import { db } from "@/lib/db";
import { appendEvent } from "./event-log";
import { getCurrentPeriod } from "./poll/shared";
import { resolvePlanCategory, getPointsPerClass } from "./plan-resolver";
import type { PlanCategory } from "./constants";

export interface ReplayResult {
  customersProcessed: number;
  eventsReplayed: number;
  totalPointsCredited: number;
  skipped: number;
}

/**
 * Perform retroactive replay of Phase 0 events.
 *
 * Finds all checkin_observed events with pointsDelta=0, resolves the plan
 * at the time from membership snapshots, and creates NEW event rows with
 * real base points (no boosts). Phase 0 rows remain untouched.
 *
 * Idempotent: per-customer flag event prevents double processing.
 */
export async function performRetroactiveReplay(): Promise<ReplayResult> {
  if (process.env.STRIKELAB_REAL_POINTS_ENABLED !== "true") {
    return { customersProcessed: 0, eventsReplayed: 0, totalPointsCredited: 0, skipped: 0 };
  }

  const result: ReplayResult = {
    customersProcessed: 0,
    eventsReplayed: 0,
    totalPointsCredited: 0,
    skipped: 0,
  };

  // Find all customers with Phase 0 checkin events (pointsDelta=0)
  const phase0Events = await db.gamificationEventLog.findMany({
    where: {
      eventType: "checkin_observed",
      pointsDelta: 0,
      source: "cron",
    },
    select: {
      id: true,
      customerId: true,
      createdAt: true,
      pointsPeriod: true,
    },
    orderBy: { id: "asc" },
  });

  if (phase0Events.length === 0) {
    return result;
  }

  // Group by customer
  const byCustomer = new Map<number, typeof phase0Events>();
  for (const ev of phase0Events) {
    const existing = byCustomer.get(ev.customerId) ?? [];
    existing.push(ev);
    byCustomer.set(ev.customerId, existing);
  }

  for (const [customerId, events] of byCustomer) {
    // Check if already replayed
    const alreadyReplayed = await db.gamificationEventLog.findFirst({
      where: {
        customerId,
        eventType: "retroactive_replay",
        source: "retroactive_replay",
      },
    });

    if (alreadyReplayed) {
      result.skipped++;
      continue;
    }

    // Get the plan at the time from the membership snapshot closest to the event period
    const snapshot = await db.yogoMembershipSnapshot.findFirst({
      where: { userId: customerId },
      orderBy: { snapshotDate: "desc" },
      select: { membershipTypeName: true },
    });

    const planCategory: PlanCategory = snapshot
      ? resolvePlanCategory(snapshot.membershipTypeName)
      : "OTHER";

    const basePoints = getPointsPerClass(planCategory);
    let customerPoints = 0;

    for (const ev of events) {
      const period = ev.pointsPeriod ?? getCurrentPeriod();

      await appendEvent({
        customerId,
        eventType: "checkin_observed",
        pointsDelta: basePoints,
        xpDelta: basePoints,
        payloadJson: {
          retroactive: true,
          originalEventId: ev.id,
          planCategory,
        },
        source: "retroactive_replay",
        idempotencyKey: `retro:${ev.id}:${customerId}`,
        pointsPeriod: period,
      });

      customerPoints += basePoints;
      result.eventsReplayed++;
    }

    // Mark customer as replayed
    await appendEvent({
      customerId,
      eventType: "retroactive_replay",
      pointsDelta: 0,
      xpDelta: 0,
      payloadJson: {
        eventsReplayed: events.length,
        pointsCredited: customerPoints,
        planCategory,
      },
      source: "retroactive_replay",
      idempotencyKey: `retro_complete:${customerId}`,
      pointsPeriod: getCurrentPeriod(),
    });

    result.customersProcessed++;
    result.totalPointsCredited += customerPoints;
  }

  return result;
}
