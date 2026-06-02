import { db } from "@/lib/db";
import { getCurrentPeriod, getISOWeekStart } from "./poll/shared";
import type { BoostDef, PlanCategory } from "./constants";
import { BOOST_CAP, RENOVACAO_BOOST_DAYS, PERFECT_WEEK_THRESHOLD } from "./constants";

/**
 * Compute the final multiplier from a list of active boosts.
 *
 * Formula: min(1.0 + Σ(multiplier - 1.0), BOOST_CAP)
 */
export function computeBoostMultiplier(activeBoosts: BoostDef[]): number {
  if (activeBoosts.length === 0) return 1.0;

  const deltaSum = activeBoosts.reduce((sum, b) => sum + (b.multiplier - 1.0), 0);
  return Math.min(1.0 + deltaSum, BOOST_CAP);
}

/**
 * Get all active boosts for a checkin event.
 *
 * Evaluates each boost predicate and returns the list of active ones.
 * Streak boosts are mutually exclusive (highest wins).
 */
export async function getActiveBoostsForCheckin(
  customerId: number,
  state: { currentStreakDays: number; lastClassAt: Date | null },
  context: {
    planCategory: PlanCategory;
    checkinDate: Date;
  },
): Promise<BoostDef[]> {
  const boosts: BoostDef[] = [];

  // Weekend boost: Sat/Sun (Lisbon timezone)
  const dayOfWeek = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Lisbon",
    weekday: "short",
  }).format(context.checkinDate);

  if (dayOfWeek === "Sat" || dayOfWeek === "Sun") {
    boosts.push({ id: "weekend", multiplier: 1.8 });
  }

  // Renovacao boost: subscription_renewed event within last 14 days
  const fourteenDaysAgo = new Date(Date.now() - RENOVACAO_BOOST_DAYS * 24 * 60 * 60 * 1000);
  const recentRenewal = await db.gamificationEventLog.findFirst({
    where: {
      customerId,
      eventType: "subscription_renewed",
      createdAt: { gte: fourteenDaysAgo },
    },
    select: { eventId: true },
  });
  if (recentRenewal) {
    boosts.push({ id: "renovacao", multiplier: 1.5 });
  }

  // Streak boost: mutually exclusive, highest wins
  if (state.currentStreakDays >= 15) {
    boosts.push({ id: "streak_15", multiplier: 1.8 });
  } else if (state.currentStreakDays >= 10) {
    boosts.push({ id: "streak_10", multiplier: 1.6 });
  } else if (state.currentStreakDays >= 5) {
    boosts.push({ id: "streak_5", multiplier: 1.3 });
  }

  // Supera ritmo boost: check if weekly checkins exceed plan threshold
  const weekStart = getISOWeekStart(context.checkinDate);
  const weekCheckins = await db.gamificationEventLog.count({
    where: {
      customerId,
      eventType: "checkin_observed",
      createdAt: { gte: weekStart },
    },
  });
  const threshold = PERFECT_WEEK_THRESHOLD[context.planCategory];
  // Supera = strictly more than the perfect week threshold
  if (threshold > 0 && weekCheckins > threshold) {
    boosts.push({ id: "supera_ritmo", multiplier: 1.2 });
  }

  // Embaixador referral boost: referral_phase_1 event within last 14 days
  // Boolean check — findFirst, not findMany. One boost max regardless of referral count.
  const recentReferralPhase1 = await db.gamificationEventLog.findFirst({
    where: {
      customerId,
      eventType: "referral_phase_1",
      createdAt: { gte: fourteenDaysAgo },
    },
    select: { eventId: true },
  });
  if (recentReferralPhase1) {
    boosts.push({ id: "embaixador_referral", multiplier: 1.4 });
  }

  return boosts;
}
