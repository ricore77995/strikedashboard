import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { launchWeeklyChallenge } from "@/lib/gamification/challenges/launch";

const ISO_WEEK = "2026-06-01";
const NOW = new Date("2026-06-03T10:00:00Z"); // Wed of that week

async function cleanup() {
  await db.strikelabChallengeRun.deleteMany({ where: { isoWeek: ISO_WEEK } }).catch(() => {});
}

describe("launchWeeklyChallenge", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("creates one active run with tz-correct window bounds", async () => {
    const run = await launchWeeklyChallenge(NOW);
    expect(run.isoWeek).toBe(ISO_WEEK);
    expect(run.challengeKey).toBe("flash_checkin");
    expect(run.status).toBe("active");
    expect(run.windowStart.toISOString()).toBe("2026-06-03T11:00:00.000Z");
    expect(run.windowEnd.toISOString()).toBe("2026-06-07T22:59:59.000Z");
  });

  it("is idempotent — a second launch for the same week does not duplicate", async () => {
    await launchWeeklyChallenge(NOW);
    await launchWeeklyChallenge(NOW);
    const count = await db.strikelabChallengeRun.count({ where: { isoWeek: ISO_WEEK } });
    expect(count).toBe(1);
  });
});
