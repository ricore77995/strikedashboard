import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { COOKIE_NAME } from "@/lib/auth";

/**
 * GET /api/strikelab/admin/logs?type=events|cron|challenges&page=1
 *
 * Admin-only. Returns gamification event logs, cron run logs, or challenge run history.
 */
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(COOKIE_NAME);
  if (!cookie?.value) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "events";
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = 50;
  const skip = (page - 1) * limit;

  if (type === "events") {
    const eventType = searchParams.get("eventType");
    const source = searchParams.get("source");

    const where: Record<string, unknown> = {};
    if (eventType) where.eventType = eventType;
    if (source) where.source = source;

    const [events, total] = await Promise.all([
      db.gamificationEventLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      db.gamificationEventLog.count({ where }),
    ]);

    return NextResponse.json({
      events: events.map((e) => ({
        id: e.id,
        eventId: e.eventId,
        customerId: e.customerId,
        eventType: e.eventType,
        pointsDelta: e.pointsDelta,
        xpDelta: e.xpDelta,
        source: e.source,
        pointsPeriod: e.pointsPeriod,
        createdAt: e.createdAt,
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  }

  if (type === "cron") {
    const cronName = searchParams.get("cronName");
    const where: Record<string, unknown> = {};
    if (cronName) where.cronName = cronName;

    const [runs, total] = await Promise.all([
      db.cronRunLog.findMany({
        where,
        orderBy: { startedAt: "desc" },
        skip,
        take: limit,
      }),
      db.cronRunLog.count({ where }),
    ]);

    // Schedule overview: all configured crons with last run
    const SCHEDULED = [
      { cronName: "strikelab-poll-classes", schedule: "0 5 * * *", label: "Diário 05:00 UTC" },
      { cronName: "strikelab-poll-memberships", schedule: "0 2 * * *", label: "Diário 02:00 UTC" },
      { cronName: "strikelab-challenge-launch", schedule: "0 11 * * 3", label: "Quarta 11:00 UTC" },
      { cronName: "strikelab-challenge-resolve", schedule: "0 5 * * 1", label: "Segunda 05:00 UTC" },
      { cronName: "strikelab-monthly-reset", schedule: "0 0 1 * *", label: "Mensal (dia 1)" },
      { cronName: "trial-followup", schedule: "0 10,11 * * *", label: "Diário 10+11 UTC" },
      { cronName: "wa-purge", schedule: "0 3 * * *", label: "Diário 03:00 UTC" },
      { cronName: "spotify-playlists", schedule: "0 4 * * *", label: "Diário 04:00 UTC" },
      { cronName: "spotify-playlist-lock", schedule: "0 23 * * *", label: "Diário 23:00 UTC" },
    ] as const;

    // Get last run for each scheduled cron
    const lastRuns = await db.cronRunLog.findMany({
      where: { cronName: { in: SCHEDULED.map((s) => s.cronName) } },
      orderBy: { startedAt: "desc" },
      distinct: ["cronName"],
    });
    const lastRunMap = new Map(lastRuns.map((r) => [r.cronName, { status: r.status, startedAt: r.startedAt.toISOString(), durationMs: r.durationMs }]));

    return NextResponse.json({
      runs: runs.map((r) => ({
        id: r.id,
        cronName: r.cronName,
        status: r.status,
        message: r.message,
        durationMs: r.durationMs,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
      })),
      schedule: SCHEDULED.map((s) => ({
        ...s,
        lastRun: lastRunMap.get(s.cronName) ?? null,
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  }

  if (type === "challenges") {
    const runs = await db.strikelabChallengeRun.findMany({
      orderBy: { launchedAt: "desc" },
      take: 50,
    });

    return NextResponse.json({
      runs: runs.map((r) => ({
        id: r.id,
        challengeKey: r.challengeKey,
        isoWeek: r.isoWeek,
        status: r.status,
        windowStart: r.windowStart,
        windowEnd: r.windowEnd,
        launchedAt: r.launchedAt,
        resolvedAt: r.resolvedAt,
      })),
    });
  }

  return NextResponse.json({ error: "invalid type" }, { status: 400 });
}
