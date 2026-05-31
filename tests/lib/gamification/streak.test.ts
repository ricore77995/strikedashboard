import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { checkStreak } from "@/lib/gamification/streak";

const CID = 91401;
const PHONE = "+351914000001";

async function cleanup() {
  await db.gamificationEventLog.deleteMany({ where: { customerId: CID } }).catch(() => {});
  await db.gamificationState.deleteMany({ where: { customerId: CID } }).catch(() => {});
  await db.gamificationIdentity.deleteMany({ where: { customerId: CID } }).catch(() => {});
}

describe("checkStreak", () => {
  beforeAll(async () => {
    await cleanup();
    await db.gamificationIdentity.create({
      data: { customerId: CID, phoneE164: PHONE },
    });
  });

  afterAll(cleanup);

  it("sets streak to 1 for first check-in", async () => {
    await db.gamificationState.create({
      data: {
        customerId: CID,
        monthlyPoints: 0,
        lifetimeXp: 0,
        currentStreakDays: 0,
        streakShieldAvailable: true,
        lastClassAt: null,
        updatedAt: new Date(),
      },
    });

    process.env.STRIKELAB_REAL_POINTS_ENABLED = "true";
    await checkStreak(CID);
    process.env.STRIKELAB_REAL_POINTS_ENABLED = "false";

    const state = await db.gamificationState.findUnique({ where: { customerId: CID } });
    expect(state!.currentStreakDays).toBe(1);

    // Cleanup for next test
    await db.gamificationState.delete({ where: { customerId: CID } });
  });

  it("increments streak on consecutive day", async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    await db.gamificationState.create({
      data: {
        customerId: CID,
        monthlyPoints: 0,
        lifetimeXp: 0,
        currentStreakDays: 4,
        streakShieldAvailable: true,
        lastClassAt: yesterday,
        updatedAt: new Date(),
      },
    });

    process.env.STRIKELAB_REAL_POINTS_ENABLED = "true";
    await checkStreak(CID);
    process.env.STRIKELAB_REAL_POINTS_ENABLED = "false";

    const state = await db.gamificationState.findUnique({ where: { customerId: CID } });
    expect(state!.currentStreakDays).toBe(5);

    // Check streak_5_activated event
    const streak5 = await db.gamificationEventLog.findFirst({
      where: { customerId: CID, eventType: "streak_5_activated" },
    });
    expect(streak5).not.toBeNull();

    await db.gamificationState.delete({ where: { customerId: CID } });
    await db.gamificationEventLog.deleteMany({ where: { customerId: CID } });
  });

  it("resets streak after 2+ day gap without shield", async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    await db.gamificationState.create({
      data: {
        customerId: CID,
        monthlyPoints: 0,
        lifetimeXp: 0,
        currentStreakDays: 10,
        streakShieldAvailable: false,
        lastClassAt: threeDaysAgo,
        updatedAt: new Date(),
      },
    });

    process.env.STRIKELAB_REAL_POINTS_ENABLED = "true";
    await checkStreak(CID);
    process.env.STRIKELAB_REAL_POINTS_ENABLED = "false";

    const state = await db.gamificationState.findUnique({ where: { customerId: CID } });
    expect(state!.currentStreakDays).toBe(1);

    await db.gamificationState.delete({ where: { customerId: CID } });
  });

  it("uses shield on 2-day gap then marks shield unavailable", async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    await db.gamificationState.create({
      data: {
        customerId: CID,
        monthlyPoints: 0,
        lifetimeXp: 0,
        currentStreakDays: 7,
        streakShieldAvailable: true,
        lastClassAt: twoDaysAgo,
        updatedAt: new Date(),
      },
    });

    process.env.STRIKELAB_REAL_POINTS_ENABLED = "true";
    await checkStreak(CID);
    process.env.STRIKELAB_REAL_POINTS_ENABLED = "false";

    const state = await db.gamificationState.findUnique({ where: { customerId: CID } });
    expect(state!.currentStreakDays).toBe(8);
    expect(state!.streakShieldAvailable).toBe(false);

    // Check shield used event
    const shield = await db.gamificationEventLog.findFirst({
      where: { customerId: CID, eventType: "streak_shield_used" },
    });
    expect(shield).not.toBeNull();

    await db.gamificationState.delete({ where: { customerId: CID } });
    await db.gamificationEventLog.deleteMany({ where: { customerId: CID } });
  });

  it("does nothing when flag is off", async () => {
    await db.gamificationState.create({
      data: {
        customerId: CID,
        monthlyPoints: 0,
        lifetimeXp: 0,
        currentStreakDays: 0,
        streakShieldAvailable: true,
        lastClassAt: null,
        updatedAt: new Date(),
      },
    });

    process.env.STRIKELAB_REAL_POINTS_ENABLED = "false";
    await checkStreak(CID);

    const state = await db.gamificationState.findUnique({ where: { customerId: CID } });
    expect(state!.currentStreakDays).toBe(0); // Unchanged

    await db.gamificationState.delete({ where: { customerId: CID } });
  });
});
