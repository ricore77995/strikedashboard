---
title: StrikeLab Phase 0 Handoff Completion
type: technical
date: 2026-05-29
status: approved
---

# StrikeLab Phase 0 — Handoff Completion Design

## Context

Phase 0 core engine is code-complete (9/9 tasks, 37 files, 57 tests) but not production-ready:
- Prisma migration pending (tables don't exist in dev DB)
- 57 gamification tests failing (no tables)
- Monthly reset logic missing (schema exists, no implementation)
- Vault docs may be stale relative to actual code

## Section 1: Technical Foundation

### 1.1 Apply Prisma Migration

Single command to create the 6 gamification tables:

```bash
npx prisma migrate dev
```

Tables created by migration `20260529081427_strikelab_foundations`:
- `GamificationIdentity` — identity resolution, consent toggles, pause flags, DOB
- `GamificationEventLog` — immutable append-only event log with idempotency keys
- `GamificationState` — materialized view (monthlyPoints, lifetimeXp, tier, streak)
- `GamificationMonthlySnapshot` — sealed monthly snapshots for reset audit
- `GamificationResetAudit` — reset operation audit trail
- `YogoMembershipSnapshot` — daily membership snapshots for diffing

### 1.2 Fix Failing Tests

Run the 57 existing gamification tests. Expected: all pass once tables exist.
If failures occur, root causes likely:
- Test harness mock issues
- Schema drift between test expectations and migration
- Missing seed data in test fixtures

Fix approach: diagnose each failure individually, fix root cause not symptoms.

### 1.3 Implement Monthly Reset

The only missing Phase 0 feature. Schema has the tables, no logic.

**New files:**
- `src/lib/gamification/reset.ts` — core reset logic
- `src/app/api/cron/strikelab-monthly-reset/route.ts` — cron endpoint
- `tests/lib/gamification/reset.test.ts` — test suite

**`performMonthlyReset()` logic:**
1. Find all `GamificationState` records where `monthlyPoints > 0`
2. For each: create `GamificationMonthlySnapshot` sealing current state
3. Set `monthlyPoints = 0` on all `GamificationState` records
4. Create single `GamificationResetAudit` entry with count and timestamp
5. Wrap in Prisma `$transaction` for atomicity

**Cron route:**
- Same auth pattern as existing cron routes (`CRON_SECRET` bearer)
- Gated by `STRIKELAB_ENABLED` feature flag
- Scheduled: 1st of each month at 00:05 Lisbon time
- Returns `{ resetCount, snapshotCount, auditId }`

**Tests:**
- Reset with no active students → no-op, no audit
- Reset with active students → snapshots created, points zeroed, audit logged
- Reset is idempotent within same month (check audit for current month)
- Transaction rollback on partial failure

### 1.4 Verify Cron Routes

Both existing cron routes should compile and respond correctly:
- `GET /api/cron/strikelab-poll-classes` — 15-min class checkin poll
- `GET /api/cron/strikelab-poll-memberships` — daily membership sweep

## Section 2: Documentation Updates

### 2.1 Handoff Doc (`StrikeLab-Phase-0-Handoff.md`)

The primary deliverable (30KB). Updates:
- Add monthly reset to architecture section
- Update file index with new files (reset.ts, new cron route, tests)
- Update test count (57 → ~70+ with reset tests)
- Mark monthly reset as shipped in task list
- Fix any inaccuracies found during code audit

### 2.2 Core Engine Doc (`StrikeLab-Phase-0-Core-Engine.md`)

Add Task 10: Monthly reset implementation
- Update status from "9/9" to "10/10 tasks shipped"

### 2.3 Coverage Matrix (`StrikeLab-Cobertura.md`)

Update item statuses:
- Monthly reset items: `scheduled` → `shipped`
- Any items found complete during code audit
- Preserve tracking for deferred Phase 1 items

### 2.4 Rollout Checklist (`StrikeLab-Phase-0-Rollout.md`)

Update verification items:
- Mark code & tests items as done
- Keep decision gates open (DG-1, DG-2, DG-3 are Ricardo's calls)
- Mark migration step as complete

### 2.5 Vault Index (`The Vault.md`)

- Ensure wikilinks to all StrikeLab docs
- Clean up stale references
- Add monthly reset to cross-references

### 2.6 Documents NOT Modified

- GDPR package (6 docs) — already complete
- `StrikeLab-v3.2-final.md` — frozen spec, no changes
- `StrikeLab-Convergence-Report.md` — historical record
- `StrikeLab-Phase-0-Decisions.md` — gates are Ricardo's to resolve
- `StrikeLab-v3.1-Refined.md`, `StrikeLab-v3.md` — superseded historical

## Scope Boundaries

### In Scope
- Apply migration, fix tests, implement monthly reset
- Update vault docs to match code reality
- Ensure handoff doc is accurate single source of truth

### Out of Scope
- Turning feature flags on (STRIKELAB_ENABLED stays false)
- Resolving decision gates DG-1, DG-2, DG-3 (Ricardo's decisions)
- Phase 1 planning or implementation
- Vercel cron configuration in dashboard
- Spike 3 (discount code POST — non-blocking)

## Success Criteria

1. `npx prisma migrate status` shows all migrations applied
2. All gamification tests pass (57+ tests)
3. Monthly reset logic works: `performMonthlyReset()` creates snapshots, zeroes points, logs audit
4. New cron route compiles and responds correctly
5. Handoff doc accurately reflects all code in the repo
6. Coverage matrix shows monthly reset as shipped
7. Vault index is clean and complete
