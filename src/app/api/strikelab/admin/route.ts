import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { challengeWindow } from "@/lib/gamification/challenges/window";
import { getChallenge } from "@/lib/gamification/challenges/catalog";

/**
 * GET /api/strikelab/admin?search=...&page=1
 *
 * Admin-only. Lists gamification identities with their state + aggregate stats.
 * Search filters by customerId, phone, or email.
 */
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("session");
  if (!cookie?.value) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = 20;
  const skip = (page - 1) * limit;

  const where = search
    ? {
        OR: [
          { phoneE164: { contains: search } },
          { email: { contains: search } },
          ...( /^\d+$/.test(search) ? [{ customerId: parseInt(search, 10) }] : []),
        ],
        erasedAt: null,
      }
    : { erasedAt: null };

  // Aggregate stats + challenge + paginated list — all in parallel
  const { isoWeek, windowStart } = challengeWindow(new Date());
  const optedInWhere = { optInAt: { not: null }, consentTraining: true, erasedAt: null };

  const [identities, total, optedIn, pointsAgg, activeThisWeek, challengeRun] = await Promise.all([
    db.gamificationIdentity.findMany({
      where,
      orderBy: { optInAt: "desc" },
      skip,
      take: limit,
      include: { state: true },
    }),
    db.gamificationIdentity.count({ where }),
    db.gamificationIdentity.count({ where: optedInWhere }),
    db.gamificationState.aggregate({ _sum: { monthlyPoints: true } }),
    db.gamificationState.count({ where: { lastClassAt: { gte: windowStart } } }),
    db.strikelabChallengeRun.findUnique({ where: { isoWeek } }),
  ]);

  const challengeDef = challengeRun ? getChallenge(challengeRun.challengeKey) : null;

  return NextResponse.json({
    students: identities.map((i) => ({
      customerId: i.customerId,
      phoneE164: i.phoneE164.startsWith("erased_") ? null : i.phoneE164,
      email: i.email,
      instagramHandle: i.instagramHandle,
      igVerified: !!i.igVerifiedAt,
      optedIn: !!i.optInAt && i.consentTraining,
      birthYear: i.birthYear,
      erasedAt: i.erasedAt,
      state: i.state
        ? {
            monthlyPoints: i.state.monthlyPoints,
            lifetimeXp: i.state.lifetimeXp,
            currentTier: i.state.currentTier,
            currentStreakDays: i.state.currentStreakDays,
            lastClassAt: i.state.lastClassAt,
          }
        : null,
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
    stats: {
      optedIn,
      totalPointsThisMonth: pointsAgg._sum.monthlyPoints ?? 0,
      activeThisWeek,
      challenge: challengeDef
        ? {
            key: challengeRun!.challengeKey,
            name: challengeDef.name,
            status: challengeRun!.status,
            windowStart: challengeRun!.windowStart.toISOString(),
            windowEnd: challengeRun!.windowEnd.toISOString(),
          }
        : null,
    },
  });
}
