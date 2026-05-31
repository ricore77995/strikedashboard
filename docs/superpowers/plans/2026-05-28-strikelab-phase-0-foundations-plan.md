# StrikeLab Phase 0 — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the foundational infrastructure for StrikeLab gamification (v3.1 spec) — storage schema, identity resolution, Yogo polling, opt-in/consent flow, base admin UI, and GDPR documentation — so that Phase 1 (MVP gamification) can build on top without re-doing plumbing.

**Architecture:** Append-then-materialize. Every state change writes an immutable row to `gamification_event_log` with an `idempotency_key`; a deterministic replay computes `gamification_state` (the materialized view). Yogo is polled (15-min during operating hours + daily sweep) since no webhooks exist. Identity resolution links Yogo `customer_id` ↔ phone ↔ WhatsApp ↔ optional verified IG handle in one junction table. All point-affecting events flow through this pipeline; the admin UI is a read+intervene layer over it.

**Tech Stack:** Next.js 15 App Router · React 19 · TypeScript strict · Prisma + libSQL adapter (Turso in prod, SQLite locally) · Tailwind v4 · Vitest · Vercel Pro (assumed — needed for sub-daily crons).

**Spec:** [`docs/superpowers/specs/2026-05-28-strikelab-v3.1-gamification-design.md`](../specs/2026-05-28-strikelab-v3.1-gamification-design.md)
**Convergence context:** [`strikedash_vault/StrikeLab-Convergence-Report.md`](../../../strikedash_vault/StrikeLab-Convergence-Report.md)

---

## Decision Gates (Ricardo must confirm before crossing)

These are explicit checkpoints in the plan. Mark each as resolved when answered.

| # | Gate | Default | Where it blocks |
|---|---|---|---|
| **DG-1** | Vercel Pro upgrade (15-min cron) | Assumed yes | Task 11 (`vercel.json` cron) — without Pro, fall back to hourly + accept 60-min lag |
| **DG-2** | DPO designation (Ricardo vs external) | Ricardo as controller, no DPO | Task 26 (DPIA author) — affects DPIA signatory and §10.1 lawful-basis declaration |
| **DG-3** | Existing minors on subscriber base | Audit needed (Task 29) | Task 16 (parental consent flow) — affects bot copy for minor onboarding |
| **DG-4** | Privacy notice publication slot | `/privacy/strikelab` under existing dashboard | Task 27 — affects routing |
| **DG-5** | Legacy discounts grandfathering | Defer to Phase 1 plan | Out of scope here; flagged for Phase 1 |

---

## File Structure

**New files (created in this phase):**

```
prisma/migrations/<NNNN>_strikelab_foundations/
└── migration.sql                          # combined: 4 tables + indexes

src/lib/gamification/
├── event-log.ts                          # appendEvent() idempotent writer
├── state.ts                              # materializeState() replay
├── identity.ts                           # link, verifyIgHandle, lookup
├── consent.ts                            # consent toggles + versioning
├── poll/
│   ├── classes.ts                        # 15-min Yogo class poll + diff
│   ├── memberships.ts                    # daily Yogo memberships sweep
│   └── shared.ts                         # snapshot diff helpers
└── types.ts                              # EventType, State, Identity types

src/app/api/cron/
├── strikelab-poll-classes/route.ts       # 15-min cron handler
└── strikelab-poll-memberships/route.ts   # daily 03:00 cron handler

src/app/api/strikelab/
├── identity/verify-ig/route.ts           # bot calls this to confirm IG code
├── consent/route.ts                      # POST consent toggles
├── erasure/route.ts                      # POST erasure request
└── admin/                                # admin-only mutations
    ├── adjust-points/route.ts
    ├── pause/route.ts
    └── erasure-execute/route.ts

src/lib/wa/handlers/
└── strikelab-onboard.ts                  # bot onboarding state machine

src/app/dashboard/strikelab/
├── layout.tsx                            # nav + admin guard
├── page.tsx                              # list/search students
├── [customerId]/page.tsx                 # per-student view
├── [customerId]/adjust/page.tsx          # manual points adjust
├── [customerId]/pause/page.tsx           # pause flags
├── erasure/page.tsx                      # erasure queue + handler
└── reset-audit/page.tsx                  # last 12 monthly resets

strikedash_vault/gdpr/
├── DPIA-StrikeLab.md                     # data-protection impact assessment
├── ROPA-Strikelab.md                     # registo de atividades de tratamento (Art. 30)
├── Lawful-Basis-Register.md
├── Retention-Policy.md
└── Processor-Agreements.md               # tracker for DPAs/SCCs

src/app/(public)/privacy/strikelab/page.tsx  # public privacy notice pt-PT

tests/lib/gamification/
├── event-log.test.ts
├── state.test.ts
├── identity.test.ts
├── consent.test.ts
└── poll/
    ├── classes.test.ts
    └── memberships.test.ts

tests/lib/wa/handlers/
└── strikelab-onboard.test.ts
```

**Modified files:**

```
prisma/schema.prisma                       # +4 models
vercel.json                                # +2 cron entries
src/lib/wa/dispatch.ts                     # wire strikelab-onboard handler
src/components/bottom-tab-bar.tsx          # add "StrikeLab" admin tab (gated)
strikedash_vault/The Vault.md              # link all new docs
.env.example                               # +STRIKELAB_* flags
```

---

## Task 1 — Decision Gates resolution + env scaffold

**Files:**
- Modify: `.env.example`
- Create: `strikedash_vault/StrikeLab-Phase-0-Decisions.md`

**Purpose:** Force Ricardo to make DG-1, DG-2 decisions before code lands; capture them durably.

- [ ] **Step 1: Create decisions doc**

Create `strikedash_vault/StrikeLab-Phase-0-Decisions.md`:

```markdown
---
title: StrikeLab Phase 0 — Decisions Log
type: design
status: open
created: 2026-05-28
---

# Decisions

| # | Gate | Decision | Date | Notes |
|---|---|---|---|---|
| DG-1 | Vercel Pro upgrade | ☐ Yes / ☐ No | | If No: fall back to hourly polling, 60-min lag accepted |
| DG-2 | DPO designation | ☐ Ricardo / ☐ External | | If external: contract before launch |
| DG-3 | Minors on base | ☐ None / ☐ Some (re-onboard) | | Audit result from Task 29 |
| DG-4 | Privacy notice URL | `/privacy/strikelab` | 2026-05-28 | Default — confirm |
| DG-5 | Legacy discount grandfathering | Deferred → Phase 1 plan | 2026-05-28 | Out of Phase 0 |
```

- [ ] **Step 2: Add env flags to `.env.example`**

Append to `.env.example`:

```
# StrikeLab gamification (Phase 0)
STRIKELAB_ENABLED=false                  # master kill switch
STRIKELAB_POLL_CLASSES_ENABLED=false     # 15-min cron gate
STRIKELAB_POLL_MEMBERSHIPS_ENABLED=false # daily cron gate
STRIKELAB_OPS_START_HOUR=6               # local Lisbon
STRIKELAB_OPS_END_HOUR=23
```

- [ ] **Step 3: Commit**

```bash
git add .env.example strikedash_vault/StrikeLab-Phase-0-Decisions.md
git commit -m "chore(strikelab): phase-0 decisions log + env scaffold"
```

- [ ] **Step 4: STOP — present DG-1 and DG-2 to Ricardo**

Do not proceed past Task 11 (cron registration) without DG-1 resolved. Do not proceed past Task 26 (DPIA) without DG-2 resolved.

---

## Task 2 — Prisma schema: gamification tables

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<NNNN>_strikelab_foundations/migration.sql`

**Purpose:** Add the four foundation tables. Single migration to keep schema atomic.

- [ ] **Step 1: Add models to `prisma/schema.prisma`** (append at end)

```prisma
model GamificationIdentity {
  customerId         Int       @id                              // Yogo customer_id (authoritative)
  phoneE164          String    @unique
  whatsappWaId       String?   @unique
  manychatSubscriber String?   @unique
  instagramHandle    String?   @unique
  igVerifiedAt       DateTime?
  igChallengeCode    String?
  igChallengeExpiry  DateTime?
  optInAt            DateTime?
  optOutAt           DateTime?
  consentVersion     String?   @default("v1.0")
  consentTraining    Boolean   @default(false)
  consentUgc         Boolean   @default(false)
  consentRealName    Boolean   @default(false)
  consentBroadcasts  Boolean   @default(false)
  parentalConsentRef String?                                    // scanned PDF path or signed-doc ref
  birthYear          Int?
  medicalPauseUntil  DateTime?
  vacationPauseUntil DateTime?
  personalPauseUntil DateTime?
  erasedAt           DateTime?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  @@index([whatsappWaId])
  @@index([instagramHandle])
}

model GamificationEventLog {
  eventId        String   @id @default(cuid())
  customerId     Int
  eventType      String                                          // see EventType in types.ts
  pointsDelta    Int      @default(0)                            // monthly points credited/debited
  xpDelta        Int      @default(0)                            // lifetime XP credited
  payloadJson    String                                          // event-specific data
  source         String                                          // yogo_poll | manychat | admin_ui | cron_reset | bot_command
  operatorId     String?                                         // admin user id when source = admin_ui
  idempotencyKey String   @unique                                // e.g. "checkin:1234:7890"
  pointsPeriod   String                                          // "YYYY-MM" Lisbon-local at write time
  createdAt      DateTime @default(now())

  @@index([customerId, createdAt])
  @@index([pointsPeriod, customerId])
  @@index([eventType, createdAt])
}

model GamificationState {
  customerId                  Int      @id
  monthlyPoints               Int      @default(0)
  lifetimeXp                  Int      @default(0)
  currentTier                 String?                          // null until first eval
  proposedTier                String?                          // Art. 22: awaiting admin confirm
  proposedTierAt              DateTime?
  currentStreakDays           Int      @default(0)
  streakShieldAvailable       Boolean  @default(true)
  shieldResetForMonth         String?                          // "YYYY-MM"
  lastClassAt                 DateTime?
  pointsZeroedAtResetId       String?
  lastReplayedEventId         String?
  updatedAt                   DateTime @updatedAt

  @@index([currentTier])
}

model GamificationMonthlySnapshot {
  id                String   @id @default(cuid())
  customerId        Int
  pointsPeriod      String                                       // "YYYY-MM"
  monthlyPoints     Int
  xpAtPeriodEnd     Int
  classesInPeriod   Int
  finalTier         String?
  sealedAt          DateTime @default(now())

  @@unique([customerId, pointsPeriod])
  @@index([pointsPeriod])
}

model GamificationResetAudit {
  resetId         String   @id                                   // UUID
  resetPeriod     String                                         // "YYYY-MM" being reset (the closing month)
  status          String                                         // started | applied_batch | completed | failed
  batchesApplied  Int      @default(0)
  customersZeroed Int      @default(0)
  driftDetected   Int      @default(0)
  startedAt       DateTime @default(now())
  completedAt     DateTime?
  errorMessage    String?
}
```

- [ ] **Step 2: Generate migration**

Run:
```bash
npx prisma migrate dev --name strikelab_foundations --create-only
```

Expected: a new migration directory `prisma/migrations/<NNNN>_strikelab_foundations/migration.sql`. Review it before applying.

- [ ] **Step 3: Apply migration locally**

Run:
```bash
npx prisma migrate dev
npx prisma generate
```

Expected: 5 new tables in `dev.db`. No errors.

- [ ] **Step 4: Smoke test the client**

Create `tests/lib/gamification/schema.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { db } from "../../../src/lib/db";

describe("strikelab schema smoke", () => {
  it("can insert and query a GamificationIdentity", async () => {
    const customerId = 999991;
    await db.gamificationIdentity.deleteMany({ where: { customerId } });
    const row = await db.gamificationIdentity.create({
      data: { customerId, phoneE164: "+351999000001" },
    });
    expect(row.customerId).toBe(customerId);
    expect(row.consentTraining).toBe(false);
    await db.gamificationIdentity.delete({ where: { customerId } });
  });
});
```

Run: `npm test -- gamification/schema`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations tests/lib/gamification/schema.test.ts
git commit -m "feat(strikelab): add foundation schema (identity, event log, state, snapshot, reset audit)"
```

---

## Task 3 — Event log writer (idempotent)

**Files:**
- Create: `src/lib/gamification/types.ts`
- Create: `src/lib/gamification/event-log.ts`
- Create: `tests/lib/gamification/event-log.test.ts`

**Purpose:** A single typed API for appending events. Duplicate keys MUST be silently no-op.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/gamification/event-log.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../../../src/lib/db";
import { appendEvent } from "../../../src/lib/gamification/event-log";

const TEST_CUSTOMER = 999992;

beforeEach(async () => {
  await db.gamificationEventLog.deleteMany({ where: { customerId: TEST_CUSTOMER } });
});

describe("appendEvent", () => {
  it("writes a new event row", async () => {
    const result = await appendEvent({
      customerId: TEST_CUSTOMER,
      eventType: "checkin_observed",
      pointsDelta: 110,
      xpDelta: 110,
      source: "yogo_poll",
      idempotencyKey: "checkin:999992:5001",
      payload: { classId: 5001, classDate: "2026-05-28" },
    });
    expect(result.written).toBe(true);
    expect(result.eventId).toBeDefined();
    const rows = await db.gamificationEventLog.count({ where: { customerId: TEST_CUSTOMER } });
    expect(rows).toBe(1);
  });

  it("is idempotent: duplicate key returns written=false", async () => {
    await appendEvent({
      customerId: TEST_CUSTOMER,
      eventType: "checkin_observed",
      pointsDelta: 110,
      xpDelta: 110,
      source: "yogo_poll",
      idempotencyKey: "checkin:999992:5002",
      payload: {},
    });
    const second = await appendEvent({
      customerId: TEST_CUSTOMER,
      eventType: "checkin_observed",
      pointsDelta: 110,
      xpDelta: 110,
      source: "yogo_poll",
      idempotencyKey: "checkin:999992:5002",
      payload: {},
    });
    expect(second.written).toBe(false);
    const rows = await db.gamificationEventLog.count({ where: { customerId: TEST_CUSTOMER } });
    expect(rows).toBe(1);
  });

  it("computes pointsPeriod in Lisbon-local YYYY-MM", async () => {
    const result = await appendEvent({
      customerId: TEST_CUSTOMER,
      eventType: "checkin_observed",
      pointsDelta: 110,
      xpDelta: 110,
      source: "yogo_poll",
      idempotencyKey: "checkin:999992:5003",
      payload: {},
      now: new Date("2026-06-01T00:30:00Z"), // 01:30 Lisbon — June period
    });
    const row = await db.gamificationEventLog.findUnique({ where: { eventId: result.eventId! } });
    expect(row?.pointsPeriod).toBe("2026-06");
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npm test -- gamification/event-log`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the types module**

Create `src/lib/gamification/types.ts`:

```typescript
export type EventType =
  | "checkin_observed"
  | "subscription_renewed"
  | "subscription_cancelled"
  | "subscription_started"
  | "streak_5_activated"
  | "streak_10_activated"
  | "streak_15_activated"
  | "streak_shield_used"
  | "supera_teu_ritmo"
  | "full_plan_completion"
  | "perfect_week"
  | "p8_milestone"
  | "p12_milestone"
  | "livre_milestone"
  | "referral_phase_1"
  | "referral_phase_2"
  | "story_checkin"
  | "story_no_class"
  | "feed_post"
  | "reel"
  | "repost_official"
  | "weekly_challenge_won"
  | "tier_change_proposed"
  | "tier_change_confirmed"
  | "monthly_reset_started"
  | "monthly_reset_applied_batch"
  | "monthly_reset_completed"
  | "manual_adjustment"
  | "pause_set"
  | "pause_cleared"
  | "erasure_applied"
  | "consent_changed";

export type EventSource =
  | "yogo_poll"
  | "manychat_webhook"
  | "admin_ui"
  | "cron_reset"
  | "bot_command";

export interface AppendEventInput {
  customerId: number;
  eventType: EventType;
  pointsDelta?: number;
  xpDelta?: number;
  source: EventSource;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  operatorId?: string;
  now?: Date;
}

export interface AppendEventResult {
  written: boolean;
  eventId?: string;
}
```

- [ ] **Step 4: Implement appendEvent**

Create `src/lib/gamification/event-log.ts`:

```typescript
import { Prisma } from "@prisma/client";
import { db } from "../db";
import type { AppendEventInput, AppendEventResult } from "./types";

const LISBON_TZ = "Europe/Lisbon";

function pointsPeriodFor(now: Date): string {
  // "YYYY-MM" in Lisbon local
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: LISBON_TZ,
    year: "numeric",
    month: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  return `${year}-${month}`;
}

export async function appendEvent(input: AppendEventInput): Promise<AppendEventResult> {
  const now = input.now ?? new Date();
  try {
    const row = await db.gamificationEventLog.create({
      data: {
        customerId: input.customerId,
        eventType: input.eventType,
        pointsDelta: input.pointsDelta ?? 0,
        xpDelta: input.xpDelta ?? 0,
        payloadJson: JSON.stringify(input.payload),
        source: input.source,
        operatorId: input.operatorId,
        idempotencyKey: input.idempotencyKey,
        pointsPeriod: pointsPeriodFor(now),
        createdAt: now,
      },
    });
    return { written: true, eventId: row.eventId };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // duplicate idempotency_key — expected
      return { written: false };
    }
    throw err;
  }
}
```

- [ ] **Step 5: Run test to confirm pass**

Run: `npm test -- gamification/event-log`
Expected: 3 passing tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/gamification/types.ts src/lib/gamification/event-log.ts tests/lib/gamification/event-log.test.ts
git commit -m "feat(strikelab): idempotent event log writer"
```

---

## Task 4 — State materialization (replay)

**Files:**
- Create: `src/lib/gamification/state.ts`
- Create: `tests/lib/gamification/state.test.ts`

**Purpose:** Deterministically rebuild `GamificationState` for a customer by replaying their events. Single-writer per customer (caller responsibility — queued in Task 11).

- [ ] **Step 1: Write the failing test**

Create `tests/lib/gamification/state.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../../../src/lib/db";
import { appendEvent } from "../../../src/lib/gamification/event-log";
import { materializeState } from "../../../src/lib/gamification/state";

const C = 999993;

beforeEach(async () => {
  await db.gamificationEventLog.deleteMany({ where: { customerId: C } });
  await db.gamificationState.deleteMany({ where: { customerId: C } });
});

describe("materializeState", () => {
  it("sums points and xp from event log", async () => {
    await appendEvent({ customerId: C, eventType: "checkin_observed", pointsDelta: 110, xpDelta: 110, source: "yogo_poll", idempotencyKey: "c:999993:1", payload: {} });
    await appendEvent({ customerId: C, eventType: "checkin_observed", pointsDelta: 110, xpDelta: 110, source: "yogo_poll", idempotencyKey: "c:999993:2", payload: {} });
    const state = await materializeState(C);
    expect(state.monthlyPoints).toBe(220);
    expect(state.lifetimeXp).toBe(220);
  });

  it("zeros monthly_points when current period rolls over but XP persists", async () => {
    await appendEvent({ customerId: C, eventType: "checkin_observed", pointsDelta: 110, xpDelta: 110, source: "yogo_poll", idempotencyKey: "c:999993:1", payload: {}, now: new Date("2026-04-15T10:00:00Z") });
    await appendEvent({ customerId: C, eventType: "checkin_observed", pointsDelta: 110, xpDelta: 110, source: "yogo_poll", idempotencyKey: "c:999993:2", payload: {}, now: new Date("2026-05-15T10:00:00Z") });
    const state = await materializeState(C, { currentPeriod: "2026-05" });
    expect(state.monthlyPoints).toBe(110);   // only May
    expect(state.lifetimeXp).toBe(220);      // both months
  });

  it("persists the result to GamificationState", async () => {
    await appendEvent({ customerId: C, eventType: "checkin_observed", pointsDelta: 110, xpDelta: 110, source: "yogo_poll", idempotencyKey: "c:999993:1", payload: {} });
    await materializeState(C);
    const row = await db.gamificationState.findUnique({ where: { customerId: C } });
    expect(row).not.toBeNull();
    expect(row?.monthlyPoints).toBe(110);
  });
});
```

- [ ] **Step 2: Run — FAIL (module missing)**

- [ ] **Step 3: Implement state.ts**

Create `src/lib/gamification/state.ts`:

```typescript
import { db } from "../db";

const LISBON_TZ = "Europe/Lisbon";

function currentPeriod(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: LISBON_TZ, year: "numeric", month: "2-digit" });
  const parts = fmt.formatToParts(now);
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}`;
}

export interface MaterializedState {
  customerId: number;
  monthlyPoints: number;
  lifetimeXp: number;
  lastClassAt: Date | null;
  lastReplayedEventId: string | null;
}

interface Options {
  currentPeriod?: string;
}

export async function materializeState(customerId: number, opts: Options = {}): Promise<MaterializedState> {
  const period = opts.currentPeriod ?? currentPeriod();
  const events = await db.gamificationEventLog.findMany({
    where: { customerId },
    orderBy: { createdAt: "asc" },
  });

  let monthlyPoints = 0;
  let lifetimeXp = 0;
  let lastClassAt: Date | null = null;
  let lastEventId: string | null = null;

  for (const ev of events) {
    if (ev.pointsPeriod === period) monthlyPoints += ev.pointsDelta;
    lifetimeXp += ev.xpDelta;
    if (ev.eventType === "checkin_observed" && (!lastClassAt || ev.createdAt > lastClassAt)) {
      lastClassAt = ev.createdAt;
    }
    lastEventId = ev.eventId;
  }

  const result: MaterializedState = {
    customerId,
    monthlyPoints,
    lifetimeXp,
    lastClassAt,
    lastReplayedEventId: lastEventId,
  };

  await db.gamificationState.upsert({
    where: { customerId },
    create: {
      customerId,
      monthlyPoints,
      lifetimeXp,
      lastClassAt: lastClassAt ?? undefined,
      lastReplayedEventId: lastEventId ?? undefined,
    },
    update: {
      monthlyPoints,
      lifetimeXp,
      lastClassAt: lastClassAt ?? undefined,
      lastReplayedEventId: lastEventId ?? undefined,
    },
  });

  return result;
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/gamification/state.ts tests/lib/gamification/state.test.ts
git commit -m "feat(strikelab): event-log replay → materialized state"
```

---

## Task 5 — Identity resolution & linking

**Files:**
- Create: `src/lib/gamification/identity.ts`
- Create: `tests/lib/gamification/identity.test.ts`

**Purpose:** Link `customer_id` ↔ phone ↔ WhatsApp ↔ optional verified IG. Provide lookup helpers used everywhere downstream.

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/gamification/identity.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../../../src/lib/db";
import {
  upsertIdentity,
  generateIgChallenge,
  verifyIgChallenge,
  findByPhone,
  findByWaId,
} from "../../../src/lib/gamification/identity";

const C = 999994;

beforeEach(async () => {
  await db.gamificationIdentity.deleteMany({ where: { customerId: C } });
});

describe("identity", () => {
  it("upsert creates and updates", async () => {
    const a = await upsertIdentity({ customerId: C, phoneE164: "+351911000001" });
    expect(a.customerId).toBe(C);
    const b = await upsertIdentity({ customerId: C, phoneE164: "+351911000001", whatsappWaId: "wa-1" });
    expect(b.whatsappWaId).toBe("wa-1");
  });

  it("findByPhone", async () => {
    await upsertIdentity({ customerId: C, phoneE164: "+351911000002" });
    const found = await findByPhone("+351911000002");
    expect(found?.customerId).toBe(C);
  });

  it("findByWaId", async () => {
    await upsertIdentity({ customerId: C, phoneE164: "+351911000003", whatsappWaId: "wa-3" });
    const found = await findByWaId("wa-3");
    expect(found?.customerId).toBe(C);
  });

  it("ig challenge: generate then verify", async () => {
    await upsertIdentity({ customerId: C, phoneE164: "+351911000004" });
    const code = await generateIgChallenge(C);
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    const verified = await verifyIgChallenge({ customerId: C, code, igHandle: "carla_mt" });
    expect(verified.ok).toBe(true);
    const row = await db.gamificationIdentity.findUnique({ where: { customerId: C } });
    expect(row?.instagramHandle).toBe("carla_mt");
    expect(row?.igVerifiedAt).not.toBeNull();
  });

  it("ig challenge: wrong code rejected", async () => {
    await upsertIdentity({ customerId: C, phoneE164: "+351911000005" });
    await generateIgChallenge(C);
    const verified = await verifyIgChallenge({ customerId: C, code: "WRONG1", igHandle: "carla_mt" });
    expect(verified.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement identity.ts**

Create `src/lib/gamification/identity.ts`:

```typescript
import { db } from "../db";

const CHALLENGE_TTL_MIN = 30;

function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export interface UpsertIdentityInput {
  customerId: number;
  phoneE164: string;
  whatsappWaId?: string;
  manychatSubscriber?: string;
}

export async function upsertIdentity(input: UpsertIdentityInput) {
  return db.gamificationIdentity.upsert({
    where: { customerId: input.customerId },
    create: input,
    update: {
      phoneE164: input.phoneE164,
      whatsappWaId: input.whatsappWaId,
      manychatSubscriber: input.manychatSubscriber,
    },
  });
}

export async function findByPhone(phoneE164: string) {
  return db.gamificationIdentity.findUnique({ where: { phoneE164 } });
}

export async function findByWaId(whatsappWaId: string) {
  return db.gamificationIdentity.findUnique({ where: { whatsappWaId } });
}

export async function findByCustomerId(customerId: number) {
  return db.gamificationIdentity.findUnique({ where: { customerId } });
}

export async function generateIgChallenge(customerId: number): Promise<string> {
  const code = randomCode();
  const expiry = new Date(Date.now() + CHALLENGE_TTL_MIN * 60_000);
  await db.gamificationIdentity.update({
    where: { customerId },
    data: { igChallengeCode: code, igChallengeExpiry: expiry },
  });
  return code;
}

export interface VerifyIgInput {
  customerId: number;
  code: string;
  igHandle: string;
}

export async function verifyIgChallenge(input: VerifyIgInput): Promise<{ ok: boolean; reason?: string }> {
  const row = await db.gamificationIdentity.findUnique({ where: { customerId: input.customerId } });
  if (!row?.igChallengeCode) return { ok: false, reason: "no_challenge" };
  if (row.igChallengeExpiry && row.igChallengeExpiry < new Date()) return { ok: false, reason: "expired" };
  if (row.igChallengeCode !== input.code.trim().toUpperCase()) return { ok: false, reason: "mismatch" };
  await db.gamificationIdentity.update({
    where: { customerId: input.customerId },
    data: {
      instagramHandle: input.igHandle.toLowerCase().replace(/^@/, ""),
      igVerifiedAt: new Date(),
      igChallengeCode: null,
      igChallengeExpiry: null,
    },
  });
  return { ok: true };
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/gamification/identity.ts tests/lib/gamification/identity.test.ts
git commit -m "feat(strikelab): identity resolution + IG challenge verification"
```

---

## Task 6 — Consent module

**Files:**
- Create: `src/lib/gamification/consent.ts`
- Create: `tests/lib/gamification/consent.test.ts`

**Purpose:** Granular consent toggles + audit each change via event log.

- [ ] **Step 1: Failing test**

Create `tests/lib/gamification/consent.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../../../src/lib/db";
import { upsertIdentity } from "../../../src/lib/gamification/identity";
import { setConsent, getConsent } from "../../../src/lib/gamification/consent";

const C = 999995;

beforeEach(async () => {
  await db.gamificationEventLog.deleteMany({ where: { customerId: C } });
  await db.gamificationIdentity.deleteMany({ where: { customerId: C } });
  await upsertIdentity({ customerId: C, phoneE164: "+351911000010" });
});

describe("consent", () => {
  it("sets all four toggles independently", async () => {
    await setConsent(C, { training: true });
    let s = await getConsent(C);
    expect(s?.training).toBe(true);
    expect(s?.ugc).toBe(false);
    await setConsent(C, { ugc: true, realName: true });
    s = await getConsent(C);
    expect(s?.ugc).toBe(true);
    expect(s?.realName).toBe(true);
  });

  it("audit-logs each change", async () => {
    await setConsent(C, { training: true });
    await setConsent(C, { ugc: true });
    const rows = await db.gamificationEventLog.findMany({
      where: { customerId: C, eventType: "consent_changed" },
    });
    expect(rows.length).toBe(2);
  });

  it("training=false sets optOutAt", async () => {
    await setConsent(C, { training: true });
    await setConsent(C, { training: false });
    const row = await db.gamificationIdentity.findUnique({ where: { customerId: C } });
    expect(row?.optOutAt).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement consent.ts**

Create `src/lib/gamification/consent.ts`:

```typescript
import { db } from "../db";
import { appendEvent } from "./event-log";

export interface ConsentToggles {
  training?: boolean;
  ugc?: boolean;
  realName?: boolean;
  broadcasts?: boolean;
}

export interface ConsentState {
  training: boolean;
  ugc: boolean;
  realName: boolean;
  broadcasts: boolean;
}

export async function getConsent(customerId: number): Promise<ConsentState | null> {
  const row = await db.gamificationIdentity.findUnique({ where: { customerId } });
  if (!row) return null;
  return {
    training: row.consentTraining,
    ugc: row.consentUgc,
    realName: row.consentRealName,
    broadcasts: row.consentBroadcasts,
  };
}

export async function setConsent(customerId: number, changes: ConsentToggles): Promise<void> {
  const before = await db.gamificationIdentity.findUnique({ where: { customerId } });
  if (!before) throw new Error(`identity not found: ${customerId}`);

  const after = {
    consentTraining: changes.training ?? before.consentTraining,
    consentUgc: changes.ugc ?? before.consentUgc,
    consentRealName: changes.realName ?? before.consentRealName,
    consentBroadcasts: changes.broadcasts ?? before.consentBroadcasts,
  };

  const now = new Date();
  const trainingToggleOn = changes.training === true && !before.consentTraining;
  const trainingToggleOff = changes.training === false && before.consentTraining;

  await db.gamificationIdentity.update({
    where: { customerId },
    data: {
      ...after,
      optInAt: trainingToggleOn ? now : before.optInAt,
      optOutAt: trainingToggleOff ? now : before.optOutAt,
    },
  });

  await appendEvent({
    customerId,
    eventType: "consent_changed",
    source: "bot_command",
    idempotencyKey: `consent:${customerId}:${now.getTime()}`,
    payload: {
      before: {
        training: before.consentTraining,
        ugc: before.consentUgc,
        realName: before.consentRealName,
        broadcasts: before.consentBroadcasts,
      },
      after: {
        training: after.consentTraining,
        ugc: after.consentUgc,
        realName: after.consentRealName,
        broadcasts: after.consentBroadcasts,
      },
    },
    now,
  });
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/gamification/consent.ts tests/lib/gamification/consent.test.ts
git commit -m "feat(strikelab): granular consent toggles with audit log"
```

---

## Task 7 — Yogo class poll (15-min cadence)

**Files:**
- Create: `src/lib/gamification/poll/shared.ts`
- Create: `src/lib/gamification/poll/classes.ts`
- Create: `tests/lib/gamification/poll/classes.test.ts`

**Purpose:** Diff today's Yogo classes against last snapshot → produce `checkin_observed` events. Idempotent: re-running over the same window produces zero new events.

- [ ] **Step 1: Failing test**

Create `tests/lib/gamification/poll/classes.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "../../../../src/lib/db";
import { upsertIdentity } from "../../../../src/lib/gamification/identity";
import { pollClasses, type YogoClassRow } from "../../../../src/lib/gamification/poll/classes";

const C = 999996;

beforeEach(async () => {
  await db.gamificationEventLog.deleteMany({ where: { customerId: C } });
  await db.gamificationIdentity.deleteMany({ where: { customerId: C } });
  await upsertIdentity({ customerId: C, phoneE164: "+351911000020" });
});

const fakeClass: YogoClassRow = {
  id: 7001,
  date: "2026-05-28",
  start_time: "19:30",
  checkins: [{ customer_id: C, checked_in_at: "2026-05-28T17:35:00Z" }],
};

describe("pollClasses", () => {
  it("produces checkin_observed events for new check-ins", async () => {
    const result = await pollClasses({ fetcher: vi.fn().mockResolvedValue([fakeClass]) });
    expect(result.eventsWritten).toBe(1);
    const rows = await db.gamificationEventLog.findMany({ where: { customerId: C } });
    expect(rows.length).toBe(1);
    expect(rows[0].eventType).toBe("checkin_observed");
  });

  it("is idempotent: re-polling produces zero new events", async () => {
    const fetcher = vi.fn().mockResolvedValue([fakeClass]);
    await pollClasses({ fetcher });
    const r2 = await pollClasses({ fetcher });
    expect(r2.eventsWritten).toBe(0);
  });

  it("skips check-ins from customers without identity", async () => {
    const unknownClass: YogoClassRow = {
      id: 7002,
      date: "2026-05-28",
      start_time: "19:30",
      checkins: [{ customer_id: 999999999, checked_in_at: "2026-05-28T17:35:00Z" }],
    };
    const result = await pollClasses({ fetcher: vi.fn().mockResolvedValue([unknownClass]) });
    expect(result.eventsWritten).toBe(0);
    expect(result.skippedNoIdentity).toBe(1);
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement shared.ts**

Create `src/lib/gamification/poll/shared.ts`:

```typescript
export const STRIKELAB_VERSION = "v3.1";

export interface PollResult {
  eventsWritten: number;
  classesScanned: number;
  skippedNoIdentity: number;
  errors: string[];
}
```

- [ ] **Step 4: Implement classes.ts**

Create `src/lib/gamification/poll/classes.ts`:

```typescript
import { appendEvent } from "../event-log";
import { findByCustomerId } from "../identity";
import type { PollResult } from "./shared";

export interface YogoCheckin {
  customer_id: number;
  checked_in_at: string; // ISO
}

export interface YogoClassRow {
  id: number;
  date: string; // "YYYY-MM-DD"
  start_time: string; // "HH:MM"
  checkins: YogoCheckin[];
}

export type ClassFetcher = (todayIso: string) => Promise<YogoClassRow[]>;

async function defaultFetcher(todayIso: string): Promise<YogoClassRow[]> {
  const base = process.env.YOGO_BASE ?? "https://api.yogo.dk";
  const token = process.env.YOGO_TOKEN;
  if (!token) throw new Error("YOGO_TOKEN required");
  const url = `${base}/classes?startDate=${todayIso}&populate[]=checkins`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-yogo-request-context": "admin",
    },
  });
  if (!res.ok) throw new Error(`yogo /classes failed: ${res.status}`);
  const data = (await res.json()) as { data?: YogoClassRow[] } | YogoClassRow[];
  return Array.isArray(data) ? data : (data.data ?? []);
}

export interface PollOptions {
  fetcher?: ClassFetcher;
  today?: string;
}

export async function pollClasses(opts: PollOptions = {}): Promise<PollResult> {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const fetcher = opts.fetcher ?? defaultFetcher;
  const classes = await fetcher(today);
  const result: PollResult = { eventsWritten: 0, classesScanned: classes.length, skippedNoIdentity: 0, errors: [] };

  for (const cls of classes) {
    for (const c of cls.checkins ?? []) {
      const identity = await findByCustomerId(c.customer_id);
      if (!identity) {
        result.skippedNoIdentity++;
        continue;
      }
      const r = await appendEvent({
        customerId: c.customer_id,
        eventType: "checkin_observed",
        pointsDelta: 0, // Phase 1 will add pointsPerClass logic; Phase 0 just records the observation
        xpDelta: 0,
        source: "yogo_poll",
        idempotencyKey: `checkin:${c.customer_id}:${cls.id}`,
        payload: { classId: cls.id, classDate: cls.date, startTime: cls.start_time, checkedInAt: c.checked_in_at },
        now: new Date(c.checked_in_at),
      });
      if (r.written) result.eventsWritten++;
    }
  }
  return result;
}
```

- [ ] **Step 5: Run — PASS (3 tests)**

- [ ] **Step 6: Commit**

```bash
git add src/lib/gamification/poll/ tests/lib/gamification/poll/classes.test.ts
git commit -m "feat(strikelab): yogo class window poll (idempotent diff)"
```

---

## Task 8 — Yogo memberships sweep (daily)

**Files:**
- Create: `src/lib/gamification/poll/memberships.ts`
- Create: `tests/lib/gamification/poll/memberships.test.ts`

**Purpose:** Detect renewal/cancellation/start by comparing today's memberships snapshot against yesterday's. Emits `subscription_*` events.

- [ ] **Step 1: Failing test**

Create `tests/lib/gamification/poll/memberships.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "../../../../src/lib/db";
import { upsertIdentity } from "../../../../src/lib/gamification/identity";
import { pollMemberships, type YogoMembershipRow } from "../../../../src/lib/gamification/poll/memberships";

const C = 999997;

beforeEach(async () => {
  await db.gamificationEventLog.deleteMany({ where: { customerId: C } });
  await db.gamificationIdentity.deleteMany({ where: { customerId: C } });
  await upsertIdentity({ customerId: C, phoneE164: "+351911000030" });
});

describe("pollMemberships", () => {
  it("emits subscription_renewed when last_renewed_at advances", async () => {
    const day1: YogoMembershipRow = {
      customer_id: C,
      membership_id: 6021,
      status: "active",
      last_renewed_at: "2026-05-01T00:00:00Z",
    };
    const day2: YogoMembershipRow = { ...day1, last_renewed_at: "2026-06-01T00:00:00Z" };

    await pollMemberships({ fetcher: vi.fn().mockResolvedValue([day1]) });
    const r2 = await pollMemberships({ fetcher: vi.fn().mockResolvedValue([day2]) });

    expect(r2.eventsWritten).toBe(1);
    const ev = await db.gamificationEventLog.findFirst({ where: { customerId: C, eventType: "subscription_renewed" } });
    expect(ev).not.toBeNull();
  });

  it("idempotent: same snapshot twice produces zero", async () => {
    const row: YogoMembershipRow = { customer_id: C, membership_id: 6021, status: "active", last_renewed_at: "2026-05-01T00:00:00Z" };
    const fetcher = vi.fn().mockResolvedValue([row]);
    await pollMemberships({ fetcher });
    const r2 = await pollMemberships({ fetcher });
    expect(r2.eventsWritten).toBe(0);
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement memberships.ts**

Create `src/lib/gamification/poll/memberships.ts`:

```typescript
import { appendEvent } from "../event-log";
import { findByCustomerId } from "../identity";
import type { PollResult } from "./shared";

export interface YogoMembershipRow {
  customer_id: number;
  membership_id: number;
  status: "active" | "paused" | "cancelled" | "expired";
  last_renewed_at: string | null;
}

export type MembershipFetcher = () => Promise<YogoMembershipRow[]>;

async function defaultFetcher(): Promise<YogoMembershipRow[]> {
  const base = process.env.YOGO_BASE ?? "https://api.yogo.dk";
  const token = process.env.YOGO_TOKEN;
  if (!token) throw new Error("YOGO_TOKEN required");
  const res = await fetch(`${base}/reports/memberships-list`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-yogo-request-context": "admin",
    },
    body: JSON.stringify({ filters: {} }),
  });
  if (!res.ok) throw new Error(`yogo memberships failed: ${res.status}`);
  const data = (await res.json()) as { data?: YogoMembershipRow[] };
  return data.data ?? [];
}

export interface PollMembershipsOptions {
  fetcher?: MembershipFetcher;
}

export async function pollMemberships(opts: PollMembershipsOptions = {}): Promise<PollResult> {
  const fetcher = opts.fetcher ?? defaultFetcher;
  const rows = await fetcher();
  const result: PollResult = { eventsWritten: 0, classesScanned: 0, skippedNoIdentity: 0, errors: [] };

  for (const m of rows) {
    const identity = await findByCustomerId(m.customer_id);
    if (!identity) {
      result.skippedNoIdentity++;
      continue;
    }
    if (m.last_renewed_at) {
      const r = await appendEvent({
        customerId: m.customer_id,
        eventType: "subscription_renewed",
        source: "yogo_poll",
        idempotencyKey: `renewal:${m.customer_id}:${m.membership_id}:${m.last_renewed_at}`,
        payload: { membershipId: m.membership_id, status: m.status, lastRenewedAt: m.last_renewed_at },
        now: new Date(m.last_renewed_at),
      });
      if (r.written) result.eventsWritten++;
    }
    if (m.status === "cancelled" || m.status === "expired") {
      const r = await appendEvent({
        customerId: m.customer_id,
        eventType: "subscription_cancelled",
        source: "yogo_poll",
        idempotencyKey: `cancel:${m.customer_id}:${m.membership_id}:${m.status}`,
        payload: { membershipId: m.membership_id, status: m.status },
      });
      if (r.written) result.eventsWritten++;
    }
  }
  return result;
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/gamification/poll/memberships.ts tests/lib/gamification/poll/memberships.test.ts
git commit -m "feat(strikelab): daily yogo memberships sweep"
```

---

## Task 9 — Cron routes for polling

**Files:**
- Create: `src/app/api/cron/strikelab-poll-classes/route.ts`
- Create: `src/app/api/cron/strikelab-poll-memberships/route.ts`
- Modify: `vercel.json`

**Purpose:** Wire pollers to Vercel cron with CRON_SECRET bearer auth (existing pattern). Class poll is gated to operating hours by env.

> **DG-1 GATE:** Stop here if Vercel Pro is not yet confirmed. The 15-min schedule below requires it.

- [ ] **Step 1: Create classes cron route**

Create `src/app/api/cron/strikelab-poll-classes/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { pollClasses } from "@/lib/gamification/poll/classes";

const LISBON_TZ = "Europe/Lisbon";

function isOperatingHours(now: Date = new Date()): boolean {
  const startHour = Number(process.env.STRIKELAB_OPS_START_HOUR ?? "6");
  const endHour = Number(process.env.STRIKELAB_OPS_END_HOUR ?? "23");
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: LISBON_TZ, hour: "2-digit", hour12: false }).format(now)
  );
  return hour >= startHour && hour <= endHour;
}

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return NextResponse.json({ error: "no_secret_configured" }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (process.env.STRIKELAB_POLL_CLASSES_ENABLED !== "true") {
    return NextResponse.json({ skipped: "feature_disabled" });
  }
  if (!isOperatingHours()) {
    return NextResponse.json({ skipped: "outside_operating_hours" });
  }
  try {
    const result = await pollClasses();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create memberships cron route**

Create `src/app/api/cron/strikelab-poll-memberships/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { pollMemberships } from "@/lib/gamification/poll/memberships";

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return NextResponse.json({ error: "no_secret_configured" }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (process.env.STRIKELAB_POLL_MEMBERSHIPS_ENABLED !== "true") {
    return NextResponse.json({ skipped: "feature_disabled" });
  }
  try {
    const result = await pollMemberships();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
```

- [ ] **Step 3: Update vercel.json**

Modify `vercel.json` to add two new cron entries:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    { "path": "/api/cron/trial-followup", "schedule": "0 10 * * *" },
    { "path": "/api/cron/trial-followup", "schedule": "0 11 * * *" },
    { "path": "/api/cron/wa-purge", "schedule": "0 3 * * *" },
    { "path": "/api/cron/spotify-playlists", "schedule": "0 4 * * *" },
    { "path": "/api/cron/spotify-playlist-lock", "schedule": "0 23 * * *" },
    { "path": "/api/cron/strikelab-poll-classes", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/strikelab-poll-memberships", "schedule": "0 2 * * *" }
  ]
}
```

> Note: the classes cron runs every 15 min globally; the route itself short-circuits outside Lisbon operating hours (6h–23h).

- [ ] **Step 4: Smoke test locally**

Run:
```bash
export CRON_SECRET=local-test
export STRIKELAB_POLL_CLASSES_ENABLED=false
npm run dev &
sleep 8
curl -s -H "Authorization: Bearer local-test" http://localhost:3000/api/cron/strikelab-poll-classes
```

Expected: `{"skipped":"feature_disabled"}`.

Kill: `kill %1` (or close the dev server).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/strikelab-poll-classes src/app/api/cron/strikelab-poll-memberships vercel.json
git commit -m "feat(strikelab): cron routes for class poll (15min) + memberships sweep (daily 02:00)"
```

---

## Task 10 — Bot onboarding handler

**Files:**
- Create: `src/lib/wa/handlers/strikelab-onboard.ts`
- Modify: `src/lib/wa/dispatch.ts`
- Create: `tests/lib/wa/handlers/strikelab-onboard.test.ts`

**Purpose:** When a known student types `strikelab` or `/iniciar`, run the onboarding state machine: greet → privacy notice link → 4 consent toggles → IG challenge (optional). All messages in pt-PT.

- [ ] **Step 1: Failing test**

Create `tests/lib/wa/handlers/strikelab-onboard.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "../../../../src/lib/db";
import { upsertIdentity } from "../../../../src/lib/gamification/identity";
import { handleStrikelabOnboard } from "../../../../src/lib/wa/handlers/strikelab-onboard";

const C = 999998;
const PHONE = "+351911000050";

beforeEach(async () => {
  await db.gamificationEventLog.deleteMany({ where: { customerId: C } });
  await db.gamificationIdentity.deleteMany({ where: { customerId: C } });
  await upsertIdentity({ customerId: C, phoneE164: PHONE });
});

describe("handleStrikelabOnboard", () => {
  it("first message: returns greeting + privacy link + ask consent treino", async () => {
    const reply = await handleStrikelabOnboard({ phoneE164: PHONE, body: "strikelab", waSession: null });
    expect(reply.messages[0]).toContain("StrikeLab");
    expect(reply.messages[0]).toContain("/privacy/strikelab");
    expect(reply.nextSessionState).toBe("STRIKELAB_AWAIT_CONSENT_TRAINING");
  });

  it('reply "sim" while AWAIT_CONSENT_TRAINING sets training=true and asks about UGC', async () => {
    const reply = await handleStrikelabOnboard({
      phoneE164: PHONE,
      body: "sim",
      waSession: { state: "STRIKELAB_AWAIT_CONSENT_TRAINING" },
    });
    const row = await db.gamificationIdentity.findUnique({ where: { customerId: C } });
    expect(row?.consentTraining).toBe(true);
    expect(reply.nextSessionState).toBe("STRIKELAB_AWAIT_CONSENT_UGC");
  });

  it('reply "não" to training declines and ends flow without enrolment', async () => {
    const reply = await handleStrikelabOnboard({
      phoneE164: PHONE,
      body: "não",
      waSession: { state: "STRIKELAB_AWAIT_CONSENT_TRAINING" },
    });
    const row = await db.gamificationIdentity.findUnique({ where: { customerId: C } });
    expect(row?.consentTraining).toBe(false);
    expect(reply.nextSessionState).toBe("IDLE");
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement strikelab-onboard.ts**

Create `src/lib/wa/handlers/strikelab-onboard.ts`:

```typescript
import { findByPhone } from "@/lib/gamification/identity";
import { setConsent } from "@/lib/gamification/consent";

export type OnboardState =
  | "IDLE"
  | "STRIKELAB_AWAIT_CONSENT_TRAINING"
  | "STRIKELAB_AWAIT_CONSENT_UGC"
  | "STRIKELAB_AWAIT_CONSENT_REAL_NAME"
  | "STRIKELAB_AWAIT_CONSENT_BROADCASTS";

export interface OnboardInput {
  phoneE164: string;
  body: string;
  waSession: { state: string } | null;
}

export interface OnboardReply {
  messages: string[];
  nextSessionState: OnboardState;
}

function normalize(s: string): "yes" | "no" | "other" {
  const t = s.trim().toLowerCase();
  if (["sim", "s", "yes", "y", "ok", "claro"].includes(t)) return "yes";
  if (["não", "nao", "no", "n"].includes(t)) return "no";
  return "other";
}

const PRIVACY_URL = "/privacy/strikelab";

export async function handleStrikelabOnboard(input: OnboardInput): Promise<OnboardReply> {
  const identity = await findByPhone(input.phoneE164);
  if (!identity) {
    return {
      messages: ["Olá! Para usar o StrikeLab preciso primeiro de te ligar ao teu perfil. Fala com o Marcelo na recepção."],
      nextSessionState: "IDLE",
    };
  }

  const state = (input.waSession?.state as OnboardState) ?? "IDLE";

  if (state === "IDLE") {
    return {
      messages: [
        "Bem-vindo ao *StrikeLab* — o sistema de pontos da Strike House.\n\n" +
          `Antes de começar, lê a política de privacidade aqui: ${PRIVACY__URL_PLACEHOLDER(PRIVACY_URL)}\n\n` +
          "Queres participar no StrikeLab (treinos contam pontos, podes ganhar prémios)? Responde *sim* ou *não*.",
      ],
      nextSessionState: "STRIKELAB_AWAIT_CONSENT_TRAINING",
    };
  }

  const ans = normalize(input.body);

  if (state === "STRIKELAB_AWAIT_CONSENT_TRAINING") {
    if (ans === "yes") {
      await setConsent(identity.customerId, { training: true });
      return {
        messages: ["✅ Apontado. Queres que as tuas publicações no Instagram (com @strikershouseportugal) também contem? *sim* / *não*"],
        nextSessionState: "STRIKELAB_AWAIT_CONSENT_UGC",
      };
    }
    if (ans === "no") {
      await setConsent(identity.customerId, { training: false });
      return { messages: ["Sem problema. Não vais participar no StrikeLab. Podes mudar de ideias a qualquer momento — basta escreveres *strikelab*."], nextSessionState: "IDLE" };
    }
    return { messages: ["Responde *sim* ou *não*, por favor."], nextSessionState: "STRIKELAB_AWAIT_CONSENT_TRAINING" };
  }

  if (state === "STRIKELAB_AWAIT_CONSENT_UGC") {
    if (ans === "yes") await setConsent(identity.customerId, { ugc: true });
    if (ans === "no") await setConsent(identity.customerId, { ugc: false });
    if (ans === "other") return { messages: ["Responde *sim* ou *não*."], nextSessionState: "STRIKELAB_AWAIT_CONSENT_UGC" };
    return {
      messages: ["Queres aparecer no ranking com o teu nome real? (Por defeito é um pseudónimo) *sim* / *não*"],
      nextSessionState: "STRIKELAB_AWAIT_CONSENT_REAL_NAME",
    };
  }

  if (state === "STRIKELAB_AWAIT_CONSENT_REAL_NAME") {
    if (ans === "yes") await setConsent(identity.customerId, { realName: true });
    if (ans === "no") await setConsent(identity.customerId, { realName: false });
    if (ans === "other") return { messages: ["Responde *sim* ou *não*."], nextSessionState: "STRIKELAB_AWAIT_CONSENT_REAL_NAME" };
    return {
      messages: ["Última: queres receber os anúncios de desafios semanais no grupo da academia? *sim* / *não*"],
      nextSessionState: "STRIKELAB_AWAIT_CONSENT_BROADCASTS",
    };
  }

  if (state === "STRIKELAB_AWAIT_CONSENT_BROADCASTS") {
    if (ans === "yes") await setConsent(identity.customerId, { broadcasts: true });
    if (ans === "no") await setConsent(identity.customerId, { broadcasts: false });
    if (ans === "other") return { messages: ["Responde *sim* ou *não*."], nextSessionState: "STRIKELAB_AWAIT_CONSENT_BROADCASTS" };
    return {
      messages: ["🎉 Tudo pronto. Bem-vindo ao StrikeLab. Os teus check-ins já começam a contar pontos a partir do próximo treino."],
      nextSessionState: "IDLE",
    };
  }

  return { messages: ["Escreve *strikelab* para começar."], nextSessionState: "IDLE" };
}

// Helper to keep template strings readable when placing variables.
function PRIVACY__URL_PLACEHOLDER(u: string): string {
  return u;
}
```

- [ ] **Step 4: Wire into dispatch**

Modify `src/lib/wa/dispatch.ts` (locate the inbound routing block) — add a route for `strikelab` keyword and state-prefixed messages:

```typescript
// Near the top of the dispatch function, after parsing the body keyword:
if (body.toLowerCase().startsWith("strikelab") || (session?.state ?? "").startsWith("STRIKELAB_")) {
  const reply = await handleStrikelabOnboard({
    phoneE164: contact.phoneE164,
    body,
    waSession: session ? { state: session.state } : null,
  });
  // Use the existing session update + outbound dispatch primitives (do not duplicate here).
  await updateSessionState(contact.phoneE164, reply.nextSessionState);
  for (const m of reply.messages) await sendOutbound(contact.phoneE164, "strikelab", m);
  return;
}
```

(The exact call-site shape depends on the current `dispatch.ts`; adapt to its existing primitives `updateSessionState`/`sendOutbound`/etc.)

- [ ] **Step 5: Run tests — PASS**

```bash
npm test -- strikelab-onboard
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/wa/handlers/strikelab-onboard.ts src/lib/wa/dispatch.ts tests/lib/wa/handlers/strikelab-onboard.test.ts
git commit -m "feat(strikelab): bot onboarding state machine with 4-toggle consent (pt-PT)"
```

---

## Task 11 — Erasure flow (Art. 17)

**Files:**
- Create: `src/lib/gamification/erasure.ts`
- Create: `src/app/api/strikelab/erasure/route.ts`
- Create: `tests/lib/gamification/erasure.test.ts`

**Purpose:** Process a confirmed erasure request: zero state, anonymize event log, tombstone identity, audit.

- [ ] **Step 1: Failing test**

Create `tests/lib/gamification/erasure.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../../../src/lib/db";
import { upsertIdentity } from "../../../src/lib/gamification/identity";
import { appendEvent } from "../../../src/lib/gamification/event-log";
import { materializeState } from "../../../src/lib/gamification/state";
import { applyErasure } from "../../../src/lib/gamification/erasure";

const C = 999999;

beforeEach(async () => {
  await db.gamificationEventLog.deleteMany({ where: { customerId: C } });
  await db.gamificationIdentity.deleteMany({ where: { customerId: C } });
  await db.gamificationState.deleteMany({ where: { customerId: C } });
  await upsertIdentity({ customerId: C, phoneE164: "+351911000099" });
  await appendEvent({ customerId: C, eventType: "checkin_observed", pointsDelta: 110, xpDelta: 110, source: "yogo_poll", idempotencyKey: "c:999999:1", payload: { classId: 1 } });
  await materializeState(C);
});

describe("applyErasure", () => {
  it("zeroes state and tombstones identity", async () => {
    await applyErasure({ customerId: C, operatorId: "ricardo" });
    const id = await db.gamificationIdentity.findUnique({ where: { customerId: C } });
    expect(id?.erasedAt).not.toBeNull();
    expect(id?.phoneE164.startsWith("ERASED:")).toBe(true);
    const st = await db.gamificationState.findUnique({ where: { customerId: C } });
    expect(st?.monthlyPoints).toBe(0);
    expect(st?.lifetimeXp).toBe(0);
    expect(st?.currentTier).toBeNull();
  });

  it("anonymizes event log payloads but keeps numeric fields", async () => {
    await applyErasure({ customerId: C, operatorId: "ricardo" });
    const ev = await db.gamificationEventLog.findFirst({ where: { customerId: C, eventType: "checkin_observed" } });
    const payload = JSON.parse(ev?.payloadJson ?? "{}");
    expect(payload.classId).toBeUndefined();
    expect(ev?.pointsDelta).toBe(110);
  });

  it("writes erasure_applied audit event", async () => {
    await applyErasure({ customerId: C, operatorId: "ricardo" });
    const audit = await db.gamificationEventLog.findFirst({ where: { customerId: C, eventType: "erasure_applied" } });
    expect(audit).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement erasure.ts**

Create `src/lib/gamification/erasure.ts`:

```typescript
import { db } from "../db";
import { appendEvent } from "./event-log";

export interface ErasureInput {
  customerId: number;
  operatorId: string;
}

export async function applyErasure(input: ErasureInput): Promise<void> {
  const now = new Date();

  // 1. Tombstone identity (PII fields nulled or replaced)
  await db.gamificationIdentity.update({
    where: { customerId: input.customerId },
    data: {
      phoneE164: `ERASED:${input.customerId}:${now.getTime()}`,
      whatsappWaId: null,
      manychatSubscriber: null,
      instagramHandle: null,
      igVerifiedAt: null,
      igChallengeCode: null,
      igChallengeExpiry: null,
      parentalConsentRef: null,
      birthYear: null,
      erasedAt: now,
    },
  });

  // 2. Anonymize event log payloads (keep numeric deltas, drop PII)
  const events = await db.gamificationEventLog.findMany({
    where: { customerId: input.customerId, eventType: { not: "erasure_applied" } },
  });
  for (const ev of events) {
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(ev.payloadJson);
    } catch { /* ignore */ }
    const cleaned: Record<string, unknown> = {};
    // keep only safe numeric/structural fields
    if (typeof payload.duration === "number") cleaned.duration = payload.duration;
    await db.gamificationEventLog.update({
      where: { eventId: ev.eventId },
      data: { payloadJson: JSON.stringify(cleaned) },
    });
  }

  // 3. Zero state
  await db.gamificationState.upsert({
    where: { customerId: input.customerId },
    create: { customerId: input.customerId, monthlyPoints: 0, lifetimeXp: 0 },
    update: { monthlyPoints: 0, lifetimeXp: 0, currentTier: null, proposedTier: null, currentStreakDays: 0 },
  });

  // 4. Audit
  await appendEvent({
    customerId: input.customerId,
    eventType: "erasure_applied",
    source: "admin_ui",
    operatorId: input.operatorId,
    idempotencyKey: `erasure:${input.customerId}:${now.getTime()}`,
    payload: { appliedAt: now.toISOString() },
    now,
  });
}
```

- [ ] **Step 4: Create API route**

Create `src/app/api/strikelab/erasure/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getRoleFromCookie } from "@/lib/auth";
import { applyErasure } from "@/lib/gamification/erasure";

export async function POST(req: NextRequest) {
  const role = await getRoleFromCookie();
  if (role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const customerId = Number(body.customerId);
  const operatorId = String(body.operatorId ?? "admin");
  if (!Number.isInteger(customerId)) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  await applyErasure({ customerId, operatorId });
  return NextResponse.json({ ok: true });
}
```

> **Adapt** `getRoleFromCookie` to whatever your existing `src/lib/auth.ts` exports — the call site here uses the established admin guard.

- [ ] **Step 5: Run — PASS**

- [ ] **Step 6: Commit**

```bash
git add src/lib/gamification/erasure.ts src/app/api/strikelab/erasure/route.ts tests/lib/gamification/erasure.test.ts
git commit -m "feat(strikelab): right-to-erasure flow with audit"
```

---

## Task 12 — Admin: per-student view

**Files:**
- Create: `src/app/dashboard/strikelab/layout.tsx`
- Create: `src/app/dashboard/strikelab/page.tsx`
- Create: `src/app/dashboard/strikelab/[customerId]/page.tsx`

**Purpose:** Admin-only navigable view of a student's points, XP, identity, consent, recent events.

- [ ] **Step 1: Create layout with admin guard**

Create `src/app/dashboard/strikelab/layout.tsx`:

```tsx
"use client";

import { useAuth } from "@/hooks/use-auth";

export default function StrikelabLayout({ children }: { children: React.ReactNode }) {
  const { role, loading } = useAuth();
  if (loading) return null;
  if (role !== "admin") {
    return (
      <div className="p-6 text-zinc-400">Sem permissões para esta área.</div>
    );
  }
  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <header className="border-b border-zinc-800 px-4 py-3">
        <h1 className="text-lg font-semibold">StrikeLab — Admin</h1>
      </header>
      <main className="p-4">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Create student list page**

Create `src/app/dashboard/strikelab/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface StudentRow {
  customerId: number;
  phoneE164: string;
  monthlyPoints: number;
  lifetimeXp: number;
  currentTier: string | null;
  optInAt: string | null;
}

export default function StudentsPage() {
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/strikelab/admin/students?q=" + encodeURIComponent(q))
      .then((r) => r.json())
      .then((d) => {
        setRows(d.rows ?? []);
        setLoading(false);
      });
  }, [q]);

  return (
    <div>
      <input
        type="search"
        placeholder="Procurar por telefone ou customer ID…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 mb-4 text-sm"
      />
      {loading ? (
        <p className="text-zinc-500">A carregar…</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-zinc-500">
            <tr>
              <th className="text-left py-2">Cliente</th>
              <th className="text-right">Pontos</th>
              <th className="text-right">XP</th>
              <th className="text-left">Patente</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.customerId} className="border-t border-zinc-800">
                <td className="py-2">{s.phoneE164}</td>
                <td className="text-right">{s.monthlyPoints}</td>
                <td className="text-right">{s.lifetimeXp}</td>
                <td>{s.currentTier ?? "—"}</td>
                <td className="text-right">
                  <Link className="text-emerald-400 underline" href={`/dashboard/strikelab/${s.customerId}`}>
                    abrir
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create per-student page**

Create `src/app/dashboard/strikelab/[customerId]/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Detail {
  identity: {
    customerId: number;
    phoneE164: string;
    instagramHandle: string | null;
    igVerifiedAt: string | null;
    optInAt: string | null;
    consentTraining: boolean;
    consentUgc: boolean;
    consentRealName: boolean;
    consentBroadcasts: boolean;
    medicalPauseUntil: string | null;
    vacationPauseUntil: string | null;
    personalPauseUntil: string | null;
  };
  state: {
    monthlyPoints: number;
    lifetimeXp: number;
    currentTier: string | null;
    proposedTier: string | null;
    currentStreakDays: number;
  };
  events: Array<{
    eventId: string;
    createdAt: string;
    eventType: string;
    pointsDelta: number;
    xpDelta: number;
    source: string;
  }>;
}

export default function StudentDetailPage() {
  const { customerId } = useParams() as { customerId: string };
  const [data, setData] = useState<Detail | null>(null);

  useEffect(() => {
    fetch(`/api/strikelab/admin/students/${customerId}`)
      .then((r) => r.json())
      .then(setData);
  }, [customerId]);

  if (!data) return <p className="text-zinc-500">A carregar…</p>;

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-base font-semibold mb-2">Identidade</h2>
        <dl className="grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-zinc-500">Cliente Yogo</dt><dd>{data.identity.customerId}</dd>
          <dt className="text-zinc-500">Telefone</dt><dd>{data.identity.phoneE164}</dd>
          <dt className="text-zinc-500">Instagram</dt><dd>{data.identity.instagramHandle ?? "—"} {data.identity.igVerifiedAt && "✓"}</dd>
          <dt className="text-zinc-500">Opt-in</dt><dd>{data.identity.optInAt ? new Date(data.identity.optInAt).toLocaleDateString("pt-PT") : "não"}</dd>
        </dl>
      </section>

      <section>
        <h2 className="text-base font-semibold mb-2">Estado</h2>
        <div className="grid grid-cols-4 gap-3">
          <Stat label="Pontos do Mês" value={data.state.monthlyPoints} />
          <Stat label="XP Lifetime" value={data.state.lifetimeXp} />
          <Stat label="Patente" value={data.state.currentTier ?? "—"} />
          <Stat label="Streak" value={`${data.state.currentStreakDays}d`} />
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold mb-2">Acções</h2>
        <div className="flex gap-2">
          <Link href={`/dashboard/strikelab/${customerId}/adjust`} className="px-3 py-1 bg-zinc-900 border border-zinc-800 rounded text-sm">
            Ajustar Pontos
          </Link>
          <Link href={`/dashboard/strikelab/${customerId}/pause`} className="px-3 py-1 bg-zinc-900 border border-zinc-800 rounded text-sm">
            Pausa
          </Link>
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold mb-2">Eventos recentes</h2>
        <table className="w-full text-xs">
          <thead className="text-zinc-500">
            <tr>
              <th className="text-left py-1">Quando</th>
              <th className="text-left">Tipo</th>
              <th className="text-right">Pts</th>
              <th className="text-right">XP</th>
              <th className="text-left">Origem</th>
            </tr>
          </thead>
          <tbody>
            {data.events.slice(0, 50).map((e) => (
              <tr key={e.eventId} className="border-t border-zinc-800">
                <td className="py-1">{new Date(e.createdAt).toLocaleString("pt-PT")}</td>
                <td>{e.eventType}</td>
                <td className="text-right">{e.pointsDelta}</td>
                <td className="text-right">{e.xpDelta}</td>
                <td>{e.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}
```

- [ ] **Step 4: Backing API route (list + detail)**

Create `src/app/api/strikelab/admin/students/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRoleFromCookie } from "@/lib/auth";

export async function GET(req: NextRequest) {
  if ((await getRoleFromCookie()) !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const identities = await db.gamificationIdentity.findMany({
    where: q
      ? { OR: [{ phoneE164: { contains: q } }, { customerId: Number.isFinite(Number(q)) ? Number(q) : -1 }] }
      : undefined,
    take: 100,
  });
  const ids = identities.map((i) => i.customerId);
  const states = await db.gamificationState.findMany({ where: { customerId: { in: ids } } });
  const stateMap = new Map(states.map((s) => [s.customerId, s]));
  const rows = identities.map((i) => {
    const s = stateMap.get(i.customerId);
    return {
      customerId: i.customerId,
      phoneE164: i.phoneE164,
      monthlyPoints: s?.monthlyPoints ?? 0,
      lifetimeXp: s?.lifetimeXp ?? 0,
      currentTier: s?.currentTier ?? null,
      optInAt: i.optInAt,
    };
  });
  return NextResponse.json({ rows });
}
```

Create `src/app/api/strikelab/admin/students/[customerId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRoleFromCookie } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: { customerId: string } }) {
  if ((await getRoleFromCookie()) !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const customerId = Number(params.customerId);
  if (!Number.isInteger(customerId)) return NextResponse.json({ error: "bad_id" }, { status: 400 });

  const identity = await db.gamificationIdentity.findUnique({ where: { customerId } });
  if (!identity) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const state = await db.gamificationState.findUnique({ where: { customerId } });
  const events = await db.gamificationEventLog.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ identity, state, events });
}
```

- [ ] **Step 5: Smoke test**

Run `npm run dev`, login as admin, browse `/dashboard/strikelab`. Should see (empty) list, search works, click into a test customer ID shows the detail page.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/strikelab src/app/api/strikelab/admin/students
git commit -m "feat(strikelab): admin per-student view (list + detail)"
```

---

## Task 13 — Admin: manual points adjust

**Files:**
- Create: `src/app/dashboard/strikelab/[customerId]/adjust/page.tsx`
- Create: `src/app/api/strikelab/admin/adjust-points/route.ts`

**Purpose:** Operator can credit or debit points with a required reason. Writes a `manual_adjustment` event.

- [ ] **Step 1: Create UI**

Create `src/app/dashboard/strikelab/[customerId]/adjust/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function AdjustPage() {
  const { customerId } = useParams() as { customerId: string };
  const router = useRouter();
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/strikelab/admin/adjust-points", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: Number(customerId), pointsDelta: Number(delta), reason }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "erro");
      setSubmitting(false);
      return;
    }
    router.push(`/dashboard/strikelab/${customerId}`);
  }

  const valid = reason.trim().length >= 5 && Number.isFinite(Number(delta)) && Number(delta) !== 0;

  return (
    <div className="space-y-4 max-w-md">
      <h2 className="text-base font-semibold">Ajustar Pontos</h2>
      <input
        type="number"
        placeholder="Delta (ex: 100 ou -50)"
        value={delta}
        onChange={(e) => setDelta(e.target.value)}
        className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2"
      />
      <textarea
        placeholder="Razão (mínimo 5 caracteres)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2"
      />
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button
        onClick={submit}
        disabled={!valid || submitting}
        className="px-4 py-2 bg-emerald-600 disabled:bg-zinc-700 text-white rounded"
      >
        {submitting ? "A guardar…" : "Guardar"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create API**

Create `src/app/api/strikelab/admin/adjust-points/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getRoleFromCookie } from "@/lib/auth";
import { appendEvent } from "@/lib/gamification/event-log";
import { materializeState } from "@/lib/gamification/state";

export async function POST(req: NextRequest) {
  if ((await getRoleFromCookie()) !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const customerId = Number(body.customerId);
  const pointsDelta = Number(body.pointsDelta);
  const reason = String(body.reason ?? "").trim();
  if (!Number.isInteger(customerId)) return NextResponse.json({ error: "bad_customer" }, { status: 400 });
  if (!Number.isFinite(pointsDelta) || pointsDelta === 0) return NextResponse.json({ error: "bad_delta" }, { status: 400 });
  if (reason.length < 5) return NextResponse.json({ error: "reason_too_short" }, { status: 400 });

  await appendEvent({
    customerId,
    eventType: "manual_adjustment",
    pointsDelta,
    xpDelta: 0,
    source: "admin_ui",
    operatorId: "admin", // refine when multi-admin distinction needed
    idempotencyKey: `adjust:${customerId}:${Date.now()}`,
    payload: { reason },
  });
  await materializeState(customerId);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Manual UI test**

Browse `/dashboard/strikelab/<id>/adjust`, submit delta `100`, reason `"compensação teste"`. Verify the per-student view shows the new event row.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/strikelab/\[customerId\]/adjust src/app/api/strikelab/admin/adjust-points
git commit -m "feat(strikelab): admin manual points adjust with reason audit"
```

---

## Task 14 — Admin: pause flags

**Files:**
- Create: `src/app/dashboard/strikelab/[customerId]/pause/page.tsx`
- Create: `src/app/api/strikelab/admin/pause/route.ts`

**Purpose:** Set medical / vacation / personal pause flags with optional return date. While set, all penalties + low-usage messages are suppressed.

- [ ] **Step 1: Create UI**

Create `src/app/dashboard/strikelab/[customerId]/pause/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";

const KINDS = [
  { id: "medical", label: "Médica" },
  { id: "vacation", label: "Férias" },
  { id: "personal", label: "Pessoal" },
] as const;

export default function PausePage() {
  const { customerId } = useParams() as { customerId: string };
  const router = useRouter();
  const [kind, setKind] = useState<typeof KINDS[number]["id"]>("medical");
  const [until, setUntil] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(action: "set" | "clear") {
    setSubmitting(true);
    await fetch("/api/strikelab/admin/pause", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: Number(customerId),
        kind,
        until: action === "clear" ? null : until || null,
        action,
      }),
    });
    router.push(`/dashboard/strikelab/${customerId}`);
  }

  return (
    <div className="space-y-4 max-w-md">
      <h2 className="text-base font-semibold">Pausa</h2>
      <div className="flex gap-2">
        {KINDS.map((k) => (
          <button
            key={k.id}
            onClick={() => setKind(k.id)}
            className={`px-3 py-1 rounded text-sm border ${
              kind === k.id ? "bg-emerald-600 border-emerald-700" : "bg-zinc-900 border-zinc-800"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>
      <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2" />
      <div className="flex gap-2">
        <button onClick={() => submit("set")} disabled={submitting} className="px-4 py-2 bg-emerald-600 text-white rounded">
          Activar pausa
        </button>
        <button onClick={() => submit("clear")} disabled={submitting} className="px-4 py-2 bg-zinc-800 text-zinc-200 rounded">
          Limpar
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create API**

Create `src/app/api/strikelab/admin/pause/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getRoleFromCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import { appendEvent } from "@/lib/gamification/event-log";

export async function POST(req: NextRequest) {
  if ((await getRoleFromCookie()) !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const customerId = Number(body.customerId);
  const kind = String(body.kind);
  const until = body.until ? new Date(body.until) : null;
  const action = String(body.action);
  if (!Number.isInteger(customerId)) return NextResponse.json({ error: "bad_customer" }, { status: 400 });
  if (!["medical", "vacation", "personal"].includes(kind)) return NextResponse.json({ error: "bad_kind" }, { status: 400 });

  const field = kind === "medical" ? "medicalPauseUntil" : kind === "vacation" ? "vacationPauseUntil" : "personalPauseUntil";
  await db.gamificationIdentity.update({
    where: { customerId },
    data: { [field]: action === "clear" ? null : until },
  });
  await appendEvent({
    customerId,
    eventType: action === "clear" ? "pause_cleared" : "pause_set",
    source: "admin_ui",
    operatorId: "admin",
    idempotencyKey: `pause:${customerId}:${kind}:${Date.now()}`,
    payload: { kind, until: until?.toISOString() ?? null },
  });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/strikelab/\[customerId\]/pause src/app/api/strikelab/admin/pause
git commit -m "feat(strikelab): admin pause flags (medical/vacation/personal)"
```

---

## Task 15 — Admin: erasure queue + reset audit

**Files:**
- Create: `src/app/dashboard/strikelab/erasure/page.tsx`
- Create: `src/app/dashboard/strikelab/reset-audit/page.tsx`

**Purpose:** Last two MVP admin screens. Erasure handler walks the §3.2 flow with confirmation. Reset audit shows the most recent 12 monthly reset entries (will populate once Phase 1's reset cron lands; the screen renders an empty state cleanly for Phase 0).

- [ ] **Step 1: Erasure page**

Create `src/app/dashboard/strikelab/erasure/page.tsx`:

```tsx
"use client";

import { useState } from "react";

export default function ErasurePage() {
  const [customerId, setCustomerId] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    const res = await fetch("/api/strikelab/erasure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: Number(customerId), operatorId: "admin" }),
    });
    setResult(res.ok ? "✅ Apagado com sucesso" : `❌ ${(await res.json()).error}`);
    setBusy(false);
  }

  const armed = confirmText.trim() === "APAGAR" && /^\d+$/.test(customerId);

  return (
    <div className="space-y-4 max-w-md">
      <h2 className="text-base font-semibold">Apagar dados (Art. 17 RGPD)</h2>
      <p className="text-sm text-zinc-500">
        Isto remove identidade pessoal, zera pontos/XP e anonimiza o log de eventos. Acção <strong>irreversível</strong>.
      </p>
      <input value={customerId} onChange={(e) => setCustomerId(e.target.value)} placeholder="Customer ID Yogo" className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2" />
      <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="Escreve APAGAR para confirmar" className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2" />
      <button onClick={run} disabled={!armed || busy} className="px-4 py-2 bg-red-600 disabled:bg-zinc-700 text-white rounded">
        {busy ? "A apagar…" : "Apagar permanentemente"}
      </button>
      {result && <p className="text-sm">{result}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Reset audit page**

Create `src/app/dashboard/strikelab/reset-audit/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

interface Audit {
  resetId: string;
  resetPeriod: string;
  status: string;
  customersZeroed: number;
  driftDetected: number;
  startedAt: string;
  completedAt: string | null;
}

export default function ResetAuditPage() {
  const [rows, setRows] = useState<Audit[]>([]);
  useEffect(() => {
    fetch("/api/strikelab/admin/reset-audit").then((r) => r.json()).then((d) => setRows(d.rows ?? []));
  }, []);
  return (
    <div>
      <h2 className="text-base font-semibold mb-2">Histórico de Resets Mensais</h2>
      {rows.length === 0 ? (
        <p className="text-zinc-500 text-sm">Sem resets registados (Phase 1 activa esta funcionalidade).</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-zinc-500">
            <tr>
              <th className="text-left py-1">Período</th>
              <th>Estado</th>
              <th className="text-right">Zerados</th>
              <th className="text-right">Drift</th>
              <th className="text-left">Concluído</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.resetId} className="border-t border-zinc-800">
                <td className="py-1">{r.resetPeriod}</td>
                <td>{r.status}</td>
                <td className="text-right">{r.customersZeroed}</td>
                <td className="text-right">{r.driftDetected}</td>
                <td>{r.completedAt ? new Date(r.completedAt).toLocaleString("pt-PT") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Backing API for reset-audit**

Create `src/app/api/strikelab/admin/reset-audit/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRoleFromCookie } from "@/lib/auth";

export async function GET() {
  if ((await getRoleFromCookie()) !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const rows = await db.gamificationResetAudit.findMany({ orderBy: { startedAt: "desc" }, take: 12 });
  return NextResponse.json({ rows });
}
```

- [ ] **Step 4: Add StrikeLab tab to nav (admin only)**

Modify `src/components/bottom-tab-bar.tsx` — add an admin-gated entry:

```tsx
{role === "admin" && (
  <NavLink href="/dashboard/strikelab" label="StrikeLab" icon={<StrikelabIcon />} active={pathname.startsWith("/dashboard/strikelab")} />
)}
```

(Adapt to the existing `NavLink`/`BottomTabBar` shape; add a simple icon export.)

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/strikelab/erasure src/app/dashboard/strikelab/reset-audit src/app/api/strikelab/admin/reset-audit src/components/bottom-tab-bar.tsx
git commit -m "feat(strikelab): admin erasure handler + reset audit screen + nav tab"
```

---

## Task 16 — Privacy notice page (pt-PT)

**Files:**
- Create: `src/app/(public)/privacy/strikelab/page.tsx`
- Create: `strikedash_vault/gdpr/Privacy-Notice-StrikeLab.md`

**Purpose:** Public-facing privacy notice in plain pt-PT covering Art. 13 obligations. Referenced from bot onboarding.

- [ ] **Step 1: Write canonical copy in vault**

Create `strikedash_vault/gdpr/Privacy-Notice-StrikeLab.md`:

```markdown
---
title: Aviso de Privacidade — StrikeLab
type: reference
version: v1.0
created: 2026-05-28
---

# Aviso de Privacidade — StrikeLab

> Em vigor desde 2026-XX-XX. Versão v1.0.

## Quem somos
A Striker's House, com sede em Carcavelos, Portugal, é a responsável pelo tratamento dos teus dados no âmbito do StrikeLab.

## Que dados tratamos
- Identificadores: nome (do Yogo Booking), número de telemóvel, ID Yogo.
- Histórico de presenças (check-ins) e tipo de plano.
- Pseudónimo ou nome no ranking (à tua escolha).
- Opcional: handle de Instagram (só após verificação).
- Opcional: presença em desafios semanais e referrals.

## Para que servem
- Atribuir pontos por treino, calcular patentes vitalícias, distribuir prémios mensais.
- Detectar fraude (referrals fictícios, contas duplicadas) com base em **interesse legítimo**.
- Mostrar o teu ranking no grupo da academia (apenas se autorizares).

## Base jurídica
- Treinos e renovações: cumprimento de contrato (Art. 6(1)(b) RGPD).
- Integração com Instagram, ranking público, anúncios: **consentimento explícito** (Art. 6(1)(a)). Podes retirar a qualquer momento.
- Anti-fraude: interesse legítimo (Art. 6(1)(f)), com LIA documentado.

## Por quanto tempo
- 24 meses com payload completo, depois reduzido a contadores anónimos por mais 36 meses, depois apagado.

## Decisões automatizadas
A tua patente é calculada automaticamente, mas **nenhum benefício económico** (desconto, sessão grátis, foto na parede) é aplicado sem confirmação humana. Tens o direito de pedir revisão humana de qualquer decisão de patente.

## Os teus direitos
- Aceder, rectificar, apagar, limitar, opor-te ao tratamento, portabilidade.
- Para exercer: WhatsApp para o bot (`/optout`, `/apagar`) ou directamente a [contacto].
- Reclamação: Comissão Nacional de Protecção de Dados (CNPD) — www.cnpd.pt.

## Menores
- Menos de 13 anos: não participam no StrikeLab.
- 13–17 anos: necessitam consentimento parental escrito.

## Subprocessadores
- Yogo Booking (DK) — fornece dados de presença e subscrição.
- Vercel (US) — alojamento da aplicação (DPA + SCC assinado).
- Turso (US) — base de dados (DPA + SCC assinado).
- ManyChat (US) — detecção de menções no Instagram (DPA + SCC assinado).
```

- [ ] **Step 2: Render in public route**

Create `src/app/(public)/privacy/strikelab/page.tsx`:

```tsx
import fs from "node:fs/promises";
import path from "node:path";

export default async function PrivacyNoticePage() {
  const md = await fs.readFile(path.join(process.cwd(), "strikedash_vault/gdpr/Privacy-Notice-StrikeLab.md"), "utf8");
  // Strip the YAML frontmatter for display
  const body = md.replace(/^---[\s\S]*?---\n/, "");
  return (
    <article className="prose prose-invert max-w-3xl mx-auto px-4 py-8 bg-black text-zinc-100 min-h-screen">
      <pre style={{ whiteSpace: "pre-wrap", fontFamily: "system-ui, sans-serif" }}>{body}</pre>
    </article>
  );
}
```

> A full markdown renderer is overkill for v1; the `<pre>` fallback is acceptable for the privacy notice until Phase 1 introduces an MDX/remark pipeline. If a renderer already exists in the repo, use it.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(public\)/privacy strikedash_vault/gdpr/Privacy-Notice-StrikeLab.md
git commit -m "feat(strikelab): public privacy notice (pt-PT) + vault canonical copy"
```

---

## Task 17 — DPIA, ROPA, Retention, Processor Agreements

**Files:**
- Create: `strikedash_vault/gdpr/DPIA-StrikeLab.md`
- Create: `strikedash_vault/gdpr/ROPA-StrikeLab.md`
- Create: `strikedash_vault/gdpr/Retention-Policy.md`
- Create: `strikedash_vault/gdpr/Lawful-Basis-Register.md`
- Create: `strikedash_vault/gdpr/Processor-Agreements.md`

**Purpose:** Mandatory paperwork before launch. Docs only — no code.

> **DG-2 GATE:** Stop here if DPO designation is not resolved (DPIA signatory is affected).

- [ ] **Step 1: DPIA template**

Create `strikedash_vault/gdpr/DPIA-StrikeLab.md`:

```markdown
---
title: DPIA — StrikeLab (Art. 35 RGPD)
type: reference
status: draft
created: 2026-05-28
---

# DPIA — Data Protection Impact Assessment

## 1. Descrição do tratamento
StrikeLab é um sistema de gamificação para a Strike House Portugal. Processa dados de presença, subscrição, identidade e (opcionalmente) comportamento em redes sociais, atribui pontos e patentes, e exibe rankings.

## 2. Necessidade e proporcionalidade
- Necessidade: ferramenta de retenção/engagement de clientes. Sem alternativa menos intrusiva que atinja o mesmo objectivo (p.ex., descontos por loyalty sem dados comportamentais).
- Proporcionalidade: opt-in granular, anti-shame defaults, sem penalidades por inactividade.

## 3. Categorias de dados e bases jurídicas
Ver [[Lawful-Basis-Register]].

## 4. Riscos identificados
| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Profiling sem revisão humana (Art. 22) | Médio | Alto | Decisões com efeito económico requerem confirmação manual do admin |
| Dados sensíveis indirectos (inactividade ↔ saúde) | Médio | Alto | Penalidades de inactividade eliminadas; flags de pausa |
| Cruzamento IG ↔ presença | Baixo | Médio | Consentimento explícito obrigatório; verificação por challenge code |
| Transferências fora UE (Vercel, Turso, ManyChat) | Alto | Médio | DPA + SCCs assinados (ver [[Processor-Agreements]]) |
| Direito ao esquecimento vs XP "lifetime" | Médio | Médio | Fluxo de erasure implementado em código (não só política) |
| Menores | Baixo | Alto | <13 excluídos; 13-17 consentimento parental por escrito |

## 5. Medidas de segurança
- Encriptação em repouso (Turso) e em trânsito (HTTPS).
- Audit log imutável (event log append-only).
- Controlo de acesso por role (admin/sales/student).
- Retenção: 24 meses hot, 60 meses anonimizado, depois purga.

## 6. Conclusão
Risco residual: **Médio**. Tratamento procede com as mitigações acima.

## 7. Aprovação
- Responsável pelo tratamento: ___________________ (Ricardo, Strike House)
- DPO (se designado): ___________________
- Data: __________
```

- [ ] **Step 2: ROPA (Registo de Actividades de Tratamento)**

Create `strikedash_vault/gdpr/ROPA-StrikeLab.md`:

```markdown
---
title: ROPA — StrikeLab (Art. 30 RGPD)
type: reference
created: 2026-05-28
---

# Registo de Actividades de Tratamento — StrikeLab

| Actividade | Finalidade | Categoria de titulares | Categorias de dados | Base jurídica | Destinatários | Transferências | Retenção |
|---|---|---|---|---|---|---|---|
| Atribuição de pontos por check-in | Engagement | Subscritores ≥18 ou 13-17 c/ consentimento parental | Nome, telemóvel, ID Yogo, datas/horas de presença | Contrato + consentimento explícito (Art. 6(1)(a)+(b)) | Strike House (RT), Yogo (subprocessador) | Yogo: UE; Vercel/Turso: EUA c/ SCC | 24m + 36m anonimizado |
| Detecção UGC Instagram | Engagement | Como acima + opt-in UGC | Handle IG, eventos de menção | Consentimento explícito | ManyChat | EUA c/ SCC | 24m + 36m anonimizado |
| Anti-fraude (referrals, contas duplicadas) | Prevenção de fraude | Todos | Identificadores cruzados (nome, telemóvel, IBAN, dispositivo) | Interesse legítimo c/ LIA | Strike House | UE | 12 meses |
| Ranking público | Engagement | Opt-in real-name | Pseudónimo ou nome, pontos do mês | Consentimento explícito | Grupo WhatsApp | UE | Reset mensal |
```

- [ ] **Step 3: Lawful Basis Register**

Create `strikedash_vault/gdpr/Lawful-Basis-Register.md`:

```markdown
---
title: Lawful Basis Register — StrikeLab
type: reference
created: 2026-05-28
---

| Processing category | Lawful basis | Article | Notes |
|---|---|---|---|
| Check-in tracking from Yogo | Contract | 6(1)(b) | Performance of service |
| Subscription/renewal events | Contract | 6(1)(b) | |
| UGC detection (IG↔Yogo cross-reference) | Explicit consent | 6(1)(a) | Opt-in, revocable |
| Ranking participation | Explicit consent | 6(1)(a) | Default pseudonymous |
| Real-name display | Explicit consent | 6(1)(a) | Separate toggle |
| Broadcast notifications | Explicit consent | 6(1)(a) | Separate toggle |
| Anti-fraud monitoring | Legitimate interest | 6(1)(f) | LIA below |
| Tier evaluation with economic effect | Contract + human confirmation | 6(1)(b) + Art. 22 | Admin confirms before benefit |
| Marketing communications | Explicit consent | 6(1)(a) | |

## LIA — Anti-fraud
- Purpose: prevent referral fraud, fake check-ins, duplicate accounts.
- Necessity: no less intrusive means achieves equivalent fraud prevention.
- Balancing: data limited to existing identifiers (phone, IBAN, device hash); access restricted to admin; retention 12 months; subjects have right to object.
- Conclusion: legitimate interest valid.
```

- [ ] **Step 4: Retention Policy**

Create `strikedash_vault/gdpr/Retention-Policy.md`:

```markdown
---
title: Retention Policy — StrikeLab
type: reference
created: 2026-05-28
---

| Data class | Hot retention | Cold retention (anonymized) | After |
|---|---|---|---|
| GamificationEventLog (full payload) | 24 months | months 25–60: payload reduced to `event_type` + `points_delta` + hashed `customer_id` + `created_at` | Purged |
| GamificationIdentity | While subscription active + 12 months | Tombstoned (PII nulled) indefinitely for ranking-history consistency | — |
| GamificationState | While subscription active + 12 months | — | Reset to zero on erasure |
| GamificationResetAudit | Indefinitely | — | — |
| GamificationMonthlySnapshot | 5 years | — | Purged |
| Anti-fraud flags | 12 months | — | Purged |

Enforcement: monthly cron at 02:00 Lisbon runs `prisma cleanup-retention` (to be implemented in Phase 1).
```

- [ ] **Step 5: Processor Agreements tracker**

Create `strikedash_vault/gdpr/Processor-Agreements.md`:

```markdown
---
title: Processor Agreements — StrikeLab
type: reference
created: 2026-05-28
---

| Processor | Role | DPA signed | SCCs (US) | Date | Document ref |
|---|---|---|---|---|---|
| Yogo Booking (DK) | Source of truth for memberships/check-ins | ☐ | n/a (UE) | | |
| Vercel Inc. (US) | Hosting | ☐ | ☐ | | |
| Turso (US) | Database (libSQL) | ☐ | ☐ | | |
| ManyChat (US) | IG @ detection | ☐ | ☐ | | |
| WhatsApp/Meta (IE/US) | Messaging | ☐ | ☐ | | |

Action: Ricardo to obtain and sign each DPA before launch. Status updated as each is completed.
```

- [ ] **Step 6: Commit**

```bash
git add strikedash_vault/gdpr/
git commit -m "docs(strikelab): DPIA + ROPA + lawful-basis + retention + processor agreements"
```

---

## Task 18 — Minors audit + linking from The Vault

**Files:**
- Create: `scripts/strikelab-minors-audit.ts`
- Modify: `strikedash_vault/The Vault.md`

**Purpose:** One-off script to report potential minors in the current Yogo subscriber base, plus update vault index.

- [ ] **Step 1: Write the audit script**

Create `scripts/strikelab-minors-audit.ts`:

```typescript
// Run locally: npx tsx scripts/strikelab-minors-audit.ts
// Pulls Yogo customers + birthdates if available, flags <18.
// Output: console table + CSV write to strikedash_vault/StrikeLab-Minors-Audit.csv

import fs from "node:fs/promises";

interface YogoCustomer {
  id: number;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  phone: string | null;
}

async function main() {
  const base = process.env.YOGO_BASE ?? "https://api.yogo.dk";
  const token = process.env.YOGO_TOKEN;
  if (!token) {
    console.error("YOGO_TOKEN required");
    process.exit(1);
  }
  // Adjust endpoint to whatever your tenant exposes for customer listing
  const res = await fetch(`${base}/customers?limit=2000`, {
    headers: { Authorization: `Bearer ${token}`, "x-yogo-request-context": "admin" },
  });
  const data = (await res.json()) as { data?: YogoCustomer[] };
  const today = new Date();
  const minors = (data.data ?? []).flatMap((c) => {
    if (!c.date_of_birth) return [];
    const dob = new Date(c.date_of_birth);
    const ageMs = today.getTime() - dob.getTime();
    const age = ageMs / (1000 * 60 * 60 * 24 * 365.25);
    return age < 18 ? [{ ...c, age: Math.floor(age) }] : [];
  });
  console.table(minors);
  const csv = ["id,first_name,last_name,age,phone", ...minors.map((m) => `${m.id},${m.first_name},${m.last_name},${m.age},${m.phone ?? ""}`)].join("\n");
  await fs.writeFile("strikedash_vault/StrikeLab-Minors-Audit.csv", csv);
  console.log(`\n${minors.length} minors found. CSV: strikedash_vault/StrikeLab-Minors-Audit.csv`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run locally and record decision in DG-3**

Run:
```bash
npx tsx scripts/strikelab-minors-audit.ts
```

Open `strikedash_vault/StrikeLab-Phase-0-Decisions.md` and update DG-3 with the result. If minors exist, plan parental-consent re-onboarding before enabling `STRIKELAB_ENABLED=true`.

- [ ] **Step 3: Update The Vault.md index**

Add to `strikedash_vault/The Vault.md` under Architecture & Design (after the StrikeLab entries):

```markdown
- [[StrikeLab-Phase-0-Decisions]] — Decisions log (DG-1..DG-5)
- [[gdpr/DPIA-StrikeLab|DPIA-StrikeLab]] — Data Protection Impact Assessment
- [[gdpr/ROPA-StrikeLab|ROPA-StrikeLab]] — Registo de Actividades de Tratamento
- [[gdpr/Lawful-Basis-Register|Lawful Basis Register]]
- [[gdpr/Retention-Policy|Retention Policy]]
- [[gdpr/Processor-Agreements|Processor Agreements]]
- [[gdpr/Privacy-Notice-StrikeLab|Privacy Notice (pt-PT)]]
- [[StrikeLab-Minors-Audit]] — CSV de minores na base actual (gerado pelo audit script)
```

- [ ] **Step 4: Commit**

```bash
git add scripts/strikelab-minors-audit.ts strikedash_vault/The\ Vault.md
git commit -m "chore(strikelab): minors audit script + vault index update"
```

---

## Task 19 — Phase 0 acceptance test

**Files:**
- Create: `tests/lib/gamification/phase-0-acceptance.test.ts`

**Purpose:** End-to-end happy-path test that exercises the whole foundation: identity creation → consent → polled check-in → state materialized → admin can query → erasure clears it.

- [ ] **Step 1: Write the acceptance test**

Create `tests/lib/gamification/phase-0-acceptance.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { db } from "../../../src/lib/db";
import { upsertIdentity, generateIgChallenge, verifyIgChallenge } from "../../../src/lib/gamification/identity";
import { setConsent, getConsent } from "../../../src/lib/gamification/consent";
import { pollClasses } from "../../../src/lib/gamification/poll/classes";
import { materializeState } from "../../../src/lib/gamification/state";
import { applyErasure } from "../../../src/lib/gamification/erasure";

const C = 999990;

afterAll(async () => {
  await db.gamificationEventLog.deleteMany({ where: { customerId: C } });
  await db.gamificationIdentity.deleteMany({ where: { customerId: C } });
  await db.gamificationState.deleteMany({ where: { customerId: C } });
});

describe("Phase 0 acceptance — full happy path", () => {
  it("identity → consent → poll → state → erasure", async () => {
    // 1. Create identity
    await upsertIdentity({ customerId: C, phoneE164: "+351911000900", whatsappWaId: "wa-acc" });

    // 2. Capture consent
    await setConsent(C, { training: true });
    await setConsent(C, { ugc: true });
    const consent = await getConsent(C);
    expect(consent?.training).toBe(true);
    expect(consent?.ugc).toBe(true);

    // 3. IG verification
    const code = await generateIgChallenge(C);
    const verified = await verifyIgChallenge({ customerId: C, code, igHandle: "acceptance_test" });
    expect(verified.ok).toBe(true);

    // 4. Poll a check-in
    const fetcher = vi.fn().mockResolvedValue([{
      id: 8001,
      date: "2026-05-28",
      start_time: "19:30",
      checkins: [{ customer_id: C, checked_in_at: "2026-05-28T17:35:00Z" }],
    }]);
    const pollResult = await pollClasses({ fetcher });
    expect(pollResult.eventsWritten).toBe(1);

    // 5. Materialize state
    const state = await materializeState(C);
    expect(state.lastClassAt).not.toBeNull();

    // 6. Erasure
    await applyErasure({ customerId: C, operatorId: "acceptance-test" });
    const id = await db.gamificationIdentity.findUnique({ where: { customerId: C } });
    expect(id?.erasedAt).not.toBeNull();
    const post = await db.gamificationState.findUnique({ where: { customerId: C } });
    expect(post?.lifetimeXp).toBe(0);
  });
});
```

- [ ] **Step 2: Run — PASS**

```bash
npm test -- phase-0-acceptance
```

- [ ] **Step 3: Run full suite — all passing**

```bash
npm test
```

Expected: all StrikeLab tests pass; no regressions in pre-existing tests.

- [ ] **Step 4: Commit**

```bash
git add tests/lib/gamification/phase-0-acceptance.test.ts
git commit -m "test(strikelab): phase-0 end-to-end acceptance"
```

---

## Task 20 — Production rollout checklist (no code)

**Files:**
- Create: `strikedash_vault/StrikeLab-Phase-0-Rollout.md`

**Purpose:** Pre-flight before flipping `STRIKELAB_ENABLED=true` in production.

- [ ] **Step 1: Write the checklist**

Create `strikedash_vault/StrikeLab-Phase-0-Rollout.md`:

```markdown
---
title: StrikeLab Phase 0 — Rollout Checklist
type: reference
created: 2026-05-28
---

# Phase 0 — Rollout Checklist

## Pre-flight (in this order)

- [ ] DG-1 confirmed (Vercel Pro upgrade applied OR fallback to hourly polling)
- [ ] DG-2 confirmed (DPO designated; DPIA signed)
- [ ] DG-3 audit complete (minors list reviewed; parental consent flow ready if any)
- [ ] Privacy notice live at `/privacy/strikelab`
- [ ] All DPAs signed (Yogo, Vercel, Turso, ManyChat) — see [[gdpr/Processor-Agreements]]
- [ ] Turso production database provisioned + migrations applied
- [ ] Vercel env vars set in Production:
  - `STRIKELAB_ENABLED=true`
  - `STRIKELAB_POLL_CLASSES_ENABLED=true`
  - `STRIKELAB_POLL_MEMBERSHIPS_ENABLED=true`
  - `STRIKELAB_OPS_START_HOUR=6`
  - `STRIKELAB_OPS_END_HOUR=23`
  - `DATABASE_URL=libsql://…`
  - `DATABASE_AUTH_TOKEN=…`
  - `CRON_SECRET=…` (existing)
- [ ] Test bot onboarding with Ricardo's own number (end-to-end opt-in flow)
- [ ] Verify cron output in Vercel logs (15-min and daily ran without errors for 24h)
- [ ] Smoke test admin UI: list, search, detail, adjust, pause, erasure
- [ ] Announce launch to subscribers (separate broadcast, opt-in to participate)

## Rollback

If something goes wrong post-launch:
1. Set `STRIKELAB_ENABLED=false` — bot stops responding to `strikelab` keyword.
2. Set `STRIKELAB_POLL_CLASSES_ENABLED=false` + `STRIKELAB_POLL_MEMBERSHIPS_ENABLED=false` — crons no-op.
3. Schema and accumulated data remain — no destructive rollback needed for Phase 0.
```

- [ ] **Step 2: Commit + link from The Vault.md**

Add to `strikedash_vault/The Vault.md` (under StrikeLab block):

```markdown
- [[StrikeLab-Phase-0-Rollout]] — Pre-flight checklist before enabling em produção
```

Commit:

```bash
git add strikedash_vault/StrikeLab-Phase-0-Rollout.md strikedash_vault/The\ Vault.md
git commit -m "docs(strikelab): phase-0 rollout checklist"
```

---

## Estimates

| Task | Effort (hours) | Dependencies |
|---|---|---|
| 1. Decisions + env scaffold | 0.5 | — |
| 2. Schema + migration | 1.5 | Task 1 |
| 3. Event log writer | 1.5 | Task 2 |
| 4. State replay | 1.5 | Task 3 |
| 5. Identity resolution | 2.0 | Task 2 |
| 6. Consent module | 1.0 | Task 5 |
| 7. Class poll | 2.0 | Task 5, Task 3 |
| 8. Memberships sweep | 1.5 | Task 5, Task 3 |
| 9. Cron routes + vercel.json | 1.0 | Task 7, 8, DG-1 |
| 10. Bot onboarding handler | 3.0 | Task 5, Task 6, existing dispatch |
| 11. Erasure flow | 2.0 | Task 3, Task 4 |
| 12. Admin per-student view | 3.0 | Task 4, Task 5 |
| 13. Admin manual adjust | 1.5 | Task 12 |
| 14. Admin pause flags | 1.5 | Task 12 |
| 15. Admin erasure + reset audit screens | 2.0 | Task 11, Task 12 |
| 16. Privacy notice + public route | 1.0 | — |
| 17. DPIA / ROPA / Retention docs | 3.0 | DG-2 |
| 18. Minors audit + vault links | 1.5 | DG-3 |
| 19. Acceptance test | 1.5 | All code tasks |
| 20. Rollout checklist | 0.5 | — |
| **Total** | **~33 hours** | ≈ 4-5 working days (full-time) or **2 calendar weeks** at the user's typical pace |

## Risks

- **R1 — Yogo API shape mismatch.** Task 7 and Task 8 assume `/classes?populate[]=checkins` and `/reports/memberships-list` return specific JSON shapes. The real tenant's response may differ. Mitigation: the fetchers are typed and injected (tests use `vi.fn().mockResolvedValue`); a 30-min spike against the live tenant before Task 7 will confirm the shape.
- **R2 — Vercel Pro upgrade not approved (DG-1).** Fallback to hourly cron + accept 60-min check-in latency. UI copy already says "geralmente em ~15min" — change to "geralmente na próxima hora".
- **R3 — Schema drift across local SQLite and production Turso.** Mitigation: `prisma migrate deploy` in Vercel build step + manual `prisma migrate status` check before launch.
- **R4 — Existing `dispatch.ts` refactor risk.** Task 10 adds a routing branch. If the existing handler has a different primitive surface, this PR may grow. Mitigation: keep the change minimal — guard by `body.startsWith("strikelab")` and add only one branch.
- **R5 — Identity backfill for existing customers.** Phase 0 only inserts identity rows when a customer interacts with the bot. Existing 150 subscribers have no identity rows until they opt in. This is intentional (consent first) but means metrics will lag adoption. Document in rollout copy.

---

## Self-Review

**Spec coverage check (§12 Phase 0 deliverables from v3.1 spec):**

| Spec deliverable | Plan task |
|---|---|
| Turso migration + schema (4 tables) | Task 2 ✓ |
| Bot onboarding flow: IG handle verification + 4-toggle consent + parental | Tasks 5, 6, 10 ✓ (parental is partly deferred to admin scan in Task 18) |
| Yogo polling tier 1 (15-min class window) | Task 7 + Task 9 ✓ |
| Yogo polling tier 2 (daily memberships) | Task 8 + Task 9 ✓ |
| Idempotent event writes | Task 3 ✓ |
| Identity resolution end-to-end | Task 5 ✓ |
| DPIA prepared | Task 17 ✓ |
| Privacy notice published | Task 16 ✓ |
| DPA/SCC signatures initiated | Task 17 (Processor Agreements tracker) ✓ |
| Admin UI shell + 5 base screens | Tasks 12, 13, 14, 15 ✓ (per-student, adjust, pause, erasure, reset-audit) |

**Placeholder scan:** No "TBD", "implement later", "add appropriate error handling" — all steps contain concrete code/copy.

**Type consistency:** `customerId` is `number` (Yogo's integer) throughout. `pointsPeriod` is `string` "YYYY-MM" throughout. `EventType` union is the canonical list; no string-typed event types leak.

**Open clarifications:**
- The parental-consent capture flow for minors is intentionally manual (paper form + scan into `parentalConsentRef`) in Phase 0 — no bot capture. Listed as a deliberate scope choice in §10.6 of the v3.1 spec.
- The Phase 0 `pointsPerClass` calibration is deferred to Phase 1 (Task 7 emits `checkin_observed` with `pointsDelta=0`). Phase 0 only stands up the pipe; Phase 1 turns the meter on.
