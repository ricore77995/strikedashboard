import { db } from "@/lib/db";
import { appendEvent } from "./event-log";
import { getCurrentPeriod } from "./poll/shared";
import { PLAN_MILESTONES, type PlanCategory } from "./constants";

/**
 * Check if plan milestones have been achieved for this month.
 *
 * Counts checkin_observed events in the current period and compares
 * against PLAN_MILESTONES thresholds. Emits milestone_achieved events
 * for each newly crossed threshold.
 *
 * Idempotent: checks if milestone event already exists for this period.
 */
export async function checkMilestones(customerId: number, planCategory: PlanCategory): Promise<void> {
  if (process.env.STRIKELAB_REAL_POINTS_ENABLED !== "true") return;

  const milestones = PLAN_MILESTONES[planCategory];
  if (!milestones || milestones.length === 0) return;

  const period = getCurrentPeriod();

  // Count checkins this period
  const checkinCount = await db.gamificationEventLog.count({
    where: {
      customerId,
      eventType: "checkin_observed",
      pointsPeriod: period,
    },
  });

  // Check each milestone
  for (const milestone of milestones) {
    if (checkinCount < milestone.classes) continue;

    // Check idempotency — already emitted?
    const existing = await db.gamificationEventLog.findFirst({
      where: {
        customerId,
        eventType: "milestone_achieved",
        pointsPeriod: period,
        payloadJson: { contains: `"classesThreshold":${milestone.classes}` },
      },
    });

    if (existing) continue;

    // Emit milestone event
    await appendEvent({
      customerId,
      eventType: "milestone_achieved",
      pointsDelta: milestone.bonus,
      xpDelta: milestone.bonus,
      payloadJson: {
        planCategory,
        classesThreshold: milestone.classes,
        actualClasses: checkinCount,
      },
      source: "system",
      idempotencyKey: `milestone:${customerId}:${period}:${planCategory}:${milestone.classes}`,
      pointsPeriod: period,
    });
  }
}
