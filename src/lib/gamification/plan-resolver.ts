import { PLAN_PATTERNS, POINTS_PER_CLASS, PERFECT_WEEK_THRESHOLD, type PlanCategory } from "./constants";

/**
 * Resolve a Yogo membership type name to a plan category.
 *
 * Uses regex patterns from PLAN_PATTERNS. Falls through to "OTHER"
 * if no pattern matches (or name is null/empty).
 */
export function resolvePlanCategory(membershipTypeName: string | null | undefined): PlanCategory {
  if (!membershipTypeName) return "OTHER";

  for (const { pattern, category } of PLAN_PATTERNS) {
    if (pattern.test(membershipTypeName)) return category;
  }

  return "OTHER";
}

/** Get the points per class for a given plan category. */
export function getPointsPerClass(category: PlanCategory): number {
  return POINTS_PER_CLASS[category];
}

/** Get the perfect week threshold for a given plan category. */
export function getPerfectWeekThreshold(category: PlanCategory): number {
  return PERFECT_WEEK_THRESHOLD[category];
}
