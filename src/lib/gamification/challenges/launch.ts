import { db } from "@/lib/db";
import { challengeWindow } from "./window";
import { pickNextChallengeKey } from "./rotation";

/**
 * Create this ISO week's challenge run (idempotent per isoWeek via the unique
 * constraint). Returns the run (existing or freshly created).
 */
export async function launchWeeklyChallenge(now: Date = new Date()) {
  const { isoWeek, windowStart, windowEnd } = challengeWindow(now);

  const existing = await db.strikelabChallengeRun.findUnique({ where: { isoWeek } });
  if (existing) return existing;

  const challengeKey = await pickNextChallengeKey();
  try {
    return await db.strikelabChallengeRun.create({
      data: {
        challengeKey, isoWeek, status: "active",
        windowStart, windowEnd, launchedAt: now,
      },
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      const row = await db.strikelabChallengeRun.findUnique({ where: { isoWeek } });
      if (row) return row;
    }
    throw err;
  }
}
