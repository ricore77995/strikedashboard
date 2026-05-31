import { TIER_THRESHOLDS, type Tier } from "./constants";

export interface TierProgress {
  current: Tier;
  next: Tier | null;
  xpToNext: number;
  /** 0–1 progress toward the next tier. */
  progress: number;
}

/**
 * Resolve a tier from lifetime XP.
 * Walks TIER_THRESHOLDS (sorted desc) and returns the first match.
 */
export function resolveTier(lifetimeXp: number): Tier {
  for (const { tier, minXP } of TIER_THRESHOLDS) {
    if (lifetimeXp >= minXP) return tier;
  }
  return "iniciante";
}

/**
 * Get tier progress info for UI display.
 * Returns current tier, next tier (null if diamante), XP remaining, and progress fraction.
 */
export function getTierProgress(lifetimeXp: number): TierProgress {
  const current = resolveTier(lifetimeXp);

  // Find the next tier (the one above current in the thresholds array)
  const currentIdx = TIER_THRESHOLDS.findIndex((t) => t.tier === current);
  const nextEntry = currentIdx > 0 ? TIER_THRESHOLDS[currentIdx - 1] : null;

  if (!nextEntry) {
    return { current, next: null, xpToNext: 0, progress: 1 };
  }

  const currentMinXP = TIER_THRESHOLDS[currentIdx].minXP;
  const xpToNext = nextEntry.minXP - lifetimeXp;
  const range = nextEntry.minXP - currentMinXP;
  const progress = Math.min(Math.max((lifetimeXp - currentMinXP) / range, 0), 1);

  return {
    current,
    next: nextEntry.tier,
    xpToNext: Math.max(xpToNext, 0),
    progress,
  };
}
