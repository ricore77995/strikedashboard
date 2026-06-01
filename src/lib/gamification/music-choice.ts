import { db } from "@/lib/db";
import { appendEvent } from "./event-log";
import { getCurrentPeriod, getISOWeekStart } from "./poll/shared";
import { MUSIC_CHOICE_BONUS, MUSIC_CHOICE_WEEKLY_CAP } from "./constants";

/**
 * Award the music-choice bonus when a student checks in to a class they
 * picked the music for.
 *
 * Credited on ATTENDANCE (not playlist acceptance) to remove the
 * book → request → unbook gaming vector. Points only — no XP, so music
 * engagement does not accelerate tier progression.
 *
 * Idempotent per class (one credit per attended class). Capped at
 * MUSIC_CHOICE_WEEKLY_CAP credited classes per ISO week (Mon–Sun, Lisbon).
 */
export async function checkMusicChoice(
  customerId: number,
  phoneE164: string | null,
  yogoClassId: number,
): Promise<void> {
  if (process.env.STRIKELAB_REAL_POINTS_ENABLED !== "true") return;
  if (!phoneE164) return;

  // Did this student pick the (still-active) music for this class?
  const request = await db.waSongRequest.findFirst({
    where: { contactId: phoneE164, yogoClassId, status: "active" },
  });
  if (!request) return;

  // Idempotency: at most one music credit per class.
  const idempotencyKey = `music_choice:${customerId}:${yogoClassId}`;
  const existing = await db.gamificationEventLog.findFirst({
    where: { customerId, eventType: "music_choice_accepted", idempotencyKey },
  });
  if (existing) return;

  // Weekly cap: at most MUSIC_CHOICE_WEEKLY_CAP credited classes per ISO week.
  const weekStart = getISOWeekStart(new Date());
  const creditedThisWeek = await db.gamificationEventLog.count({
    where: {
      customerId,
      eventType: "music_choice_accepted",
      createdAt: { gte: weekStart },
    },
  });
  if (creditedThisWeek >= MUSIC_CHOICE_WEEKLY_CAP) return;

  await appendEvent({
    customerId,
    eventType: "music_choice_accepted",
    pointsDelta: MUSIC_CHOICE_BONUS,
    xpDelta: 0,
    payloadJson: {
      yogoClassId,
      trackName: request.spotifyTrackName,
      artistName: request.spotifyArtistName,
    },
    source: "system",
    idempotencyKey,
    pointsPeriod: getCurrentPeriod(),
  });
}
