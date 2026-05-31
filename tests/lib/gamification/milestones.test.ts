import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { appendEvent } from "@/lib/gamification/event-log";
import { checkMilestones } from "@/lib/gamification/milestones";
import { getCurrentPeriod } from "@/lib/gamification/poll/shared";

const CID = 91301;
const PHONE = "+351913000001";
const PERIOD = getCurrentPeriod();

async function cleanup() {
  await db.gamificationEventLog.deleteMany({ where: { customerId: CID } }).catch(() => {});
  await db.gamificationState.deleteMany({ where: { customerId: CID } }).catch(() => {});
  await db.gamificationIdentity.deleteMany({ where: { customerId: CID } }).catch(() => {});
}

async function seedCheckins(count: number) {
  for (let i = 0; i < count; i++) {
    await appendEvent({
      customerId: CID,
      eventType: "checkin_observed",
      pointsDelta: 110,
      xpDelta: 110,
      source: "cron",
      idempotencyKey: `test_checkin:${CID}:${i}`,
      pointsPeriod: PERIOD,
    });
  }
}

describe("checkMilestones", () => {
  beforeAll(async () => {
    await cleanup();
    await db.gamificationIdentity.create({
      data: { customerId: CID, phoneE164: PHONE },
    });
    // Create initial state
    await db.gamificationState.create({
      data: { customerId: CID, monthlyPoints: 0, lifetimeXp: 0, currentStreakDays: 0, streakShieldAvailable: true, updatedAt: new Date() },
    });
  });

  afterAll(cleanup);

  it("emits P8 milestone at 4 classes (200 pts)", async () => {
    await seedCheckins(4);

    const originalEnv = process.env.STRIKELAB_REAL_POINTS_ENABLED;
    process.env.STRIKELAB_REAL_POINTS_ENABLED = "true";

    await checkMilestones(CID, "P8");

    process.env.STRIKELAB_REAL_POINTS_ENABLED = originalEnv;

    const milestone = await db.gamificationEventLog.findFirst({
      where: {
        customerId: CID,
        eventType: "milestone_achieved",
        pointsPeriod: PERIOD,
      },
    });

    expect(milestone).not.toBeNull();
    expect(milestone!.pointsDelta).toBe(200);
  });

  it("is idempotent — no duplicate milestones", async () => {
    const before = await db.gamificationEventLog.count({
      where: { customerId: CID, eventType: "milestone_achieved" },
    });

    const originalEnv = process.env.STRIKELAB_REAL_POINTS_ENABLED;
    process.env.STRIKELAB_REAL_POINTS_ENABLED = "true";
    await checkMilestones(CID, "P8");
    process.env.STRIKELAB_REAL_POINTS_ENABLED = originalEnv;

    const after = await db.gamificationEventLog.count({
      where: { customerId: CID, eventType: "milestone_achieved" },
    });

    expect(after).toBe(before); // No new milestones emitted
  });

  it("does nothing when flag is off", async () => {
    const before = await db.gamificationEventLog.count({
      where: { customerId: CID, eventType: "milestone_achieved" },
    });

    process.env.STRIKELAB_REAL_POINTS_ENABLED = "false";
    await checkMilestones(CID, "P8");

    const after = await db.gamificationEventLog.count({
      where: { customerId: CID, eventType: "milestone_achieved" },
    });

    expect(after).toBe(before);
  });

  it("emits nothing for PT plan (no milestones defined)", async () => {
    const before = await db.gamificationEventLog.count({
      where: { customerId: CID, eventType: "milestone_achieved" },
    });

    process.env.STRIKELAB_REAL_POINTS_ENABLED = "true";
    await checkMilestones(CID, "PT");
    process.env.STRIKELAB_REAL_POINTS_ENABLED = "false";

    const after = await db.gamificationEventLog.count({
      where: { customerId: CID, eventType: "milestone_achieved" },
    });

    expect(after).toBe(before);
  });
});
