import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/strikelab/admin/logs?type=events|cron|challenges&page=1
 *
 * Admin-only. Returns gamification event logs, cron run logs, or challenge run history.
 */
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("session");
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
