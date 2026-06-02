import { NextRequest, NextResponse } from "next/server";
import { performMonthlyReset } from "@/lib/gamification/reset";
import { withCronLog } from "@/lib/cron-log";

/**
 * GET /api/cron/strikelab-monthly-reset
 *
 * Monthly cron (1st of month, 00:05 UTC) that seals the current month's
 * points into snapshots and zeroes monthlyPoints.
 *
 * Gated by:
 * 1. CRON_SECRET bearer auth
 * 2. STRIKELAB_ENABLED master switch
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

  try {
    const result = await withCronLog("strikelab-monthly-reset", () => performMonthlyReset());
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
