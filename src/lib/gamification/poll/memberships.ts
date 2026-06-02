import { db } from "@/lib/db";
import { yogoFetch } from "@/lib/yogo/fetch";
import { findByCustomerId } from "@/lib/gamification/identity";
import { appendEvent } from "@/lib/gamification/event-log";
import { isNonActionableLead } from "@/lib/yogo/non-actionable-lead";
import { getTodayISO, getCurrentPeriod } from "./shared";
import { RENEWAL_BONUS } from "@/lib/gamification/constants";
import { tryReferralPhase1, tryReferralPhase2 } from "@/lib/gamification/referral";

// ─── Types ───────────────────────────────────────────────────────────

interface YogoMembershipRow {
  user_id: number;
  user_email?: string;
  membership_type_id: number;
  membership_type_name: string;
  status: string;
  status_text: string;
  paid_until: string | null;
  next_payment_date: string | null;
}

// ─── Result ──────────────────────────────────────────────────────────

export interface MembershipPollResult {
  rowsProcessed: number;
  snapshotsUpserted: number;
  renewed: number;
  cancelled: number;
  dunningDetected: number;
  skippedNoIdentity: number;
  skippedAggregator: number;
  skippedFirstObservation: number;
}

// ─── Snapshot diff helpers ───────────────────────────────────────────

function parseDate(d: string | null | undefined): Date | null {
  if (!d) return null;
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Diff today's membership data against yesterday's snapshot.
 * Returns trigger events to emit (if any).
 */
function diffSnapshot(
  today: YogoMembershipRow,
  yesterday: {
    paidUntil: Date | null;
    status: string | null;
    statusText: string | null;
  } | null,
): Array<{ eventType: "subscription_renewed" | "subscription_cancelled" | "dunning_detected"; payload?: Record<string, unknown> }> {
  const events: Array<{ eventType: "subscription_renewed" | "subscription_cancelled" | "dunning_detected"; payload?: Record<string, unknown> }> = [];

  if (!yesterday) return events; // First observation — no diff possible

  // 1. Renewal: paid_until advanced by ≥25 days
  const todayPaidUntil = parseDate(today.paid_until);
  if (todayPaidUntil && yesterday.paidUntil) {
    const diffMs = todayPaidUntil.getTime() - yesterday.paidUntil.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays >= 25) {
      events.push({
        eventType: "subscription_renewed",
        payload: {
          previousPaidUntil: yesterday.paidUntil.toISOString(),
          newPaidUntil: todayPaidUntil.toISOString(),
          daysAdvanced: Math.round(diffDays),
        },
      });
    }
  }

  // 2. Cancellation: status changed to "ended"
  if (today.status === "ended" && yesterday.status !== "ended") {
    events.push({
      eventType: "subscription_cancelled",
      payload: {
        previousStatus: yesterday.status,
        membershipName: today.membership_type_name,
      },
    });
  }

  // 3. Dunning: status_text newly matches dunning pattern
  const dunningPattern = /falhou|Pausado.*falhou/i;
  const wasDunning = yesterday.statusText ? dunningPattern.test(yesterday.statusText) : false;
  const isDunning = dunningPattern.test(today.status_text);
  if (isDunning && !wasDunning) {
    events.push({
      eventType: "dunning_detected",
      payload: {
        statusText: today.status_text,
        previousStatusText: yesterday.statusText,
      },
    });
  }

  return events;
}

// ─── Main poll ───────────────────────────────────────────────────────

/**
 * Daily sweep of Yogo memberships. Creates today's snapshot, diffs against
 * yesterday's, and emits renewal/cancellation/dunning events.
 */
export async function pollMemberships(): Promise<MembershipPollResult> {
  const today = getTodayISO();
  const period = getCurrentPeriod();

  const result: MembershipPollResult = {
    rowsProcessed: 0,
    snapshotsUpserted: 0,
    renewed: 0,
    cancelled: 0,
    dunningDetected: 0,
    skippedNoIdentity: 0,
    skippedAggregator: 0,
    skippedFirstObservation: 0,
  };

  // Fetch all memberships
  const response = await yogoFetch<YogoMembershipRow[]>("reports/memberships-list", {
    method: "POST",
    body: JSON.stringify({}),
  });

  if (!response.ok || !Array.isArray(response.data)) {
    throw new Error(`Yogo memberships fetch failed: ${response.status}`);
  }

  const rows = response.data;
  result.rowsProcessed = rows.length;

  for (const row of rows) {
    // 1. Filter aggregator accounts
    if (isNonActionableLead(row.user_email)) {
      result.skippedAggregator++;
      continue;
    }

    // 2. Identity lookup
    const identity = await findByCustomerId(row.user_id);
    if (!identity) {
      result.skippedNoIdentity++;
      continue;
    }

    if (identity.erasedAt) continue;

    // 3. Get yesterday's snapshot for diff
    const yesterday = await db.yogoMembershipSnapshot.findUnique({
      where: { userId_snapshotDate: { userId: row.user_id, snapshotDate: today } },
    });

    // Look for a recent previous snapshot (could be yesterday or older)
    const previousSnapshot = yesterday
      ? null // Already have today's — unlikely on first run
      : await db.yogoMembershipSnapshot.findFirst({
          where: {
            userId: row.user_id,
            snapshotDate: { not: today },
          },
          orderBy: { snapshotDate: "desc" },
        });

    const prevData = previousSnapshot
      ? {
          paidUntil: previousSnapshot.paidUntil,
          status: previousSnapshot.status,
          statusText: previousSnapshot.statusText,
        }
      : null;

    // 4. Diff and emit events
    const diffEvents = diffSnapshot(row, prevData);

    if (diffEvents.length === 0 && !prevData) {
      result.skippedFirstObservation++;
    }

    for (const ev of diffEvents) {
      // Phase 1: real points on renewal
      const realPointsEnabled = process.env.STRIKELAB_REAL_POINTS_ENABLED === "true";
      let pointsDelta = 0;
      let xpDelta = 0;

      if (realPointsEnabled && ev.eventType === "subscription_renewed") {
        pointsDelta = RENEWAL_BONUS;
        xpDelta = RENEWAL_BONUS;
      }

      const appended = await appendEvent({
        customerId: row.user_id,
        eventType: ev.eventType,
        pointsDelta,
        xpDelta,
        payloadJson: ev.payload ?? null,
        source: "cron",
        idempotencyKey: `${ev.eventType}:${row.user_id}:${today}`,
        pointsPeriod: period,
      });

      if (appended.written) {
        if (ev.eventType === "subscription_renewed") result.renewed++;
        if (ev.eventType === "subscription_cancelled") result.cancelled++;
        if (ev.eventType === "dunning_detected") result.dunningDetected++;

        // Referral hooks (Phase 2)
        if (ev.eventType === "subscription_renewed") {
          await tryReferralPhase1(row.user_id);
          await tryReferralPhase2(row.user_id);
        }
      }
    }

    // 5. Upsert today's snapshot
    await db.yogoMembershipSnapshot.upsert({
      where: { userId_snapshotDate: { userId: row.user_id, snapshotDate: today } },
      update: {
        membershipTypeId: row.membership_type_id,
        membershipTypeName: row.membership_type_name,
        paidUntil: parseDate(row.paid_until),
        nextPaymentDate: parseDate(row.next_payment_date),
        status: row.status,
        statusText: row.status_text,
        capturedAt: new Date(),
      },
      create: {
        userId: row.user_id,
        snapshotDate: today,
        membershipTypeId: row.membership_type_id,
        membershipTypeName: row.membership_type_name,
        paidUntil: parseDate(row.paid_until),
        nextPaymentDate: parseDate(row.next_payment_date),
        status: row.status,
        statusText: row.status_text,
      },
    });
    result.snapshotsUpserted++;
  }

  return result;
}
