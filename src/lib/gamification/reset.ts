import { db } from "@/lib/db";
import { getCurrentPeriod } from "@/lib/gamification/poll/shared";

export interface MonthlyResetResult {
  resetCount: number;
  snapshotCount: number;
  auditId: string | null;
  skipped: boolean;
}

/**
 * Perform the monthly reset:
 * 1. Check if already run this month (idempotency via audit)
 * 2. Find all states with monthlyPoints > 0
 * 3. For each: create a sealed snapshot
 * 4. Zero monthlyPoints on all found states
 * 5. Create a single audit entry
 *
 * All in a single Prisma $transaction for atomicity.
 */
export async function performMonthlyReset(): Promise<MonthlyResetResult> {
  const period = getCurrentPeriod();

  // Idempotency: check if audit already exists for this period
  const existingAudit = await db.gamificationResetAudit.findFirst({
    where: { resetPeriod: period, status: "completed" },
  });
  if (existingAudit) {
    return { resetCount: 0, snapshotCount: 0, auditId: existingAudit.resetId, skipped: true };
  }

  // Find all states with points to reset
  const statesWithPoints = await db.gamificationState.findMany({
    where: { monthlyPoints: { gt: 0 } },
    select: {
      customerId: true,
      monthlyPoints: true,
      lifetimeXp: true,
      currentTier: true,
      currentStreakDays: true,
    },
  });

  if (statesWithPoints.length === 0) {
    // Nothing to reset — still log an audit for traceability
    const audit = await db.gamificationResetAudit.create({
      data: {
        resetPeriod: period,
        status: "completed",
        batchesApplied: 1,
        customersZeroed: 0,
        completedAt: new Date(),
      },
    });
    return { resetCount: 0, snapshotCount: 0, auditId: audit.resetId, skipped: false };
  }

  // Execute atomically
  const audit = await db.$transaction(async (tx) => {
    // 1. Create sealed snapshots
    for (const state of statesWithPoints) {
      // Count checkin events this period for classesInPeriod
      const checkinCount = await tx.gamificationEventLog.count({
        where: {
          customerId: state.customerId,
          eventType: "checkin_observed",
          pointsPeriod: period,
        },
      });

      await tx.gamificationMonthlySnapshot.upsert({
        where: {
          customerId_pointsPeriod: { customerId: state.customerId, pointsPeriod: period },
        },
        update: {
          monthlyPoints: state.monthlyPoints,
          xpAtPeriodEnd: state.lifetimeXp,
          classesInPeriod: checkinCount,
          finalTier: state.currentTier,
          sealedAt: new Date(),
        },
        create: {
          customerId: state.customerId,
          pointsPeriod: period,
          monthlyPoints: state.monthlyPoints,
          xpAtPeriodEnd: state.lifetimeXp,
          classesInPeriod: checkinCount,
          finalTier: state.currentTier,
          sealedAt: new Date(),
        },
      });
    }

    // 2. Zero monthlyPoints on all states with points
    await tx.gamificationState.updateMany({
      where: { monthlyPoints: { gt: 0 } },
      data: { monthlyPoints: 0 },
    });

    // Phase 1: Renew streak shields for all identities with a state
    if (process.env.STRIKELAB_REAL_POINTS_ENABLED === "true") {
      await tx.gamificationState.updateMany({
        data: {
          streakShieldAvailable: true,
          shieldResetForMonth: period,
        },
      });
    }

    // 3. Create audit entry
    return tx.gamificationResetAudit.create({
      data: {
        resetPeriod: period,
        status: "completed",
        batchesApplied: 1,
        customersZeroed: statesWithPoints.length,
        completedAt: new Date(),
      },
    });
  });

  return {
    resetCount: statesWithPoints.length,
    snapshotCount: statesWithPoints.length,
    auditId: audit.resetId,
    skipped: false,
  };
}
