import { NextRequest, NextResponse } from "next/server";
import { detectLoyaltyQualifications, expireStaleGrants } from "@/lib/gamification/loyalty";
import { withCronLog } from "@/lib/cron-log";

/**
 * GET /api/cron/strikelab-loyalty-detect
 *
 * Daily cron (03:00 Lisbon) that scans active loyalty levels,
 * detects qualifying students, creates pending grants, and expires
 * stale grants (>30 days in pending_approval).
 *
 * Runs after strikelab-poll-memberships (02:00) so snapshots are fresh.
 *
 * Gated by:
 * 1. CRON_SECRET bearer auth
 * 2. STRIKELAB_ENABLED master switch
 */
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "no_secret_configured" }, { status: 500 });
  }
  const header = req.headers.get("authorization") ?? "";
  if (header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (process.env.STRIKELAB_ENABLED !== "true") {
    return NextResponse.json({ skipped: true, reason: "STRIKELAB_ENABLED not set" });
  }

  return withCronLog("strikelab-loyalty-detect", async () => {
    const [detectResult, expiredCount] = await Promise.all([
      detectLoyaltyQualifications(),
      expireStaleGrants(),
    ]);

    return {
      scanned: detectResult.scanned,
      newGrants: detectResult.newGrants,
      errors: detectResult.errors,
      expired: expiredCount,
    };
  }).then((result) => NextResponse.json(result))
    .catch((e) => NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    ));
}
