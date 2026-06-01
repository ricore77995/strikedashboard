# StrikeLab Music Choice (+50) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Award +50 monthly points (cap 2/ISO-week) when a student checks in to a class they picked the music for, via a new internally-idempotent post-checkin hook.

**Architecture:** A new `checkMusicChoice(customerId, phoneE164, yogoClassId)` hook mirrors the existing one-shot pattern (`comeback.ts`). It is called from `pollClasses()` inside the existing `if (realPointsEnabled && pointsDelta > 0)` block, after the other post-checkin hooks. It looks up the student's active `WaSongRequest` for the class (keyed by phone), enforces per-class idempotency + a weekly cap, and emits a `music_choice_accepted` event with `pointsDelta=50, xpDelta=0`. The ISO-week helper `getISOWeekStart` is first consolidated into `poll/shared.ts` to avoid a third duplicate.

**Tech Stack:** Next.js 15, TypeScript (strict), Prisma + SQLite (dev) / Turso (prod), Vitest. Spec: `[[StrikeLab-Phase-2-Music-Choice-Design]]`.

---

### Task 1: Consolidate `getISOWeekStart` into `poll/shared.ts`

Behaviour-preserving refactor. `getISOWeekStart` is currently duplicated privately in `perfect-week.ts` and `supera-ritmo.ts`; extract one copy so the new hook is the third *consumer*, not the third *copy*. (`getISOWeekString` is left as-is — not needed here.)

**Files:**
- Modify: `src/lib/gamification/poll/shared.ts`
- Modify: `src/lib/gamification/perfect-week.ts`
- Modify: `src/lib/gamification/supera-ritmo.ts`
- Test: existing `tests/lib/gamification/poll/*` + `npx tsc --noEmit`

- [ ] **Step 1: Add `getISOWeekStart` to `poll/shared.ts`**

Append to `src/lib/gamification/poll/shared.ts` (verbatim copy of the existing private helper in `perfect-week.ts:58-72`):

```ts
/** Start of the current ISO week (Monday 00:00, Europe/Lisbon). */
export function getISOWeekStart(date: Date): Date {
  const lisbonDate = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

  const d = new Date(lisbonDate);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
```

- [ ] **Step 2: Point `perfect-week.ts` at the shared helper**

In `src/lib/gamification/perfect-week.ts`: it has no `./poll/shared` import today. Add a new import line below the existing imports (after line 3):

```ts
import { getISOWeekStart } from "./poll/shared";
```

Then delete the local `function getISOWeekStart(date: Date): Date { ... }` block entirely (lines 58-72). Leave `getISOWeekString` and `getPeriodFromWeek` untouched.

- [ ] **Step 3: Point `supera-ritmo.ts` at the shared helper**

In `src/lib/gamification/supera-ritmo.ts`: add `import { getISOWeekStart } from "./poll/shared";` and delete its private `getISOWeekStart` copy. Leave its other local helpers untouched.

- [ ] **Step 4: Verify no behaviour change**

Run: `npx tsc --noEmit`
Expected: exit 0 (no errors).

Run: `npx vitest run tests/lib/gamification`
Expected: same pass count as before this task (perfect-week / supera-ritmo behaviour unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/lib/gamification/poll/shared.ts src/lib/gamification/perfect-week.ts src/lib/gamification/supera-ritmo.ts
git commit -m "refactor(strikelab): consolidate getISOWeekStart into poll/shared"
```

---

### Task 2: Add the `music_choice_accepted` event type, label, and cap constant

**Files:**
- Modify: `src/lib/gamification/types.ts:9-29`
- Modify: `src/lib/gamification/labels.ts:21-41`
- Modify: `src/lib/gamification/constants.ts` (near line 114)

- [ ] **Step 1: Add the event type**

In `src/lib/gamification/types.ts`, add to the `EventType` union (after `"retroactive_replay"`):

```ts
  | "retroactive_replay"
  // Phase 2 event types
  | "music_choice_accepted";
```

- [ ] **Step 2: Add the Pt-PT label**

In `src/lib/gamification/labels.ts`, add to `EVENT_LABELS` (the record is `Record<EventType, string>`, so this is required for the build to pass):

```ts
  retroactive_replay: "Replay retroactivo",
  music_choice_accepted: "Música escolhida",
```

- [ ] **Step 3: Add the weekly-cap constant**

In `src/lib/gamification/constants.ts`, directly below `export const MUSIC_CHOICE_BONUS = 50;`:

```ts
/** Max music-choice credits per ISO week. */
export const MUSIC_CHOICE_WEEKLY_CAP = 2;
```

- [ ] **Step 4: Verify exhaustiveness**

Run: `npx tsc --noEmit`
Expected: exit 0. (If the label is missing, TS errors on the `EVENT_LABELS` record — that's the guard working.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/gamification/types.ts src/lib/gamification/labels.ts src/lib/gamification/constants.ts
git commit -m "feat(strikelab): add music_choice_accepted event type + label + cap"
```

---

### Task 3: Implement `checkMusicChoice` (TDD)

**Files:**
- Create: `src/lib/gamification/music-choice.ts`
- Test: `tests/lib/gamification/music-choice.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/gamification/music-choice.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { appendEvent } from "@/lib/gamification/event-log";
import { checkMusicChoice } from "@/lib/gamification/music-choice";
import { getCurrentPeriod } from "@/lib/gamification/poll/shared";

const CID = 92401;
const PHONE = "+351924000001";
const CLASS_A = 880001;
const CLASS_B = 880002;
const CLASS_C = 880003;
const PERIOD = getCurrentPeriod();

async function cleanup() {
  await db.gamificationEventLog.deleteMany({ where: { customerId: CID } }).catch(() => {});
  await db.gamificationState.deleteMany({ where: { customerId: CID } }).catch(() => {});
  await db.gamificationIdentity.deleteMany({ where: { customerId: CID } }).catch(() => {});
  await db.waSongRequest.deleteMany({ where: { contactId: PHONE } }).catch(() => {});
}

async function seedSongRequest(yogoClassId: number, status = "active") {
  await db.waSongRequest.create({
    data: {
      contactId: PHONE,
      yogoClassId,
      spotifyTrackId: `trk_${yogoClassId}`,
      spotifyTrackName: `Song ${yogoClassId}`,
      spotifyArtistName: `Artist ${yogoClassId}`,
      spotifyTrackUri: `spotify:track:trk_${yogoClassId}`,
      position: 1,
      status,
    },
  });
}

/** Seed an already-credited music event this week (for cap tests). */
async function seedMusicCredit(yogoClassId: number) {
  await appendEvent({
    customerId: CID,
    eventType: "music_choice_accepted",
    pointsDelta: 50,
    xpDelta: 0,
    source: "system",
    idempotencyKey: `music_choice:${CID}:${yogoClassId}`,
    pointsPeriod: PERIOD,
  });
}

function withFlag(on: boolean): () => void {
  const original = process.env.STRIKELAB_REAL_POINTS_ENABLED;
  process.env.STRIKELAB_REAL_POINTS_ENABLED = on ? "true" : "false";
  return () => { process.env.STRIKELAB_REAL_POINTS_ENABLED = original; };
}

async function musicEventCount(yogoClassId?: number): Promise<number> {
  return db.gamificationEventLog.count({
    where: {
      customerId: CID,
      eventType: "music_choice_accepted",
      ...(yogoClassId ? { idempotencyKey: `music_choice:${CID}:${yogoClassId}` } : {}),
    },
  });
}

describe("checkMusicChoice", () => {
  beforeEach(async () => {
    await cleanup();
    await db.gamificationIdentity.create({ data: { customerId: CID, phoneE164: PHONE } });
  });
  afterAll(cleanup);

  it("awards +50 once for an attended class with an active song request", async () => {
    await seedSongRequest(CLASS_A);
    const restore = withFlag(true);
    await checkMusicChoice(CID, PHONE, CLASS_A);
    restore();

    const event = await db.gamificationEventLog.findFirst({
      where: { customerId: CID, eventType: "music_choice_accepted" },
    });
    expect(event).not.toBeNull();
    expect(event!.pointsDelta).toBe(50);
    expect(event!.xpDelta).toBe(0);
  });

  it("is idempotent per class — no double pay on re-poll", async () => {
    await seedSongRequest(CLASS_A);
    const restore = withFlag(true);
    await checkMusicChoice(CID, PHONE, CLASS_A);
    await checkMusicChoice(CID, PHONE, CLASS_A);
    restore();
    expect(await musicEventCount(CLASS_A)).toBe(1);
  });

  it("caps at 2 per ISO week — third class is skipped", async () => {
    await seedMusicCredit(CLASS_A);
    await seedMusicCredit(CLASS_B);
    await seedSongRequest(CLASS_C);
    const restore = withFlag(true);
    await checkMusicChoice(CID, PHONE, CLASS_C);
    restore();
    expect(await musicEventCount(CLASS_C)).toBe(0);
    expect(await musicEventCount()).toBe(2);
  });

  it("skips when there is no active song request for the class", async () => {
    await seedSongRequest(CLASS_A, "swapped"); // not active
    const restore = withFlag(true);
    await checkMusicChoice(CID, PHONE, CLASS_A);
    restore();
    expect(await musicEventCount()).toBe(0);
  });

  it("skips when phone is null", async () => {
    await seedSongRequest(CLASS_A);
    const restore = withFlag(true);
    await checkMusicChoice(CID, null, CLASS_A);
    restore();
    expect(await musicEventCount()).toBe(0);
  });

  it("does nothing when the flag is off", async () => {
    await seedSongRequest(CLASS_A);
    const restore = withFlag(false);
    await checkMusicChoice(CID, PHONE, CLASS_A);
    restore();
    expect(await musicEventCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/gamification/music-choice.test.ts`
Expected: FAIL — cannot resolve `@/lib/gamification/music-choice` (module not created yet).

- [ ] **Step 3: Implement the hook**

Create `src/lib/gamification/music-choice.ts`:

```ts
import { db } from "@/lib/db";
import { appendEvent } from "./event-log";
import { getCurrentPeriod, getISOWeekStart } from "./poll/shared";
import { MUSIC_CHOICE_BONUS, MUSIC_CHOICE_WEEKLY_CAP } from "./constants";

/**
 * Award the music-choice bonus when a student checks in to a class they
 * picked the music for.
 *
 * Credited on ATTENDANCE (not playlist acceptance) to remove the
 * book → request → unbook gaming vector. Points only — no XP, so music
 * engagement does not accelerate tier progression.
 *
 * Idempotent per class (one credit per attended class). Capped at
 * MUSIC_CHOICE_WEEKLY_CAP credited classes per ISO week (Mon–Sun, Lisbon).
 */
export async function checkMusicChoice(
  customerId: number,
  phoneE164: string | null,
  yogoClassId: number,
): Promise<void> {
  if (process.env.STRIKELAB_REAL_POINTS_ENABLED !== "true") return;
  if (!phoneE164) return;

  // Did this student pick the (still-active) music for this class?
  const request = await db.waSongRequest.findFirst({
    where: { contactId: phoneE164, yogoClassId, status: "active" },
  });
  if (!request) return;

  // Idempotency: at most one music credit per class.
  const idempotencyKey = `music_choice:${customerId}:${yogoClassId}`;
  const existing = await db.gamificationEventLog.findFirst({
    where: { customerId, eventType: "music_choice_accepted", idempotencyKey },
  });
  if (existing) return;

  // Weekly cap: at most MUSIC_CHOICE_WEEKLY_CAP credited classes per ISO week.
  const weekStart = getISOWeekStart(new Date());
  const creditedThisWeek = await db.gamificationEventLog.count({
    where: {
      customerId,
      eventType: "music_choice_accepted",
      createdAt: { gte: weekStart },
    },
  });
  if (creditedThisWeek >= MUSIC_CHOICE_WEEKLY_CAP) return;

  await appendEvent({
    customerId,
    eventType: "music_choice_accepted",
    pointsDelta: MUSIC_CHOICE_BONUS,
    xpDelta: 0,
    payloadJson: {
      yogoClassId,
      trackName: request.spotifyTrackName,
      artistName: request.spotifyArtistName,
    },
    source: "system",
    idempotencyKey,
    pointsPeriod: getCurrentPeriod(),
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/gamification/music-choice.test.ts`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gamification/music-choice.ts tests/lib/gamification/music-choice.test.ts
git commit -m "feat(strikelab): checkMusicChoice hook (+50 on attendance, cap 2/week)"
```

---

### Task 4: Wire the hook into `pollClasses`

**Files:**
- Modify: `src/lib/gamification/poll/classes.ts` (import + the post-checkin hook block, ~lines 1-17 and 226-238)

- [ ] **Step 1: Add the import**

In `src/lib/gamification/poll/classes.ts`, add alongside the other hook imports (after the `checkSuperaRitmo` import, line 16):

```ts
import { checkMusicChoice } from "@/lib/gamification/music-choice";
```

- [ ] **Step 2: Call the hook in the post-checkin block**

In the `if (realPointsEnabled && pointsDelta > 0)` block, after `await checkSuperaRitmo(customerId, planCategory);` (line 237), add:

```ts
          await checkSuperaRitmo(customerId, planCategory);
          await checkMusicChoice(customerId, identity.phoneE164, cls.id);
```

(`identity` is the row from `findByCustomerId(customerId)` at line 145 and exposes `phoneE164`; `cls.id` is the Yogo class id.)

- [ ] **Step 3: Run the full gamification suite + types**

Run: `npx vitest run tests/lib/gamification`
Expected: PASS — all green, including the existing `poll/classes.test.ts`.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/gamification/poll/classes.ts
git commit -m "feat(strikelab): credit music choice on checkin in pollClasses"
```

---

### Task 5: Activity-feed render check + manual e2e proof

No code change expected — the new label flows through `event-view.ts` and `EVENT_LABELS` into both the student `/strikelab/me` and admin detail feeds. This task verifies acceptance criteria 2 and 3.

**Files:**
- Verify only: `src/lib/gamification/event-view.ts`, `src/app/(public)/strikelab/me/me-client.tsx`, `src/app/dashboard/strikelab/[customerId]/page.tsx`

- [ ] **Step 1: Confirm the label resolves**

Run: `npx vitest run tests/lib/gamification`
Add (if not already covered) a one-line assertion in `music-choice.test.ts` confirming the label:

```ts
import { eventLabel } from "@/lib/gamification/labels";
// ...inside describe:
it("renders a Pt-PT label for the activity feed", () => {
  expect(eventLabel("music_choice_accepted")).toBe("Música escolhida");
});
```

Run: `npx vitest run tests/lib/gamification/music-choice.test.ts`
Expected: PASS.

- [ ] **Step 2: Manual e2e proof (local, against `prisma/dev.db`)**

The dev server defaults to Turso (no gamification tables). Run against the local SQLite file and seed a checkin + active song request for the same class, then invoke the poller path. Use Prisma Studio or a throwaway script to:

1. Insert a `GamificationIdentity { customerId: 999001, phoneE164: "+351999000001" }`.
2. Insert a `WaSongRequest { contactId: "+351999000001", yogoClassId: 999900, status: "active", spotifyTrackName: "Test", spotifyArtistName: "Test", spotifyTrackId: "x", spotifyTrackUri: "spotify:track:x", position: 1 }`.
3. With `STRIKELAB_REAL_POINTS_ENABLED=true`, call `checkMusicChoice(999001, "+351999000001", 999900)` (e.g. via a `vitest` scratch test or `tsx` script).
4. Confirm exactly one `music_choice_accepted` row with `pointsDelta=50, xpDelta=0`.
5. Call it again for class `999901` and `999902` after seeding active requests — confirm the 3rd (class `999902`) is **not** credited (weekly cap).
6. Delete the seeded rows.

Paste the row output as the e2e evidence. (This mirrors `tests/lib/gamification/music-choice.test.ts`, so the unit suite already encodes the same proof; this step confirms it end-to-end against the real schema.)

- [ ] **Step 3: Full verification before done**

Run: `npx vitest run`
Expected: full suite green (469 + new music-choice tests).

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm run build`
Expected: compiles.

- [ ] **Step 4: Commit any test additions**

```bash
git add tests/lib/gamification/music-choice.test.ts
git commit -m "test(strikelab): assert music_choice label renders in activity feed"
```

---

## Notes for the implementer

- **Prod flags stay OFF.** Do not touch Vercel env vars. Go-live is a separate decision (see `[[StrikeLab-Phase-1-Engine-Handoff]]`).
- **Cleanup scoping:** every test `deleteMany` is filtered by `customerId` / `contactId` — never global. The event-log query is global, so assert on this customer's events only.
- **PT/OTHER plans:** the hook sits inside the `pointsDelta > 0` block, so PT check-ins (base 0) don't earn the music bonus. This is intended (PT has no class playlist). Documented in the spec.
- **No claw-back:** credit fires only on attendance, so an unbook before the class never credited anything to reverse.
```
