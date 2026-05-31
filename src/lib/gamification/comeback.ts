import { db } from "@/lib/db";
import { appendEvent } from "./event-log";
import { getCurrentPeriod, getTodayISO } from "./poll/shared";
import { COMEBACK_THRESHOLD_DAYS, COMEBACK_BONUS } from "./constants";

/**
 * Check if this check-in qualifies as a comeback (≥21 days absence).
 *
 * Compares lastClassAt from state with today. If the gap is ≥21 days,
 * emits a comeback event with bonus points.
 *
 * Idempotent: one comeback per check-in date.
 */
export async function checkComeback(customerId: number): Promise<void> {
  if (process.env.STRIKELAB_REAL_POINTS_ENABLED !== "true") return;

  const state = await db.gamificationState.findUnique({ where: { customerId } });
  if (!state || !state.lastClassAt) return;

  const now = new Date();
  const diffMs = now.getTime() - state.lastClassAt.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < COMEBACK_THRESHOLD_DAYS) return;

  // Idempotency: one comeback per check-in date
  const today = getTodayISO();
  const existing = await db.gamificationEventLog.findFirst({
    where: {
      customerId,
      eventType: "comeback",
      idempotencyKey: `comeback:${customerId}:${today}`,
    },
  });

  if (existing) return;

  await appendEvent({
    customerId,
    eventType: "comeback",
    pointsDelta: COMEBACK_BONUS,
    xpDelta: COMEBACK_BONUS,
    payloadJson: { daysAbsent: Math.floor(diffDays) },
    source: "system",
    idempotencyKey: `comeback:${customerId}:${today}`,
    pointsPeriod: getCurrentPeriod(),
  });
}
