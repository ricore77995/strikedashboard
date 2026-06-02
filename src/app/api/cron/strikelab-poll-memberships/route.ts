import { NextRequest, NextResponse } from "next/server";
import { pollMemberships } from "@/lib/gamification/poll/memberships";
import { withCronLog } from "@/lib/cron-log";

/**
 * GET /api/cron/strikelab-poll-memberships
 *
 * Daily cron (02:00 Lisbon) that sweeps all Yogo memberships,
 * creates today's snapshot, diffs against yesterday's, and emits
 * renewal/cancellation/dunning events.
 *
 * Gated by:
 * 1. CRON_SECRET bearer auth
 * 2. STRIKELAB_ENABLED master switch
 * 3. STRIKELAB_POLL_MEMBERSHIPS_ENABLED feature flag
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

  // Feature flag gate
  if (process.env.STRIKELAB_POLL_MEMBERSHIPS_ENABLED !== "true") {
    return NextResponse.json({ skipped: true, reason: "STRIKELAB_POLL_MEMBERSHIPS_ENABLED not set" });
  }

  try {
    const result = await withCronLog("strikelab-poll-memberships", () => pollMemberships());
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
