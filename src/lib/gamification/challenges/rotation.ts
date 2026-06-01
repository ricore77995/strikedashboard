import { db } from "@/lib/db";
import { CHALLENGE_CATALOG } from "./catalog";

/**
 * Pick the next challenge key: the catalog entry least-recently run (longest
 * since its last run), tie-broken by catalog order. With a single-item pool
 * this always returns that one challenge.
 */
export async function pickNextChallengeKey(): Promise<string> {
  const keys = CHALLENGE_CATALOG.map((c) => c.key);
  if (keys.length <= 1) return keys[0];

  const recent = await db.strikelabChallengeRun.findMany({
    where: { challengeKey: { in: keys } },
    orderBy: { launchedAt: "desc" },
  });
  const lastRunAt = new Map<string, number>();
  for (const run of recent) {
    if (!lastRunAt.has(run.challengeKey)) lastRunAt.set(run.challengeKey, run.launchedAt.getTime());
  }
  let best = keys[0];
  let bestTs = Number.POSITIVE_INFINITY;
  for (const key of keys) {
    const ts = lastRunAt.get(key) ?? -1;
    if (ts < bestTs) { bestTs = ts; best = key; }
  }
  return best;
}
