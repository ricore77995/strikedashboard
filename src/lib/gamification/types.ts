/**
 * Shared types for the StrikeLab gamification engine.
 * Extended in Phase 1 for real points, boosts, tiers, and milestones.
 */

// ─── Event types ─────────────────────────────────────────────────────

/** All known event types across Phase 0 and Phase 1. */
export type EventType =
  | "checkin_observed"
  | "subscription_renewed"
  | "subscription_cancelled"
  | "dunning_detected"
  | "consent_changed"
  | "manual_points_adjust"
  | "monthly_reset"
  | "erasure_executed"
  | "identity_created"
  | "ig_verified"
  // Phase 1 event types
  | "streak_5_activated"
  | "streak_10_activated"
  | "streak_15_activated"
  | "streak_shield_used"
  | "comeback"
  | "supera_teu_ritmo"
  | "perfect_week"
  | "milestone_achieved"
  | "retroactive_replay"
  // Phase 2 event types
  | "music_choice_accepted"
  | "weekly_challenge_won"
  | "referral_trial_only"
  | "referral_phase_1"
  | "referral_phase_2";

/** Source of the event — who/what triggered it. */
export type EventSource = "system" | "bot" | "admin" | "cron" | "retroactive_replay";

// ─── State ───────────────────────────────────────────────────────────

export type Tier = "iniciante" | "bronze" | "prata" | "ouro" | "diamante";

/** Shape returned by materializeState(). */
export interface GamificationStateView {
  customerId: number;
  monthlyPoints: number;
  lifetimeXp: number;
  currentTier: Tier;
  currentStreakDays: number;
  streakShieldAvailable: boolean;
  lastClassAt: Date | null;
  lastReplayedEventId: number | null;
}

// ─── Identity ────────────────────────────────────────────────────────

export interface IdentityInput {
  customerId: number;
  phoneE164?: string;
  email?: string | null;
  whatsappWaId?: string | null;
}

// ─── Event log ───────────────────────────────────────────────────────

export interface AppendEventInput {
  customerId: number;
  eventType: EventType;
  pointsDelta?: number;
  xpDelta?: number;
  payloadJson?: Record<string, unknown> | null;
  source?: EventSource;
  operatorId?: number | null;
  idempotencyKey: string;
  pointsPeriod?: string | null; // "YYYY-MM" computed by caller
}

export interface AppendEventResult {
  written: boolean;
  eventId?: number;
}
