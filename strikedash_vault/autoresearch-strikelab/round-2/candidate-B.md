---
title: StrikeLab v3.2-final — Round 2 Synthesis Patches
type: design
status: synthesis (inline, not cold-start agent)
parent: candidate-A.md (Round 2 Author-A output)
critique: critique.md (Round 2 adversarial)
created: 2026-05-28
honesty_disclaimer: |
  This file was produced inline by the main context, not by an isolated cold-start
  subagent (weekly agent budget exhausted until 2026-05-30 10:00 Europe/Lisbon).
  The reason workflow's "context isolation invariant" is broken from here on.
  Treat this as a transparent synthesis attempt, not a blind challenger.
---

# v3.2-final — Targeted Patches to v3.2-pre

> Read first: `candidate-A.md` (v3.2-pre, 3992 words) and `critique.md` (13 weaknesses). This file does NOT restate the full spec. It applies the smallest changes needed to address the FATAL + MAJOR weaknesses without losing v3.2-pre's gains.

## Honesty about process

- v3.1 (Round 1 winner) → v3.2-pre (Round 2 Author-A) was a genuine improvement: economic break-even attempted, all 8 open questions decided, /postei UGC path, two engagement triggers (early_renewal, comeback), frozen event-type enum.
- The adversarial critic then found 1 FATAL + 9 MAJOR + 3 MINOR in v3.2-pre.
- This file resolves them. No fake "blind synthesis" — just the corrections, with the reasoning.

---

## Patches (one per weakness)

### Patch 1 — FATAL: §4.3 economic model collapse under success

**Problem (W1):** The break-even table assumes static behavior at N=150 with 38 winners/mo. Under success (40% opt-in + learning effect) Bronze threshold 2,500pts becomes a participation prize for ~50% of subscribers → cost doubles. "6% of MRR" anchor breaks.

**Patch:**

Replace §4.3 with a **dynamic budget** that floats with engagement:

```
prize_budget_pct_of_mrr = 5%   # hard ceiling
trigger_threshold       = if any month's actual_prize_cost > 6% of MRR, apply pressure

Pressure mechanism (auto, no Marcelo decisions):
  bronze_threshold_next_month = max(2500, current * 1.10)   # raise by 10%
  silver_threshold_next_month = max(5000, current * 1.10)
  ...
  Caps adjust monthly until prize_cost <= 5% MRR for 3 consecutive months,
  then thresholds freeze.
```

Add to §4.3:

> **Self-tuning prize economy.** Thresholds are not constants. If month N's total prize cost exceeds 6% MRR, all four thresholds rise 10% for month N+1. If three consecutive months are under 5%, thresholds freeze. Students see the next-month threshold a week before the month ends (via bot command `/limiares`). This converts the model from "static at small N" to "adaptive under any growth path" — the implementer ships with `bronze=2500` but the system never gets stuck giving Bronze to 50% of the base.

This addresses W1 directly. The "honest accounting" claim becomes self-enforcing.

---

### Patch 2 — MAJOR: §2.5 snapshot vs streak semantics contradiction

**Problem (W2):** Spec conflates monthly_points zeroing with streak attribution. Streak counter ownership and zeroing rules are unspecified.

**Patch:** Insert a clarification at top of §5.3:

```
## §5.3.0 Streak counter ownership

The streak counter lives in `gamification_state.current_streak_days`.

- Streak counter does NOT zero at monthly reset. It is a continuous timeline
  property, not a points-period property.
- Streak break is computed from `last_class_at` (also on gamification_state):
  if (today_lisbon - last_class_at_lisbon_date) > shield_grace_days_remaining,
  streak resets to 0 in a single transaction (no batching, no cron — happens
  on the next event-log replay for that customer).
- The monthly_points_snapshot only freezes monthly_points totals for the
  closing month. Streak state passes through untouched.
```

Then remove the misleading rhetorical sentence from §2.5 ("eliminates the entire class of streak-broke-because-timezone bugs"). That claim was already untrue for the snapshot — it's true for the §5.3.0 rule above.

---

### Patch 3 — MAJOR: §2.5 advisory lock without fencing

**Problem (W3):** "If running row > 30 min old, proceed" is unsafe — Vercel cold starts can stall longer; two writers could race against `monthly_points_snapshot`.

**Patch:** Replace the 30-min heuristic with a Turso-native fencing token:

```
Reset cron acquisition:
  1. Try INSERT INTO reset_run (reset_id, status, started_at) VALUES (uuid, 'running', now())
     If insert succeeds, this caller is the writer. Carry reset_id as fencing token.
  2. If insert fails (PK conflict on a non-existent reset_id is impossible —
     but on a unique constraint on `status='running'` it would fail):
        → exit immediately, log "already running", no further action.

Idempotency at write time:
  Every INSERT into monthly_points_snapshot uses ON CONFLICT(customer_id, points_period) DO NOTHING.
  Every UPDATE to gamification_state during reset uses WHERE pointsZeroedAtResetId IS NULL
  OR pointsZeroedAtResetId = <this reset_id>.

If reset crashes mid-flight:
  - reset_run.status stays 'running' forever (does NOT auto-recover).
  - Marcelo sees an alarm in the reset audit screen ("Reset 2026-05-01 stuck").
  - Marcelo manually completes via a 'Force complete' button that explicitly
    accepts the risk and writes status='force_completed' with operator id.
  - The system never auto-decides a stalled run is dead.
```

Why this is better: removes the "30 min = dead" guess, makes recovery a human decision with audit, no fencing token needed because the unique-constraint+ON CONFLICT pattern makes every batch idempotent.

---

### Patch 4 — MAJOR: §4.2 stacking cap math contradiction

**Problem (W4):** Worked example gives 4,500–6,000 but delta-sum math actually yields ~7,700. Either the cap is misapplied, the formula is wrong, or the example is wrong.

**Patch:** The DELTA-SUM formula is correct (it's the v3.1 invariant we kept). The worked example was wrong. Replace §4.2 worked example with:

```
Worked example — P8, renewal month, perfect weekend with streak_10 active:

Base points for the weekend's 2 classes:                  2 × 110 = 220
P8 perfect-week bonus (≥2 classes/wk):                            +300
Full plan bonus (if reached this weekend):                        +600
Renewal trigger one-shot:                                         +350
                                                          ──────────────
Subtotal (before boosts):                                   1,470

Boost stack active at the time of the classes:
  weekend (1.8) + renovacao (1.5) + streak_10 (1.6) = deltas 0.8 + 0.5 + 0.6
  Effective multiplier = min(1.0 + 1.9, 3.0) = 2.9 (under cap)

  But: boosts apply ONLY to checkin pointsDelta, NOT to one-shot bonuses
  (perfect-week, full-plan, renewal). One-shots are flat.

Boosted contribution: 220 × 2.9 = 638
Flat contributions:   300 + 600 + 350 = 1,250
                      ─────────────────────
Total for that weekend in a renewal month:  1,888 pts

Realistic monthly total for a maxed P8 in a renewal month: ~3,200–4,500 pts.
The hard cap on monthly_points (any source) is the boost cap reflected
through pointsDelta — it cannot exceed 3.0× the unboosted training base.
```

This clarifies the previously hidden invariant: **boosts apply to checkin points only, not to one-shots.** Without this rule, a renewal week with three one-shots would have been over 7,700 — economically untenable. With this rule, a maxed P8 lands honestly in the 3-4k range.

Insert this rule into §6 explicitly:

```
§6.5 Boost scope (NEW)
- Boost multipliers apply to: pointsDelta from `checkin_observed` events.
- Boosts do NOT apply to: full_plan_completion, perfect_week, p8_milestone,
  p12_milestone, livre_milestone, renewal_processed, supera_teu_ritmo,
  referral_*, manual_adjustment, weekly_challenge_won.
- Rationale: prevents stacking from compounding one-shot bonuses into the cap
  ceiling; keeps the worst-case predictable.
```

---

### Patch 5 — MAJOR: §3.2 erasure is pseudonymization theatre

**Problem (W5):** Retaining `customer_id` (= Yogo customer_id, which is PII) across event log + state + Yogo system makes the "tombstoned" identity trivially re-identifiable. Under WP29/EDPB this is pseudonymization, not anonymization.

**Patch:** Replace §3.2 with honest pseudonymization labeling + a true anonymization path:

```
§3.2 Erasure flow (revised)

Two-track erasure:

Track A — "Forget me from StrikeLab" (default request):
  - Tombstone gamification_identity (PII fields nulled).
  - Zero gamification_state.
  - REWRITE gamification_event_log payloads to drop all PII fields
    (handles, names, message text). Numeric deltas preserved.
  - Public broadcasts: redact in-place where possible.
  - This is PSEUDONYMIZATION, not anonymization. The customer_id link to
    Yogo remains. The student CAN be re-identified by anyone with Yogo access.
  - Documented honestly in the privacy notice §10.4 as such.

Track B — "Full anonymization for analytics" (operator action, ≥12 months
since erasure request):
  - Replace customer_id in all gamification tables with a stable hash
    `sha256(customer_id || pepper)`.
  - Update gamification_identity → DELETE row entirely.
  - The link to Yogo is severed at the StrikeLab side. Yogo retains its
    own customer record under its own retention policy (out of scope for
    StrikeLab).

Retention of erasure_applied audit:
  - 3 years (was 5). Justification: defending against false erasure-completion
    claims; aligned with PT civil-claims limitation (3 years).
  - LIA: documented in Lawful-Basis-Register.

Privacy notice §10.4 updated to say:
  "Apagar-te do StrikeLab remove o teu perfil de gamificação. Os teus dados
  no Yogo (subscrição, presenças) seguem a política de privacidade do Yogo,
  separada desta — pede ao Marcelo ou contacta o Yogo directamente para
  apagar essa parte. Após 12 meses, removemos também o teu ID interno por
  inteiro (anonimização completa do lado do StrikeLab)."
```

This addresses the GDPR theatre charge honestly. Students who want full erasure get a real path; students who just want out of StrikeLab get fast removal.

---

### Patch 6 — MAJOR: §7 over-engineered for N=150

**Problem (W6):** Elaborate atomic selection algorithm for 3-5 winners/week is over-engineering. Also `winners_max` never specified.

**Patch:** Simplify §7 selection to a deterministic post-hoc query (no atomic locking, no Yogo timestamp tie-breaking complexity):

```
§7.4 Weekly Challenge winner selection (revised — simpler)

Challenge has a public window (e.g. Wed 12:00 → Sun 23:59). At Mon 06:00
Lisbon a single cron job runs:

  SELECT customerId, MIN(createdAt) AS first_checkin
  FROM gamification_event_log
  WHERE eventType = 'checkin_observed'
    AND createdAt BETWEEN window_start AND window_end
    AND customerId IN (SELECT customerId FROM gamification_identity WHERE consentTraining = true)
  GROUP BY customerId
  ORDER BY MIN(createdAt) ASC
  LIMIT winners_max

Winners are written as `weekly_challenge_won` events with idempotency_key =
"challenge:<challenge_id>:<customerId>". Pointing the same customer twice for
the same challenge is impossible by idempotency. Re-running the Monday cron
is safe.

winners_max defaults:
  flash_checkin: 5
  story_theme:   5
  aula_lotada:   1
  combo_surpresa: unlimited (everyone who reports during the named class)
  hora_h:        unlimited (everyone who attends the named class)

Marcelo can override winners_max per-challenge via the admin UI before the
window opens (default override audit-logged).
```

This drops the "race-free atomic SELECT with Yogo timestamps" complexity. At N=150 the simple post-window cron is correct and trivial to reason about.

---

### Patch 7 — MAJOR: §12 capacity estimate optimism

**Problem (W7):** Phase 1 estimate of 60h for 16 deliverables = 3.75h each is unrealistic.

**Patch:** Replace §12 timeline with:

```
§12 Phased rollout (revised — honest)

Phase 0 (Foundations):       2-3 calendar weeks, ~33h coding
Phase 1 (MVP gamification):  5-6 calendar weeks, ~110h coding
Phase 2 (UGC + Social):      3-4 calendar weeks, ~50h coding
Phase 3 (V2 deferred items): not estimated here

Total MVP shipping: 10-13 calendar weeks (not 8). Reasoning:
- Phase 1 has 16 deliverables that each include schema work, business logic,
  admin UI surface, tests, deploy verification, and Marcelo handoff. 7h/each
  is realistic, not 3.75h.
- Phase 2 needs ManyChat integration spike + Instagram OAuth or oEmbed path —
  unknown unknowns warrant a 50% buffer.
- Phase 0 is comfortable at 33h because the architecture decisions are
  already made (see this spec).

The original 8-week target assumed best-case execution with no Yogo API
surprises. Move it to 12 weeks as a planning baseline; if it ships in 10,
we celebrate.
```

---

### Patch 8 — MAJOR: §2.3 Yogo timestamp field assumption

**Problem (W8):** `yogo.check_in_recorded_at` is asserted but never demonstrated. If Yogo doesn't expose precise timestamps, the "race-free under polling lag" claim collapses.

**Patch:** Add a Phase 0 spike to validate Yogo response shape BEFORE Phase 1 commits to the architecture:

```
§2.3 Yogo poll strategy (revised — add validation gate)

Phase 0 Task 0a (BLOCKING): Yogo schema spike (~2h)
- Hit /classes?startDate=today&populate[]=checkins on the live tenant.
- Confirm every check-in record has:
  - customer_id (int)
  - A timestamp field with resolution finer than the class start time
- If timestamps are absent OR rounded to class start:
  - winner selection in §7.4 falls back to creation-order (event_id ASC).
  - "First-N" challenges lose their wall-clock fairness — document this in
    bot copy ("vence quem entrar primeiro no sistema, não necessariamente
    quem fizer fisicamente check-in primeiro").
  - This is acceptable for the academy's scale; we don't need second-level
    fairness to award €25 t-shirts.
- Record findings in strikedash_vault/StrikeLab-Yogo-Schema-Findings.md
- Update §7.4 if the fallback path is needed.
```

This honest acknowledgement removes the hidden assumption.

---

### Patch 9 — MAJOR: §10.1 /postei legal regression

**Problem (W9):** The flip from "consent" (v3.1) to "contract" (v3.2-pre) for /postei UGC is legally wrong. Gamification is opt-in by spec §1; therefore Art. 6(1)(b) "contract" doesn't apply.

**Patch:** Revert §10.1 row to consent, not contract:

```
| UGC detection via /postei bot command | Explicit consent (Art. 6(1)(a)) | Granular toggle: consentUgc must be true; otherwise /postei replies with "obrigado, mas tens o UGC desativado no StrikeLab — escreve /strikelab para activar" |
| UGC detection via ManyChat IG cross-reference | Explicit consent (Art. 6(1)(a)) | Same toggle |
```

The contract basis was an over-reach. Reverting to consent + honoring the toggle is the right legal basis AND the right product behaviour.

---

### Patch 10 — MAJOR: §9.1 re-entry locks engaged students

**Problem (W10):** Deferred re-entry rule locks the top 3-5 most-engaged students out of all rewards in N+1 OR N+2. Contradicts §1 principle 2.

**Patch:** Replace the deferral with parallel-track recognition that never excludes anyone:

```
§9.1 Champions League (revised — no exclusion ever)

Top 3 per category in month N are awarded the regular prize for month N
(at full value) AND given a "Liga dos Campeões" badge that runs through
N+1 only.

In month N+1:
- They compete in the REGULAR leaderboard normally.
- They additionally compete in a parallel "Champions League" leaderboard
  ranking only badge-holders.
- Champions League N+1 prize: 1 master class voucher OR small recognition
  item (~€10). NOT a duplicate of the main monthly prize.
- The badge expires at end of N+1; they may re-enter Champions League in
  N+2 by winning their category again.

No exclusion mechanic. Engaged students always win in proportion to engagement.
"Liga dos Campeões" becomes an additive recognition layer, not a rotation
penalty.
```

This honors §1.2 ("reward training first, social second"); engaged training never gets punished.

---

### Patch 11 — MINOR (but worth fixing): §2.1 AT TIME ZONE not supported in SQLite

**Problem (W11):** `AT TIME ZONE 'Europe/Lisbon'` is PostgreSQL syntax. libSQL/SQLite doesn't have it natively.

**Patch:** Remove the generated-column approach. Compute `lisbon_local_date` and `points_period` in application code at insert time, store as plain TEXT columns:

```
§2.1 Storage (revised)

Three logical stores. Generated columns are NOT used (libSQL doesn't support
timezone-aware generated columns).

Instead, the application layer (src/lib/gamification/event-log.ts) computes:
  - lisbon_local_date (TEXT "YYYY-MM-DD") via Intl.DateTimeFormat
  - points_period (TEXT "YYYY-MM") via Intl.DateTimeFormat
at insert time, in the appendEvent function.

These are stored as regular columns. There is only one writer for these
fields (appendEvent), so consistency is enforced in code rather than DB.

Tests verify the timezone computation explicitly (already in Task 3).
```

---

### Patch 12 — MINOR: §15 fallback overlap

**Problem (W12):** "Invisible to students" claim is false for Flash Check-in timing precision at Wed 12:00 + Sun 23:59 boundaries.

**Patch:** Acknowledge in §15:

```
§15 Hobby cron fallback (revised disclaimer)

If Vercel Pro is not used and only hourly polling is available:
- Flash Check-in winners are determined at the next hourly poll after window
  start; ties are broken by event_id ASC. Up to 60min lag accepted at window
  boundaries. Bot announces "Os vencedores são anunciados todas as horas em
  ponto durante o Flash Check-in" so students understand the cadence.
- All other features are unaffected (boost activation, streak detection,
  tier evaluation all run on event_log replay, not poll lag).
- Pro path is still preferred; this fallback is for budget contingency only.
```

---

### Patch 13 — MINOR: §13.2 DPO contradiction

**Problem (W13):** §13.2 requires DPO sign-off; §10.3 says no DPO until >250 subs. Launch blocker hidden in plain sight.

**Patch:**

```
§13.2 Pre-launch sign-off (revised)

- DPIA reviewed and signed by Ricardo (controller).
- DPIA additionally reviewed by an external privacy lawyer for a one-time
  ~€300 paid consultation (not a recurring DPO contract). Output: a 1-page
  attestation that the DPIA reflects standard small-business compliance
  posture. This satisfies the "external review" intent without provisioning
  a DPO the business is not yet legally required to have.
- §10.3 unchanged: fractional DPO is contracted only above the 250-sub
  threshold or upon a CNPD inquiry.
```

---

## Summary of changes

| Patch | Section | Impact |
|---|---|---|
| 1 | §4.3 | **Adaptive prize thresholds** — self-tunes if cost exceeds 6% MRR |
| 2 | §5.3.0 (new) | **Streak counter ownership clarified** |
| 3 | §2.5 | **No more 30-min "dead" heuristic** — human-decided recovery |
| 4 | §6.5 (new), §4.2 | **Boost scope rule** — boosts only on checkins |
| 5 | §3.2, §10.4 | **Two-track erasure** — honest pseudonymization labelling |
| 6 | §7.4 | **Simpler winner selection** — single post-window cron |
| 7 | §12 | **Honest 10-13wk MVP** estimate (was 8) |
| 8 | §2.3 | **Yogo schema spike** gates Phase 1 |
| 9 | §10.1 | **/postei reverts to consent basis** |
| 10 | §9.1 | **No-exclusion Champions League** |
| 11 | §2.1 | **Drop generated columns** — application-level timezone |
| 12 | §15 | **Honest fallback disclaimer** for hourly polling |
| 13 | §13.2 | **External lawyer review (€300)** replaces DPO requirement |

## What v3.2-pre got right (kept untouched)

- Dual ledger (monthly + lifetime)
- Granular 4-toggle opt-in
- Art. 22 admin confirmation queue
- IG verification via challenge code
- Identity table architecture
- Deleted toxic mechanics (inactivity penalty, embaixador_ratio, atleta, mini_random)
- P8 + P12 milestones
- Sealed monthly snapshot
- Frozen event-type enumeration
- /postei bot path as default UGC channel
- early_renewal + comeback engagement triggers
- Streak shield commands
- Phase 0 admin UI (13 screens)
- Full GDPR posture (DPIA, ROPA, retention)
- Honest re-pricing of "1 mês grátis"

## What v3.2-final still leaves open (for Ricardo)

1. **DG-1 Vercel Pro** — still recommended; fallback documented in §15.
2. **External lawyer reviewer for DPIA** — ~€300, ~1 week sourcing.
3. **`winners_max` defaults** — set in spec but Marcelo may want to tune per-challenge.
4. **Prize tier initial threshold values** — `bronze=2500`, `silver=5000`, `gold=8500`, `diamond=12000` are starting points; the adaptive mechanism (Patch 1) will move them.
5. **Sourcing initial inventory** for prizes (bandanas, t-shirts, jackets) — operational not technical.
