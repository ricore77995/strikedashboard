import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withCronLog } from "@/lib/cron-log";

const RETENTION_DAYS = 90;

// GET /api/cron/wa-purge — GDPR retention. Scheduled `0 3 * * *` in vercel.json
// (3am UTC daily, low-traffic window). Deletes WaInbound rows older than 90
// days. WaContact, WaSession, WaOutbound, and WaEvent are kept indefinitely
// (no PII in event meta, contact phone is operational, outbound is audit).
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return NextResponse.json({ error: "no_secret_configured" }, { status: 500 });
  const header = req.headers.get("authorization") ?? "";
  if (header !== `Bearer ${expected}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await withCronLog("wa-purge", async () => {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const res = await db.waInbound.deleteMany({ where: { receivedAt: { lt: cutoff } } });
    return { deleted: res.count, cutoff: cutoff.toISOString() };
  });

  return NextResponse.json(result);
}
