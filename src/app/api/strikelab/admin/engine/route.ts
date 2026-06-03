import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { COOKIE_NAME } from "@/lib/auth";
import { getChallenge } from "@/lib/gamification/challenges/catalog";

/**
 * GET /api/strikelab/admin/engine
 *
 * Engine dashboard data: poll health, event breakdown, referral pipeline,
 * challenge status. All from existing models — no new tables needed.
 */
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(COOKIE_NAME);
  if (!cookie?.value) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // 1. Poll health — last run of each cron
  const [classPolls, membershipPolls] = await Promise.all([
    db.cronRunLog.findMany({
      where: { cronName: "strikelab-poll-classes" },
      orderBy: { startedAt: "desc" },
      take: 1,
    }),
    db.cronRunLog.findMany({
      where: { cronName: "strikelab-poll-memberships" },
      orderBy: { startedAt: "desc" },
      take: 1,
    }),
  ]);

  const polls = {
    classes: classPolls[0]
      ? {
          lastRun: classPolls[0].startedAt.toISOString(),
          status: classPolls[0].status,
          durationMs: classPolls[0].durationMs,
          message: classPolls[0].message,
        }
      : null,
    memberships: membershipPolls[0]
      ? {
          lastRun: membershipPolls[0].startedAt.toISOString(),
          status: membershipPolls[0].status,
          durationMs: membershipPolls[0].durationMs,
          message: membershipPolls[0].message,
        }
      : null,
  };

  // 2. Event breakdown — counts by eventType for today / this week / this month
  const allEvents = await db.gamificationEventLog.findMany({
    where: { createdAt: { gte: monthStart } },
    select: { eventType: true, createdAt: true },
  });

  const breakdown = new Map<string, { today: number; thisWeek: number; thisMonth: number }>();

  for (const ev of allEvents) {
    const entry = breakdown.get(ev.eventType) ?? { today: 0, thisWeek: 0, thisMonth: 0 };
    entry.thisMonth++;
    if (ev.createdAt >= weekStart) entry.thisWeek++;
    if (ev.createdAt >= todayStart) entry.today++;
    breakdown.set(ev.eventType, entry);
  }

  const eventBreakdown = [...breakdown.entries()]
    .map(([eventType, counts]) => ({ eventType, ...counts }))
    .sort((a, b) => b.thisMonth - a.thisMonth);

  // 3. Referral pipeline
  const [pending, trialCredited, phase1, phase2] = await Promise.all([
    db.referral.count({ where: { status: "pending" } }),
    db.referral.count({ where: { status: "trial_credited" } }),
    db.referral.count({ where: { status: "phase1_credited" } }),
    db.referral.count({ where: { status: "phase2_credited" } }),
  ]);

  const referralPipeline = { pending, trialCredited, phase1, phase2 };

  // 4. Challenge status — current active/resolved run
  const challengeRun = await db.strikelabChallengeRun.findFirst({
    orderBy: { launchedAt: "desc" },
  });

  let challenge: EngineData["challenge"] = null;

  if (challengeRun) {
    const def = getChallenge(challengeRun.challengeKey);
    const winners = challengeRun.status === "resolved"
      ? await db.gamificationEventLog.findMany({
          where: {
            eventType: "weekly_challenge_won",
            payloadJson: { contains: challengeRun.isoWeek },
          },
          orderBy: { createdAt: "asc" },
          select: { customerId: true, pointsDelta: true },
        })
      : [];

    challenge = {
      key: challengeRun.challengeKey,
      name: def?.name ?? challengeRun.challengeKey,
      status: challengeRun.status,
      isoWeek: challengeRun.isoWeek,
      windowStart: challengeRun.windowStart.toISOString(),
      windowEnd: challengeRun.windowEnd.toISOString(),
      winners: winners.length,
      points: def?.points ?? 0,
    };
  }

  return NextResponse.json({ polls, eventBreakdown, referralPipeline, challenge });
}

interface EngineData {
  polls: {
    classes: { lastRun: string; status: string; durationMs: number | null; message: string | null } | null;
    memberships: { lastRun: string; status: string; durationMs: number | null; message: string | null } | null;
  };
  eventBreakdown: { eventType: string; today: number; thisWeek: number; thisMonth: number }[];
  referralPipeline: { pending: number; trialCredited: number; phase1: number; phase2: number };
  challenge: {
    key: string; name: string; status: string; isoWeek: string;
    windowStart: string; windowEnd: string; winners: number; points: number;
  } | null;
}
