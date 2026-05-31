# StrikeLab Phase 0 — Handoff Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make StrikeLab Phase 0 production-ready by applying the migration, fixing tests, implementing the missing monthly reset feature, and updating all Obsidian vault docs to match code reality.

**Architecture:** The monthly reset follows the existing cron pattern (auth → feature flag → execute). A new `reset.ts` module performs an atomic transaction: seal snapshots → zero monthly points → log audit. No changes to existing modules.

**Tech Stack:** Next.js 15, Prisma (LibSQL adapter), TypeScript strict, Vitest, Tailwind CSS v4

**Spec:** `docs/superpowers/specs/2026-05-29-strikelab-phase-0-handoff-completion-design.md`

---

## File Structure

### New Files

| File | Purpose |
|------|---------|
| `src/lib/gamification/reset.ts` | Monthly reset logic — `performMonthlyReset()` |
| `src/app/api/cron/strikelab-monthly-reset/route.ts` | Cron endpoint for monthly reset |
| `tests/lib/gamification/reset.test.ts` | Tests for monthly reset |

### Modified Files

| File | Change |
|------|--------|
| `strikedash_vault/StrikeLab-Phase-0-Handoff.md` | Add monthly reset section, update file index, update test count |
| `strikedash_vault/StrikeLab-Phase-0-Core-Engine.md` | Fix truncation, add Task 10 |
| `strikedash_vault/StrikeLab-Cobertura.md` | Update monthly reset items to shipped |
| `strikedash_vault/StrikeLab-Phase-0-Rollout.md` | Mark code/tests/migration items done |
| `strikedash_vault/The Vault.md` | Clean up StrikeLab references |

---

## Task 1: Apply Prisma Migration

**Files:**
- Verify: `prisma/migrations/20260529081427_strikelab_foundations/migration.sql`

- [ ] **Step 1: Check migration status**

Run: `npx prisma migrate status`

Expected output shows:
```
10 migrations found in prisma/migrations
Following migration have not yet been applied:
20260529081427_strikelab_foundations
```

- [ ] **Step 2: Apply the migration**

Run: `npx prisma migrate dev`

Expected: migration applied, no errors. Creates the 6 gamification tables.

- [ ] **Step 3: Verify tables exist**

Run: `npx prisma studio` (open browser, check that `GamificationIdentity`, `GamificationEventLog`, `GamificationState`, `GamificationMonthlySnapshot`, `GamificationResetAudit`, `YogoMembershipSnapshot` tables appear)

Alternative: `npx prisma db execute --stdin <<< "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'Gamification%' OR name LIKE 'YogoMembership%';"`

- [ ] **Step 4: Commit if any schema drift was auto-fixed**

```bash
git status
# Only commit if prisma/schema.prisma or migration files changed
```

---

## Task 2: Run Existing Tests and Fix Failures

**Files:**
- Verify: `tests/lib/gamification/*.test.ts` (7 files, ~57 tests)

- [ ] **Step 1: Run all gamification tests**

Run: `npx vitest run tests/lib/gamification/`

Expected: all tests pass now that the migration is applied. If tests fail, note the failures.

- [ ] **Step 2: If failures, diagnose and fix**

Common root causes:
- Test expects different column names than migration → update test
- Missing cleanup between tests → add `afterAll` cleanup
- Seed data conflicts → use unique CID per test file

Fix each failure individually. The test pattern is:
```typescript
const CID = 90XXX; // unique per test file
async function cleanup() {
  await db.gamificationEventLog.deleteMany({ where: { customerId: CID } });
  await db.gamificationState.deleteMany({ where: { customerId: CID } });
  await db.gamificationMonthlySnapshot.deleteMany({ where: { customerId: CID } });
  await db.gamificationIdentity.deleteMany({ where: { customerId: CID } });
}
```

- [ ] **Step 3: Run full gamification suite and confirm green**

Run: `npx vitest run tests/lib/gamification/`

Expected: all tests pass. Note the test count for doc updates.

- [ ] **Step 4: Commit any test fixes**

```bash
git add tests/
git commit -m "fix(strikelab): resolve gamification test failures post-migration"
```

---

## Task 3: Write Monthly Reset Failing Tests

**Files:**
- Create: `tests/lib/gamification/reset.test.ts`

This task follows TDD — write failing tests first, then implement.

- [ ] **Step 1: Write the test file**

Create `tests/lib/gamification/reset.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { appendEvent } from "@/lib/gamification/event-log";
import { persistState } from "@/lib/gamification/state";
import type { GamificationStateView } from "@/lib/gamification/types";
import { performMonthlyReset } from "@/lib/gamification/reset";
import { getCurrentPeriod } from "@/lib/gamification/poll/shared";

// Use unique CID range for reset tests to avoid collisions
const CID_A = 90301;
const CID_B = 90302;
const CID_C = 90303; // no points — should be skipped
const ALL_CIDS = [CID_A, CID_B, CID_C];

async function seedIdentity(customerId: number, phone: string) {
  return db.gamificationIdentity.upsert({
    where: { customerId },
    update: { phoneE164: phone },
    create: { customerId, phoneE164: phone },
  });
}

async function seedState(customerId: number, monthlyPoints: number, lifetimeXp: number) {
  await db.gamificationState.upsert({
    where: { customerId },
    update: { monthlyPoints, lifetimeXp },
    create: { customerId, monthlyPoints, lifetimeXp },
  });
}

async function cleanup() {
  for (const cid of ALL_CIDS) {
    await db.gamificationMonthlySnapshot.deleteMany({ where: { customerId: cid } }).catch(() => {});
    await db.gamificationEventLog.deleteMany({ where: { customerId: cid } }).catch(() => {});
    await db.gamificationState.deleteMany({ where: { customerId: cid } }).catch(() => {});
    await db.gamificationIdentity.deleteMany({ where: { customerId: cid } }).catch(() => {});
  }
  // Clean up reset audits from test runs
  await db.gamificationResetAudit.deleteMany({
    where: { resetPeriod: getCurrentPeriod() },
  }).catch(() => {});
}

describe("performMonthlyReset", () => {
  beforeAll(async () => {
    await cleanup();
    await seedIdentity(CID_A, "+351903000001");
    await seedIdentity(CID_B, "+351903000002");
    await seedIdentity(CID_C, "+351903000003");

    // CID_A has 150 monthly points
    await seedState(CID_A, 150, 500);
    // CID_B has 80 monthly points
    await seedState(CID_B, 80, 200);
    // CID_C has 0 monthly points
    await seedState(CID_C, 0, 50);
  });

  afterAll(cleanup);

  it("creates snapshots for students with monthlyPoints > 0", async () => {
    const result = await performMonthlyReset();

    expect(result.snapshotCount).toBe(2); // CID_A and CID_B only
    expect(result.resetCount).toBe(2);

    // Verify snapshots were created
    const period = getCurrentPeriod();
    const snapA = await db.gamificationMonthlySnapshot.findUnique({
      where: { customerId_pointsPeriod: { customerId: CID_A, pointsPeriod: period } },
    });
    const snapB = await db.gamificationMonthlySnapshot.findUnique({
      where: { customerId_pointsPeriod: { customerId: CID_B, pointsPeriod: period } },
    });
    const snapC = await db.gamificationMonthlySnapshot.findUnique({
      where: { customerId_pointsPeriod: { customerId: CID_C, pointsPeriod: period } },
    });

    expect(snapA).not.toBeNull();
    expect(snapA!.monthlyPoints).toBe(150);
    expect(snapB).not.toBeNull();
    expect(snapB!.monthlyPoints).toBe(80);
    expect(snapC).toBeNull(); // 0 points → no snapshot
  });

  it("zeroes monthlyPoints on all reset students", async () => {
    const stateA = await db.gamificationState.findUnique({ where: { customerId: CID_A } });
    const stateB = await db.gamificationState.findUnique({ where: { customerId: CID_B } });
    const stateC = await db.gamificationState.findUnique({ where: { customerId: CID_C } });

    expect(stateA!.monthlyPoints).toBe(0);
    expect(stateB!.monthlyPoints).toBe(0);
    expect(stateC!.monthlyPoints).toBe(0); // already was 0
  });

  it("preserves lifetimeXp (not reset)", async () => {
    const stateA = await db.gamificationState.findUnique({ where: { customerId: CID_A } });
    const stateB = await db.gamificationState.findUnique({ where: { customerId: CID_B } });

    expect(stateA!.lifetimeXp).toBe(500);
    expect(stateB!.lifetimeXp).toBe(200);
  });

  it("creates a single reset audit entry", async () => {
    const period = getCurrentPeriod();
    const audit = await db.gamificationResetAudit.findFirst({
      where: { resetPeriod: period },
    });

    expect(audit).not.toBeNull();
    expect(audit!.status).toBe("completed");
    expect(audit!.customersZeroed).toBe(2);
    expect(audit!.completedAt).not.toBeNull();
  });

  it("is idempotent — second call in same month is a no-op", async () => {
    const result = await performMonthlyReset();

    // Should skip because audit already exists for this period
    expect(result.resetCount).toBe(0);
    expect(result.snapshotCount).toBe(0);
    expect(result.skipped).toBe(true);
  });

  it("returns correct result shape", async () => {
    // First clean up the audit to test a fresh run
    const period = getCurrentPeriod();
    await db.gamificationResetAudit.deleteMany({ where: { resetPeriod: period } });
    // Re-seed points
    await seedState(CID_A, 100, 500);

    const result = await performMonthlyReset();
    expect(result).toEqual({
      resetCount: 1,
      snapshotCount: 1,
      auditId: expect.any(String),
      skipped: false,
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run tests/lib/gamification/reset.test.ts`

Expected: FAIL — `Cannot find module '@/lib/gamification/reset'` or similar import error.

---

## Task 4: Implement Monthly Reset Logic

**Files:**
- Create: `src/lib/gamification/reset.ts`

- [ ] **Step 1: Write the reset module**

Create `src/lib/gamification/reset.ts`:

```typescript
import { db } from "@/lib/db";
import { getCurrentPeriod } from "@/lib/gamification/poll/shared";

export interface MonthlyResetResult {
  resetCount: number;
  snapshotCount: number;
  auditId: string | null;
  skipped: boolean;
}

/**
 * Perform the monthly reset:
 * 1. Check if already run this month (idempotency via audit)
 * 2. Find all states with monthlyPoints > 0
 * 3. For each: create a sealed snapshot
 * 4. Zero monthlyPoints on all found states
 * 5. Create a single audit entry
 *
 * All in a single Prisma $transaction for atomicity.
 */
export async function performMonthlyReset(): Promise<MonthlyResetResult> {
  const period = getCurrentPeriod();

  // Idempotency: check if audit already exists for this period
  const existingAudit = await db.gamificationResetAudit.findFirst({
    where: { resetPeriod: period, status: "completed" },
  });
  if (existingAudit) {
    return { resetCount: 0, snapshotCount: 0, auditId: existingAudit.resetId, skipped: true };
  }

  // Find all states with points to reset
  const statesWithPoints = await db.gamificationState.findMany({
    where: { monthlyPoints: { gt: 0 } },
    select: {
      customerId: true,
      monthlyPoints: true,
      lifetimeXp: true,
      currentTier: true,
      currentStreakDays: true,
    },
  });

  if (statesWithPoints.length === 0) {
    // Nothing to reset — still log an audit for traceability
    const audit = await db.gamificationResetAudit.create({
      data: {
        resetPeriod: period,
        status: "completed",
        batchesApplied: 1,
        customersZeroed: 0,
        completedAt: new Date(),
      },
    });
    return { resetCount: 0, snapshotCount: 0, auditId: audit.resetId, skipped: false };
  }

  // Execute atomically
  const audit = await db.$transaction(async (tx) => {
    // 1. Create sealed snapshots
    for (const state of statesWithPoints) {
      // Count checkin events this period for classesInPeriod
      const checkinCount = await tx.gamificationEventLog.count({
        where: {
          customerId: state.customerId,
          eventType: "checkin_observed",
          pointsPeriod: period,
        },
      });

      await tx.gamificationMonthlySnapshot.upsert({
        where: {
          customerId_pointsPeriod: { customerId: state.customerId, pointsPeriod: period },
        },
        update: {
          monthlyPoints: state.monthlyPoints,
          xpAtPeriodEnd: state.lifetimeXp,
          classesInPeriod: checkinCount,
          finalTier: state.currentTier,
          sealedAt: new Date(),
        },
        create: {
          customerId: state.customerId,
          pointsPeriod: period,
          monthlyPoints: state.monthlyPoints,
          xpAtPeriodEnd: state.lifetimeXp,
          classesInPeriod: checkinCount,
          finalTier: state.currentTier,
          sealedAt: new Date(),
        },
      });
    }

    // 2. Zero monthlyPoints on all states with points
    await tx.gamificationState.updateMany({
      where: { monthlyPoints: { gt: 0 } },
      data: { monthlyPoints: 0 },
    });

    // 3. Create audit entry
    return tx.gamificationResetAudit.create({
      data: {
        resetPeriod: period,
        status: "completed",
        batchesApplied: 1,
        customersZeroed: statesWithPoints.length,
        completedAt: new Date(),
      },
    });
  });

  return {
    resetCount: statesWithPoints.length,
    snapshotCount: statesWithPoints.length,
    auditId: audit.resetId,
    skipped: false,
  };
}
```

- [ ] **Step 2: Run reset tests**

Run: `npx vitest run tests/lib/gamification/reset.test.ts`

Expected: all 6 tests PASS.

- [ ] **Step 3: Run full gamification suite to check no regressions**

Run: `npx vitest run tests/lib/gamification/`

Expected: all tests pass (57 existing + 6 new = 63+ tests).

- [ ] **Step 4: Commit**

```bash
git add src/lib/gamification/reset.ts tests/lib/gamification/reset.test.ts
git commit -m "feat(strikelab): monthly reset logic with sealed snapshots + audit trail"
```

---

## Task 5: Create Monthly Reset Cron Route

**Files:**
- Create: `src/app/api/cron/strikelab-monthly-reset/route.ts`

- [ ] **Step 1: Write the cron route**

Create `src/app/api/cron/strikelab-monthly-reset/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { performMonthlyReset } from "@/lib/gamification/reset";

/**
 * GET /api/cron/strikelab-monthly-reset
 *
 * Monthly cron (1st of month, 00:05 Lisbon = 23:05 UTC previous day in WEST)
 * that seals the current month's points into snapshots and zeroes monthlyPoints.
 *
 * Gated by:
 * 1. CRON_SECRET bearer auth
 * 2. STRIKELAB_ENABLED master switch
 */
export async function GET(req: NextRequest) {
  // Auth
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "no_secret_configured" }, { status: 500 });
  }
  const header = req.headers.get("authorization") ?? "";
  if (header !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Master kill switch
  if (process.env.STRIKELAB_ENABLED !== "true") {
    return NextResponse.json({ skipped: true, reason: "STRIKELAB_ENABLED not set" });
  }

  try {
    const result = await performMonthlyReset();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify route compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`

Expected: no errors related to the new route.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/strikelab-monthly-reset/route.ts
git commit -m "feat(strikelab): monthly reset cron endpoint with auth + feature flag"
```

---

## Task 6: Verify All Cron Routes Compile

**Files:**
- Verify: `src/app/api/cron/strikelab-poll-classes/route.ts`
- Verify: `src/app/api/cron/strikelab-poll-memberships/route.ts`
- Verify: `src/app/api/cron/strikelab-monthly-reset/route.ts`

- [ ] **Step 1: Run full TypeScript check**

Run: `npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`

Expected: all tests pass across the entire project (not just gamification).

- [ ] **Step 3: Note final test count**

Record the total gamification test count for doc updates:
```bash
npx vitest run tests/lib/gamification/ 2>&1 | tail -5
```

---

## Task 7: Update Handoff Doc in Vault

**Files:**
- Modify: `strikedash_vault/StrikeLab-Phase-0-Handoff.md`

- [ ] **Step 1: Add monthly reset section after "Membership Sweep" section**

Insert after line 355 (end of Membership Sweep section), before "### Vercel cron config":

```markdown

### Monthly Reset — 1st of month at 00:05 Lisbon

**File:** `src/app/api/cron/strikelab-monthly-reset/route.ts`
**Library:** `src/lib/gamification/reset.ts`

1. Checks idempotency: if a completed audit exists for the current month → skip
2. Finds all `GamificationState` rows where `monthlyPoints > 0`
3. For each: creates a sealed `GamificationMonthlySnapshot` (points, XP, tier, class count)
4. Zeroes `monthlyPoints` on all found states
5. Creates a single `GamificationResetAudit` entry
6. All in a Prisma `$transaction` for atomicity
7. Gated by `STRIKELAB_ENABLED` only (no separate feature flag — reset is low-risk)
8. Returns: `{ resetCount, snapshotCount, auditId, skipped }`
```

- [ ] **Step 2: Update Vercel cron config section**

Find the cron config JSON block (around line 357-368) and add the monthly reset entry:

```json
{
  "path": "/api/cron/strikelab-poll-classes",
  "schedule": "*/15 * * * *"
},
{
  "path": "/api/cron/strikelab-poll-memberships",
  "schedule": "0 2 * * *"
},
{
  "path": "/api/cron/strikelab-monthly-reset",
  "schedule": "5 0 1 * *"
}
```

Note: `5 0 1 * *` = 00:05 UTC on 1st of month. During WEST (Mar-Oct) this is 01:05 Lisbon; during WET (Nov-Feb) it's 00:05 Lisbon. Acceptable for a monthly job.

- [ ] **Step 3: Update Environment variables section**

Add after the existing env vars:

```
# (no new env var — monthly reset uses STRIKELAB_ENABLED only)
```

- [ ] **Step 4: Update File Index — Library section**

Add to the library table:

```markdown
| `gamification/reset.ts` | Monthly reset — seal snapshots, zero points, audit trail |
```

- [ ] **Step 5: Update File Index — API Routes section**

Add to the API routes table:

```markdown
| `cron/strikelab-monthly-reset/route.ts` | Monthly reset cron endpoint |
```

- [ ] **Step 6: Update File Index — Tests section**

Add to the tests table:

```markdown
| `lib/gamification/reset.test.ts` | Monthly reset tests (idempotency, snapshots, audit) |
```

- [ ] **Step 7: Update Test Coverage section**

Find the test coverage section (around line 478-510) and update the counts. The new total is existing tests + ~6 reset tests.

- [ ] **Step 8: Update header file count**

The header says "All 37 Phase 0 Files". Update to "All 40 Phase 0 Files" (3 new files: reset.ts, cron route, test).

- [ ] **Step 9: Commit vault update**

```bash
git add strikedash_vault/StrikeLab-Phase-0-Handoff.md
git commit -m "docs(strikelab): update handoff with monthly reset, file index, test counts"
```

---

## Task 8: Update Core Engine Doc

**Files:**
- Modify: `strikedash_vault/StrikeLab-Phase-0-Core-Engine.md`

- [ ] **Step 1: Fix the truncated line at end of file**

The file ends at line 83-84 with a truncated sentence:
```
- Dunning/paused customers: event emitted with `pointsDelta
```

This is the cutoff point. Append the remaining content. First, fix the truncation:

```
- Dunning/paused customers: event emitted with `pointsDelta=0` (audit-only, no gamification credit)
```

Then append the remaining sections:

```markdown

### Task 9 — Yogo membership sweep ✅
**Files:** `src/lib/gamification/poll/memberships.ts`

- Daily sweep of all Yogo memberships (~149 rows)
- Snapshot diff: detects renewals (`paid_until` +25d), cancellations (`status=ended`), dunning
- Emits `subscription_renewed`, `subscription_cancelled`, `dunning_detected` events
- Identity filter: `isNonActionableLead()` removes USC/ClassPass/internal

### Task 10 — Monthly reset ✅
**Files:** `src/lib/gamification/reset.ts`, `src/app/api/cron/strikelab-monthly-reset/route.ts`

- `performMonthlyReset()` — seals monthly snapshots, zeroes points, logs audit
- Idempotent: checks for existing completed audit in current period
- Prisma `$transaction` for atomicity
- Cron route: same auth pattern as other cron endpoints
- Only gated by `STRIKELAB_ENABLED` (no separate feature flag)

## Summary

| Task | Module | Status |
|------|--------|--------|
| 1 | Decisions log + env scaffold | ✅ shipped |
| 2 | Prisma schema (6 tables) | ✅ shipped |
| 3 | Idempotent event log writer | ✅ shipped |
| 4 | State materialization | ✅ shipped |
| 5 | Identity resolution | ✅ shipped |
| 6 | Consent module | ✅ shipped |
| 7 | Yogo classify + helpers | ✅ shipped |
| 8 | Yogo class poll | ✅ shipped |
| 9 | Yogo membership sweep | ✅ shipped |
| 10 | Monthly reset | ✅ shipped |

> **Status:** ✅ Complete — 10/10 core engine tasks shipped.
> **Zero UI, zero cron wiring.** Phase 1 builds points calculation, boosts, and student-facing experience.
```

- [ ] **Step 2: Commit**

```bash
git add strikedash_vault/StrikeLab-Phase-0-Core-Engine.md
git commit -m "docs(strikelab): fix truncation, add Tasks 9-10, update to 10/10 shipped"
```

---

## Task 9: Update Coverage Matrix

**Files:**
- Modify: `strikedash_vault/StrikeLab-Cobertura.md`

- [ ] **Step 1: Read the file and find monthly reset items**

Run: `grep -n -i "reset\|mensal" strikedash_vault/StrikeLab-Cobertura.md`

Find all items related to monthly reset / reset audit / snapshot sealing.

- [ ] **Step 2: Update monthly reset items from scheduled → shipped**

For each matching item, change status from `scheduled` or `in-progress` to `shipped`. The exact format depends on how the cobertura file tracks status — look for the existing pattern (emoji, color, or text status) and follow it.

- [ ] **Step 3: Commit**

```bash
git add strikedash_vault/StrikeLab-Cobertura.md
git commit -m "docs(strikelab): update cobertura — monthly reset items shipped"
```

---

## Task 10: Update Rollout Checklist

**Files:**
- Modify: `strikedash_vault/StrikeLab-Phase-0-Rollout.md`

- [ ] **Step 1: Read the file and find code/test items**

- [ ] **Step 2: Mark the following items as done:**
- Migration applied (`npx prisma migrate dev` completed)
- All gamification tests passing
- Monthly reset implemented
- Cron routes verified

- [ ] **Step 3: Keep decision gate items open (DG-1, DG-2, DG-3)**

These are Ricardo's decisions — do not mark them done.

- [ ] **Step 4: Commit**

```bash
git add strikedash_vault/StrikeLab-Phase-0-Rollout.md
git commit -m "docs(strikelab): update rollout checklist — code/tests/migration done"
```

---

## Task 11: Update Vault Index

**Files:**
- Modify: `strikedash_vault/The Vault.md`

- [ ] **Step 1: Review current StrikeLab references**

The index already has 10 StrikeLab references. Verify all are accurate and add any missing cross-references.

- [ ] **Step 2: Add missing references if any**

Check if monthly reset or core engine Task 10 should be called out. The handoff doc already covers it, so likely no new entries needed — just verify wikilinks resolve.

- [ ] **Step 3: Commit**

```bash
git add strikedash_vault/The\ Vault.md
git commit -m "docs(strikelab): clean up vault index references"
```

---

## Task 12: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`

Expected: all tests pass, 0 failures.

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 3: Run linter**

Run: `npm run lint`

Expected: 0 errors.

- [ ] **Step 4: Verify migration status**

Run: `npx prisma migrate status`

Expected: all migrations applied, no pending.

- [ ] **Step 5: Final commit with all doc updates**

If any last adjustments needed:
```bash
git add strikedash_vault/ docs/
git commit -m "docs(strikelab): Phase 0 handoff completion — all docs verified"
```
