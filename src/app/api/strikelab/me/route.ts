import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTierProgress } from "@/lib/gamification/tier";
import { parseEventPayload } from "@/lib/gamification/event-view";
import { verifyStudentToken } from "@/lib/gamification/student-link";

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

  const [identity, state, events] = await Promise.all([
    db.gamificationIdentity.findUnique({ where: { customerId } }),
    db.gamificationState.findUnique({ where: { customerId } }),
    db.gamificationEventLog.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: 20,
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

  return NextResponse.json({
    customerId,
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
