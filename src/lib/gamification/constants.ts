/**
 * Phase 1 scoring constants for StrikeLab.
 *
 * Points per class, tier thresholds, milestone definitions, perfect week
 * thresholds, and boost multipliers. Single source of truth for all
 * gamification values.
 */

// ─── Plan categories ──────────────────────────────────────────────────

/** Membership plan categories used for points calculation. */
export type PlanCategory = "P8" | "P12" | "LIVRE" | "PT" | "OTHER";

/** Points awarded per class check-in by plan category. */
export const POINTS_PER_CLASS: Record<PlanCategory, number> = {
  P8: 110,
  P12: 80,
  LIVRE: 55,
  PT: 0,
  OTHER: 0,
};

/** Regex patterns mapping Yogo membership type names to plan categories. */
export const PLAN_PATTERNS: Array<{ pattern: RegExp; category: PlanCategory }> = [
  { pattern: /\b8\s*sess/i, category: "P8" },
  { pattern: /\b12\s*sess/i, category: "P12" },
  { pattern: /\b24\s*sess/i, category: "LIVRE" },
  { pattern: /\bLivre\b/i, category: "LIVRE" },
  { pattern: /\bPT\b/i, category: "PT" },
];

// ─── Tier thresholds ──────────────────────────────────────────────────

export type Tier = "iniciante" | "bronze" | "prata" | "ouro" | "diamante";

/** Tier thresholds sorted by XP descending for lookup. */
export const TIER_THRESHOLDS: ReadonlyArray<{ tier: Tier; minXP: number }> = [
  { tier: "diamante", minXP: 80_000 },
  { tier: "ouro", minXP: 40_000 },
  { tier: "prata", minXP: 15_000 },
  { tier: "bronze", minXP: 5_000 },
  { tier: "iniciante", minXP: 0 },
] as const;

// ─── Perfect week ─────────────────────────────────────────────────────

/** Minimum classes per ISO week to earn the perfect week bonus, by plan. */
export const PERFECT_WEEK_THRESHOLD: Record<PlanCategory, number> = {
  P8: 2,
  P12: 3,
  LIVRE: 4,
  PT: 0,
  OTHER: 0,
};

/** Points awarded for a perfect week, by plan. */
export const PERFECT_WEEK_BONUS: Record<PlanCategory, number> = {
  P8: 300,
  P12: 280,
  LIVRE: 220,
  PT: 0,
  OTHER: 0,
};

// ─── Milestones ───────────────────────────────────────────────────────

export interface MilestoneDef {
  /** Minimum classes in the period to earn this milestone. */
  classes: number;
  /** Bonus points awarded (one-shot, no boosts). */
  bonus: number;
}

/** Milestone definitions by plan category. */
export const PLAN_MILESTONES: Record<string, ReadonlyArray<MilestoneDef>> = {
  P8: [
    { classes: 4, bonus: 200 },
    { classes: 6, bonus: 300 },
    { classes: 8, bonus: 600 },
  ],
  P12: [
    { classes: 6, bonus: 250 },
    { classes: 9, bonus: 350 },
    { classes: 12, bonus: 700 },
  ],
  LIVRE: [
    { classes: 8, bonus: 200 },
    { classes: 12, bonus: 300 },
    { classes: 16, bonus: 400 },
    { classes: 20, bonus: 500 },
  ],
};

// ─── Boosts ────────────────────────────────────────────────────────────

export interface BoostDef {
  id: string;
  multiplier: number;
}

/** Hard cap on boost multiplier stacking. */
export const BOOST_CAP = 3.0;

/** Points awarded on subscription renewal. */
export const RENEWAL_BONUS = 350;

/** Points awarded on comeback (≥21 days absence). */
export const COMEBACK_BONUS = 250;

/** Points awarded on supera teu ritmo. */
export const SUPERA_BONUS = 250;

/** Points awarded on music choice accepted (see MUSIC_CHOICE_WEEKLY_CAP). */
export const MUSIC_CHOICE_BONUS = 50;

/** Max music-choice credits per ISO week. */
export const MUSIC_CHOICE_WEEKLY_CAP = 2;

/** Renovacao boost duration in days. */
export const RENOVACAO_BOOST_DAYS = 14;

/** Comeback detection threshold in days. */
export const COMEBACK_THRESHOLD_DAYS = 21;
