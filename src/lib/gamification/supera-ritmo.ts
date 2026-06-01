import { db } from "@/lib/db";
import { appendEvent } from "./event-log";
import { getCurrentPeriod, getISOWeekStart } from "./poll/shared";
import { PERFECT_WEEK_THRESHOLD, SUPERA_BONUS, type PlanCategory } from "./constants";

/**
 * Check if the student achieved "supera teu ritmo" — more classes this week
 * than the perfect week threshold for their plan.
 *
 * Idempotent: one supera per ISO week.
 */
export async function checkSuperaRitmo(customerId: number, planCategory: PlanCategory): Promise<void> {
  if (process.env.STRIKELAB_REAL_POINTS_ENABLED !== "true") return;

  const threshold = PERFECT_WEEK_THRESHOLD[planCategory];
  if (threshold === 0) return;

  const now = new Date();
  const weekStart = getISOWeekStart(now);

  // Count checkins this week (including this one)
  const checkinCount = await db.gamificationEventLog.count({
    where: {
      customerId,
      eventType: "checkin_observed",
      createdAt: { gte: weekStart },
    },
  });

  // Supera = strictly more than threshold
  if (checkinCount <= threshold) return;

  // Idempotency
  const isoWeek = getISOWeekString(now);
  const existing = await db.gamificationEventLog.findFirst({
    where: {
      customerId,
      eventType: "supera_teu_ritmo",
      idempotencyKey: `supera:${customerId}:${isoWeek}`,
    },
  });

  if (existing) return;

  await appendEvent({
    customerId,
    eventType: "supera_teu_ritmo",
    pointsDelta: SUPERA_BONUS,
    xpDelta: SUPERA_BONUS,
    payloadJson: { planCategory, actualClasses: checkinCount, threshold },
    source: "system",
    idempotencyKey: `supera:${customerId}:${isoWeek}`,
    pointsPeriod: getCurrentPeriod(),
  });
}

function getISOWeekString(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
