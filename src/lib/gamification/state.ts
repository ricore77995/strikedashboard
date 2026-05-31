import { db } from "@/lib/db";
import type { GamificationStateView } from "./types";
import { type Tier } from "./constants";
import { resolveTier } from "./tier";

/**
 * Materialize the gamification state for a customer by replaying their
 * entire event log. This is the deterministic "source of truth" view.
 *
 * Phase 0: only accumulates monthlyPoints, lifetimeXp, and tracks
 * lastClassAt / lastReplayedEventId. Tier logic comes in Phase 1.
 */
export async function materializeState(customerId: number): Promise<GamificationStateView | null> {
  const events = await db.gamificationEventLog.findMany({
    where: { customerId },
    orderBy: { eventId: "asc" },
    select: {
      eventId: true,
      eventType: true,
      pointsDelta: true,
      xpDelta: true,
      createdAt: true,
    },
  });

  if (events.length === 0) {
    // Check if identity exists — if not, return null
    const identity = await db.gamificationIdentity.findUnique({
      where: { customerId },
    });
    if (!identity) return null;
  }

  let monthlyPoints = 0;
  let lifetimeXp = 0;
  let lastClassAt: Date | null = null;
  let lastReplayedEventId: number | null = null;

  for (const ev of events) {
    monthlyPoints += ev.pointsDelta;
    lifetimeXp += ev.xpDelta;
    if (ev.eventType === "checkin_observed" && ev.pointsDelta !== 0) {
      lastClassAt = ev.createdAt;
    }
    lastReplayedEventId = ev.eventId;
  }

  const state: GamificationStateView = {
    customerId,
    monthlyPoints,
    lifetimeXp,
    currentTier: resolveTier(lifetimeXp),
    currentStreakDays: 0,
    streakShieldAvailable: false,
    lastClassAt,
    lastReplayedEventId,
  };

  return state;
}

/**
 * Upsert the materialized state into GamificationState table.
 * Called after event append to keep the materialized view fresh.
 */
export async function persistState(state: GamificationStateView): Promise<void> {
  await db.gamificationState.upsert({
    where: { customerId: state.customerId },
    update: {
      monthlyPoints: state.monthlyPoints,
      lifetimeXp: state.lifetimeXp,
      currentTier: state.currentTier,
      currentStreakDays: state.currentStreakDays,
      streakShieldAvailable: state.streakShieldAvailable,
      lastClassAt: state.lastClassAt,
      lastReplayedEventId: state.lastReplayedEventId,
    },
    create: {
      customerId: state.customerId,
      monthlyPoints: state.monthlyPoints,
      lifetimeXp: state.lifetimeXp,
      currentTier: state.currentTier,
      currentStreakDays: state.currentStreakDays,
      streakShieldAvailable: state.streakShieldAvailable,
      lastClassAt: state.lastClassAt,
      lastReplayedEventId: state.lastReplayedEventId,
    },
  });
}
