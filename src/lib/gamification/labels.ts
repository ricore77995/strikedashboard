/**
 * Pt-PT display labels for gamification tiers, events, and boosts.
 *
 * Pure data — safe to import in client components. Shared between the admin
 * student detail page and the upcoming student self-service page.
 */

import type { Tier } from "./constants";
import type { EventType } from "./types";

/** Tier name + emoji for display. */
export const TIER_LABELS: Record<Tier, { name: string; emoji: string }> = {
  iniciante: { name: "Iniciante", emoji: "🥚" },
  bronze: { name: "Bronze", emoji: "🥉" },
  prata: { name: "Prata", emoji: "🥈" },
  ouro: { name: "Ouro", emoji: "🥇" },
  diamante: { name: "Diamante", emoji: "💎" },
};

/** Human-readable Pt-PT label for each event type. */
export const EVENT_LABELS: Record<EventType, string> = {
  checkin_observed: "Check-in",
  subscription_renewed: "Renovação",
  subscription_cancelled: "Cancelamento",
  dunning_detected: "Pagamento falhado",
  consent_changed: "Consentimento alterado",
  manual_points_adjust: "Ajuste manual",
  monthly_reset: "Reset mensal",
  erasure_executed: "Apagado (RGPD)",
  identity_created: "Identidade criada",
  ig_verified: "Instagram verificado",
  streak_5_activated: "Streak 5 dias",
  streak_10_activated: "Streak 10 dias",
  streak_15_activated: "Streak 15 dias",
  streak_shield_used: "Escudo usado",
  comeback: "Regresso",
  supera_teu_ritmo: "Supera o teu ritmo",
  perfect_week: "Semana perfeita",
  milestone_achieved: "Marco atingido",
  retroactive_replay: "Replay retroactivo",
};

/** Short Pt-PT label for each boost id stored in event payloads. */
export const BOOST_LABELS: Record<string, string> = {
  weekend: "Fim-de-semana",
  renovacao: "Renovação",
  streak_5: "Streak 5",
  streak_10: "Streak 10",
  streak_15: "Streak 15",
  supera_ritmo: "Supera ritmo",
};

/** Tier label with a safe fallback for unknown values. */
export function tierLabel(tier: string): { name: string; emoji: string } {
  return TIER_LABELS[tier as Tier] ?? { name: tier, emoji: "" };
}

/** Event label with a safe fallback to the raw type. */
export function eventLabel(eventType: string): string {
  return EVENT_LABELS[eventType as EventType] ?? eventType;
}

/** Boost label with a safe fallback to the raw id. */
export function boostLabel(id: string): string {
  return BOOST_LABELS[id] ?? id;
}
