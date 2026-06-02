import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { listClasses, parseClassStart } from "@/lib/yogo/signups";
import { withCronLog } from "@/lib/cron-log";

// Verify request is from Vercel Cron (Authorization: Bearer ${CRON_SECRET})
function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) return new NextResponse("unauthorized", { status: 401 });

  const result = await withCronLog("spotify-playlist-lock", async () => {
    const today = isoDate(0);
    const tomorrow = isoDate(1);
    const all = await listClasses(today, tomorrow);
    const now = Date.now();
    const cutoff = 10 * 60 * 1000;

    let locked = 0;
    for (const k of all) {
      const startsAt = parseClassStart(k);
      if (!startsAt) continue;
      if (now - startsAt.getTime() >= cutoff) {
        const r = await db.waClassPlaylist.updateMany({
          where: { yogoClassId: k.id, locked: false },
          data: { locked: true },
        });
        locked += r.count;
      }
    }
    return { ok: true, locked };
  });

  return NextResponse.json(result);
}
