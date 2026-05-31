import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { appendEvent } from "@/lib/gamification/event-log";
import { materializeState, persistState } from "@/lib/gamification/state";

const CID = 90002;
const PHONE = "+351900000002";

async function cleanup() {
  await db.gamificationEventLog.deleteMany({ where: { customerId: CID } });
  await db.gamificationState.deleteMany({ where: { customerId: CID } });
  await db.gamificationIdentity.deleteMany({ where: { customerId: CID } });
}

describe("materializeState", () => {
  beforeAll(async () => {
    await cleanup();
    await db.gamificationIdentity.create({
      data: { customerId: CID, phoneE164: PHONE },
    });
  });

  afterAll(cleanup);

  it("returns null for unknown customer", async () => {
    const state = await materializeState(999999);
    expect(state).toBeNull();
  });

  it("returns zeroed state for identity with no events", async () => {
    const state = await materializeState(CID);
    expect(state).not.toBeNull();
    expect(state!.monthlyPoints).toBe(0);
    expect(state!.lifetimeXp).toBe(0);
    expect(state!.currentTier).toBe("iniciante");
  });

  it("accumulates points and xp from events", async () => {
    await appendEvent({
      customerId: CID,
      eventType: "checkin_observed",
      pointsDelta: 10,
      xpDelta: 5,
      idempotencyKey: `test:state:checkin:${CID}:1`,
    });
    await appendEvent({
      customerId: CID,
      eventType: "checkin_observed",
      pointsDelta: 10,
      xpDelta: 5,
      idempotencyKey: `test:state:checkin:${CID}:2`,
    });

    const state = await materializeState(CID);
    expect(state!.monthlyPoints).toBe(20);
    expect(state!.lifetimeXp).toBe(10);
    expect(state!.lastReplayedEventId).toBeGreaterThan(0);
  });

  it("tracks lastClassAt from checkin events with non-zero points", async () => {
    const state = await materializeState(CID);
    expect(state!.lastClassAt).not.toBeNull();
  });

  it("persistState upserts into GamificationState table", async () => {
    const state = (await materializeState(CID))!;
    await persistState(state);

    const row = await db.gamificationState.findUnique({ where: { customerId: CID } });
    expect(row).not.toBeNull();
    expect(row!.monthlyPoints).toBe(20);
    expect(row!.lifetimeXp).toBe(10);
  });
});
