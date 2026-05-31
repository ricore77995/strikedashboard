---
title: StrikeLab Phase 0 — Core Engine Implementation
type: technical
status: complete
created: 2026-05-29
tags:
  - strikelab
  - phase-0
  - implementation
related:
  - "[[StrikeLab-v3.2-final]]"
  - "[[StrikeLab-Cobertura]]"
  - "[[StrikeLab-Phase-0-Decisions]]"
---

# StrikeLab Phase 0 — Core Engine (Tasks 1-10)

> **Status:** ✅ Complete — 10/10 core engine tasks shipped, 60 gamification tests passing, 0 failures.
> **Branch:** `worktree-strikelab-phase0-core`
> **Plan:** [[StrikeLab-Phase-0-Decisions]] · Spec: [[StrikeLab-v3.2-final]]

## What Was Built

The foundational gamification engine — storage, identity, consent, Yogo helpers, both pollers, and monthly reset. Zero UI, zero cron wiring. Phase 1 builds points calculation, boosts, and the student-facing experience on top of this.

### Task 1 — Decisions log + env scaffold ✅
- `STRIKELAB_ENABLED`, `STRIKELAB_POLL_CLASSES_ENABLED`, `STRIKELAB_POLL_MEMBERSHIPS_ENABLED` flags in `.env.example`
- Decisions log existed from prior session

### Task 2 — Prisma schema: 6 tables ✅
**File:** `prisma/schema.prisma` + migration `20260529081427_strikelab_foundations`

| Table | Purpose |
|-------|---------|
| `GamificationIdentity` | Yogo customer_id ↔ phone ↔ email ↔ WA ↔ IG junction |
| `GamificationEventLog` | Immutable append-only event log with idempotency_key |
| `GamificationState` | Materialized view from deterministic replay |
| `GamificationMonthlySnapshot` | Sealed monthly state for prizes/history |
| `GamificationResetAudit` | Audit trail for monthly reset operations |
| `YogoMembershipSnapshot` | Daily Yogo membership data for diff detection |

### Task 3 — Idempotent event log writer ✅
**File:** `src/lib/gamification/event-log.ts`

- `appendEvent()` — writes immutable row, P2002 catch for duplicate idempotency
- Auto-incrementing `eventId` counter
- `pointsPeriod` ("YYYY-MM") computed in app code (Lisbon tz), never in SQL

### Task 4 — State materialization ✅
**File:** `src/lib/gamification/state.ts`

- `materializeState(customerId)` — deterministic replay of entire event log
- `persistState()` — upserts materialized view into GamificationState table
- Phase 0: accumulates monthlyPoints + lifetimeXp only (tier logic in Phase 1)

### Task 5 — Identity resolution ✅
**File:** `src/lib/gamification/identity.ts`

- `upsertIdentity()`, `findByPhone()`, `findByEmail()`, `findByWaId()`, `findByCustomerId()`
- IG verification: 6-digit challenge code with 30-min expiry
- Email normalization: lowercase + trim

### Task 6 — Consent module ✅
**File:** `src/lib/gamification/consent.ts`

- `applyConsent()` — 4-toggle diff-based update with `consent_changed` audit event
- `isOptedIn()` — checks training consent flag
- Opt-in/out timestamps tracked on identity

### Task 7 — Yogo classify + helpers ✅
**Files:** `src/lib/yogo/classify.ts`, `pick-best-membership.ts`, `non-actionable-lead.ts`

- `classify()` — 7-state membership classification (active/dunning/paused/cancelled/expired/trial/unknown)
- `pickBestMembership()` — priority-based selection across multiple memberships
- `isNonActionableLead()` — filters USC/ClassPass/internal aggregator accounts
- Real Spike 2 dunning case validated: `"Pausado. Renovação automática falhou 4 vezes."` → `paused`

### Task 8 — Yogo class poll ✅
**Files:** `src/lib/gamification/poll/classes.ts`, `poll/shared.ts`

- 15-min Yogo class poll → `checkin_observed` events for checked-in students
- Identity lookup → erased check → opt-in gate → classify gate
- Passive DOB capture from Yogo user data
- Dunning/paused customers: event emitted with `pointsDelta=0` (audit-only, no gamification credit)

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