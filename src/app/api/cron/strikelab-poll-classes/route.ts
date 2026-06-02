import { NextRequest, NextResponse } from "next/server";
import { pollClasses } from "@/lib/gamification/poll/classes";
import { isWithinOpsHours } from "@/lib/gamification/poll/shared";
import { withCronLog } from "@/lib/cron-log";

/**
 * GET /api/cron/strikelab-poll-classes
 *
 * 15-minute cron that fetches today's Yogo classes and emits
 * checkin_observed events for checked-in students.
 *
 * Gated by:
 * 1. CRON_SECRET bearer auth
 * 2. STRIKELAB_ENABLED master switch
 * 3. STRIKELAB_POLL_CLASSES_ENABLED feature flag
 * 4. Operating hours (STRIKELAB_OPS_START_HOUR..STRIKELAB_OPS_END_HOUR Lisbon)
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
  if (process.env.STRIKELAB_POLL_CLASSES_ENABLED !== "true") {
    return NextResponse.json({ skipped: true, reason: "STRIKELAB_POLL_CLASSES_ENABLED not set" });
  }

  // Operating hours gate
  const startHour = parseInt(process.env.STRIKELAB_OPS_START_HOUR ?? "6", 10);
  const endHour = parseInt(process.env.STRIKELAB_OPS_END_HOUR ?? "23", 10);
  if (!isWithinOpsHours(startHour, endHour)) {
    return NextResponse.json({ skipped: true, reason: "outside_operating_hours" });
  }

  try {
    const result = await withCronLog("strikelab-poll-classes", () => pollClasses());
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
