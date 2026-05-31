import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { computeBoostMultiplier, getActiveBoostsForCheckin } from "@/lib/gamification/boosts";
import { appendEvent } from "@/lib/gamification/event-log";
import { getCurrentPeriod } from "@/lib/gamification/poll/shared";
import type { BoostDef } from "@/lib/gamification/constants";

const CID = 91201;
const PHONE = "+351912000001";

async function cleanup() {
  await db.gamificationEventLog.deleteMany({ where: { customerId: CID } }).catch(() => {});
  await db.gamificationState.deleteMany({ where: { customerId: CID } }).catch(() => {});
  await db.gamificationIdentity.deleteMany({ where: { customerId: CID } }).catch(() => {});
}

describe("computeBoostMultiplier", () => {
  it("returns 1.0 for no boosts", () => {
    expect(computeBoostMultiplier([])).toBe(1.0);
  });

  it("applies single boost correctly", () => {
    const boosts: BoostDef[] = [{ id: "weekend", multiplier: 1.8 }];
    expect(computeBoostMultiplier(boosts)).toBeCloseTo(1.8, 5);
  });

  it("stacks multiple boosts additively", () => {
    const boosts: BoostDef[] = [
      { id: "weekend", multiplier: 1.8 },
      { id: "renovacao", multiplier: 1.5 },
    ];
    // 1.0 + (0.8 + 0.5) = 2.3
    expect(computeBoostMultiplier(boosts)).toBeCloseTo(2.3, 5);
  });

  it("caps at BOOST_CAP (3.0)", () => {
    const boosts: BoostDef[] = [
      { id: "weekend", multiplier: 1.8 },
      { id: "renovacao", multiplier: 1.5 },
      { id: "streak_15", multiplier: 1.8 },
      { id: "supera_ritmo", multiplier: 1.2 },
    ];
    // 1.0 + (0.8 + 0.5 + 0.8 + 0.2) = 3.3 → capped at 3.0
    expect(computeBoostMultiplier(boosts)).toBe(3.0);
  });

  it("stacks exactly at cap boundary", () => {
    const boosts: BoostDef[] = [
      { id: "weekend", multiplier: 1.8 },
      { id: "streak_15", multiplier: 1.8 },
    ];
    // 1.0 + (0.8 + 0.8) = 2.6
    expect(computeBoostMultiplier(boosts)).toBeCloseTo(2.6, 5);
  });
});

describe("getActiveBoostsForCheckin", () => {
  beforeAll(async () => {
    await cleanup();
    await db.gamificationIdentity.create({
      data: { customerId: CID, phoneE164: PHONE },
    });
  });

  afterAll(cleanup);

  it("returns weekend boost on Saturday", async () => {
    // Create a Saturday date
    const saturday = new Date("2026-05-30T10:00:00Z"); // This is a Saturday

    const boosts = await getActiveBoostsForCheckin(
      CID,
      { currentStreakDays: 0, lastClassAt: null },
      { planCategory: "P8", checkinDate: saturday },
    );

    const weekend = boosts.find((b) => b.id === "weekend");
    expect(weekend).toBeDefined();
    expect(weekend!.multiplier).toBe(1.8);
  });

  it("does not return weekend boost on Monday", async () => {
    const monday = new Date("2026-06-01T10:00:00Z"); // Monday

    const boosts = await getActiveBoostsForCheckin(
      CID,
      { currentStreakDays: 0, lastClassAt: null },
      { planCategory: "P8", checkinDate: monday },
    );

    expect(boosts.find((b) => b.id === "weekend")).toBeUndefined();
  });

  it("returns renovacao boost when recent renewal exists", async () => {
    // Add a recent renewal event via appendEvent
    await appendEvent({
      customerId: CID,
      eventType: "subscription_renewed",
      pointsDelta: 0,
      xpDelta: 0,
      source: "cron",
      idempotencyKey: `test_renewal:${CID}`,
      pointsPeriod: getCurrentPeriod(),
    });

    const monday = new Date("2026-06-01T10:00:00Z");
    const boosts = await getActiveBoostsForCheckin(
      CID,
      { currentStreakDays: 0, lastClassAt: null },
      { planCategory: "P8", checkinDate: monday },
    );

    const renovacao = boosts.find((b) => b.id === "renovacao");
    expect(renovacao).toBeDefined();
    expect(renovacao!.multiplier).toBe(1.5);

    // Cleanup renewal event
    await db.gamificationEventLog.deleteMany({ where: { customerId: CID } }).catch(() => {});
  });

  it("returns streak_5 at 5 consecutive days", async () => {
    const monday = new Date("2026-06-01T10:00:00Z");
    const boosts = await getActiveBoostsForCheckin(
      CID,
      { currentStreakDays: 5, lastClassAt: new Date() },
      { planCategory: "P8", checkinDate: monday },
    );

    const streak = boosts.find((b) => b.id === "streak_5");
    expect(streak).toBeDefined();
    expect(streak!.multiplier).toBe(1.3);
  });

  it("returns streak_10 at 10 consecutive days (replaces streak_5)", async () => {
    const monday = new Date("2026-06-01T10:00:00Z");
    const boosts = await getActiveBoostsForCheckin(
      CID,
      { currentStreakDays: 10, lastClassAt: new Date() },
      { planCategory: "P8", checkinDate: monday },
    );

    expect(boosts.find((b) => b.id === "streak_5")).toBeUndefined();
    expect(boosts.find((b) => b.id === "streak_10")).toBeDefined();
    expect(boosts.find((b) => b.id === "streak_10")!.multiplier).toBe(1.6);
  });

  it("returns streak_15 at 15 consecutive days (highest)", async () => {
    const monday = new Date("2026-06-01T10:00:00Z");
    const boosts = await getActiveBoostsForCheckin(
      CID,
      { currentStreakDays: 15, lastClassAt: new Date() },
      { planCategory: "P8", checkinDate: monday },
    );

    expect(boosts.find((b) => b.id === "streak_5")).toBeUndefined();
    expect(boosts.find((b) => b.id === "streak_10")).toBeUndefined();
    expect(boosts.find((b) => b.id === "streak_15")).toBeDefined();
    expect(boosts.find((b) => b.id === "streak_15")!.multiplier).toBe(1.8);
  });

  it("returns no boosts for zero-streak weekday with no renewal", async () => {
    const monday = new Date("2026-06-01T10:00:00Z");
    const boosts = await getActiveBoostsForCheckin(
      CID,
      { currentStreakDays: 0, lastClassAt: null },
      { planCategory: "P8", checkinDate: monday },
    );

    expect(boosts).toHaveLength(0);
  });
});
