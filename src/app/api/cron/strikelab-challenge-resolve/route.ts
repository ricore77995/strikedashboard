import { NextRequest, NextResponse } from "next/server";
import { resolveWeeklyChallenge } from "@/lib/gamification/challenges/resolve";
import { withCronLog } from "@/lib/cron-log";

/**
 * GET /api/cron/strikelab-challenge-resolve
 * Weekly cron (Mon ~06:00 Lisbon) that scores the active run from live Yogo
 * data and awards winners. Replay-safe: if STRIKELAB_REAL_POINTS_ENABLED is
 * off, the run is left active for a later resolve.
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
    const result = await withCronLog("strikelab-challenge-resolve", () => resolveWeeklyChallenge());
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
