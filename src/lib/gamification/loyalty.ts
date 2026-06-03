import { db } from "@/lib/db";
import { resolveTier } from "./tier";

// ─── Types ──────────────────────────────────────────────────────────

export interface QualificationResult {
  yogoCustomerId: number;
  loyaltyLevelId: number;
  qualifyingValue: string;
}

// ─── Condition evaluation ───────────────────────────────────────────

/**
 * Check if a student qualifies for a loyalty level.
 * Returns the qualifying description or null if not qualified.
 */
export async function evaluateCondition(
  yogoCustomerId: number,
  level: { active: boolean; conditionType: string; conditionValue: string },
): Promise<string | null> {
  if (!level.active) return null;

  if (level.conditionType === "active_months") {
    return evaluateActiveMonths(yogoCustomerId, level.conditionValue);
  }

  if (level.conditionType === "xp_tier") {
    return evaluateXpTier(yogoCustomerId, level.conditionValue);
  }

  return null;
}

async function evaluateActiveMonths(
  yogoCustomerId: number,
  thresholdStr: string,
): Promise<string | null> {
  const thresholdMonths = parseInt(thresholdStr, 10);
  if (isNaN(thresholdMonths) || thresholdMonths <= 0) return null;

  const identity = await db.gamificationIdentity.findUnique({
    where: { customerId: yogoCustomerId },
  });
  if (!identity) return null;

  // Membership snapshots have snapshotDate as "YYYY-MM-DD" string
  // Fetch recent snapshots and count consecutive active days
  const today = new Date();
  const cutoff = new Date(today.getTime() - (thresholdMonths * 31 + 10) * 86_400_000);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const snapshots = await db.yogoMembershipSnapshot.findMany({
    where: {
      userId: yogoCustomerId,
      snapshotDate: { gte: cutoffStr },
    },
    orderBy: { snapshotDate: "desc" },
  });

  if (snapshots.length === 0) return null;

  // Build a set of dates with active membership for O(1) lookup
  const activeDates = new Set<string>();
  for (const snap of snapshots) {
    if (snap.statusText && !/^Paus/i.test(snap.statusText)) {
      activeDates.add(snap.snapshotDate);
    }
  }

  // Count consecutive active days going backwards from today
  let consecutiveDays = 0;
  const dayMs = 86_400_000;

  for (let i = 0; i < thresholdMonths * 31 + 10; i++) {
    const checkDate = new Date(today.getTime() - i * dayMs);
    const dateStr = checkDate.toISOString().slice(0, 10);

    if (activeDates.has(dateStr)) {
      consecutiveDays++;
    } else {
      break;
    }
  }

  const activeMonths = consecutiveDays / 30.44;

  if (activeMonths >= thresholdMonths) {
    return `${activeMonths.toFixed(1)} months active (threshold: ${thresholdMonths})`;
  }

  return null;
}

async function evaluateXpTier(
  yogoCustomerId: number,
  targetTier: string,
): Promise<string | null> {
  const state = await db.gamificationState.findUnique({
    where: { customerId: yogoCustomerId },
  });
  if (!state) return null;

  const currentTier = resolveTier(state.lifetimeXp);

  if (currentTier === targetTier) {
    return `${targetTier} tier reached (${state.lifetimeXp} XP)`;
  }

  return null;
}

// ─── Detection (cron entry point) ───────────────────────────────────

/**
 * Scan all active loyalty levels and detect qualifying students.
 * Creates LoyaltyGrant records in "pending_approval" status.
 * Idempotent — skips students with existing grants per frequency rules.
 */
export async function detectLoyaltyQualifications(): Promise<{
  scanned: number;
  newGrants: number;
  errors: number;
}> {
  const levels = await db.loyaltyLevel.findMany({
    where: { active: true },
  });

  let newGrants = 0;
  let errors = 0;

  // Get all students with gamification state
  const identities = await db.gamificationIdentity.findMany({
    where: { erasedAt: null },
    select: { customerId: true },
  });

  for (const level of levels) {
    for (const { customerId } of identities) {
      try {
        // Check if student already has a grant for this level
        const existing = await db.loyaltyGrant.findFirst({
          where: {
            loyaltyLevelId: level.id,
            yogoCustomerId: customerId,
            status: { in: ["pending_approval", "approved", "applied"] },
          },
        });

        if (existing) continue;

        // For yearly frequency, check if granted this year
        if (level.frequency === "yearly") {
          const yearStart = new Date(new Date().getFullYear(), 0, 1);
          const yearlyGrant = await db.loyaltyGrant.findFirst({
            where: {
              loyaltyLevelId: level.id,
              yogoCustomerId: customerId,
              status: "applied",
              appliedAt: { gte: yearStart },
            },
          });
          if (yearlyGrant) continue;
        }

        // Evaluate condition
        const qualifyingValue = await evaluateCondition(customerId, level);
        if (!qualifyingValue) continue;

        // Create pending grant
        await db.loyaltyGrant.create({
          data: {
            loyaltyLevelId: level.id,
            yogoCustomerId: customerId,
            status: "pending_approval",
            qualifyingValue,
          },
        });
        newGrants++;
      } catch {
        // Skip individual errors (e.g. unique constraint race)
        errors++;
      }
    }
  }

  return { scanned: identities.length, newGrants, errors };
}

// ─── Expire stale grants ────────────────────────────────────────────

/**
 * Mark grants in pending_approval for >30 days as expired.
 */
export async function expireStaleGrants(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 86_400_000);

  const result = await db.loyaltyGrant.updateMany({
    where: {
      status: "pending_approval",
      createdAt: { lt: cutoff },
    },
    data: { status: "expired" },
  });

  return result.count;
}
