import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTierProgress } from "@/lib/gamification/tier";

/** Safely parse a stored event payload, extracting only the fields the UI shows. */
function parsePayload(raw: string | null): { className: string | null; boostsApplied: string[] } {
  if (!raw) return { className: null, boostsApplied: [] };
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    const className = typeof p.className === "string" ? p.className : null;
    const boostsApplied = Array.isArray(p.boostsApplied)
      ? p.boostsApplied.filter((b): b is string => typeof b === "string")
      : [];
    return { className, boostsApplied };
  } catch {
    return { className: null, boostsApplied: [] };
  }
}

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
      const { className, boostsApplied } = parsePayload(e.payloadJson);
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
