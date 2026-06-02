import { NextRequest, NextResponse } from "next/server";
import { performRetroactiveReplay } from "@/lib/gamification/retroactive-replay";
import { withCronLog } from "@/lib/cron-log";

/**
 * GET /api/cron/strikelab-retroactive-replay
 *
 * One-shot retroactive replay of Phase 0 events with real base points.
 * Idempotent — safe to re-trigger.
 *
 * Gated by:
 * 1. CRON_SECRET bearer auth
 * 2. STRIKELAB_ENABLED master switch
 * 3. STRIKELAB_REAL_POINTS_ENABLED Phase 1 flag
 */
export async function GET(req: NextRequest) {
  // Auth
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "no_secret_configured" }, { status: 500 });
  }
  const header = req.headers.get("authorization") ?? "";
  if (header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Master kill switch
  if (process.env.STRIKELAB_ENABLED !== "true") {
    return NextResponse.json({ skipped: true, reason: "STRIKELAB_ENABLED not set" });
  }

  // Phase 1 flag
  if (process.env.STRIKELAB_REAL_POINTS_ENABLED !== "true") {
    return NextResponse.json({ skipped: true, reason: "STRIKELAB_REAL_POINTS_ENABLED not set" });
  }

  try {
    const result = await withCronLog("strikelab-retroactive-replay", () => performRetroactiveReplay());
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
