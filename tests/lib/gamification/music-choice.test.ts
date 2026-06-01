import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { appendEvent } from "@/lib/gamification/event-log";
import { checkMusicChoice } from "@/lib/gamification/music-choice";
import { getCurrentPeriod } from "@/lib/gamification/poll/shared";
import { eventLabel } from "@/lib/gamification/labels";

const CID = 92401;
const PHONE = "+351924000001";
const CLASS_A = 880001;
const CLASS_B = 880002;
const CLASS_C = 880003;
const PERIOD = getCurrentPeriod();
const ORIGINAL_FLAG = process.env.STRIKELAB_REAL_POINTS_ENABLED;

async function cleanup() {
  await db.gamificationEventLog.deleteMany({ where: { customerId: CID } }).catch(() => {});
  await db.gamificationState.deleteMany({ where: { customerId: CID } }).catch(() => {});
  await db.gamificationIdentity.deleteMany({ where: { customerId: CID } }).catch(() => {});
  await db.waSongRequest.deleteMany({ where: { contactId: PHONE } }).catch(() => {});
}

async function seedSongRequest(yogoClassId: number, status = "active") {
  await db.waSongRequest.create({
    data: {
      contactId: PHONE,
      yogoClassId,
      spotifyTrackId: `trk_${yogoClassId}`,
      spotifyTrackName: `Song ${yogoClassId}`,
      spotifyArtistName: `Artist ${yogoClassId}`,
      spotifyTrackUri: `spotify:track:trk_${yogoClassId}`,
      position: 1,
      status,
    },
  });
}

/** Seed an already-credited music event this week (for cap tests). */
async function seedMusicCredit(yogoClassId: number) {
  await appendEvent({
    customerId: CID,
    eventType: "music_choice_accepted",
    pointsDelta: 50,
    xpDelta: 0,
    source: "system",
    idempotencyKey: `music_choice:${CID}:${yogoClassId}`,
    pointsPeriod: PERIOD,
  });
}

function withFlag(on: boolean): () => void {
  const original = process.env.STRIKELAB_REAL_POINTS_ENABLED;
  process.env.STRIKELAB_REAL_POINTS_ENABLED = on ? "true" : "false";
  return () => { process.env.STRIKELAB_REAL_POINTS_ENABLED = original; };
}

async function musicEventCount(yogoClassId?: number): Promise<number> {
  return db.gamificationEventLog.count({
    where: {
      customerId: CID,
      eventType: "music_choice_accepted",
      ...(yogoClassId ? { idempotencyKey: `music_choice:${CID}:${yogoClassId}` } : {}),
    },
  });
}

describe("checkMusicChoice", () => {
  beforeEach(async () => {
    await cleanup();
    await db.gamificationIdentity.create({ data: { customerId: CID, phoneE164: PHONE } });
  });
  afterAll(cleanup);

  // Belt-and-suspenders: guarantee the flag is restored even if a test throws
  // before its own restore() runs (vitest shares the process across tests).
  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) delete process.env.STRIKELAB_REAL_POINTS_ENABLED;
    else process.env.STRIKELAB_REAL_POINTS_ENABLED = ORIGINAL_FLAG;
  });

  it("awards +50 once for an attended class with an active song request", async () => {
    await seedSongRequest(CLASS_A);
    const restore = withFlag(true);
    await checkMusicChoice(CID, PHONE, CLASS_A);
    restore();

    const event = await db.gamificationEventLog.findFirst({
      where: { customerId: CID, eventType: "music_choice_accepted" },
    });
    expect(event).not.toBeNull();
    expect(event!.pointsDelta).toBe(50);
    expect(event!.xpDelta).toBe(0);
    expect(JSON.parse(event!.payloadJson!)).toMatchObject({
      yogoClassId: CLASS_A,
      trackName: `Song ${CLASS_A}`,
      artistName: `Artist ${CLASS_A}`,
    });
  });

  it("is idempotent per class — no double pay on re-poll", async () => {
    await seedSongRequest(CLASS_A);
    const restore = withFlag(true);
    await checkMusicChoice(CID, PHONE, CLASS_A);
    await checkMusicChoice(CID, PHONE, CLASS_A);
    restore();
    expect(await musicEventCount(CLASS_A)).toBe(1);
  });

  it("caps at 2 per ISO week — third class is skipped", async () => {
    await seedMusicCredit(CLASS_A);
    await seedMusicCredit(CLASS_B);
    await seedSongRequest(CLASS_C);
    const restore = withFlag(true);
    await checkMusicChoice(CID, PHONE, CLASS_C);
    restore();
    expect(await musicEventCount(CLASS_C)).toBe(0);
    expect(await musicEventCount()).toBe(2);
  });

  it("skips when there is no active song request for the class", async () => {
    await seedSongRequest(CLASS_A, "swapped"); // not active
    const restore = withFlag(true);
    await checkMusicChoice(CID, PHONE, CLASS_A);
    restore();
    expect(await musicEventCount()).toBe(0);
  });

  it("skips when phone is null", async () => {
    await seedSongRequest(CLASS_A);
    const restore = withFlag(true);
    await checkMusicChoice(CID, null, CLASS_A);
    restore();
    expect(await musicEventCount()).toBe(0);
  });

  it("does nothing when the flag is off", async () => {
    await seedSongRequest(CLASS_A);
    const restore = withFlag(false);
    await checkMusicChoice(CID, PHONE, CLASS_A);
    restore();
    expect(await musicEventCount()).toBe(0);
  });

  it("renders a Pt-PT label for the activity feed", () => {
    expect(eventLabel("music_choice_accepted")).toBe("Música escolhida");
  });
});
