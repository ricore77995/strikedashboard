import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTierProgress } from "@/lib/gamification/tier";
import { parseEventPayload } from "@/lib/gamification/event-view";
import { verifyStudentToken } from "@/lib/gamification/student-link";
import { getMonthlyLeaderboard, formatLeaderName } from "@/lib/gamification/leaderboard";
import { getCustomersByIds } from "@/lib/yogo/lookup";
import { challengeWindow } from "@/lib/gamification/challenges/window";
import { getChallenge } from "@/lib/gamification/challenges/catalog";

/**
 * GET /api/strikelab/me?t=<token>
 *
 * Student self-service. No login — authenticated by a signed magic-link token
 * (see lib/gamification/student-link.ts) sent over WhatsApp. Returns only the
 * student's own gamification progress: NO phone/email/consent/pause data.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t");
  if (!token) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }

  const result = verifyStudentToken(token);
  if (!result.ok) {
    // Misconfiguration is a server problem; everything else is an auth failure.
    const status = result.reason === "no_secret" ? 503 : 401;
    return NextResponse.json({ error: result.reason }, { status });
  }

  const customerId = result.customerId;

  const { isoWeek } = challengeWindow(new Date());

  const [identity, state, events, challengeRun, myWinEvent] = await Promise.all([
    db.gamificationIdentity.findUnique({ where: { customerId } }),
    db.gamificationState.findUnique({ where: { customerId } }),
    db.gamificationEventLog.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.strikelabChallengeRun.findUnique({ where: { isoWeek } }),
    db.gamificationEventLog.findFirst({
      where: { customerId, eventType: "weekly_challenge_won", payloadJson: { contains: isoWeek } },
    }),
  ]);

  if (!identity) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (identity.erasedAt) {
    return NextResponse.json({ error: "erased" }, { status: 410 });
  }

  // Zeroed defaults when the engine hasn't materialized a state row yet, so the
  // student page always renders cleanly.
  const lifetimeXp = state?.lifetimeXp ?? 0;

  // Top-10 monthly leaderboard with names resolved from Yogo (first name + last
  // initial). Falls back to an anonymous label if a name can't be resolved.
  const board = await getMonthlyLeaderboard(customerId, 10);
  const names = await getCustomersByIds(board.map((b) => b.customerId));
  const leaderboard = board.map((b) => ({
    rank: b.rank,
    name: formatLeaderName(names.get(b.customerId)?.first_name, names.get(b.customerId)?.last_name)
      ?? `Atleta #${b.rank}`,
    monthlyPoints: b.monthlyPoints,
    isViewer: b.isViewer,
  }));

  const challengeDef = challengeRun ? getChallenge(challengeRun.challengeKey) : null;

  return NextResponse.json({
    customerId,
    leaderboard,
    challenge: challengeDef
      ? {
          name: challengeDef.name,
          points: challengeDef.points,
          status: challengeRun!.status,
          windowStart: challengeRun!.windowStart.toISOString(),
          windowEnd: challengeRun!.windowEnd.toISOString(),
          won: !!myWinEvent,
        }
      : null,
    state: {
      monthlyPoints: state?.monthlyPoints ?? 0,
      lifetimeXp,
      currentTier: state?.currentTier ?? "iniciante",
      currentStreakDays: state?.currentStreakDays ?? 0,
      streakShieldAvailable: state?.streakShieldAvailable ?? false,
      lastClassAt: state?.lastClassAt ?? null,
      tierProgress: getTierProgress(lifetimeXp),
    },
    events: events.map((e) => {
      const { className, boostsApplied } = parseEventPayload(e.payloadJson);
      return {
        id: e.id,
        eventType: e.eventType,
        pointsDelta: e.pointsDelta,
        xpDelta: e.xpDelta,
        createdAt: e.createdAt,
        className,
        boostsApplied,
      };
    }),
  });
}
