# StrikeLab Phase 0 — Foundations Final Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [[StrikeLab-v3.2-final]] (`strikedash_vault/StrikeLab-v3.2-final.md`)
**API mapping:** [[Yogo-StrikeLab-Gap-Report]]
**Supersedes:** `2026-05-28-strikelab-phase-0-foundations-plan.md` (v3.1 plan pre-spikes)

**Goal:** Ship the foundational infrastructure for StrikeLab gamification — storage schema, identity resolution (phone+email+IG), Yogo polling with classify() gating, opt-in/consent flow, base admin UI, and GDPR documentation — so Phase 1 (MVP gamification) can build on top without re-doing plumbing.

**Architecture:** Append-then-materialize. Every state change writes an immutable row to `gamification_event_log` with an `idempotency_key`; deterministic replay computes `gamification_state` (materialized view). Yogo polled every 15min (classes) + daily (memberships) since no webhooks exist. Identity links Yogo `customer_id` ↔ phone ↔ email ↔ WhatsApp ↔ optional verified IG. Every credit gated by `classify(membership) === "active"` (dunning/pause-safe). Admin UI is a read+intervene layer over it.

**Tech Stack:** Next.js 15 App Router · React 19 · TypeScript strict · Prisma + libSQL adapter (Turso prod, SQLite local) · Tailwind v4 · Vitest · Vercel Pro assumed (DG-1).

---

## 📊 Yogo API ↔ StrikeLab capability matrix

| # | Capability | Yogo endpoint | Status | Spike validation |
|---|---|---|---|---|
| 1 | List active subs (bulk) | `POST /reports/customers` + `hasMembershipOrClassPass` filter | ✅ OK | Existing code |
| 2 | Lookup by phone | `findCustomerByPhone()` (60s cache) | ✅ OK | Existing |
| 3 | Lookup by email | needs new index — Spike 4 found phone can be null | 🔧 BUILD | Phase 0 Task 5 |
| 4 | Class signups + check-in time | `GET /classes?populate[]=signups.user` | ✅ OK | Spike 1: `checked_in` Unix ms confirmed |
| 5 | Order "first to check-in" | `MIN(signups.checked_in)` ASC | ✅ OK | Spike 1: 5-21s resolution between students |
| 6 | Membership list w/ status_text | `POST /reports/memberships-list {}` | ✅ OK | Spike 2: 149 rows, 20 fields confirmed |
| 7 | Detect renewal | Diff `paid_until` between daily snapshots | ✅ OK (snapshot-diff) | Spike 2 — `last_renewed_at` doesn't exist; diff strategy needed |
| 8 | Detect dunning | Regex `/falhou\|Pausado.*falhou/i` on `status_text` | ✅ OK | Spike 2: real case user_id 1174940 found |
| 9 | Classify true state (paused/dunning/active/etc.) | `classify()` recipe from skill | ✅ OK | Skill canonical |
| 10 | Multi-membership user → real plan | `pickBestMembership()` recipe | ✅ OK | Skill canonical |
| 11 | Filter aggregator/USC accounts | `isNonActionableLead()` regex on email | ✅ OK | Skill canonical |
| 12 | Date of birth (minors audit) | `date_of_birth` in `/users/{id}` populated | ⚠️ PARTIAL | Spike 4: optional field, real customer (Natali) has it `null`. Audit task required |
| 13 | Discount codes (read) | `GET /discount-codes` | ✅ OK | — |
| 14 | Discount codes (create programmatically) | `POST /discount-codes` (undocumented) | ⏳ PENDING SPIKE 3 | Fallback CSV documented |
| 15 | Class signups (book/cancel) | `POST /class-signups` / `DELETE /class-signups/{id}` | ✅ OK (existing) | — |
| 16 | Revenue YTD | `POST /graphql revenueReport` | ✅ OK (existing) | Not used by StrikeLab |

**No full-scan per-customer queries.** All Yogo touches are bulk endpoints or single-id lookups triggered by bot events.

---

## Decision Gates

| # | Gate | Default | Blocks task |
|---|---|---|---|
| DG-1 | Vercel Pro upgrade (15-min cron) | Assumed yes | Task 12 cron registration — fallback hourly in §15 |
| DG-2 | DPO designation | Lawyer review ~€300, no DPO contracted | Task 18 DPIA signatory |
| DG-3 | Existing minors on subscriber base | Audit (Task 16) | Task 14 onboarding copy |
| DG-4 | Privacy notice URL | `/privacy/strikelab` | Task 19 |
| DG-5 | Legacy discount grandfathering | Deferred → Phase 1 | Out of scope |

---

## Tasks (20 — final)

### Task 1 — Decisions log + env scaffold (0.5h)

Same as v1 plan. Captures DG-1, DG-2 status in `strikedash_vault/StrikeLab-Phase-0-Decisions.md` and adds `STRIKELAB_*` flags to `.env.example`. Default state: all gating flags `false`.

### Task 2 — Prisma schema: 5 gamification tables + 1 yogo snapshot (1.5h)

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<NNNN>_strikelab_foundations/migration.sql`

Models (5 + 1 = 6):
- `GamificationIdentity` — with `instagramHandle`, `igVerifiedAt`, `igChallengeCode`, `consentTraining/Ugc/RealName/Broadcasts`, `birthYear` (filled from Yogo DOB during onboarding), 3 pause fields, `erasedAt`
- `GamificationEventLog` — `eventId`, `customerId`, `eventType`, `pointsDelta`, `xpDelta`, `payloadJson`, `source`, `operatorId`, `idempotencyKey @unique`, `pointsPeriod`, `createdAt`
- `GamificationState` — `monthlyPoints`, `lifetimeXp`, `currentTier`, `proposedTier`, `currentStreakDays`, `streakShieldAvailable`, `shieldResetForMonth`, `lastClassAt`, `lastReplayedEventId`
- `GamificationMonthlySnapshot` — `(customerId, pointsPeriod) @unique`, `monthlyPoints`, `xpAtPeriodEnd`, `classesInPeriod`, `finalTier`, `sealedAt`
- `GamificationResetAudit` — `resetId @id`, `resetPeriod`, `status`, `batchesApplied`, `customersZeroed`, `startedAt`, `completedAt`
- **`YogoMembershipSnapshot`** — `(userId, snapshotDate) @id`, `membershipTypeId`, `membershipTypeName`, `paidUntil`, `nextPaymentDate`, `status`, `statusText`, `capturedAt`

> **Critical:** NO generated columns. `pointsPeriod` is computed in app code at insert time via `Intl.DateTimeFormat` with timezone `Europe/Lisbon`. libSQL doesn't support `AT TIME ZONE`.

Tests: `tests/lib/gamification/schema.test.ts` — smoke insert/delete on each table.

### Task 3 — Idempotent event log writer (1.5h)

Same as v1 plan. `src/lib/gamification/event-log.ts` with `appendEvent()` that returns `{written: bool, eventId?}`. Duplicate `idempotency_key` → silent no-op via Prisma P2002 catch.

### Task 4 — State materialization (replay) (1.5h)

Same as v1. `src/lib/gamification/state.ts` with `materializeState(customerId)`.

### Task 5 — Identity resolution (phone + EMAIL + IG verify) (2.5h — was 2h)

**PATCH P16 applied:** add email as second lookup eixo.

**Files:**
- Create: `src/lib/gamification/identity.ts`
- Create: `tests/lib/gamification/identity.test.ts`

Public surface:
```ts
upsertIdentity({ customerId, phoneE164, email, whatsappWaId? })
findByPhone(phoneE164): Identity | null
findByEmail(email: string): Identity | null   // NEW (P16)
findByWaId(whatsappWaId): Identity | null
findByCustomerId(customerId): Identity | null
generateIgChallenge(customerId): Promise<string>
verifyIgChallenge({ customerId, code, igHandle }): { ok, reason? }
```

Email normalisation: lowercase, trim, strip dots from gmail local parts (optional — discuss).

### Task 6 — Consent module (1h)

Same as v1 — 4-toggle consent with `consent_changed` audit event.

### Task 7 — Yogo classify() + pickBestMembership + isNonActionableLead helpers (1.5h) [NEW]

**PATCH B1, B2, B3, B4 applied** — pull the canonical recipes from the skill into our codebase.

**Files:**
- Create: `src/lib/yogo/classify.ts`
- Create: `src/lib/yogo/pick-best-membership.ts`
- Create: `src/lib/yogo/non-actionable-lead.ts`
- Create: `tests/lib/yogo/classify.test.ts` (covers all 7 states + real case user_id 1174940)

Copy verbatim from `recipes.md` (linha 162-179 classify, 199-215 pickBestMembership, 147-153 isNonActionableLead). These are battle-tested.

Critical test: the real Spike 2 case must classify as `"paused"`:
```ts
const m = {
  status: "active",
  status_text: "Pausado. Renovação automática falhou 4 vezes.",
  paid_until: "2026-03-31",
  next_payment: { date: "2026-04-01" }
};
expect(classify(m, "2026-05-28")).toBe("paused");
```

### Task 8 — Yogo class poll (15-min) + DOB capture + classify gate (2.5h)

**PATCH P14 + P15 applied.**

**Files:**
- Create: `src/lib/gamification/poll/classes.ts`
- Create: `src/lib/gamification/poll/shared.ts`
- Create: `tests/lib/gamification/poll/classes.test.ts`

Behaviour:
1. `GET /classes?startDate=today&populate[]=signups.user&populate[]=class_type`
2. For each signup with `checked_in > 0`:
   - Lookup identity (by customer_id)
   - If no identity → skip (`skippedNoIdentity++`)
   - If identity has `erasedAt !== null` → skip
   - If identity opted-out → skip (`skippedOptOut++`)
   - **Spike 4 capture:** if `signups.user.date_of_birth` is non-null AND `identity.birthYear` is null → update `identity.birthYear` (passive DOB capture)
   - Lookup customer's current membership (via daily yogo_membership_snapshot)
   - **PATCH P14 gate:** if `classify(membership) !== "active"` → skip credit (still emit `checkin_observed` with `pointsDelta=0` for audit)
   - emit `checkin_observed` with idempotency `checkin:{customerId}:{classId}`
   - Phase 0: `pointsDelta=0`; Phase 1 will calculate from plan + boosts.

Tests cover:
- Idempotent re-polling produces 0 new events
- Erased customer skipped
- Dunning customer (real Spike 2 case) emits event with pointsDelta=0
- DOB captured passively

### Task 9 — Yogo memberships sweep (daily) + snapshot diff (3h — was 1.5h)

**PATCH P17 applied: dunning detector.**

**Files:**
- Create: `src/lib/gamification/poll/memberships.ts`
- Create: `tests/lib/gamification/poll/memberships.test.ts`

Behaviour:
1. `POST /reports/memberships-list {}` (149 rows on Strike House — Spike 2 confirmed)
2. For each row:
   - Identity lookup
   - Pipe through `isNonActionableLead` (filter aggregator/USC accounts)
   - **Snapshot diff** vs `yogo_membership_snapshot` row from previous day:
     - `paid_until` advanced ≥25 days → emit `subscription_renewed`
     - `status` changed to `ended` → emit `subscription_cancelled`
     - `status_text` newly matches `/falhou|Pausado.*falhou/i` → emit **`dunning_detected`** (P17) with 0 pts + admin alert
   - Upsert today's snapshot row

Tests cover:
- New customer first observation produces 0 trigger events (no diff yet)
- `paid_until` advance produces renewed
- `status_text` "Pausado. Renovação automática falhou 4 vezes" newly observed → dunning_detected
- Idempotent: same snapshot twice produces 0 new events

### Task 10 — Cron routes for both pollers (1h)

Same as v1. Two routes with bearer auth + feature flag gates:
- `src/app/api/cron/strikelab-poll-classes/route.ts` — gated by `STRIKELAB_POLL_CLASSES_ENABLED` + operating hours
- `src/app/api/cron/strikelab-poll-memberships/route.ts` — gated by `STRIKELAB_POLL_MEMBERSHIPS_ENABLED`

### Task 11 — Update vercel.json crons (0.5h)

Add:
```json
{ "path": "/api/cron/strikelab-poll-classes", "schedule": "*/15 * * * *" },
{ "path": "/api/cron/strikelab-poll-memberships", "schedule": "0 2 * * *" }
```

**DG-1 GATE** — if Vercel Pro denied, fall back:
```json
{ "path": "/api/cron/strikelab-poll-classes", "schedule": "0 * * * *" }
```
+ adjust bot copy: "vencedores anunciados todas as horas em ponto".

### Task 12 — Bot onboarding handler — DOB enforcement (3h — was 3h, same)

**PATCH P15: refuse onboarding if Yogo DOB is null.**

**Files:**
- Create: `src/lib/wa/handlers/strikelab-onboard.ts`
- Modify: `src/lib/wa/dispatch.ts`
- Create: `tests/lib/wa/handlers/strikelab-onboard.test.ts`

State machine:
```
IDLE → "strikelab" → CHECK_DOB
  ↓
  if no identity OR no Yogo customer → "fala com o Marcelo"
  if Yogo customer.date_of_birth IS NULL → 
    "Para participares preciso de confirmar a tua idade. Fala com o Marcelo na recepção, ele actualiza no Yogo e depois escreves 'strikelab' outra vez."
  if DOB < 13yr → "Lamentamos — o StrikeLab é para idades 13+"
  if 13 ≤ DOB < 18 → AWAIT_PARENTAL_CONSENT
  else → AWAIT_CONSENT_TRAINING
↓
[4 toggles consent flow]
↓
IDLE (concluído)
```

Tests cover DOB null → refusal, DOB <13 → exclusion, DOB 13-17 → parental flow, DOB ≥18 → 4 toggles.

### Task 13 — Erasure flow (Art. 17 — two-track) (2.5h — was 2h)

**PATCH P5 applied: two-track erasure.**

Track A (default, fast): tombstone identity, anonymise event log payloads, zero state, audit event.
Track B (≥12 months after Track A, operator-initiated): hash customer_id everywhere, delete identity row.

**Files:**
- Create: `src/lib/gamification/erasure.ts`
- Create: `src/app/api/strikelab/erasure/route.ts`
- Create: `tests/lib/gamification/erasure.test.ts`

### Task 14 — Admin: per-student view (3h)

Same as v1 plan. List/search + `[customerId]` detail showing identity, state, last 50 events. Admin role guard.

### Task 15 — Admin: manual points adjust + pause flags + reset audit (3h — combined)

Same as v1 plan, condensed into one task (3 ecrãs already similar shape).

### Task 16 — Minors audit script + DOB enforcement audit (2h — was 1.5h)

**Spike 4 finding driven.**

**Files:**
- Create: `scripts/strikelab-minors-audit.ts`
- Create: `strikedash_vault/StrikeLab-Minors-Audit.csv` (gitignored, generated)

Behaviour:
1. Fetch all active subscribers via `POST /reports/customers + hasMembershipOrClassPass(ALL_SUB_IDS, true)`
2. For each one missing DOB (we know from Spike 4 this CAN happen):
   - Output to `strikedash_vault/StrikeLab-DOB-Missing.csv`
3. For those with DOB:
   - Compute age, flag minors → `strikedash_vault/StrikeLab-Minors-Audit.csv`

Ricardo runs this BEFORE go-live. Marcelo updates Yogo to fill missing DOBs. **Phase 0 launch gated on:** "all active subscribers have DOB populated OR documented exception".

### Task 17 — Spike 3 (coupon POST) capture (manual, 0.5h Ricardo)

Manual DevTools — see `strikedash_vault/yogo-spikes/SPIKE-3-MANUAL.md`. Not blocking Phase 0. If captured before Phase 1: enables programmatic discount code creation. If not: Phase 1 ships with CSV fallback.

### Task 18 — DPIA + ROPA + Retention + Lawful Basis + Processor Agreements (3h)

**DG-2 GATE** — DPIA signatory (Ricardo + privacy lawyer ~€300 review).

Same as v1 plan. 5 GDPR docs in `strikedash_vault/gdpr/`.

### Task 19 — Privacy notice page (pt-PT) (1h)

Same as v1. `src/app/(public)/privacy/strikelab/page.tsx` rendering `strikedash_vault/gdpr/Privacy-Notice-StrikeLab.md`. **Updates from P5:** Track A erasure honestly labeled as pseudonimização.

### Task 20 — Phase 0 acceptance test (1.5h)

End-to-end test exercising the full pipe:

```ts
it("Phase 0 acceptance — full happy path with classify gate", async () => {
  // 1. Create identity with DOB filled
  // 2. Capture consent (training=true)
  // 3. IG verify via challenge code
  // 4. Daily membership snapshot captures membership in active state
  // 5. Class poll observes check-in
  //    - classify === "active" → pointsDelta=0 event still recorded
  // 6. Materialize state
  // 7. Insert a dunning row in memberships poll → classify changes to "paused"
  // 8. Next class poll for same customer skips credit (pointsDelta=0 with skipped=true in payload)
  // 9. Erasure → state zeroed, identity tombstoned
});
```

### Task 21 — Rollout checklist + The Vault links update (0.5h)

`strikedash_vault/StrikeLab-Phase-0-Rollout.md` (updated from v1):
- DG-1 confirmed
- DG-2 confirmed (lawyer review done)
- DG-3 audit complete (DOB filled for all active subs OR exceptions documented)
- Spike 3 status (captured or fallback CSV)
- Vercel env vars set
- Privacy notice live
- All DPAs signed
- Turso prod ready
- Smoke test passed

Plus update `The Vault.md` with all artefacts linked.

---

## Estimates

| Block | Tasks | Hours |
|---|---|---|
| Setup + schema | 1, 2 | 2h |
| Storage primitives | 3, 4 | 3h |
| Identity + consent | 5, 6 | 3.5h |
| Yogo helpers (classify) | 7 | 1.5h |
| Polling + cron | 8, 9, 10, 11 | 7h |
| Bot onboarding | 12 | 3h |
| Erasure | 13 | 2.5h |
| Admin UI | 14, 15 | 6h |
| Audit + spikes | 16, 17 | 2.5h |
| GDPR docs | 18, 19 | 4h |
| Acceptance + rollout | 20, 21 | 2h |
| **Total** | **21 tasks** | **~37h** |

≈ **2.5 calendar weeks** at typical pace (15h/sem coding).

---

## Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Yogo `/reports/memberships-list` schema drifts in future Yogo update | `classify()` defensively handles unknown statuses; snapshot fields are nullable |
| R2 | Vercel Pro denied (DG-1) | Hourly fallback documented in vercel.json + bot copy adjustment |
| R3 | DOB audit reveals many missing (Spike 4 suggests this is real) | Marcelo manual fill in Yogo admin UI; ~30-min one-shot before launch |
| R4 | Dunning case not exactly matching regex `/falhou\|Pausado.*falhou/i` | Test against full sample of memberships during Task 9; refine regex if needed |
| R5 | IG verification code expiry too short (30min) | Tune via `.env` if dropout observed in onboarding |
| R6 | Spike 3 never captured before Phase 1 | CSV fallback documented, Marcelo accepts 30-min/mês overhead until captured |

---

## Self-review

**Spec coverage (§ from v3.2-final):**

| §  | Spec deliverable | Plan task |
|---|---|---|
| §2.1 | Turso schema (5 tables + yogo snapshot) | Task 2 ✓ |
| §2.2 | Identity phone+email+IG | Task 5 ✓ |
| §2.3 | Polling 15min + daily | Tasks 8, 9, 10, 11 ✓ |
| §2.4 | classify() gate | Task 7 + Task 8 ✓ |
| §2.5 | Monthly reset (idempotent) | Phase 1 — schema ready in Task 2 |
| §3 | Dual ledger + erasure | Tasks 3, 4, 13 ✓ |
| §5 | Triggers — only `checkin_observed` shell in Phase 0 | Task 8 ✓ (no pointsDelta logic yet) |
| §10.2 | Opt-in 4 toggles | Tasks 6, 12 ✓ |
| §10.3 | Minors / parental | Task 12 (refuse if no DOB) + Task 16 audit ✓ |
| §10.4 | Erasure 2-track | Task 13 ✓ |
| §11 | 13 admin UI screens | Tasks 14, 15 ship the 5 critical MVP ones (per-student, adjust, pause, erasure, reset-audit) — remaining 8 in Phase 1 |
| §14 | Open questions | All resolved (table above) |

**Patches applied:**
- P1 (adaptive prizes) — schema-ready in Task 2; logic in Phase 1
- P3 (no 30-min lock heuristic) — schema design includes unique constraint approach
- P4 (boost scope) — N/A Phase 0 (no boost logic yet)
- P5 (two-track erasure) — Task 13 ✓
- P9 (UGC consent not contract) — Task 19 privacy notice + lawful basis register ✓
- P10 (Champions League no-exclusion) — N/A Phase 0
- P11 (no generated columns) — Task 2 ✓
- P13 (lawyer review ~€300) — Task 18 ✓
- P14 (classify gate) — Tasks 7, 8 ✓
- P15 (DOB enforcement) — Task 12 ✓ + Task 16 ✓
- P16 (email as identity eixo) — Task 5 ✓
- P17 (dunning_detected trigger) — Task 9 ✓
- B1-B4 (skill recipes) — Task 7 ✓

**Type consistency:** `customerId: number` throughout. `pointsPeriod: "YYYY-MM"` always app-computed. `EventType` union frozen in `src/lib/gamification/types.ts`.

**Cuts from v1 plan:**
- v1 task "Phase 0 Yogo schema spike" → completed inline (this convergence)
- v1 separate tasks for `pause` + `manual adjust` + `reset audit` → merged into Task 15
- v1 task for `early_renewal` → removed (D38)

**Open clarifications:**
- Spike 3 deliberately not on critical path (Task 17 is Ricardo manual, doesn't block other tasks)
- Phase 0 does NOT credit any points (`pointsDelta=0` everywhere). Phase 1 turns the meter on with plan-aware pointsPerClass.
