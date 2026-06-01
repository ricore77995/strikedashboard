import { db } from "@/lib/db";
import { yogoFetch } from "@/lib/yogo/fetch";
import { appendEvent } from "@/lib/gamification/event-log";
import { checkCreditGates } from "@/lib/gamification/gates";
import { getCurrentPeriod } from "@/lib/gamification/poll/shared";
import { getChallenge } from "./catalog";
import { scoreFlashCheckin, type ScorerClass } from "./scorer-flash-checkin";

type ChallengeRun = Awaited<ReturnType<typeof db.strikelabChallengeRun.findUniqueOrThrow>>;

export interface AwardResult {
  awarded: number;
  skipped?: string;
}

/**
 * Score + gate (with backfill) + award + mark resolved for a given run and the
 * window's Yogo classes. Replay-safe:
 *  - flag off → award nothing, leave run active (re-runnable later)
 *  - deterministic winner order; per-athlete idempotency key prevents double-pay
 *  - mark resolved only AFTER all awards
 *
 * Crash-recovery correctness depends on the scorer being DETERMINISTIC over the
 * same (classes, window): a re-run re-derives the identical winner set, so
 * already-paid athletes no-op on their idempotency key and the rest get paid.
 * A future non-deterministic challenge would break this invariant.
 */
export async function awardChallengeWinners(run: ChallengeRun, classes: ScorerClass[]): Promise<AwardResult> {
  if (process.env.STRIKELAB_REAL_POINTS_ENABLED !== "true") {
    return { awarded: 0, skipped: "real_points_disabled" };
  }
  const def = getChallenge(run.challengeKey);
  if (!def) return { awarded: 0, skipped: "unknown_challenge" };

  const ranked = scoreFlashCheckin(classes, run.windowStart.getTime(), run.windowEnd.getTime());

  const period = getCurrentPeriod();
  let awarded = 0;
  let rank = 0;
  for (const cand of ranked) {
    if (awarded >= def.winnersMax) break;
    const gate = await checkCreditGates(cand.customerId);
    if (!gate.passed) continue;
    rank += 1;
    await appendEvent({
      customerId: cand.customerId,
      eventType: "weekly_challenge_won",
      pointsDelta: def.points,
      xpDelta: 0,
      payloadJson: {
        challengeKey: run.challengeKey, isoWeek: run.isoWeek, rank,
        runId: run.id, checkedInAt: cand.checkedInAt,
      },
      source: "cron",
      idempotencyKey: `challenge:${run.id}:${cand.customerId}`,
      pointsPeriod: period,
    });
    awarded += 1;
  }

  await db.strikelabChallengeRun.update({
    where: { id: run.id },
    data: { status: "resolved", resolvedAt: new Date() },
  });
  return { awarded };
}

interface YogoSignup { user?: { id?: number }; checked_in?: number }
interface YogoClass { signups?: YogoSignup[] }

/** Fetch the window's classes (with check-in data) directly from Yogo. */
async function fetchWindowClasses(run: ChallengeRun): Promise<ScorerClass[]> {
  // Pad the date range ±1 day so a class at the tz-edge of the window can't be
  // missed (Yogo interprets startDate/endDate as Lisbon-local dates). The scorer
  // trims precisely by ms bounds, so the extra days are harmless.
  const DAY_MS = 86_400_000;
  const start = new Date(run.windowStart.getTime() - DAY_MS).toISOString().slice(0, 10);
  const end = new Date(run.windowEnd.getTime() + DAY_MS).toISOString().slice(0, 10);
  const res = await yogoFetch<unknown>(
    `classes?startDate=${start}&endDate=${end}&populate[]=signups.user&populate[]=class_type`,
  );
  if (!res.ok) throw new Error(`Yogo classes fetch failed: ${res.status}`);
  let raw: YogoClass[] = [];
  if (Array.isArray(res.data)) raw = res.data as YogoClass[];
  else if (res.data && typeof res.data === "object") {
    const wrapped = (res.data as { classes?: unknown }).classes;
    if (Array.isArray(wrapped)) raw = wrapped as YogoClass[];
  }
  return raw.map((c) => ({
    signups: (c.signups ?? [])
      .filter((s) => typeof s.user?.id === "number" && typeof s.checked_in === "number")
      .map((s) => ({ user: { id: s.user!.id as number }, checked_in: s.checked_in as number })),
  }));
}

/** Cron entry: resolve the most recent active run from live Yogo data. */
export async function resolveWeeklyChallenge(): Promise<AwardResult> {
  if (process.env.STRIKELAB_REAL_POINTS_ENABLED !== "true") {
    return { awarded: 0, skipped: "real_points_disabled" };
  }
  const run = await db.strikelabChallengeRun.findFirst({
    where: { status: "active" },
    orderBy: { windowEnd: "desc" },
  });
  if (!run) return { awarded: 0, skipped: "no_active_run" };
  const classes = await fetchWindowClasses(run);
  // A real gym week always has classes Wed–Sun. Zero classes means Yogo returned
  // a degraded/empty payload (HTTP-OK but no data) — treat as transient and DO
  // NOT resolve, so the week isn't silently burned. The Monday cron (or a manual
  // retry) will re-run. A genuinely quiet week still has classes (just no
  // in-window check-ins) and resolves normally with 0 winners.
  if (classes.length === 0) return { awarded: 0, skipped: "no_classes_fetched" };
  return awardChallengeWinners(run, classes);
}
