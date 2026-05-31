import { db } from "@/lib/db";
import { appendEvent } from "./event-log";
import { getTodayISO, getCurrentPeriod } from "./poll/shared";

/**
 * Check and update streak after a check-in.
 *
 * Logic:
 * - Compare last class date with today (Lisbon timezone)
 * - Consecutive day → increment currentStreakDays
 * - 1-day gap with shield → use shield, preserve streak
 * - Larger gap → reset to 1
 * - At 5/10/15 → emit streak_N_activated event
 */
export async function checkStreak(customerId: number): Promise<void> {
  if (process.env.STRIKELAB_REAL_POINTS_ENABLED !== "true") return;

  const state = await db.gamificationState.findUnique({ where: { customerId } });
  if (!state) return;

  const today = getTodayISO();

  // Get last class date in Lisbon
  const lastClassISO = state.lastClassAt
    ? new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Europe/Lisbon",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(state.lastClassAt)
    : null;

  let newStreakDays: number;
  let shieldUsed = false;

  if (!lastClassISO) {
    // First ever class
    newStreakDays = 1;
  } else if (lastClassISO === today) {
    // Same day (duplicate check-in) — no change
    return;
  } else {
    const lastDate = new Date(lastClassISO);
    const todayDate = new Date(today);
    const diffDays = Math.round((todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      // Consecutive day
      newStreakDays = state.currentStreakDays + 1;
    } else if (diffDays === 2 && state.streakShieldAvailable) {
      // 1-day gap with shield available — use it
      newStreakDays = state.currentStreakDays + 1;
      shieldUsed = true;

      // Emit shield used event
      await appendEvent({
        customerId,
        eventType: "streak_shield_used",
        pointsDelta: 0,
        xpDelta: 0,
        source: "system",
        idempotencyKey: `shield:${customerId}:${getCurrentPeriod()}`,
        pointsPeriod: getCurrentPeriod(),
      });
    } else {
      // Gap too large or no shield — reset
      newStreakDays = 1;
    }
  }

  // Check for streak milestones (5/10/15)
  const prevStreak = state.currentStreakDays;
  const period = getCurrentPeriod();

  if (prevStreak < 5 && newStreakDays >= 5) {
    await appendEvent({
      customerId,
      eventType: "streak_5_activated",
      pointsDelta: 0,
      xpDelta: 0,
      payloadJson: { streakDays: newStreakDays },
      source: "system",
      idempotencyKey: `streak5:${customerId}:${period}`,
      pointsPeriod: period,
    });
  }

  if (prevStreak < 10 && newStreakDays >= 10) {
    await appendEvent({
      customerId,
      eventType: "streak_10_activated",
      pointsDelta: 0,
      xpDelta: 0,
      payloadJson: { streakDays: newStreakDays },
      source: "system",
      idempotencyKey: `streak10:${customerId}:${period}`,
      pointsPeriod: period,
    });
  }

  if (prevStreak < 15 && newStreakDays >= 15) {
    await appendEvent({
      customerId,
      eventType: "streak_15_activated",
      pointsDelta: 0,
      xpDelta: 0,
      payloadJson: { streakDays: newStreakDays },
      source: "system",
      idempotencyKey: `streak15:${customerId}:${period}`,
      pointsPeriod: period,
    });
  }

  // Update state
  await db.gamificationState.update({
    where: { customerId },
    data: {
      currentStreakDays: newStreakDays,
      streakShieldAvailable: shieldUsed ? false : state.streakShieldAvailable,
    },
  });
}
