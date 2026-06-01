import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { awardChallengeWinners } from "@/lib/gamification/challenges/resolve";
import type { ScorerClass } from "@/lib/gamification/challenges/scorer-flash-checkin";

const CIDS = [93101, 93102, 93103, 93104, 93105, 93106, 93107];
const ISO_WEEK = "2026-06-01";
const WIN_START = Date.parse("2026-06-03T11:00:00.000Z");
const ORIGINAL_FLAG = process.env.STRIKELAB_REAL_POINTS_ENABLED;

async function cleanup() {
  await db.gamificationEventLog.deleteMany({ where: { customerId: { in: CIDS } } }).catch(() => {});
  await db.gamificationIdentity.deleteMany({ where: { customerId: { in: CIDS } } }).catch(() => {});
  await db.strikelabChallengeRun.deleteMany({ where: { isoWeek: ISO_WEEK } }).catch(() => {});
}

async function seedIdentity(customerId: number, opts: { erased?: boolean } = {}) {
  await db.gamificationIdentity.create({
    data: {
      customerId,
      phoneE164: `+3519${customerId}`,
      consentTraining: true,
      erasedAt: opts.erased ? new Date() : null,
    },
  });
}

async function makeRun() {
  return db.strikelabChallengeRun.create({
    data: {
      challengeKey: "flash_checkin", isoWeek: ISO_WEEK, status: "active",
      windowStart: new Date(WIN_START), windowEnd: new Date(WIN_START + 4 * 86400000),
      launchedAt: new Date(WIN_START),
    },
  });
}

function classesFor(entries: Array<{ id: number; offset: number }>): ScorerClass[] {
  return [{ signups: entries.map((e) => ({ user: { id: e.id }, checked_in: WIN_START + e.offset })) }];
}

function setFlag(on: boolean) { process.env.STRIKELAB_REAL_POINTS_ENABLED = on ? "true" : "false"; }

describe("awardChallengeWinners", () => {
  beforeEach(cleanup);
  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) delete process.env.STRIKELAB_REAL_POINTS_ENABLED;
    else process.env.STRIKELAB_REAL_POINTS_ENABLED = ORIGINAL_FLAG;
  });
  afterAll(cleanup);

  it("awards +250/xp0 to the first winnersMax eligible, in rank order, marks resolved", async () => {
    for (const c of CIDS.slice(0, 6)) await seedIdentity(c);
    const run = await makeRun();
    setFlag(true);
    const classes = classesFor([
      { id: CIDS[0], offset: 1000 }, { id: CIDS[1], offset: 2000 }, { id: CIDS[2], offset: 3000 },
      { id: CIDS[3], offset: 4000 }, { id: CIDS[4], offset: 5000 }, { id: CIDS[5], offset: 6000 },
    ]);
    const res = await awardChallengeWinners(run, classes);
    expect(res.awarded).toBe(5);

    const events = await db.gamificationEventLog.findMany({
      where: { customerId: { in: CIDS }, eventType: "weekly_challenge_won" },
      orderBy: { customerId: "asc" },
    });
    expect(events).toHaveLength(5);
    expect(events.every((e) => e.pointsDelta === 250 && e.xpDelta === 0)).toBe(true);
    expect(events.find((e) => e.customerId === CIDS[5])).toBeUndefined();

    const after = await db.strikelabChallengeRun.findUnique({ where: { id: run.id } });
    expect(after!.status).toBe("resolved");
  });

  it("backfills past a gate-failing athlete (erased) to keep winnersMax winners", async () => {
    await seedIdentity(CIDS[0], { erased: true });
    for (const c of CIDS.slice(1, 6)) await seedIdentity(c);
    const run = await makeRun();
    setFlag(true);
    const classes = classesFor(CIDS.slice(0, 6).map((id, i) => ({ id, offset: 1000 * (i + 1) })));
    const res = await awardChallengeWinners(run, classes);
    expect(res.awarded).toBe(5);
    const erasedEvent = await db.gamificationEventLog.findFirst({
      where: { customerId: CIDS[0], eventType: "weekly_challenge_won" },
    });
    expect(erasedEvent).toBeNull();
  });

  it("is idempotent — re-run does not double-award and yields the same winners", async () => {
    for (const c of CIDS.slice(0, 5)) await seedIdentity(c);
    const run = await makeRun();
    setFlag(true);
    const classes = classesFor(CIDS.slice(0, 5).map((id, i) => ({ id, offset: 1000 * (i + 1) })));
    await awardChallengeWinners(run, classes);
    await awardChallengeWinners(run, classes);
    const count = await db.gamificationEventLog.count({
      where: { customerId: { in: CIDS }, eventType: "weekly_challenge_won" },
    });
    expect(count).toBe(5);
  });

  it("flag off → awards nothing and leaves the run active (replayable)", async () => {
    for (const c of CIDS.slice(0, 5)) await seedIdentity(c);
    const run = await makeRun();
    setFlag(false);
    const classes = classesFor(CIDS.slice(0, 5).map((id, i) => ({ id, offset: 1000 * (i + 1) })));
    const res = await awardChallengeWinners(run, classes);
    expect(res.awarded).toBe(0);
    const count = await db.gamificationEventLog.count({
      where: { customerId: { in: CIDS }, eventType: "weekly_challenge_won" },
    });
    expect(count).toBe(0);
    const after = await db.strikelabChallengeRun.findUnique({ where: { id: run.id } });
    expect(after!.status).toBe("active");
  });
});
