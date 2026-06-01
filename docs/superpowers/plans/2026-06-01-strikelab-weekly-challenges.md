# StrikeLab Weekly Challenge Engine (Flash Check-in) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A weekly Flash Check-in challenge that launches Wed 12:00, closes Sun 23:59 (Lisbon), and on Monday awards the first 5 in-window check-ins +250 points each (XP 0), credit-gated, replay-safe — engine only, no UI.

**Architecture:** A launch cron creates one `StrikelabChallengeRun` per ISO week (window bounds computed tz-correctly in Lisbon). A resolve cron fetches the window's classes **directly from Yogo** (the source of truth — the poller's event log is not a complete window record), scores winners with a pure function, applies credit gates with backfill, and awards idempotent `weekly_challenge_won` events. Winners live in the immutable event log; the run row drives rotation + (later) UI.

**Tech Stack:** Next.js 15, TypeScript strict, Prisma (SQLite dev / Turso prod), Vitest. Spec: `[[StrikeLab-Phase-2-Weekly-Challenges-Design]]`.

**Conventions:** Tests use the real DB via `@/lib/db`, unique customer IDs, cleanup scoped by `customerId` (never global). Env flag toggled via `process.env.STRIKELAB_REAL_POINTS_ENABLED` with restore in `afterEach`. Pt-PT (Portugal) UI strings.

---

### Task 1: Add the `StrikelabChallengeRun` Prisma model

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the model**

Append to `prisma/schema.prisma`:

```prisma
model StrikelabChallengeRun {
  id           String    @id @default(cuid())
  challengeKey String
  isoWeek      String    @unique
  status       String // "active" | "resolved"
  windowStart  DateTime
  windowEnd    DateTime
  launchedAt   DateTime
  resolvedAt   DateTime?

  @@index([status])
}
```

- [ ] **Step 2: Create the migration and regenerate the client**

Run: `npx prisma migrate dev --name strikelab_challenge_run`
Expected: migration created + applied to `prisma/dev.db`; client regenerated. (If it prompts about the Turso `.env.local` URL, ensure `DATABASE_URL="file:./prisma/dev.db"` is used for the local migration: `DATABASE_URL="file:./prisma/dev.db" npx prisma migrate dev --name strikelab_challenge_run`.)

- [ ] **Step 3: Verify the type exists**

Run: `npx tsc --noEmit`
Expected: exit 0 (`db.strikelabChallengeRun` is now typed).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(strikelab): add StrikelabChallengeRun model"
```

---

### Task 2: Tz-correct challenge window (`window.ts`)

**Files:**
- Create: `src/lib/gamification/challenges/window.ts`
- Test: `tests/lib/gamification/challenges/window.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/gamification/challenges/window.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { challengeWindow } from "@/lib/gamification/challenges/window";

describe("challengeWindow", () => {
  it("summer week (WEST, UTC+1): Wed 12:00 / Sun 23:59:59 Lisbon", () => {
    // 2026-06-03T10:00:00Z = Wed 2026-06-03 11:00 Lisbon (WEST). ISO week Mon = 2026-06-01.
    const w = challengeWindow(new Date("2026-06-03T10:00:00Z"));
    expect(w.isoWeek).toBe("2026-06-01");
    expect(w.windowStart.toISOString()).toBe("2026-06-03T11:00:00.000Z"); // 12:00 WEST
    expect(w.windowEnd.toISOString()).toBe("2026-06-07T22:59:59.000Z"); // Sun 23:59:59 WEST
  });

  it("winter week (WET, UTC+0): Wed 12:00 / Sun 23:59:59 Lisbon", () => {
    // 2026-01-07T10:00:00Z = Wed 2026-01-07 10:00 Lisbon (WET). ISO week Mon = 2026-01-05.
    const w = challengeWindow(new Date("2026-01-07T10:00:00Z"));
    expect(w.isoWeek).toBe("2026-01-05");
    expect(w.windowStart.toISOString()).toBe("2026-01-07T12:00:00.000Z");
    expect(w.windowEnd.toISOString()).toBe("2026-01-11T23:59:59.000Z");
  });

  it("is stable regardless of which weekday 'now' falls on", () => {
    // Friday of the same summer week → identical window.
    const w = challengeWindow(new Date("2026-06-05T09:00:00Z"));
    expect(w.isoWeek).toBe("2026-06-01");
    expect(w.windowStart.toISOString()).toBe("2026-06-03T11:00:00.000Z");
    expect(w.windowEnd.toISOString()).toBe("2026-06-07T22:59:59.000Z");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/gamification/challenges/window.test.ts`
Expected: FAIL — cannot resolve `@/lib/gamification/challenges/window`.

- [ ] **Step 3: Implement**

Create `src/lib/gamification/challenges/window.ts`:

```ts
/**
 * Tz-correct weekly-challenge window bounds, in Europe/Lisbon.
 *
 * Deliberately does NOT use getISOWeekStart (which resolves the boundary in
 * UTC, off by ~1h during WEST). Window = Wed 12:00:00 → Sun 23:59:59 Lisbon
 * of the ISO week (Mon–Sun) containing `now`. isoWeek id = that Monday's
 * Lisbon calendar date "YYYY-MM-DD".
 */

const LISBON = "Europe/Lisbon";
const DAY_MS = 86_400_000;
const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
};

interface LisbonParts {
  year: number; month: number; day: number;
  hour: number; minute: number; second: number; weekday: string;
}

function lisbonParts(at: Date): LisbonParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LISBON, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short",
  }).formatToParts(at);
  const m: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") m[p.type] = p.value;
  return {
    year: Number(m.year), month: Number(m.month), day: Number(m.day),
    hour: Number(m.hour) % 24, minute: Number(m.minute), second: Number(m.second),
    weekday: m.weekday,
  };
}

/** Minutes to add to a UTC instant to get Lisbon wall time (+60 in summer). */
function lisbonOffsetMinutes(at: Date): number {
  const lp = lisbonParts(at);
  const asUTC = Date.UTC(lp.year, lp.month - 1, lp.day, lp.hour, lp.minute, lp.second);
  return Math.round((asUTC - at.getTime()) / 60000);
}

/** UTC instant for a Lisbon wall-clock time on a Lisbon Y-M-D. */
function lisbonInstant(y: number, mo: number, d: number, hh: number, mm: number, ss: number): Date {
  const naive = Date.UTC(y, mo - 1, d, hh, mm, ss);
  const off = lisbonOffsetMinutes(new Date(naive));
  return new Date(naive - off * 60000);
}

export interface ChallengeWindow {
  isoWeek: string;
  windowStart: Date;
  windowEnd: Date;
}

export function challengeWindow(now: Date): ChallengeWindow {
  const lp = lisbonParts(now);
  const dow = WEEKDAY_INDEX[lp.weekday]; // 0=Mon .. 6=Sun
  // Monday's Lisbon calendar date via pure date arithmetic (UTC-midnight proxy).
  const monday = new Date(Date.UTC(lp.year, lp.month - 1, lp.day) - dow * DAY_MS);
  const wed = new Date(monday.getTime() + 2 * DAY_MS);
  const sun = new Date(monday.getTime() + 6 * DAY_MS);

  const isoWeek = `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, "0")}-${String(monday.getUTCDate()).padStart(2, "0")}`;
  const windowStart = lisbonInstant(wed.getUTCFullYear(), wed.getUTCMonth() + 1, wed.getUTCDate(), 12, 0, 0);
  const windowEnd = lisbonInstant(sun.getUTCFullYear(), sun.getUTCMonth() + 1, sun.getUTCDate(), 23, 59, 59);
  return { isoWeek, windowStart, windowEnd };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/gamification/challenges/window.test.ts`
Expected: PASS — 3 tests. (If a boundary is off, the assertions show the exact ISO instant to correct against.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/gamification/challenges/window.ts tests/lib/gamification/challenges/window.test.ts
git commit -m "feat(strikelab): tz-correct challenge window bounds"
```

---

### Task 3: Event type + label

**Files:**
- Modify: `src/lib/gamification/types.ts`
- Modify: `src/lib/gamification/labels.ts`

- [ ] **Step 1: Add the event type**

In `src/lib/gamification/types.ts`, extend the `EventType` union — change the final `| "music_choice_accepted";` line to:

```ts
  | "music_choice_accepted"
  | "weekly_challenge_won";
```

- [ ] **Step 2: Add the label**

In `src/lib/gamification/labels.ts`, add to `EVENT_LABELS` after the `music_choice_accepted` entry:

```ts
  music_choice_accepted: "Música escolhida",
  weekly_challenge_won: "Desafio semanal",
```

- [ ] **Step 3: Verify exhaustiveness**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/gamification/types.ts src/lib/gamification/labels.ts
git commit -m "feat(strikelab): add weekly_challenge_won event type + label"
```

---

### Task 4: Challenge catalog + rotation

**Files:**
- Create: `src/lib/gamification/challenges/catalog.ts`
- Create: `src/lib/gamification/challenges/rotation.ts`
- Test: `tests/lib/gamification/challenges/rotation.test.ts`

- [ ] **Step 1: Create the catalog**

Create `src/lib/gamification/challenges/catalog.ts`:

```ts
/**
 * Weekly challenge catalog. Slice 1 ships the single fully-automatic
 * challenge (Flash Check-in). The pool grows here as more challenges land;
 * rotation.ts picks one per week.
 */
export interface ChallengeDef {
  key: string;
  /** Pt-PT display name (used by the slice-2 UI). */
  name: string;
  points: number;
  winnersMax: number;
}

export const CHALLENGE_CATALOG: ReadonlyArray<ChallengeDef> = [
  { key: "flash_checkin", name: "Flash Check-in", points: 250, winnersMax: 5 },
];

export function getChallenge(key: string): ChallengeDef | undefined {
  return CHALLENGE_CATALOG.find((c) => c.key === key);
}
```

- [ ] **Step 2: Write the failing rotation test**

Create `tests/lib/gamification/challenges/rotation.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/lib/gamification/challenges/rotation.test.ts`
Expected: FAIL — cannot resolve `@/lib/gamification/challenges/rotation`.

- [ ] **Step 4: Implement rotation**

Create `src/lib/gamification/challenges/rotation.ts`:

```ts
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

  // Most-recent run per key (by launchedAt). Keys never run sort first (oldest).
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
    const ts = lastRunAt.get(key) ?? -1; // never-run → -1 (oldest)
    if (ts < bestTs) { bestTs = ts; best = key; }
  }
  return best;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/lib/gamification/challenges/rotation.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/gamification/challenges/catalog.ts src/lib/gamification/challenges/rotation.ts tests/lib/gamification/challenges/rotation.test.ts
git commit -m "feat(strikelab): challenge catalog + rotation"
```

---

### Task 5: Pure Flash Check-in scorer

**Files:**
- Create: `src/lib/gamification/challenges/scorer-flash-checkin.ts`
- Test: `tests/lib/gamification/challenges/scorer-flash-checkin.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/gamification/challenges/scorer-flash-checkin.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { scoreFlashCheckin, type ScorerClass } from "@/lib/gamification/challenges/scorer-flash-checkin";

const WIN_START = Date.parse("2026-06-03T11:00:00.000Z");
const WIN_END = Date.parse("2026-06-07T22:59:59.000Z");

function cls(signups: Array<{ id: number; checked_in: number }>): ScorerClass {
  return { signups: signups.map((s) => ({ user: { id: s.id }, checked_in: s.checked_in })) };
}

describe("scoreFlashCheckin", () => {
  it("ranks earliest in-window check-ins ascending", () => {
    const classes = [
      cls([{ id: 1, checked_in: WIN_START + 5000 }, { id: 2, checked_in: WIN_START + 1000 }]),
      cls([{ id: 3, checked_in: WIN_START + 3000 }]),
    ];
    const ranked = scoreFlashCheckin(classes, WIN_START, WIN_END);
    expect(ranked.map((r) => r.customerId)).toEqual([2, 3, 1]);
  });

  it("excludes check-ins outside the window and not-checked-in (0)", () => {
    const classes = [
      cls([{ id: 1, checked_in: WIN_START - 1000 }, { id: 2, checked_in: 0 }, { id: 3, checked_in: WIN_END + 1 }]),
      cls([{ id: 4, checked_in: WIN_END }]),
    ];
    const ranked = scoreFlashCheckin(classes, WIN_START, WIN_END);
    expect(ranked.map((r) => r.customerId)).toEqual([4]);
  });

  it("dedupes to each customer's earliest check-in", () => {
    const classes = [
      cls([{ id: 7, checked_in: WIN_START + 9000 }]),
      cls([{ id: 7, checked_in: WIN_START + 2000 }]),
    ];
    const ranked = scoreFlashCheckin(classes, WIN_START, WIN_END);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]).toEqual({ customerId: 7, checkedInAt: WIN_START + 2000 });
  });

  it("breaks timestamp ties deterministically by customerId ascending", () => {
    const t = WIN_START + 4000;
    const classes = [cls([{ id: 30, checked_in: t }, { id: 10, checked_in: t }, { id: 20, checked_in: t }])];
    const ranked = scoreFlashCheckin(classes, WIN_START, WIN_END);
    expect(ranked.map((r) => r.customerId)).toEqual([10, 20, 30]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/gamification/challenges/scorer-flash-checkin.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure scorer**

Create `src/lib/gamification/challenges/scorer-flash-checkin.ts`:

```ts
/**
 * Pure Flash Check-in scorer. Given Yogo classes and the window bounds (ms),
 * returns every athlete's EARLIEST in-window check-in, ranked ascending by
 * check-in time, tie-broken by customerId. No DB, no gates, no cap — resolve
 * applies credit gates + winnersMax with backfill.
 */
export interface ScorerSignup {
  user: { id: number };
  checked_in: number; // Yogo Unix ms, 0 = not checked in
}
export interface ScorerClass {
  signups: ScorerSignup[];
}
export interface RankedCheckin {
  customerId: number;
  checkedInAt: number;
}

export function scoreFlashCheckin(
  classes: ScorerClass[],
  windowStartMs: number,
  windowEndMs: number,
): RankedCheckin[] {
  const earliest = new Map<number, number>();
  for (const cls of classes) {
    for (const s of cls.signups ?? []) {
      const ts = s.checked_in;
      if (!ts || ts < windowStartMs || ts > windowEndMs) continue;
      const id = s.user?.id;
      if (typeof id !== "number") continue;
      const prev = earliest.get(id);
      if (prev === undefined || ts < prev) earliest.set(id, ts);
    }
  }
  return [...earliest.entries()]
    .map(([customerId, checkedInAt]) => ({ customerId, checkedInAt }))
    .sort((a, b) => a.checkedInAt - b.checkedInAt || a.customerId - b.customerId);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/gamification/challenges/scorer-flash-checkin.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gamification/challenges/scorer-flash-checkin.ts tests/lib/gamification/challenges/scorer-flash-checkin.test.ts
git commit -m "feat(strikelab): pure flash check-in scorer"
```

---

### Task 6: Launch — create the week's run

**Files:**
- Create: `src/lib/gamification/challenges/launch.ts`
- Test: `tests/lib/gamification/challenges/launch.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/gamification/challenges/launch.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/gamification/challenges/launch.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/gamification/challenges/launch.ts`:

```ts
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
    // Concurrent launch lost the race on the unique isoWeek — return the winner.
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      const row = await db.strikelabChallengeRun.findUnique({ where: { isoWeek } });
      if (row) return row;
    }
    throw err;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/gamification/challenges/launch.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gamification/challenges/launch.ts tests/lib/gamification/challenges/launch.test.ts
git commit -m "feat(strikelab): weekly challenge launch"
```

---

### Task 7: Resolve — award winners (gates + backfill, replay-safe)

**Files:**
- Create: `src/lib/gamification/challenges/resolve.ts`
- Test: `tests/lib/gamification/challenges/resolve.test.ts`

`resolve.ts` exposes two functions: `awardChallengeWinners(run, classes)` (pure-ish: score + gate-backfill + award + mark resolved, against the real DB) and `resolveWeeklyChallenge()` (find active run + fetch Yogo + delegate). Tests target `awardChallengeWinners` with seeded identities + injected classes — no Yogo mock.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/gamification/challenges/resolve.test.ts`:

```ts
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

/** Seed identities opted-in + active so credit gates pass; `gated` ones are erased (fail). */
async function seedIdentity(customerId: number, opts: { erased?: boolean } = {}) {
  await db.gamificationIdentity.create({
    data: {
      customerId,
      phoneE164: `+3519${customerId}`,
      consentTraining: true,
      optInAt: new Date("2026-01-01"),
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
    // 6 check-ins; winnersMax = 5 (catalog). Order by offset.
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
    // 6th-earliest (CIDS[5]) is over the cap → not awarded.
    expect(events.find((e) => e.customerId === CIDS[5])).toBeUndefined();

    const after = await db.strikelabChallengeRun.findUnique({ where: { id: run.id } });
    expect(after!.status).toBe("resolved");
  });

  it("backfills past a gate-failing athlete (erased) to keep winnersMax winners", async () => {
    // CIDS[0] is erased (fails gates); CIDS[1..5] eligible. Expect 5 winners, not 4.
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
    expect(erasedEvent).toBeNull(); // erased athlete skipped
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
    expect(after!.status).toBe("active"); // NOT burned
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/gamification/challenges/resolve.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/gamification/challenges/resolve.ts`:

```ts
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
    if (!gate.passed) continue; // backfill: skip, try next-ranked
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
  const start = run.windowStart.toISOString().slice(0, 10);
  const end = run.windowEnd.toISOString().slice(0, 10);
  const res = await yogoFetch<unknown>(
    `classes?startDate=${start}&endDate=${end}&populate[]=signups.user&populate[]=class_type`,
  );
  if (!res.ok) throw new Error(`Yogo classes fetch failed: ${res.status}`);
  // Accept both bare-array and { classes: [...] } shapes (see lib/yogo/signups.ts).
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
  return awardChallengeWinners(run, classes);
}
```

NOTE — gate seeding is already correct and minimal (verified against `gates.ts` + `consent.ts`): `checkCreditGates` passes when the identity has `consentTraining: true` and `erasedAt: null`, with **no membership snapshot** (Gate 4 allows through when no `yogoMembershipSnapshot` row exists) and **no email** (Gate 5 aggregator check is skipped when `email` is null) and no future pause dates. So `seedIdentity` needs only `{ customerId, phoneE164, consentTraining: true, erasedAt: null }` (`optInAt` is harmless but not required by gates). The erased variant sets `erasedAt` → Gate 1 fails. Do NOT seed a `yogoMembershipSnapshot`. All fields used exist on the `GamificationIdentity` model.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/gamification/challenges/resolve.test.ts`
Expected: PASS — 4 tests. If gate seeding needs adjustment, fix the `seedIdentity` helper (not the assertions) until eligible athletes pass `checkCreditGates`.

- [ ] **Step 5: Run the full gamification suite + types**

Run: `npx vitest run tests/lib/gamification && npx tsc --noEmit`
Expected: all green, exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/gamification/challenges/resolve.ts tests/lib/gamification/challenges/resolve.test.ts
git commit -m "feat(strikelab): weekly challenge resolve (gates + backfill, replay-safe)"
```

---

### Task 8: Cron routes + Vercel schedule

**Files:**
- Create: `src/app/api/cron/strikelab-challenge-launch/route.ts`
- Create: `src/app/api/cron/strikelab-challenge-resolve/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Create the launch route**

Create `src/app/api/cron/strikelab-challenge-launch/route.ts` (mirrors `strikelab-monthly-reset/route.ts`):

```ts
import { NextRequest, NextResponse } from "next/server";
import { launchWeeklyChallenge } from "@/lib/gamification/challenges/launch";

/**
 * GET /api/cron/strikelab-challenge-launch
 * Weekly cron (Wed ~12:00 Lisbon) that creates this week's challenge run.
 * Gated by CRON_SECRET bearer + STRIKELAB_ENABLED.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return NextResponse.json({ error: "no_secret_configured" }, { status: 500 });
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (process.env.STRIKELAB_ENABLED !== "true") {
    return NextResponse.json({ skipped: true, reason: "STRIKELAB_ENABLED not set" });
  }
  try {
    const run = await launchWeeklyChallenge();
    return NextResponse.json({ isoWeek: run.isoWeek, challengeKey: run.challengeKey, status: run.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create the resolve route**

Create `src/app/api/cron/strikelab-challenge-resolve/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { resolveWeeklyChallenge } from "@/lib/gamification/challenges/resolve";

/**
 * GET /api/cron/strikelab-challenge-resolve
 * Weekly cron (Mon ~06:00 Lisbon) that scores the active run from live Yogo
 * data and awards winners. Replay-safe: if STRIKELAB_REAL_POINTS_ENABLED is
 * off, the run is left active for a later resolve.
 * Gated by CRON_SECRET bearer + STRIKELAB_ENABLED.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return NextResponse.json({ error: "no_secret_configured" }, { status: 500 });
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (process.env.STRIKELAB_ENABLED !== "true") {
    return NextResponse.json({ skipped: true, reason: "STRIKELAB_ENABLED not set" });
  }
  try {
    const result = await resolveWeeklyChallenge();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Add Vercel cron schedules**

In `vercel.json`, add two entries to the `crons` array (after the existing strikelab entries). Wed 12:00 / Mon 06:00 Lisbon ≈ 11:00 / 05:00 UTC (±1h DST, accepted):

```json
    { "path": "/api/cron/strikelab-challenge-launch", "schedule": "0 11 * * 3" },
    { "path": "/api/cron/strikelab-challenge-resolve", "schedule": "0 5 * * 1" }
```

- [ ] **Step 4: Verify types + build**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/strikelab-challenge-launch src/app/api/cron/strikelab-challenge-resolve vercel.json
git commit -m "feat(strikelab): challenge launch + resolve cron routes"
```

---

### Task 9: Full verification + manual e2e proof

**Files:**
- Test/verify only (plus a throwaway scratch script that MUST be deleted, not committed).

- [ ] **Step 1: Full suite + types + build**

Run: `npx vitest run`
Expected: full suite green (prior 476/477 + the new challenge tests).

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm run build`
Expected: compiles (the two new routes register). If the build fails, capture the exact error and report it — do NOT edit unrelated files to force it green.

- [ ] **Step 2: Manual e2e proof against `prisma/dev.db`**

Create a throwaway `scripts/_e2e_challenge_scratch.ts` that:
1. Uses customerIds 991001..991006, seeds identities so credit gates pass (match `seedIdentity` from Task 7).
2. Creates a `StrikelabChallengeRun` for isoWeek `2026-06-01`, status active, windowStart `2026-06-03T11:00:00Z`, windowEnd `2026-06-07T22:59:59Z`.
3. Sets `process.env.STRIKELAB_REAL_POINTS_ENABLED = "true"`.
4. Builds 6 in-window check-ins (ascending offsets) as `ScorerClass[]` and calls `awardChallengeWinners(run, classes)`.
5. Prints the `weekly_challenge_won` events (customerId, pointsDelta, xpDelta, rank from payload) and the run status.
6. Asserts/prints: exactly 5 awarded at 250/0, the 6th not awarded, run status `resolved`. Then re-runs `awardChallengeWinners` and asserts still 5 (idempotent).
7. Deletes all seeded rows.

Run: `DATABASE_URL="file:./prisma/dev.db" npx tsx scripts/_e2e_challenge_scratch.ts`
Paste the output as evidence. Then `rm scripts/_e2e_challenge_scratch.ts` and confirm `git status` shows it gone.

- [ ] **Step 3: Confirm clean tree**

Run: `git status --short`
Expected: only the usual `prisma/dev.db-*` / `.obsidian/workspace.json` noise — no stray source files.

---

## Notes for the implementer

- **Prod flags stay OFF.** Do not touch Vercel env vars. Go-live is separate.
- **Yogo is the scorer's source of truth** — the scorer must NOT read `checkin_observed` events (the poller doesn't reliably capture a full window). `resolve.fetchWindowClasses` pulls live Yogo data.
- **Window math lives only in `window.ts`** and is tz-correct; do not reuse `getISOWeekStart`.
- **Idempotency** is the per-athlete event key `challenge:{runId}:{customerId}` riding the unique `idempotencyKey`; never use run status as the award guard.
- **Cleanup scoping:** every test `deleteMany` filters by `customerId`/`isoWeek` — never global.
- **Gate seeding (Task 7):** verified — `consentTraining: true` + not-erased + no snapshot + no email passes all 5 gates. No `yogoMembershipSnapshot` seeding required.
