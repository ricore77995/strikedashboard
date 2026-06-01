import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { pickNextChallengeKey } from "@/lib/gamification/challenges/rotation";

const TEST_WEEKS = ["2099-01-05", "2099-01-12", "2099-01-19"];

async function cleanup() {
  await db.strikelabChallengeRun.deleteMany({ where: { isoWeek: { in: TEST_WEEKS } } }).catch(() => {});
}

describe("pickNextChallengeKey", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("returns flash_checkin for the single-item pool", async () => {
    expect(await pickNextChallengeKey()).toBe("flash_checkin");
  });

  it("still returns flash_checkin even after prior runs (pool has one item)", async () => {
    await db.strikelabChallengeRun.create({
      data: {
        challengeKey: "flash_checkin", isoWeek: TEST_WEEKS[0], status: "resolved",
        windowStart: new Date(), windowEnd: new Date(), launchedAt: new Date(),
      },
    });
    expect(await pickNextChallengeKey()).toBe("flash_checkin");
  });
});
