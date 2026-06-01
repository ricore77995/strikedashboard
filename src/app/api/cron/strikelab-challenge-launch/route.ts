import { NextRequest, NextResponse } from "next/server";
import { launchWeeklyChallenge } from "@/lib/gamification/challenges/launch";

/**
 * GET /api/cron/strikelab-challenge-launch
 * Weekly cron (Wed ~12:00 Lisbon) that creates this week's challenge run.
 * Gated by CRON_SECRET bearer + STRIKELAB_ENABLED.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return NextResponse.json({ error: "no_secret_configured" }, { status: 500 });
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (process.env.STRIKELAB_ENABLED !== "true") {
    return NextResponse.json({ skipped: true, reason: "STRIKELAB_ENABLED not set" });
  }
  try {
    const run = await launchWeeklyChallenge();
    return NextResponse.json({ isoWeek: run.isoWeek, challengeKey: run.challengeKey, status: run.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
