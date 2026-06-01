import { db } from "@/lib/db";
import { appendEvent } from "./event-log";
import { getISOWeekStart } from "./poll/shared";
import { PERFECT_WEEK_THRESHOLD, PERFECT_WEEK_BONUS, type PlanCategory } from "./constants";

/**
 * Check if the student achieved a perfect week.
 *
 * Counts checkin_observed events in the current ISO week (Mon-Sun, Lisbon)
 * and compares against PERFECT_WEEK_THRESHOLD for their plan.
 *
 * Idempotent: checks if perfect_week event already exists for this week.
 */
export async function checkPerfectWeek(customerId: number, planCategory: PlanCategory): Promise<void> {
  if (process.env.STRIKELAB_REAL_POINTS_ENABLED !== "true") return;

  const threshold = PERFECT_WEEK_THRESHOLD[planCategory];
  if (threshold === 0) return;

  const now = new Date();
  const weekStart = getISOWeekStart(now);

  // Count checkins this week
  const checkinCount = await db.gamificationEventLog.count({
    where: {
      customerId,
      eventType: "checkin_observed",
      createdAt: { gte: weekStart },
    },
  });

  if (checkinCount < threshold) return;

  // Idempotency check
  const isoWeek = getISOWeekString(now);
  const existing = await db.gamificationEventLog.findFirst({
    where: {
      customerId,
      eventType: "perfect_week",
      idempotencyKey: `perfect_week:${customerId}:${isoWeek}`,
    },
  });

  if (existing) return;

  const bonus = PERFECT_WEEK_BONUS[planCategory];
  await appendEvent({
    customerId,
    eventType: "perfect_week",
    pointsDelta: bonus,
    xpDelta: bonus,
    payloadJson: { planCategory, actualClasses: checkinCount, threshold },
    source: "system",
    idempotencyKey: `perfect_week:${customerId}:${isoWeek}`,
    pointsPeriod: getPeriodFromWeek(isoWeek),
  });
}

function getISOWeekString(date: Date): string {
  const lisbonDate = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return lisbonDate;
}

function getPeriodFromWeek(isoDate: string): string {
  return isoDate.substring(0, 7); // "YYYY-MM"
}
