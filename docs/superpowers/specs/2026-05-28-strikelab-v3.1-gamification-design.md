---
title: StrikeLab v3.1 — Refined Gamification Spec
type: design
version: 3.1
status: draft
date: 2026-05-27
owner: Strike House Portugal
supersedes: StrikeLab-v3-full.json (v3.0)
---

# StrikeLab v3.1

A gamification system for Strike House, a martial arts academy in Carcavelos. v3.1 keeps the dual-ledger spirit and patente vitalícia of v3.0 but rebuilds it around five non-negotiables: opt-in by default, train-first economics, no penalties for human life, an admin UI Marcelo can actually operate, and GDPR compliance baked in rather than bolted on. The system is scoped to ~150 active subscribers and must ship a working MVP within six weeks.

---

## 1. Design Principles

1. **Opt-in by default, opt-out friction-free.** No student is enrolled in StrikeLab without an explicit yes captured in WhatsApp. Opt-out is a single message at any time, processed within 24h, and reversible. Subscriptions and class access never depend on gamification participation.
2. **Reward training first, social second.** A student who only trains must be able to top the leaderboard. UGC is a bonus channel, not the primary one. No social action ever earns more than a week of disciplined training under reasonable boosts.
3. **No public shaming, no health-discriminatory penalties.** Inactivity is never punished with point loss or public messaging. The only acceptable response to long absence is a private, neutral check-in. Public rankings are pseudonymous unless the student explicitly opts into name display.
4. **Operationally light.** Every event that can change a student's points, tier, or status must be either fully automated AND idempotent, OR have a defined admin UI screen with audit log. Nothing in this spec relies on Marcelo "doing it on the side".
5. **GDPR-compliant by design.** Lawful basis declared per processing category, DPIA prepared before launch, retention TTLs enforced, right to erasure implemented in code (not policy only), Art. 22 mitigated by withholding economic effects until human operator confirms tier changes.

---

## 2. Architecture

### 2.1 Storage

All gamification state lives in **Turso (libSQL)**, not SQLite. SQLite is retained only for read-only local dev caches; no production write path uses it.

Three logical stores:

- `gamification_event_log` — append-only, source of truth for every credit, debit, boost activation, tier change, opt-in/out, consent change. Each row has `event_id` (UUID), `customer_id`, `event_type`, `payload_json`, `created_at`, `source` (`yogo_poll`, `manychat_webhook`, `admin_ui`, `cron_reset`, `bot_command`), `idempotency_key`. Unique index on `idempotency_key` prevents double-processing on retries.
- `gamification_state` — derived/materialized state per `customer_id`: `monthly_points`, `lifetime_xp`, `current_tier`, `current_streak_days`, `streak_shield_available_this_month`, `last_class_at`, `opt_in_at`, `opt_out_at`, `medical_pause_until`, `consent_version`. Rebuildable from `gamification_event_log` by replay (essential for right-to-erasure derivative cleanup and for debugging).
- `gamification_identity` — see §2.2.

### 2.2 Identity resolution

A single junction table maps all upstream IDs to a stable internal `customer_id` (Yogo customer id is authoritative).

```
gamification_identity (
  customer_id          INT PRIMARY KEY,    -- Yogo customer_id (source of truth)
  phone_e164           TEXT UNIQUE,        -- normalized from Yogo + WhatsApp
  whatsapp_wa_id       TEXT UNIQUE,        -- WhatsApp Cloud / bot id
  manychat_subscriber  TEXT UNIQUE NULL,
  instagram_handle     TEXT UNIQUE NULL,   -- lowercased, no @
  ig_verified_at       TIMESTAMP NULL,     -- bot confirmed via challenge code
  opt_in_at            TIMESTAMP NULL,
  consent_version      TEXT NULL
)
```

IG handle linkage requires a verification step: the bot DMs a short code, the student replies from the IG account, the bot confirms. UGC triggers credit ONLY when `ig_verified_at IS NOT NULL`. This eliminates the "credit the wrong student" failure mode and gives a clean audit trail.

### 2.3 Polling Yogo

No webhooks exist. Strategy:

- **Tier 1 — class window polling.** Every 15 minutes during operating hours (Mon–Sun 06:00–23:00 Europe/Lisbon) hit `/classes?startDate=today&populate[]=checkins`. Diff against last snapshot → produce `checkin_observed` events. Acceptable lag: 15 min. Cron uses Vercel Pro scheduled functions (Hobby's daily cron is insufficient; the cost is justified for ops).
- **Tier 2 — memberships sweep.** Once daily at 03:00 Lisbon, `/reports/memberships-list` full diff → produce `subscription_renewed`, `subscription_cancelled`, `subscription_started` events. Renewal timestamp is the Yogo `last_renewed_at` (or first-observed-renewed if missing); polling-detection time is recorded separately as `observed_at`.
- **Lag tolerance.** Every trigger that references "last 24h" or "last N days" uses Yogo-side timestamps, not polling-detection time. This eliminates the polling-confuses-streak failure.

### 2.4 Cron + monthly reset

- Reset cron runs **02:30 Lisbon on day 1** to comfortably clear DST shifts. The cron writes a single `monthly_reset_started` event with a `reset_id` (UUID) and locks (advisory row in `gamification_state_meta`). It then processes students in batches of 50 in idempotent steps. Each batch emits `monthly_reset_applied_batch` events. A final `monthly_reset_completed` event closes the lock.
- **Idempotency:** the reset writes a `points_zeroed_at_reset_id` field per student; if cron retries, students already zeroed in that `reset_id` are skipped.
- **Events arriving during reset:** every event has a `points_period` field computed at write time from `created_at` (Lisbon timezone). If `created_at < first_of_month_local`, the event credits the previous period's snapshot (a sealed table `monthly_points_snapshot` retains finalized prior-month totals for audit and league logic).
- **Daily lightweight reconciliation** at 04:00 Lisbon: rebuild `gamification_state` for any customer who had events in the last 24h, comparing against running totals. Drift > 0 flags an admin alert.

### 2.5 Race condition handling

All point/XP credits use an **append-then-materialize** pattern:

1. Write event to `gamification_event_log` with `idempotency_key` (e.g. `checkin:{customer_id}:{class_id}`). Unique constraint discards duplicates.
2. A small queue worker (single-writer per `customer_id`, partitioned by hash) replays new events for that customer in `event_id` order, recomputing `gamification_state` deterministically. Single-writer per customer eliminates SELECT-FOR-UPDATE concerns.
3. Boost multipliers are computed at materialization time from the active boost set as of the event's `created_at` — never from "now". This makes the system deterministic and replay-safe.

Tier evaluation is **NOT continuous on every credit.** Tier is reassessed nightly during the 04:00 reconciliation OR on demand from the admin UI. Tier changes always emit a `tier_change_proposed` event that requires admin confirmation before economic benefits unlock (see §10 Art. 22 mitigation).

---

## 3. Ledgers

### 3.1 Dual ledger preserved

| Ledger | Behaviour | Purpose |
|---|---|---|
| `monthly_points` | Zeroed day 1 monthly | Ranking + prize redemption |
| `lifetime_xp` | Accrues; can be reduced only by erasure or correction | Tier qualification |

Every action that credits monthly points also credits XP. **XP receives the base value, no boosts.** Boost effects amplify the leaderboard race but not lifetime status, so heavy boost months don't permanently distort tier progression.

### 3.2 Right-to-erasure path

On a confirmed erasure request:

1. `gamification_identity` row is replaced with a tombstone (PII fields nulled, `customer_id` retained as opaque hash).
2. `gamification_state.lifetime_xp` and `monthly_points` set to 0; `current_tier` set to NULL.
3. `gamification_event_log` rows for that `customer_id` are rewritten to remove PII payload fields (names, IG handle, phone, message text) while retaining numeric anonymous aggregates (`event_type`, `points_delta`, `created_at`). The hashed `customer_id` is retained so historical leaderboards reconcile.
4. Public artefacts (wall photo, broadcast records mentioning the student) are taken down — see §10.
5. An `erasure_applied` audit event records who processed it and when. Retention of this audit event: 5 years (legitimate interest, defense of legal claims).

### 3.3 Event log retention

- **Hot retention:** 24 months full payload.
- **Cold retention:** months 25–60 — payload reduced to `event_type` + `points_delta` + hashed `customer_id` + timestamp. PII stripped.
- **After 60 months:** aggregated to monthly counters; rows purged.
- Retention is enforced by a monthly cron, not aspirational policy.

---

## 4. Plans

Three plans, same prices. **pointsPerClass recalibrated** so a high-discipline P8 student can credibly compete and so UGC actions don't dwarf training.

| Plan | Price | classes/mo (typical) | pointsPerClass | Full-plan bonus | perfectWeek threshold | perfectWeek bonus |
|---|---|---|---|---|---|---|
| P8 | €50 | 8 | 110 | 600 | ≥2 classes/wk | 300 |
| P12 | €60 | 12 | 80 | 700 | ≥3 classes/wk | 280 |
| Livre | €75 | 16–20 | 55 | n/a (milestones) | ≥4 classes/wk | 220 |

A maxed-out P8 month: 8 × 110 = 880 + 600 = 1480 base, plus perfect weeks. A reel under v3.1 (see §5) is 250 pts. The ratio "1 reel ≤ 2 classes" is now structurally true.

### 4.1 Plano 8 milestones (new)

P8 had no progression narrative. v3.1 gives it three reachable milestones so casual subscribers see checkpoints, not a single all-or-nothing target:

```
P8.milestones:
  classesInMonth=4  → +200, "Meio Caminho"
  classesInMonth=6  → +300, "Quase Lá"
  classesInMonth=8  → +600 (full plan bonus), "Plano Cheio"
```

### 4.2 Plano 12 milestones (new)

```
P12.milestones:
  classesInMonth=6  → +250, "Meio Plano"
  classesInMonth=9  → +350, "75%"
  classesInMonth=12 → +700 (full plan bonus), "Plano Cheio"
```

### 4.3 Plano Livre

Keeps progressive milestones (200/300/400/500). The **`atleta` boost is REMOVED** in v3.1 (it structurally favored Livre and compounded the prize-class gap). The Livre advantage is now milestone count + sheer volume, not a permanent multiplier.

---

## 5. Triggers (cut hard)

### 5.1 Kept

| Trigger | Points (base) | Notes |
|---|---|---|
| `checkin` | per `pointsPerClass` | Source: Yogo class attendance |
| `full_plan_completion` (P8/P12) | see §4 | Idempotent per period |
| `perfect_week` | see §4 | Computed Sunday 23:59 Lisbon |
| `livre_milestone` | 200/300/400/500 | One-shot per period |
| `p8_milestone` / `p12_milestone` | see §4 | One-shot per period |
| `streak_5` | activates streak_5 boost x1.3 | See §6 |
| `streak_10` | activates streak_10 boost x1.6 (was 2.0) | Decayed |
| `streak_15` | activates streak_15 boost x1.8 (was 2.5) | Decayed |
| `streak_shield` | preserves streak | See §5.4 |
| `supera_teu_ritmo` | 250 (was 400) | classesThisWeek > perfectWeek.threshold |
| `renewal_processed` | 350 (was 400) | activates renovação boost x1.5 for 14d |
| `referral_converted` | 800 + 1200 phased (was 1000 + 1500) | See §5.5 |
| `referral_trial_only` | 200 (was 400) | Trial completed, no signup |
| `story_checkin` | 100 (was 80) | Story within 24h of a check-in |
| `repost_official` | 120 (was 200) | Cap 1/wk (was 2) |
| `feed_post` | 180 (was 350) | Cap 1/wk |
| `reel` | 250 (was 600) | Cap 1/mo (was 2) |
| `low_usage_checkin` | 0 pts, neutral message | NOT a penalty |
| `dupla` | 60 (was 100) | See §5.6 |

### 5.2 Inverted

- `story_organic` is **deleted as a separate trigger.** A story that mentions Strike House without a recent check-in earns the same 50 pts as a basic repost (capped 1/wk) under a new `story_no_class` event. The 250-pts-for-not-training pathway is gone. Training-coupled UGC is now strictly more valuable than detached UGC.

### 5.3 Deleted

- `inactivity_long -50 pts` — gone. Replaced by `low_usage_checkin` (private, neutral): "Olá [nome], queríamos só dar um sinal — estamos por cá quando quiseres voltar." No points lost, no public visibility. Triggers only if the student has NOT set `medical_pause` or `vacation_pause`.
- `broken_streak -30 pts` — gone. Losing a streak is its own loss; no extra penalty.
- `inactivity_long` and `broken_streak` are removed from the schema entirely.

### 5.4 Streak Shield (refined)

- Shield is a **monthly resource** per student, available by default to anyone in good standing (subscription active, not on medical pause).
- Auto-applied is **opt-out**: students can toggle "save my shield for later" via bot. Default behaviour is auto-apply on first qualifying gap so the casual student is protected without thinking.
- Resets day 1 of the month independently of any `monthly_reset`.
- An audit row is written every time the shield activates OR is consciously saved.
- Removed: the "broken_streak after shield" penalty. If both shield and streak are gone, the student simply loses the streak and its boost.

### 5.5 Referral (anti-fraud tightened)

```
referral_converted phased payout:
  phase_1 (signup):                 +800 pts
  phase_2 (after referred completes 6 check-ins AND 1 renewal): +1200 pts
  total: 2000 (was 2500)
```

Anti-fraud additions:

- Anti-ring: the system flags pairs where A and B refer each other within 60 days. Admin must approve before phase_2 unlocks.
- Phone+IBAN+device fingerprint overlap raises a `duplicate_suspect` admin queue entry instead of auto-approving.
- Max 3 successful referrals per inviter per rolling 90 days. Beyond that, phase_1 still credits but phase_2 requires admin review.

### 5.6 Trigger pairs (Dupla, Cross-training) — deferred to V2

- `dupla` requires both students to report, has 50% reporting drop-off, and creates manual ops load. **Deferred.** If V2 brings it back, it must be auto-detected from Yogo check-ins (same class, same time, no bot ack required) and capped severely.
- `cross_training` requires Yogo to expose class modality reliably. As of v3.1 spec, `class_type_id` is not modality-mapped, mapping creates an ongoing operator load, and the prize category structurally penalizes single-modality students. **Deferred to V2** alongside a Yogo class-type categorization table built once.

### 5.7 Removed exploits

- `multi_class_same_day "variable"` — gone. Multiple check-ins on one day each credit their normal `pointsPerClass`. No special trigger.
- `mini_random` — gone. Replaced by **Weekly Challenge** (single, transparent, see §7).
- `music_choice` / `store_purchase` — out of MVP scope, no Spotify/store integration committed.

---

## 6. Boosts

### 6.1 Stack model

Cap stays at **x3.0** but the floor is raised. New stack formula:

```
finalMultiplier = min(1.0 + sum(active_boost.delta), 3.0)
where each boost.delta = boost.multiplier - 1.0
```

Worst-case stack (P8 with streak 15, weekend, renovação, ugc_story all active) sums to 0.8 + 0.8 + 0.5 + 0.5 = 2.6 → 3.6 → capped 3.0. To reach the cap a student must have a real streak AND it's a weekend AND they renewed AND they posted with a recent check-in — all training-aligned. The cap is reachable but only by training-active students.

### 6.2 Definitions

| Boost | Multiplier | Trigger | Duration |
|---|---|---|---|
| `weekend` | 1.8 | day ∈ {Sat, Sun} | 48h cyclical |
| `renovacao` | 1.5 (was 1.6) | subscription_renewed | 14d |
| `streak_5` | 1.3 | streak ≥ 5 | until streak breaks |
| `streak_10` | 1.6 (was 2.0) | streak ≥ 10 | until streak breaks (no decay) |
| `streak_15` | 1.8 (was 2.5) | streak ≥ 15 | until streak breaks (no decay) |
| `ugc_story` | 1.3 (was 1.5) | story_checkin posted | 24h |
| `ugc_post` | 1.4 (was 1.8) | feed_post posted | 48h |
| `ugc_reel` | 1.5 (was 2.0) | reel posted | 72h |
| `supera_ritmo` | 1.2 (was 1.3) | supera_teu_ritmo | end of week |
| `embaixador_referral` | 1.4 (was 1.5) | referral_converted phase_1 | 14d |

### 6.3 Removed

- **`atleta`** — gone (favoured Livre structurally).
- **`embaixador_ratio`** — gone, no exceptions. The replacement is the "Embaixador" recognition (see §9) earned by referrals + UGC paired with check-ins, never by stories-exceeding-check-ins ratio.

### 6.4 State machine

Every boost row has `started_at`, `expires_at`, `expired` (bool). Time-based expiry is computed at read time, not on a separate cron, eliminating "ghost boost" race conditions. The `weekend` boost is a calendar predicate, not a stored row.

---

## 7. Weekly Challenges

**One challenge per week**, launched Wednesday 12:00 Lisbon, runs through Sunday 23:59. Marcelo cannot curate two per week and the additional cadence would not survive his real load.

### 7.1 Mechanism

- Bot rotates from a fixed pool of **5 challenges** (down from 7). No repeat within 4 weeks.
- Marcelo can override the rotation via admin UI ("set next week's challenge") with one click.
- Challenges that require live in-class content (`combo_surpresa`, `senha_secreta`) are **scheduled in advance** with the coach for that week, never thrown at Marcelo on the day.
- Public announcement in the academy group is opt-in per student (default: opted-in for active subscribers who have completed the gamification consent). Winner broadcast respects pseudonym preference.

### 7.2 Pool

1. **Flash Check-in** — first 5 to check in within 24h of broadcast: +250 pts each.
2. **Aula Lotada** — student who fills the last seat of a near-full class on Saturday: +200 pts.
3. **Hora H** — specific named class wins +200 if attended.
4. **Story-Treino** — train this week AND post a story-checkin: +150 (in addition to standard story_checkin).
5. **Combo Surpresa** — coach announces combo live in one named class; students report via bot, +250 each. Coach is briefed by Marcelo on Wednesday during the override step.

Reportable challenges accept the bot's `/feito` command which writes an `event_log` row that the admin queue can audit if abuse is suspected.

---

## 8. Tiers

Five tiers preserved. Lifetime status is permanent; benefits are conditional on an active subscription.

### 8.1 Thresholds (recalibrated)

Original XP thresholds locked Plano 8 students out of Diamante for ~9 years and out of Prata/Ouro for 3+ years. v3.1 thresholds are tuned so a P8 student training 6–8 classes/month reaches Prata in ~12 months and Ouro in ~30 months — aspirational but visible. Diamante remains rare by intent (long-term loyalty + manual rubric).

| Tier | minMonthsAsClient | minXP | XP/year typical P8 (~1,500–2,000) | Years to reach (P8) |
|---|---|---|---|---|
| Iniciante | 0 | 0 | — | — |
| Bronze | 3 | 5,000 | — | ~3 mo |
| Prata | 6 | 15,000 | ~1,800 | ~9–12 mo |
| Ouro | 12 | 40,000 | ~1,800 | ~24–30 mo |
| Diamante | 24 | 80,000 | ~1,800 | ~45 mo + manual rubric |

P12 and Livre students reach faster proportionally; Diamante remains exceptional.

### 8.2 Benefits delivery (defined)

Each benefit now has an explicit delivery mechanism:

| Tier | Benefit | Delivery mechanism (MVP) |
|---|---|---|
| Bronze | 5% on bootcamps/workshops | Admin UI generates Yogo coupon code on workshop signup. |
| Prata | 5% monthly discount | Admin UI generates monthly Yogo coupon batch on day 1 (single-button job). Welcome-to-Silver brinde on POS pickup. Master class priority = manual reserve list. |
| Ouro | 10% monthly discount + 1 PT session/quarter + masterclass reserved seat | Same monthly batch. PT session = ticket in admin UI consumed by Marcelo's PT calendar. |
| Diamante | 15% monthly discount + private session/month | Same monthly batch. Private session = ticket. **`freeMonthsPerYear` deferred to V2** — until a Yogo coupon-for-full-month flow exists, Strike House does not promise free months it cannot operationally honour without manual subscription edits. The Diamante perk list for MVP is: discount + private session + wall photo opportunity (with consent flow) + recognition.

### 8.3 Wall photo (Diamante) — explicit consent

The wall photo benefit requires:

1. Signed paper consent (or equivalent e-sign) with explicit acknowledgement of: physical display location, indefinite display term, right to revoke (photo removed within 7 days of revocation), right to refuse without losing any other Diamante benefit.
2. Consent is stored as a scanned PDF with `consent_id` linked in `gamification_identity`.
3. Diamante status is granted independently of whether the student accepts the wall photo. The two decisions are decoupled.

### 8.4 Diamante manual validation — rubric

Two-of-three rubric, decided jointly by Ricardo + Marcelo within 30 days of XP+months thresholds being met:

1. **Conduct** — no documented code-of-conduct issues in the last 12 months.
2. **Engagement** — visible community contribution (helping new students, attending events, supporting the academy beyond own training).
3. **Continuity** — no >3-month subscription gaps in the past 24 months.

Decision is recorded in the admin UI with a 1–2 sentence justification visible to the student on request. If denied, re-evaluation in 6 months automatically.

### 8.5 Removed governance ambiguity

The `decisionVote: true` Diamante benefit is **removed.** It was an undefined power with no decision queue, no constituency, and no scope. If governance influence is desired in V2, it should be designed as a defined consultative forum, not implied in a tier perk.

---

## 9. Monthly Prizes

### 9.1 Tiers (recalibrated)

| Prize tier | Points threshold | Prize | True cost to Strike House |
|---|---|---|---|
| Bronze | 2,500 | Bandana / pulseira / merch sticker pack | €8 |
| Silver | 5,000 | T-shirt Strike House | €25 |
| Gold | 8,500 | Casaco Strike House | €40 |
| Diamond | 12,000 | **25% discount on next month** (was "1 mês grátis") | ~€15 opportunity cost |

The headline change: "1 mês grátis" at a stated €10 cost was honest accounting fiction (real foregone revenue: €50–75). v3.1 substitutes a 25% next-month discount, which is honest about its real cost and matches actual gym discount mechanics.

### 9.2 Liga dos Campeões — engagement preserved

Top 3 per category in month N are not exiled. They enter a **parallel Champions League leaderboard** in month N+1 that competes only against other recent Top-3 winners. Standard ranking still shows their position but with a "Liga dos Campeões" badge instead of prize eligibility — so they remain visible, motivated, and engaged while making space for new winners in the regular ranking.

A Champions League month yields its own prize tier (one extra "Mentor of the Month" badge + small recognition; no monetary prize). After one month in the Champions League, they return to the regular ranking. This preserves the social-mobility intent of the v3.0 rotation without enforcing detraining at peak engagement.

### 9.3 Categories

- `most_classes`
- `biggest_streak`
- `biggest_referrer`
- `biggest_embaixador` — redefined: highest count of UGC events paired with check-ins (not raw story count). No structural reward for posting without training.
- `most_cross_trainer` — **deferred to V2** alongside cross_training trigger.

---

## 10. Anti-Abuse + GDPR

### 10.1 Lawful basis

| Processing category | Lawful basis |
|---|---|
| Check-in tracking from Yogo | Contract (Art. 6(1)(b)) — performance of service contract |
| Subscription/renewal events | Contract |
| UGC detection (IG ↔ Yogo) | **Explicit consent (Art. 6(1)(a))** — opt-in flow required |
| Ranking participation | **Explicit consent** — opt-in, default pseudonymous |
| Anti-fraud monitoring (referral rings, duplicate accounts) | Legitimate interest (Art. 6(1)(f)), documented LIA |
| Tier evaluation with economic effect | Contract + **explicit human confirmation** before benefit applies (Art. 22 mitigation) |
| Marketing-style broadcasts | Explicit consent, separately opt-in/out |

### 10.2 Opt-in flow

First contact with the bot includes a structured onboarding:

1. Welcome + plain-language explanation of what StrikeLab does.
2. Granular consent options:
   - [ ] I want to participate in StrikeLab (training + tiers + monthly prizes).
   - [ ] I want my Instagram activity to count (UGC triggers).
   - [ ] I want my real name shown in the ranking (default: pseudonym).
   - [ ] I want to receive broadcast challenge announcements in the academy group.
3. Each option is independently revocable via `/optout [category]` bot command.
4. Consent version is stored in `gamification_identity.consent_version`; material policy changes increment the version and re-request consent.

### 10.3 DPIA + retention

- **DPIA prepared before launch.** Template: profiling extent, special-category data risk (health correlation from absence patterns), mitigation measures, residual risk assessment.
- **Retention TTLs** (see §3.3): 24mo hot, 60mo cold-anonymized, then purge.
- **DPA + SCCs** signed with ManyChat (US processor), Vercel (US), Turso (US). Yogo (DK) is intra-EU. All listed in Registo de Atividades de Tratamento (Art. 30).

### 10.4 Right to erasure (Art. 17)

Implemented as the §3.2 flow. Wall photo removal within 7 days. Public broadcast records: redacted in the WhatsApp group via a "[student requested removal]" note + actual broadcasts deleted where the bot has admin rights. Recognition of the irreversible nature of WhatsApp message broadcasts is documented in the privacy notice so students consent informed.

### 10.5 Art. 22 mitigation

Tier evaluation runs automatically nightly, BUT economic effects (discounts, free sessions, wall photo offer) require an **admin confirmation tap** before the benefit batch is generated. Marcelo sees a "Pending tier promotions" queue daily; each row shows the student, proposed new tier, and a "Confirm" button. The student is informed of the right to request a human review of any tier decision; the right to object is documented in the privacy notice.

### 10.6 Minors

- Under 16 → parental consent required, captured at the academy on a paper form, scanned, linked to `gamification_identity.consent_version`. Bot cannot enrol a minor without that form on file.
- Under 13 → **excluded from StrikeLab** in MVP. Their training is unaffected; they simply don't participate in points/tiers/prizes. (V2 may revisit with a child-specific design and dedicated DPIA.)
- Public ranking display defaults to pseudonym for all minors regardless of parental setting.

### 10.7 Public ranking

Default display: pseudonym (auto-generated handle, editable by student). Real-name display only on explicit consent. Winner broadcasts use the chosen display name. Group broadcasts never reveal points totals of non-winners.

### 10.8 No penalty for inactivity

Removed in §5.3. No exceptions. The closest mechanic is the neutral `low_usage_checkin` private message, suppressed entirely if the student has set any pause flag.

### 10.9 Third-party data minimization

- Referrals: the inviter's name is shared with the referred only with explicit "OK to mention" check at the moment the inviter generates the referral link. Default: anonymous ("um amigo da Strike House").
- Dupla (when re-introduced in V2): both students must have opted in to the partner mechanic.

---

## 11. Operator Tools (Admin UI — MVP scope)

Marcelo gets a single `/admin/strikelab` route in the existing dashboard. It is not optional — every screen below ships in the MVP. Without these screens, the system creates more work than it removes.

### 11.1 MVP screens

1. **Per-student view** — full state: points, XP, tier, streak, shield status, opt-in flags, recent events (paginated), pause flags. One screen, mobile-friendly.
2. **Manual points adjust** — credit or debit with required reason field. Writes a `manual_adjustment` event linked to operator identity. Audit log immutable.
3. **Tier confirmation queue** — pending tier promotions awaiting admin tap (Art. 22 implementation).
4. **Tier override** — promote/demote with reason. Logged.
5. **Pause flags** — `medical_pause`, `vacation_pause`, `personal_pause` with optional return date. While set, no penalties (already removed), no low-usage messages, streak frozen (not broken).
6. **Prize redemption POS** — student arrives, Marcelo enters customer search, sees current points + available prizes (with stock), picks prize, confirms debit. Stock decrements. A "delivered" timestamp is captured for inventory tracking. Stock alerts when any item drops below threshold.
7. **UGC manual approve queue** — for ManyChat false negatives: Marcelo pastes a screenshot URL or IG link + customer, picks event type (`story_checkin` / `feed_post` / `reel`), confirms. Writes an event identical to the auto-detected version, with `source = admin_ui`.
8. **Discount apply tool** — day-1 monthly batch: one button generates Yogo coupon codes for every Prata/Ouro/Diamante and queues them (CSV export or Yogo API if available). Marcelo reviews + sends.
9. **Diamante review queue** — students who hit XP+months thresholds; rubric checklist (§8.4), confirm/deny with note.
10. **Duplicate suspect queue** — pairs of accounts flagged by overlap rules; Confirm fraud / Dismiss as legitimate (twins, family) / Pause for review.
11. **Reset audit log** — last 12 monthly resets with status, batch counts, drift detected, completion timestamp. An "alarm" row if anything is partial.
12. **Inventory** — manual stock counts per prize item. Updated by Marcelo when stock arrives.
13. **Erasure request handler** — receives student opt-out/erasure, walks the §3.2 flow with confirmations, logs.

### 11.2 Audit log

Every admin action writes to `gamification_event_log` with `source = admin_ui` and the operator's identity. Marcelo and Ricardo can review all admin actions in a single chronological view.

---

## 12. Phased Rollout

### Phase 0 — Foundations (Sprint 1, 2 weeks)

- Turso migration; new schema (`gamification_event_log`, `gamification_state`, `gamification_identity`, `monthly_points_snapshot`).
- Bot onboarding flow: IG handle verification, consent capture (all four toggles), parental consent flow for minors.
- Yogo polling: tier 1 (15-min class window) + tier 2 (daily memberships sweep). Idempotent event writes.
- Identity resolution end-to-end (Yogo customer ↔ phone ↔ WhatsApp ↔ optional IG).
- DPIA prepared. Privacy notice published. DPA/SCC signatures with ManyChat, Vercel, Turso initiated.
- Admin UI shell + per-student view + manual adjustment + pause flags + erasure handler.

### Phase 1 — MVP gamification (Sprints 2–3, 4 weeks)

- Monthly points + lifetime XP credit on check-in with plan-aware `pointsPerClass`.
- Tier evaluation nightly + Art. 22 confirmation queue.
- Core triggers: renewal, streak_5/10/15 (with shield), supera_teu_ritmo, full_plan_completion, plan milestones.
- Boosts: weekend, renovação, streak (all three), supera_ritmo.
- Monthly reset cron (idempotent) + reset audit log.
- Monthly prize tiers + POS redemption + inventory.
- Discount apply tool (Yogo coupon batch).
- Diamante review queue.

### Phase 2 — UGC + Social (Sprints 4–5, 4 weeks)

- ManyChat integration for `story_checkin`, `feed_post`, `reel` only (no story_organic).
- UGC manual approve queue.
- Referral with phased payout + anti-ring detection.
- One weekly challenge (rotation of 5).
- Champions League parallel leaderboard.
- Pseudonymous public ranking + opt-in broadcasts.

### Phase 3 — Optional, V2 (later)

- Cross-training (once Yogo modality mapping built).
- Dupla (auto-detected, no bot ack).
- Diamante `freeMonthsPerYear` (once Yogo coupon-for-month flow exists).
- Music / store integrations.
- Governance forum (replacement for `decisionVote`).
- Story-organic re-evaluation (only if economic damage from removal is proven).

---

## 13. Cut List (explicit)

| Item | Status | Reason |
|---|---|---|
| `inactivity_long` -50 pts penalty | **Deleted** | Health-discriminatory, churn accelerant, GDPR-exposed |
| `broken_streak` -30 pts penalty | **Deleted** | Adds insult to loss of streak; no behavioural benefit |
| `story_organic` 250 pts > story_checkin | **Deleted as separate trigger** | Inverted incentive; reduced to 50 pts under `story_no_class` to keep some recognition without exploit |
| `embaixador_ratio` boost | **Deleted** | Rewards posting > training; permanent x1.5 with trivial setup |
| `atleta` boost (Plano Livre x1.4) | **Deleted** | Structurally favoured highest-paying plan; widened prize-class gap |
| `mini_random` boost/award | **Deleted** | Opaque selection, favoritism perception, ops burden |
| `multi_class_same_day "variable"` | **Deleted** | Undefined exploit surface; multiple check-ins simply credit normally |
| `cross_training` trigger | **Deferred V2** | Yogo modality mapping not built; structurally penalizes purists |
| `dupla` trigger (manual bot ack version) | **Deferred V2** | High friction, ops burden; V2 must be auto-detected |
| `decisionVote: true` Diamante perk | **Deleted** | Undefined governance; potential third-party-data issues |
| `freeMonthsPerYear` Diamante benefit | **Deferred V2** | No Yogo automation; manual ops cost > benefit |
| `music_choice`, `store_purchase` triggers | **Deleted MVP** | Out of scope, no integration committed |
| 2× weekly challenges | **Cut to 1×** | Marcelo cannot curate two |
| "1 mês grátis" monthly diamond prize | **Replaced** with 25% next-month discount | Honest accounting |

---

## 14. Open Questions for Ricardo

1. **Vercel Pro vs Hobby.** 15-min polling needs Pro's scheduled functions. Confirm budget acceptance OR alternative (e.g., self-hosted cron on a small VPS that calls Vercel API)?
2. **Yogo coupon API.** Does Yogo expose programmatic coupon creation, or is the discount-apply tool a CSV-export-then-paste workflow in v3.1 MVP? This decides whether tier benefits ship on day 1 of Phase 1.
3. **WhatsApp Cloud API timing.** The current bot is custom. Does Phase 0 stay on the existing bot, or does this trigger the WhatsApp Cloud migration listed as Sprint 4 on the roadmap?
4. **Minors threshold.** Confirm: under 13 fully excluded, 13–17 with parental consent. Are there any current minors in the active subscriber base whose parents must be re-onboarded?
5. **DPO designation.** Profiling at this scale likely requires a designated DPO under Art. 37. Ricardo as owner or external DPO contract?
6. **Tier benefit conflicts with existing promotions.** Some students may already have legacy discounts. How are existing arrangements grandfathered into v3.1 tiers?
7. **Champions League prize.** Should the parallel-leaderboard month have a real prize (e.g., extra masterclass) or remain recognition-only?
8. **Anti-ring threshold.** The 60-day window + 3-referrals-per-90-days is a starting point. Is there an existing dataset of historical referral patterns we can tune against before launch?

---

## How v3.1 addresses each FATAL weakness

**Engineer FATAL-1 (Vercel + SQLite write-heavy):** Spec moves entirely to Turso in Phase 0. Event log + materialized state pattern. No SQLite writes in production. (§2.1)

**Engineer FATAL-2 (race conditions in continuous tier eval + boost stacking):** Tier evaluation moved to nightly + admin confirmation. Single-writer-per-customer queue serializes credits. Boost multipliers computed deterministically from event timestamp, not "now". (§2.4, §2.5)

**Engineer FATAL-3 (streak detection vs daily polling):** Polling moved to 15-min cadence during operating hours; all temporal triggers reference Yogo timestamps, not poll detection times. (§2.3)

**Engineer FATAL-4 (identity resolution undefined):** `gamification_identity` table with IG verification step; UGC credits only when IG handle is verified. (§2.2)

**Game Designer FATAL-1 (embaixador_ratio perverse incentive):** Boost deleted. Replaced with `embaixador_referral` (delta tied to actual referrals + check-in-coupled UGC). (§6.3, §13)

**Game Designer FATAL-2 (referral collusion):** Phased payout retained but tightened: 6 check-ins + 1 renewal for phase 2 (was 4 + 1); anti-ring detection; max 3 referrals per 90 days; admin review queue. (§5.5)

**Game Designer FATAL-3 (story_organic > story_checkin):** Inverted. story_organic deleted; replaced with `story_no_class` at 50 pts vs story_checkin at 100 pts. Training-coupled UGC is now strictly more valuable. (§5.2, §13)

**Aluna Cética FATAL-1 (inactivity_long -50 penalty + paternalistic tone):** Penalty deleted. Replaced with neutral private message suppressed by pause flags. (§5.3, §10.8)

**Marcelo FATAL-1 (Diamante manual validation without rubric):** Defined rubric (two-of-three criteria), 30-day window, recorded justification, automatic re-eval in 6 months if denied. (§8.4)

**Marcelo FATAL-2 (prize redemption without POS):** Dedicated `Prize redemption POS` screen in admin UI with inventory, stock alerts, delivery timestamp. (§11.1)

**Marcelo FATAL-3 (1 mês grátis Yogo manual):** Diamond prize replaced with 25% discount (Yogo coupon batch path). `freeMonthsPerYear` Diamante benefit deferred to V2 until Yogo automation exists. (§8.2, §9.1)

**Marcelo FATAL-4 (tier discounts without Yogo mechanism):** Discount apply tool = one-button monthly batch. Coupon path documented as Open Question #2 if API doesn't expose it (graceful fallback to CSV). (§11.1, §14)

**Marcelo FATAL-5 (ManyChat false negatives, no fallback UI):** UGC manual approve queue in admin UI; Marcelo pastes link, picks event type, credits with audit. (§11.1)

**Marcelo FATAL-6 (inactivity_long without medical context):** Penalty deleted; pause flags (medical/vacation/personal) suppress low-usage check-in. (§5.3, §11.1)

**Legal FATAL-1 (IG↔Yogo cross without lawful basis):** Granular opt-in for UGC; lawful basis = explicit consent. IG must be verified before crediting. (§10.1, §10.2, §2.2)

**Legal FATAL-2 (Art. 22 automated tier with economic effect):** Tier promotion requires admin tap before benefits apply; right to human review documented. (§10.5)

**Legal FATAL-3 (lifetime XP permanent vs Art. 17 erasure):** Defined erasure path that zeroes XP, anonymises events, tombstones identity, removes public artefacts. (§3.2, §10.4)

**Legal FATAL-4 (inactivity penalty = indirect health discrimination):** Penalty deleted; pause flags; no public visibility on any low-usage path. (§5.3, §10.8)

---

## MAJOR weaknesses addressed vs deferred

**Addressed in v3.1:**
- Engineer MAJOR 5 (monthly reset idempotency + DST) → reset_id locking + 02:30 cron + idempotency fields. (§2.4)
- Engineer MAJOR 6 (mini_random undefined state) → mechanic deleted entirely. (§5.7)
- Engineer MAJOR 7 (storyCheckInDetection Yogo query feasibility) → 15-min polling refreshes a `last_class_at` field; story-detection compares against this materialized value, no live N+1 query. (§2.3, §2.4)
- Engineer MAJOR 8 (renewal detection timing ambiguity) → Yogo-side `last_renewed_at` used; polling-detection time stored separately. (§2.3)
- Engineer MAJOR 9 (Liga dos Campeões retroactive) → `monthly_points_snapshot` sealed at reset; late events credit prior period explicitly without altering ranking. (§2.4, §9.2)
- Engineer MAJOR 10 (event log growth) → defined retention with cold archive and aggregation. (§3.3)
- Game Designer MAJOR 4 (reel >> training week) → reel reduced to 250 pts cap 1/mo, x1.5 boost. (§5.1, §6.2)
- Game Designer MAJOR 5 (shield manipulation) → shield default-auto, opt-out save, no broken_streak penalty. (§5.4)
- Game Designer MAJOR 7 (Champions League exile) → parallel leaderboard, returns next month. (§9.2)
- Game Designer MAJOR 9 (Livre dominates rankings) → atleta boost deleted; pointsPerClass recalibrated; P8 milestones added. (§4, §6.3)
- Game Designer MAJOR 13 (inactivity penalty churn) → deleted. (§5.3)
- Game Designer MAJOR 14 (1 mês grátis accounting) → replaced with 25% discount. (§9.1)
- Aluna Cética MAJOR 2 (excluded from embaixador_ratio) → boost deleted. (§6.3)
- Aluna Cética MAJOR 3 (1 reel = half her month) → reel reduced 600→250, capped 1/mo, boost 2.0→1.5. (§5.1)
- Aluna Cética MAJOR 6 (Diamante unreachable for P8) → thresholds recalibrated (80k XP, achievable in ~4 years P8). (§8.1)
- Aluna Cética MAJOR 7 (Liga dos Campeões invisible to her) → parallel leaderboard preserves normal ranking visibility; her standing is always shown. (§9.2)
- Aluna Cética MAJOR 8 (streak system inaccessible to her cadence) → P8 milestones give her own progression checkpoints not dependent on streaks. (§4.1)
- Aluna Cética MAJOR 11 (P8 has no milestones) → three milestones added. (§4.1)
- Marcelo MAJOR 7 (cross_training class_type mapping) → deferred V2. (§5.6, §13)
- Marcelo MAJOR 8 (dupla one-side-forgets) → deferred V2. (§5.6, §13)
- Marcelo MAJOR 9 (mini_random favoritism) → deleted. (§5.7)
- Marcelo MAJOR 10 (weekly challenge curation cost) → cut to 1/week, fixed pool of 5, Marcelo can override. (§7)
- Marcelo MAJOR 11 (duplicate suspect queue) → defined admin screen. (§11.1)
- Marcelo MAJOR 12 (monthly reset firefighting) → idempotent reset + audit log + admin alarm. (§2.4, §11.1)
- Legal MAJOR 5 (wall photo consent + revocation) → explicit signed consent flow, 7-day removal SLA. (§8.3, §10.4)
- Legal MAJOR 6 (duplicate detection LIA) → documented in DPIA prep. (§10.3)
- Legal MAJOR 7 (ManyChat / Vercel transfers) → DPA + SCCs in Phase 0. (§10.3)
- Legal MAJOR 8 (public broadcasts consent) → opt-in default-pseudonym ranking; explicit broadcast consent. (§10.7)
- Legal MAJOR 9 (minors) → <13 excluded, 13–17 parental consent. (§10.6)
- Legal MAJOR 10 (third-party data in referrals) → consent at referral generation, anonymous default. (§10.9)

**Deferred with reason:**
- Engineer MINOR 11 (shield month-boundary edge) → low impact; documented behaviour: shield resets day 1 independently; streak counter survives the reset (it's lifetime-style not points-style).
- Engineer MINOR 12 (boost query efficiency) → addressed by computed `weekend` predicate; remaining boost rows are small enough at 150 active students.
- Game Designer MAJOR 6 (multi_class_same_day exploit) → exploit removed by deleting the special trigger; back-to-back classes now simply credit normally.
- Game Designer MAJOR 8 (mini_random selection opacity) → deleted entirely; not deferred.
- Game Designer MAJOR 10 (cross_training single-modality penalty) → category removed from prize list along with deferred trigger.
- Game Designer MAJOR 11 (Day 28–31 desperation rush) → partially addressed by Champions League visibility for top players and P8 milestones for casual students; capacity-management discipline (booking caps) is an operational decision left to Marcelo.
- Game Designer MAJOR 12 (Diamante governance) → `decisionVote` removed; governance forum deferred to V2.
- Aluna Cética MINOR 9 (senha_secreta social anxiety) → still present in challenge pool but reduced from senha_secreta to optional `combo_surpresa`; challenge participation is itself opt-in via the broadcast consent toggle.
- Aluna Cética MINOR 10 (dupla orgulho friction) → deferred V2.
- Aluna Cética MINOR 12 (tone of broadcasts) → MVP keeps current bot copy. A copy review pass is a Phase 2 task (low effort, high alignment value).
- Legal MINOR 11 (music_choice via Spotify) → trigger deleted MVP.
- Legal MINOR 12 (versioning of profiling policy) → `consent_version` field captures material changes; full Art. 13(3) notification flow built when first policy revision happens.

---

End v3.1.
