import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { listClasses, parseClassStart } from "@/lib/yogo/signups";
import { createClassPlaylist } from "@/lib/spotify/playlist-manager";
import { withCronLog } from "@/lib/cron-log";

// Verify request is from Vercel Cron (Authorization: Bearer ${CRON_SECRET})
function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// Group classes have more than 1 seat. PTs are 1:1 (seats = 1 or unset).
// The YogoClass type uses `seats` (not `max_attendees`) — see src/lib/yogo/signups.ts.
function isGroupClass(k: { seats?: number }): boolean {
  return (k.seats ?? 0) > 1;
}

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) return new NextResponse("unauthorized", { status: 401 });

  const result = await withCronLog("spotify-playlists", async () => {
    const today = isoDate(0);
    const tomorrow = isoDate(1);
    const all = await listClasses(today, tomorrow);
    const todays = all.filter(isGroupClass).filter((k) => k.date === today);

    const results: { yogoClassId: number; created: boolean; error?: string }[] = [];
    for (const k of todays) {
      const startsAt = parseClassStart(k);
      if (!startsAt) {
        results.push({ yogoClassId: k.id, created: false, error: "missing date/start_time" });
        continue;
      }
      try {
        const r = await createClassPlaylist({
          yogoClassId: k.id,
          className: k.class_type?.name ?? `Class ${k.id}`,
          startsAtIso: startsAt.toISOString(),
        });
        results.push({ yogoClassId: k.id, created: r.created });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        results.push({ yogoClassId: k.id, created: false, error: errorMsg });
        await db.waEvent.create({
          data: {
            kind: "SPOTIFY_PLAYLIST_CREATE_FAIL",
            phoneE164: null,
            meta: JSON.stringify({ yogoClassId: k.id, error: errorMsg }),
          },
        });
      }
    }
    return { ok: true, total: todays.length, results };
  });

  return NextResponse.json(result);
}
