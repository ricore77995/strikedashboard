import { sendText } from "@/lib/wa/meta";
import { sendMenu } from "@/lib/wa/handlers/menu";
import { userBookingsNext24h } from "@/lib/yogo/signups";
import { ensureClassPlaylist } from "@/lib/wa/handlers/song-request";

const NO_CLASSES =
  "Sem aulas em grupo reservadas nas próximas 24h. Reserva uma com 'reserva' primeiro 🥷";

function formatTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${dd} ${hh}:${mm}`;
}

export async function handlePlaylistList(phoneE164: string): Promise<void> {
  const bookings = await userBookingsNext24h(phoneE164);
  if (bookings.length === 0) {
    await sendText(phoneE164, NO_CLASSES);
    await sendMenu(phoneE164);
    return;
  }

  const lines = ["As tuas próximas aulas:", ""];
  let any = false;
  for (let i = 0; i < bookings.length; i++) {
    const b = bookings[i];
    // Create the playlist on demand if the daily cron hasn't run yet
    const playlist = await ensureClassPlaylist(b.yogoClassId);
    if (!playlist) continue;
    lines.push(`${i + 1}. ${formatTime(b.startsAtIso)} — ${b.className}`);
    lines.push(`   https://open.spotify.com/playlist/${playlist.spotifyPlaylistId}`);
    any = true;
  }

  if (!any) {
    await sendText(phoneE164, NO_CLASSES);
    await sendMenu(phoneE164);
    return;
  }

  await sendText(phoneE164, lines.join("\n"));
  await sendMenu(phoneE164);
}
