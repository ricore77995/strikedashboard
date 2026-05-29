---
title: StrikeLab Phase 0 — Complete Handoff
type: reference
status: current
created: 2026-05-29
updated: 2026-05-29
tags:
  - strikelab
  - handoff
  - phase-0
  - gamification
related:
  - "[[StrikeLab-v3.2-final]]"
  - "[[StrikeLab-Cobertura]]"
  - "[[Yogo-StrikeLab-Gap-Report]]"
  - "[[StrikeLab-Phase-0-Decisions]]"
---

# StrikeLab Phase 0 — Complete Handoff

**Date:** 2026-05-29 · **Commit:** `63e4dec` · **Branch:** `main` (merged)
**Status:** Code complete. Feature flags OFF. Awaiting 3 decision gates before go-live.

## TL;DR

StrikeLab é o sistema de gamificação da Striker's House. Phase 0 shipou toda a infraestrutura fundacional — schema, identity, consent, Yogo polling, admin UI, GDPR — mas corre em modo silencioso: todos os events têm `pointsDelta=0`.

Phase 1 liga os pontos reais (pointsPerClass, boosts, streaks, milestones) e faz replay retroactivo dos eventos Phase 0.

**Numbers:** 21 commits · 37 files · ~5k LOC · 288 tests (76 gamification-specific)
**All feature flags OFF by default. Nothing runs until you flip them.**

**Purpose of this doc:** Your reference for picking up Phase 1. Every table, every file, every decision, every gotcha — in one place. Not a marketing doc. Not a tutorial. The truth.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Yogo Booking API                         │
│  /classes (15min)    /reports/memberships-list (daily)          │
└────────┬───────────────────────┬────────────────────────────────┘
         │                       │
    ┌────▼─────┐          ┌─────▼──────┐
    │ Class    │          │ Membership │
    │ Poller   │          │ Sweep      │
    └────┬─────┘          └─────┬──────┘
         │                       │
         ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Event Log (append-only)                       │
│  checkin_observed · dunning_detected · subscription_renewed/    │
│  cancelled · consent_changed · manual_adjust · erasure_executed │
└──────────────────────────┬──────────────────────────────────────┘
                           │ deterministic replay
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Materialized State                            │
│  monthlyPoints · lifetimeXp · currentTier · streakDays          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                  ▼
   ┌──────────┐    ┌──────────────┐   ┌──────────────┐
   │ Admin UI │    │ WhatsApp Bot │   │ Monthly      │
   │ (5 pages)│    │ Onboarding   │   │ Snapshot     │
   └──────────┘    └──────────────┘   └──────────────┘
```

**Core pattern:** Append-then-materialize. Every state change writes an immutable row to `GamificationEventLog` with a unique `idempotencyKey`. The current state is computed by deterministic replay of the full event log for that customer. This means:

- Events are never mutated or deleted (except GDPR erasure)
- State can be rebuilt from scratch at any time
- Idempotent by design — duplicate events silently ignored via P2002 catch

**Key constraint:** `pointsPeriod` ("YYYY-MM") is computed in app code using Lisbon timezone (`Intl.DateTimeFormat` with `Europe/Lisbon`), never in SQL. libSQL/Turso doesn't support `AT TIME ZONE`.

---

## Data Model

### GamificationIdentity

The junction table linking a Yogo customer to all their identity axes.

| Field | Type | Notes |
|-------|------|-------|
| customerId | Int @id | Yogo customer_id |
| phoneE164 | String? @unique | E.164 format |
| email | String? @unique | Lowercase, trimmed |
| whatsappWaId | String? @unique | WhatsApp ID |
| instagramHandle | String? | Verified via challenge code |
| igVerifiedAt | DateTime? | 6-digit code, 30-min expiry |
| igChallengeCode | String? | Current challenge (null after verified) |
| birthYear | Int? | Passive capture from Yogo DOB |
| consentTraining | Boolean | Default false — must opt in |
| consentUgc | Boolean | User-generated content |
| consentRealName | Boolean | Leaderboard display name |
| consentBroadcasts | Boolean | Marketing messages |
| consentTrainingAt | DateTime? | Timestamp of training opt-in |
| consentUgcAt | DateTime? | Timestamp of UGC opt-in |
| consentRealNameAt | DateTime? | Timestamp of real name opt-in |
| consentBroadcastsAt | DateTime? | Timestamp of broadcasts opt-in |
| erasedAt | DateTime? | Null = active, set = pseudonymised |
| pausedMedical | Boolean | Default false |
| pausedVacation | Boolean | Default false |
| pausedPersonal | Boolean | Default false |
| createdAt | DateTime | |
| updatedAt | DateTime | Auto-updated |

### GamificationEventLog

Immutable append-only log. The single source of truth.

| Field | Type | Notes |
|-------|------|-------|
| eventId | Int @id @default(autoincrement) | Monotonic |
| customerId | Int | FK → Identity |
| eventType | String | Union of known event types |
| pointsDelta | Int | Phase 0: always 0 |
| xpDelta | Int | Phase 0: always 0 |
| payloadJson | String? | Event-specific data (JSON) |
| source | String | "yogo_poll" \| "admin" \| "bot" \| "system" |
| operatorId | String? | Admin who triggered (if manual) |
| idempotencyKey | String @unique | Duplicate → P2002 silent skip |
| pointsPeriod | String | "YYYY-MM" computed in Lisbon tz |
| createdAt | DateTime | Insertion timestamp |

**Event types in Phase 0:**
- `checkin_observed` — class poll detected a check-in
- `subscription_renewed` — membership snapshot diff detected renewal
- `subscription_cancelled` — membership snapshot diff detected cancellation
- `dunning_detected` — membership status_text matches dunning pattern
- `consent_changed` — user toggled any of 4 consent flags
- `manual_adjust` — admin adjusted points manually
- `erasure_executed` — GDPR erasure triggered
- `reset_applied` — monthly reset (Phase 1, schema-ready)

### GamificationState

Materialized view from deterministic replay. 1:1 with Identity.

| Field | Type | Notes |
|-------|------|-------|
| customerId | Int @id | 1:1 with Identity |
| monthlyPoints | Int | Reset monthly |
| lifetimeXp | Int | Never resets |
| currentTier | String? | Phase 1 — Bronze/Silver/Gold/Platinum |
| proposedTier | String? | Phase 1 — demotion buffer |
| currentStreakDays | Int | Phase 1 — consecutive training days |
| streakShieldAvailable | Boolean | Phase 1 — streak protection |
| shieldResetForMonth | String? | Phase 1 |
| lastClassAt | DateTime? | Updated on checkin_observed |
| lastReplayedEventId | Int? | Replay cursor |
| updatedAt | DateTime | Auto-updated on materialize |

### GamificationMonthlySnapshot

Sealed monthly state for prizes/history.

| Field | Type | Notes |
|-------|------|-------|
| customerId + pointsPeriod | @@unique | Composite key |
| monthlyPoints | Int | Frozen at seal time |
| xpAtPeriodEnd | Int | |
| classesInPeriod | Int | |
| finalTier | String? | Phase 1 |
| sealedAt | DateTime? | Null = unsealed (current month) |

### GamificationResetAudit

Audit trail for monthly reset operations.

| Field | Type | Notes |
|-------|------|-------|
| resetId | String @id | UUID |
| resetPeriod | String | "YYYY-MM" |
| status | String | "started" \| "completed" \| "failed" |
| batchesApplied | Int | |
| customersZeroed | Int | |
| startedAt | DateTime | |
| completedAt | DateTime? | |

### YogoMembershipSnapshot

Daily Yogo data for diff-based change detection. Independent of gamification tables.

| Field | Type | Notes |
|-------|------|-------|
| userId + snapshotDate | @@id | Composite PK |
| membershipTypeId | Int | |
| membershipTypeName | String | |
| paidUntil | DateTime? | Diff → detect renewal |
| nextPaymentDate | DateTime? | |
| status | String | Diff → detect cancellation |
| statusText | String? | Diff → detect dunning |
| capturedAt | DateTime | |

### Relationships

```
Identity  1:1  State
Identity  1:N  EventLog
Identity  1:N  MonthlySnapshot
Identity  1:N  ResetAudit (indirect)
YogoMembershipSnapshot  (independent — used by membership sweep)
```

---

## Event Sourcing Flow

1. Something happens (check-in detected, membership renewed, admin adjusts points)
2. `appendEvent()` writes immutable row with unique `idempotencyKey`
3. If duplicate key → Prisma P2002 → silent no-op (idempotent)
4. `materializeState(customerId)` replays entire event log → upserts GamificationState
5. Phase 0: replay accumulates monthlyPoints + lifetimeXp only (all deltas = 0)
6. Phase 1: replay adds tier logic, streaks, boosts

### Idempotency Keys

Each event type uses a structured key to prevent duplicates on re-poll:
- `checkin:{customerId}:{classId}` — class poller
- `membership:{userId}:{snapshotDate}:{triggerType}` — membership sweep
- `consent:{customerId}:{timestamp}` — consent change
- `adjust:{customerId}:{timestamp}` — admin manual adjust
- `erasure:{customerId}` — GDPR erasure

---

## Identity Resolution

Links Yogo customer_id to phone, email, WhatsApp, Instagram.

### Lookup axes

| Axis | Field | Method |
|------|-------|--------|
| Yogo ID | `customerId` | `findByCustomerId()` |
| Phone | `phoneE164` | `findByPhone()` |
| Email | `email` | `findByEmail()` |
| WhatsApp | `whatsappWaId` | `findByWaId()` |
| Instagram | `instagramHandle` | Verified only — requires challenge code |

### IG verification flow

1. `generateIgChallenge(customerId)` → generates 6-digit code, stores on identity with 30-min expiry
2. User posts code on IG story + DMs bot
3. `verifyIgChallenge({ customerId, code, igHandle })` → marks verified, sets `igVerifiedAt`
4. Failed attempts → `{ ok: false, reason: "invalid_code" | "expired" }`

### Email normalization

Lowercase + trim. No gmail dot-stripping — decided against for simplicity.

### Erased identities

`erasedAt !== null` → identity is tombstoned. All queries filter these out. Events still exist but payloads are anonymised.

### Where identities get created

| Source | When | Axes populated |
|--------|------|----------------|
| Class poller | Checked-in customer has no identity | `customerId` (auto-created) |
| Bot onboarding | User texts "strikelab" | `customerId` + `whatsappWaId` |
| Admin UI | Manual creation | `customerId` + whatever admin provides |

---

## Consent Module

4 toggles, all opt-in (default false):

| Toggle | Field | Purpose |
|--------|-------|---------|
| Training | `consentTraining` | Participate in gamification (points, leaderboard) |
| UGC | `consentUgc` | User-generated content (sharing achievements, reels) |
| Real Name | `consentRealName` | Display real name on leaderboard |
| Broadcasts | `consentBroadcasts` | Receive marketing/broadcast messages |

### Flow

1. On change → `applyConsent()` computes diff between old and new toggle values
2. If diff exists → writes `consent_changed` audit event with old/new values in payload
3. Opt-in timestamps tracked per toggle (`consentTrainingAt`, etc.)
4. `isOptedIn()` checks `consentTraining === true`
5. All point-crediting gated on `isOptedIn()` — opted-out customers still generate events (for audit) but with `pointsDelta=0`

---

## Yogo Integration

### classify() — 7-state membership classifier

**File:** `src/lib/yogo/classify.ts`

Given a Yogo membership object + reference date → one of:
`active | dunning | paused | cancelled | expired | trial | unknown`

**Key logic:**
- `status_text` takes priority over `status` (Yogo bug: dunning customers show `status: "active"` but text like `"Pausado. Renovação automática falhou N vezes."`)
- Regex: `/falhou|Pausado.*falhou/i` → dunning
- `paid_until` past reference date → expired
- `status: "ended"` → cancelled
- Validated with real Spike 2 case (user_id 1174940)

### pickBestMembership() — multi-membership resolver

When a customer has multiple memberships, picks the "real" one by priority:
`active > dunning > paused > trial > expired > cancelled > unknown`

### isNonActionableLead() — aggregator filter

Filters accounts that are not real leads:
- `usc-*@urbansportsclub.com` — Urban Sports Club
- `@strikershouse.*` — internal test accounts
- Other aggregator patterns

**These never generate gamification events. Do not remove this filter.**

---

## Cron Jobs

### Class Poller — every 15 minutes

**File:** `src/app/api/cron/strikelab-poll-classes/route.ts`
**Library:** `src/lib/gamification/poll/classes.ts`

1. Fetches today's Yogo classes with signups: `GET /classes?startDate=today&populate[]=signups.user&populate[]=class_type`
2. For each checked-in signup:
   - Identity lookup (by customer_id)
   - Skip if no identity / erased / opted-out
   - Passive DOB capture: if `signups.user.date_of_birth` is non-null AND `identity.birthYear` is null → update `identity.birthYear`
   - classify() gate: if not "active" → still emit event with `pointsDelta=0` (for audit)
   - emit `checkin_observed` with idempotency key `checkin:{customerId}:{classId}`
3. Gated by `STRIKELAB_POLL_CLASSES_ENABLED` + operating hours (6-23 Lisbon)
4. Returns JSON with counts: `{ processed, skipped, events }`

### Membership Sweep — daily at 2am

**File:** `src/app/api/cron/strikelab-poll-memberships/route.ts`
**Library:** `src/lib/gamification/poll/memberships.ts`

1. Fetches all memberships: `POST /reports/memberships-list {}` (~149 rows on Strike House)
2. For each:
   - Identity lookup → filter `isNonActionableLead()`
   - Snapshot diff vs previous day's `YogoMembershipSnapshot`:
     - `paid_until` advanced ≥25 days → `subscription_renewed`
     - `status` changed to `ended` → `subscription_cancelled`
     - `status_text` newly matches dunning pattern → `dunning_detected`
   - Upsert today's snapshot row
3. Gated by `STRIKELAB_POLL_MEMBERSHIPS_ENABLED`
4. Returns JSON with counts: `{ processed, events }`

### Vercel cron config

```json
{
  "path": "/api/cron/strikelab-poll-classes",
  "schedule": "*/15 * * * *"
},
{
  "path": "/api/cron/strikelab-poll-memberships",
  "schedule": "0 2 * * *"
}
```

**DG-1 fallback:** if Vercel Pro denied, classes drop to hourly `0 * * * *`. Bot copy adjustment: "vencedores anunciados todas as horas em ponto".

### Environment variables

```
STRIKELAB_ENABLED=false                  # master kill switch
STRIKELAB_POLL_CLASSES_ENABLED=false     # class poller gate
STRIKELAB_POLL_MEMBERSHIPS_ENABLED=false # membership sweep gate
STRIKELAB_OPS_START_HOUR=6               # Lisbon hour
STRIKELAB_OPS_END_HOUR=23
CRON_SECRET=                             # bearer auth for cron routes
```

---

## WhatsApp Bot Onboarding

**File:** `src/lib/wa/handlers/strikelab-onboard.ts`

State machine triggered when user texts "strikelab":

```
IDLE → "strikelab" → CHECK_DOB
  ↓
  no identity / no Yogo customer → "fala com o Marcelo"
  Yogo DOB is NULL → "fala com o Marcelo na recepção para actualizar"
  DOB < 13yr → "StrikeLab é para idades 13+"
  13 ≤ DOB < 18 → AWAIT_PARENTAL_CONSENT → parental code flow
  DOB ≥ 18 → AWAIT_CONSENT_TRAINING
  ↓
  4-toggle consent flow (training, ugc, realName, broadcasts)
  ↓
  IDLE (concluído) + identity created + consent recorded
```

**Key constraints:**
- DOB is required — no onboarding without it (Spike 4 finding: `date_of_birth` is optional in Yogo, real customers have it null)
- Minors (13-17) require parental consent step
- Under 13 excluded entirely
- The bot dispatch file (`src/lib/wa/dispatch.ts`) routes "strikelab" to this handler

---

## Admin UI — 6 Pages

All under `/dashboard/strikelab/`, admin role guard required.

| Page | Path | Purpose |
|------|------|---------|
| Student list | `/dashboard/strikelab` | Search/list all identities |
| Student detail | `/dashboard/strikelab/[customerId]` | State + last 50 events + identity info |
| Points adjust | `/dashboard/strikelab/[customerId]/adjust` | Manual adjust with reason + audit event |
| Pause flags | `/dashboard/strikelab/[customerId]/pause` | Medical/vacation/personal pause flags with dates |
| Erasure handler | `/dashboard/strikelab/erasure` | GDPR Art. 17 two-track erasure UI |
| Reset audit | `/dashboard/strikelab/reset-audit` | Monthly reset audit log viewer |

---

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/strikelab/admin` | GET | List/search students |
| `/api/strikelab/admin/[customerId]` | GET | Per-student detail (identity + state + events) |
| `/api/strikelab/admin/adjust-points` | POST | Manual points adjust (body: `{ customerId, delta, reason }`) |
| `/api/strikelab/admin/pause` | POST | Set/clear pause flags (body: `{ customerId, type, active, reason? }`) |
| `/api/strikelab/erasure` | POST | Trigger GDPR erasure (body: `{ customerId, track }`) |
| `/api/cron/strikelab-poll-classes` | GET | Cron: class poller |
| `/api/cron/strikelab-poll-memberships` | GET | Cron: membership sweep |

**Auth:**
- Admin routes: session cookie with `admin` role
- Cron routes: `Authorization: Bearer {CRON_SECRET}` header

---

## GDPR Compliance Package

5 documents in `strikedash_vault/gdpr/`:

| Document | File | Purpose |
|----------|------|---------|
| DPIA | `DPIA-StrikeLab.md` | Data Protection Impact Assessment |
| ROPA | `ROPA-Strikelab.md` | Record of Processing Activities (Art. 30) |
| Lawful Basis | `Lawful-Basis-Register.md` | Legal basis per processing activity |
| Retention Policy | `Retention-Policy.md` | Data lifecycle rules |
| Processor Agreements | `Processor-Agreements.md` | Third-party processors (Vercel, Turso, Meta) |

**Public page:** `/privacy/strikelab` — privacy notice in pt-PT
**File:** `src/app/(public)/privacy/strikelab/page.tsx`

### Erasure flow (Art. 17 — two-track)

**Track A (immediate, default):**
1. Tombstone identity (`erasedAt = now`)
2. Anonymise event log payloads (replace PII with `[erased]`)
3. Zero state (monthlyPoints=0, lifetimeXp=0)
4. Write `erasure_executed` audit event

**Track B (≥12 months after Track A, operator-initiated):**
1. Hash customer_id everywhere
2. Delete identity row entirely
3. Update audit record

**DG-2 gate:** DPIA needs privacy lawyer review (~€300) before go-live.

---

## Test Coverage

288 tests total, 76 gamification-specific across 8 test files:

| Test file | ~Tests | Covers |
|-----------|--------|--------|
| `tests/lib/gamification/phase0-acceptance.test.ts` | 1 | Full happy path end-to-end |
| `tests/lib/gamification/identity.test.ts` | ~10 | Upsert, lookup by all axes, IG verify |
| `tests/lib/gamification/consent.test.ts` | ~8 | 4-toggle diff, audit events, timestamps |
| `tests/lib/gamification/state.test.ts` | ~6 | Materialization, replay from empty, accumulation |
| `tests/lib/gamification/erasure.test.ts` | ~6 | Track A pseudonymise + Track B full delete |
| `tests/lib/gamification/event-log.test.ts` | ~8 | Append, idempotency, P2002 duplicate skip |
| `tests/lib/gamification/poll/memberships.test.ts` | ~10 | Snapshot diff, renewal, dunning, cancellation |
| `tests/lib/gamification/poll/classes.test.ts` | ~12 | Check-in, DOB capture, classify gate, opt-out skip |

### Phase 0 acceptance test path

```
1. Create identity with DOB filled
2. Capture consent (training=true)
3. IG verify via challenge code
4. Daily membership snapshot captures membership in active state
5. Class poll observes check-in → classify "active" → pointsDelta=0 event recorded
6. Materialize state
7. Insert dunning row in memberships poll → classify changes to "paused"
8. Next class poll for same customer → pointsDelta=0 with skipped=true in payload
9. Erasure → state zeroed, identity tombstoned
```

**Run tests:** `npx vitest run` (or `npm test`)

---

## Decision Gates

| # | Gate | Status | Blocks | How to resolve |
|---|------|--------|--------|----------------|
| DG-1 | Vercel Pro upgrade (~€20/mês) for 15-min cron | ☐ Open | Cron registration | Upgrade Vercel, or accept hourly fallback |
| DG-2 | Privacy lawyer review DPIA (~€300) | ☐ Open | GDPR sign-off | Engage lawyer, send DPIA doc |
| DG-3 | DOB audit of ~150 students in Yogo | ☐ Pending | Go-live | `npx tsx scripts/strikelab-minors-audit.ts` → CSV → Marcelo fills gaps |
| DG-4 | Privacy notice URL | ✅ Resolved | — | `/privacy/strikelab` |
| DG-5 | Legacy discount grandfathering | ⏭️ Deferred | — | Phase 1 scope |

**DG-3 step-by-step:**
1. Run `npx tsx scripts/strikelab-minors-audit.ts`
2. Script outputs `strikedash_vault/StrikeLab-DOB-Missing.csv` and `StrikeLab-Minors-Audit.csv`
3. Marcelo logs into Yogo admin, updates missing DOBs
4. Re-run until `DOB-Missing.csv` is empty
5. Review `Minors-Audit.csv` for any <18 students — they need parental consent flow

**Spike status:**

| Spike | Status | Output |
|-------|--------|--------|
| 1 — Check-in timestamps | ✅ Done | `signups.checked_in` Unix ms confirmed |
| 2 — Renewal detection | ✅ Done | Snapshot-diff strategy validated |
| 3 — Discount code POST | ⏳ Pending (manual DevTools) | Non-blocking — CSV fallback for Phase 1 |
| 4 — DOB / user detail | ✅ Done | DOB optional in Yogo — audit required |

---

## Known Gotchas

1. **`pointsPeriod` is app-computed, never SQL.** Lisbon timezone via `Intl.DateTimeFormat`. Turso doesn't support `AT TIME ZONE`. If you see a SQL-generated period, it's wrong.

2. **Dunning customers show `status: "active"` in Yogo.** The `status_text` field is the truth. `classify()` handles this by checking `status_text` before `status`. The regex `/falhou|Pausado.*falhou/i` catches the known pattern.

3. **USC/ClassPass accounts are not real leads.** `isNonActionableLead()` filters `usc-*@urbansportsclub.com` and `@strikershouse.*`. Do not remove this filter. These accounts would pollute the gamification system.

4. **Yogo DOB is optional.** Spike 4 confirmed real customers have `date_of_birth: null`. Bot onboarding refuses without DOB. Passive DOB capture in class poller helps fill gaps over time.

5. **Phase 0 events all have `pointsDelta=0`.** This is intentional. Phase 1 turns on real points via a retroactive replay job. Don't change Phase 0 events.

6. **Spike 3 (coupon POST) still pending.** Manual DevTools capture needed. Non-blocking — Phase 1 has CSV fallback for discount codes.

7. **Vercel free tier = hourly cron max.** 15-min cron requires Pro upgrade. Hourly works but degrades check-in resolution (students who check in within the same hour may appear simultaneous).

8. **Identity auto-creation in class poller.** When a checked-in customer has no identity, the poller creates one with just `customerId`. Other axes (phone, email, WA) get filled later via bot onboarding or admin.

9. **`libSQL` adapter quirks.** Prisma with libSQL (Turso) doesn't support generated columns, raw SQL with `AT TIME ZONE`, or certain PostgreSQL-specific features. All app logic stays in TypeScript.

10. **Monthly snapshots are sealed, not auto-generated.** The seal operation (freezing monthly state for prizes/history) is a Phase 1 feature. The schema is ready but no code seals yet.

---

## Phase 1 Transition Plan

### What Phase 1 needs to build

| # | Feature | Depends on | Notes |
|---|---------|-----------|-------|
| 1 | `pointsPerClass` by plan | classify() (ready) | Each plan tier awards different points per class |
| 2 | Boost logic | Event log (ready) | Streak shields, first-to-check-in bonus, class variety |
| 3 | Tier system | State (ready) | Bronze/Silver/Gold/Platinum thresholds + demotion buffer |
| 4 | Monthly leaderboard | State + snapshots (ready) | Student-facing page |
| 5 | Monthly reset job | ResetAudit schema (ready) | Seal snapshot, zero monthly points |
| 6 | Retroactive replay | Event log (ready) | One-time job to recalculate all Phase 0 events with real deltas |
| 7 | Remaining 8 admin pages | Admin routes (ready) | From v3.2 spec §11 |
| 8 | Student-facing dashboard | State + leaderboard | Web page showing points, tier, streak |

### What Phase 1 does NOT need to rebuild

- ✅ Schema (6 tables already there, may need minor additions for tier config)
- ✅ Event log + state materialization (working, tested)
- ✅ Identity resolution (all 4 axes + IG verify working)
- ✅ Consent module (4 toggles working with audit)
- ✅ Yogo classify/poll helpers (battle-tested against real data)
- ✅ Cron routes (just need feature flags flipped)
- ✅ GDPR package (complete — DPIA, ROPA, lawful basis, retention, processors, privacy notice)
- ✅ Admin UI foundation (5 pages working)

### Phase 1 starting point

1. Flip `STRIKELAB_ENABLED=true` in Vercel env
2. Flip `STRIKELAB_POLL_CLASSES_ENABLED=true`
3. Flip `STRIKELAB_POLL_MEMBERSHIPS_ENABLED=true`
4. Add `pointsPerClass` configuration (by plan type)
5. Modify `materializeState()` to calculate real deltas instead of 0
6. Run retroactive replay job for all existing Phase 0 events
7. Build tier thresholds + leaderboard page

### Spec references for Phase 1

- Full gamification spec: [[StrikeLab-v3.2-final]]
- Scoring system map: [[StrikeLab-Pontuacao-Mapa]]
- Coverage matrix (what's Phase 0 vs Phase 1): [[StrikeLab-Cobertura]]
- Yogo API mapping: [[Yogo-StrikeLab-Gap-Report]]

---

## File Index — All 37 Phase 0 Files

### Library (`src/lib/`)

| File | Purpose |
|------|---------|
| `gamification/types.ts` | Type definitions (EventType union, interfaces) |
| `gamification/event-log.ts` | Idempotent event writer (`appendEvent()`) |
| `gamification/state.ts` | State materialization via replay (`materializeState()`) |
| `gamification/identity.ts` | Identity resolution — 4 axes + IG verify |
| `gamification/consent.ts` | 4-toggle consent module with audit |
| `gamification/erasure.ts` | Two-track Art. 17 GDPR erasure |
| `gamification/poll/classes.ts` | 15-min Yogo class poller |
| `gamification/poll/memberships.ts` | Daily membership sweep with diff detection |
| `gamification/poll/shared.ts` | Shared polling utilities (Yogo fetch helpers) |
| `yogo/classify.ts` | 7-state membership classifier |
| `yogo/pick-best-membership.ts` | Multi-membership priority resolver |
| `yogo/non-actionable-lead.ts` | Aggregator/USC/internal account filter |
| `wa/handlers/strikelab-onboard.ts` | WhatsApp onboarding state machine |

### API Routes (`src/app/api/`)

| File | Purpose |
|------|---------|
| `cron/strikelab-poll-classes/route.ts` | 15-min class poller cron endpoint |
| `cron/strikelab-poll-memberships/route.ts` | Daily membership sweep cron endpoint |
| `strikelab/admin/route.ts` | Student list/search endpoint |
| `strikelab/admin/[customerId]/route.ts` | Per-student detail endpoint |
| `strikelab/admin/adjust-points/route.ts` | Manual points adjust endpoint |
| `strikelab/admin/pause/route.ts` | Pause flags endpoint |
| `strikelab/erasure/route.ts` | GDPR erasure endpoint |

### Admin UI (`src/app/dashboard/strikelab/`)

| File | Purpose |
|------|---------|
| `page.tsx` | Student list/search page |
| `[customerId]/page.tsx` | Per-student detail (state + events) |
| `[customerId]/adjust/page.tsx` | Points adjust with reason |
| `[customerId]/pause/page.tsx` | Pause flags (medical/vacation/personal) |
| `erasure/page.tsx` | GDPR erasure handler page |
| `reset-audit/page.tsx` | Monthly reset audit log viewer |

### Public (`src/app/`)

| File | Purpose |
|------|---------|
| `(public)/privacy/strikelab/page.tsx` | Public privacy notice (pt-PT) |

### Tests (`tests/`)

| File | Purpose |
|------|---------|
| `lib/gamification/phase0-acceptance.test.ts` | Full happy path e2e |
| `lib/gamification/identity.test.ts` | Identity resolution tests |
| `lib/gamification/consent.test.ts` | Consent toggle tests |
| `lib/gamification/state.test.ts` | State materialization tests |
| `lib/gamification/erasure.test.ts` | GDPR erasure tests |
| `lib/gamification/event-log.test.ts` | Event log tests |
| `lib/gamification/poll/memberships.test.ts` | Membership sweep tests |
| `lib/gamification/poll/classes.test.ts` | Class poller tests |

### Scripts

| File | Purpose |
|------|---------|
| `scripts/strikelab-minors-audit.ts` | DOB completeness audit (outputs CSV) |

### Prisma

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | 6 gamification models added |
| `prisma/migrations/20260529081427_strikelab_foundations/` | Migration SQL |

---

## Related Vault Notes

- [[StrikeLab-v3.2-final]] — Final approved spec (35 decisions + 17 patches)
- [[StrikeLab-Pontuacao-Mapa]] — Complete scoring system reference
- [[StrikeLab-Cobertura]] — Coverage matrix (141 items mapped)
- [[StrikeLab-Phase-0-Decisions]] — Decision gates tracker (DG-1 through DG-5)
- [[StrikeLab-Phase-0-Core-Engine]] — Technical implementation detail (Tasks 1-9) — *this handoff supersedes the detail sections*
- [[StrikeLab-Fluxo.canvas|StrikeLab-Fluxo]] — Visual flow canvas
- [[Yogo-StrikeLab-Gap-Report]] — API mapping validated with real data
- [Phase 0 Final Plan](../docs/superpowers/plans/2026-05-28-strikelab-phase-0-final.md) — 21 tasks, ~37h (the executed plan)
