import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTierProgress } from "@/lib/gamification/tier";
import { parseEventPayload } from "@/lib/gamification/event-view";

/**
 * GET /api/strikelab/admin/[customerId]
 *
 * Admin-only. Returns identity, state, and last 50 events for a student.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ customerId: string }> },
) {
  const cookie = _req.cookies.get("session");
  if (!cookie?.value) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { customerId: cidStr } = await params;
  const customerId = parseInt(cidStr, 10);
  if (isNaN(customerId)) {
    return NextResponse.json({ error: "Invalid customerId" }, { status: 400 });
  }

  const [identity, state, events] = await Promise.all([
    db.gamificationIdentity.findUnique({ where: { customerId } }),
    db.gamificationState.findUnique({ where: { customerId } }),
    db.gamificationEventLog.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  if (!identity) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  return NextResponse.json({
    identity: {
      customerId: identity.customerId,
      phoneE164: identity.phoneE164.startsWith("erased_") ? null : identity.phoneE164,
      email: identity.email,
      instagramHandle: identity.instagramHandle,
      igVerifiedAt: identity.igVerifiedAt,
      optInAt: identity.optInAt,
      optOutAt: identity.optOutAt,
      consentTraining: identity.consentTraining,
      consentUgc: identity.consentUgc,
      consentRealName: identity.consentRealName,
      consentBroadcasts: identity.consentBroadcasts,
      birthYear: identity.birthYear,
      erasedAt: identity.erasedAt,
      medicalPauseUntil: identity.medicalPauseUntil,
      vacationPauseUntil: identity.vacationPauseUntil,
      personalPauseUntil: identity.personalPauseUntil,
      createdAt: identity.createdAt,
    },
    state: state
      ? {
          monthlyPoints: state.monthlyPoints,
          lifetimeXp: state.lifetimeXp,
          currentTier: state.currentTier,
          proposedTier: state.proposedTier,
          currentStreakDays: state.currentStreakDays,
          streakShieldAvailable: state.streakShieldAvailable,
          lastClassAt: state.lastClassAt,
          tierProgress: getTierProgress(state.lifetimeXp),
        }
      : null,
    events: events.map((e) => {
      const { className, boostsApplied } = parseEventPayload(e.payloadJson);
      return {
        id: e.id,
        eventId: e.eventId,
        eventType: e.eventType,
        pointsDelta: e.pointsDelta,
        xpDelta: e.xpDelta,
        source: e.source,
        pointsPeriod: e.pointsPeriod,
        createdAt: e.createdAt,
        className,
        boostsApplied,
      };
    }),
  });
}
