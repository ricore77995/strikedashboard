import { db } from "@/lib/db";

/**
 * Monthly StrikeLab leaderboard.
 *
 * Ranks opted-in, non-erased, training-consented students by their current
 * monthlyPoints (which resets each month). Name resolution is the caller's job
 * (names come from Yogo) — this module stays pure-DB and testable.
 */

export interface LeaderboardRow {
  rank: number;
  customerId: number;
  monthlyPoints: number;
  isViewer: boolean;
}

/**
 * Format a public leaderboard name as "First L." (first name + last initial).
 * Returns null when there is no usable first name so the caller can fall back
 * to an anonymous label.
 */
export function formatLeaderName(first?: string | null, last?: string | null): string | null {
  const f = (first ?? "").trim();
  if (!f) return null;
  const l = (last ?? "").trim();
  return l ? `${f} ${l[0].toUpperCase()}.` : f;
}

/**
 * Top-N students by current monthly points. Eligibility: opted in, not erased,
 * training consent, and at least 1 point. Deterministic tie-break by lifetime
 * XP then customerId.
 */
export async function getMonthlyLeaderboard(
  viewerCustomerId: number,
  limit = 10,
): Promise<LeaderboardRow[]> {
  const states = await db.gamificationState.findMany({
    where: {
      monthlyPoints: { gt: 0 },
      identity: { optInAt: { not: null }, erasedAt: null, consentTraining: true },
    },
    orderBy: [{ monthlyPoints: "desc" }, { lifetimeXp: "desc" }, { customerId: "asc" }],
    take: limit,
    select: { customerId: true, monthlyPoints: true },
  });

  return states.map((s, i) => ({
    rank: i + 1,
    customerId: s.customerId,
    monthlyPoints: s.monthlyPoints,
    isViewer: s.customerId === viewerCustomerId,
  }));
}
