---
title: StrikeLab v3.2 — Ship-Ready Gamification Spec
type: design
version: 3.2
status: draft
date: 2026-05-28
owner: Strike House Portugal
supersedes: StrikeLab v3.1 (round-1 candidate-B)
---

# StrikeLab v3.2

Gamification for Strike House (~150 subscribers, one operator, one owner/dev). v3.2 keeps the v3.1 spine — dual ledger, granular opt-in, Art. 22 confirmation, anti-shame defaults, IG verification, polling architecture, full admin UI — and hardens what would still cost the implementer a week of micro-decisions: month-boundary semantics, "first-N" race resolution, the economic model under stress, a Yogo coupon fallback, and a leaner UGC path that reduces GDPR surface.

---

## 1. Design Principles

1. Opt-in by default, opt-out friction-free.
2. Reward training first, social second.
3. No public shaming, no health-discriminatory penalties.
4. Operationally light: every state change is either fully automated + idempotent OR has an admin UI screen with audit log.
5. GDPR-compliant by design: lawful basis per category, DPIA before launch, retention TTLs, in-code erasure, Art. 22 mitigated by human confirmation.
6. **No mechanic ships without a worked example.** Every formula, selection algorithm, and edge case has a concrete walk-through in this spec. If we cannot write the example, we cannot ship the rule.

---

## 2. Architecture

### 2.1 Storage

Turso (libSQL) is the production write path; local SQLite is dev-only. Three logical stores plus one new sealed-snapshot:

- `gamification_event_log` — append-only source of truth. Columns: `event_id` (UUID v7, time-ordered), `customer_id`, `event_type` (enum §2.6), `payload_json`, `created_at` (UTC), `lisbon_local_date` (generated DATE), `points_period` (generated YYYY-MM from `lisbon_local_date`), `points_delta`, `xp_delta`, `source`, `actor`, `idempotency_key` (UNIQUE). Generated columns are critical for race-free month-boundary attribution (§2.5).
- `gamification_state` — derived materialised view per `customer_id`. Rebuildable by replay.
- `gamification_identity` — junction of upstream IDs (§2.2).
- `monthly_points_snapshot` — sealed per `(customer_id, points_period)`: final totals + frozen tier + frozen ranks. Written by the reset cron, never mutated. Reads: Liga dos Campeões, audit views, historical admin lookups. Late events credit via explicit `late_credit_applied` audit, never silently.

### 2.2 Identity resolution

`gamification_identity` maps Yogo `customer_id` (source of truth) ↔ `phone_e164` ↔ `whatsapp_wa_id` ↔ optional `instagram_handle`. IG requires a verification challenge (bot DMs a 6-char code, student replies from IG, bot writes `ig_verified_at`). UGC credits only when `ig_verified_at IS NOT NULL`.

### 2.3 Polling Yogo

Two tiers, both Vercel cron-scheduled:

- **Class window polling.** Every 15 min, 06:00–23:00 Lisbon. `/classes?startDate=today&populate[]=checkins`. Diff `(customer_id, class_id)` against last poll → `checkin_observed` events with `idempotency_key = "checkin:{customer_id}:{class_id}"`.
- **Daily memberships sweep.** 03:00 Lisbon. `/reports/memberships-list` full pull, diff → `subscription_{started,renewed,cancelled}`. Renewal uses Yogo's `last_renewed_at` as canonical; observation time stored separately.

**All temporal triggers reference Yogo-side timestamps**, never poll observation time. This is the rule that makes 15-min lag tolerable.

### 2.4 Vercel Pro vs Hobby — decided

**Pro.** Hobby's daily cron limit makes 15-min polling impossible without an external scheduler; alternatives (small VPS, GitHub Actions cron) introduce a second piece of infra with its own outage modes and secret storage. At ~€20/mo, Pro is the cheapest path. If Pro is unavailable, the spec degrades gracefully via a windowed-cron pattern (§15).

### 2.5 Monthly reset — precise semantics

Cron runs **02:30 Lisbon on day 1 of each month** (clears DST in both directions). Algorithm:

1. Acquire advisory lock via insert into `gamification_state_meta(reset_id, started_at, status='running')`. If a `running` row exists < 30 min old, abort (concurrent run); > 30 min, log alarm and proceed (recovery).
2. Write `monthly_reset_started` with the `reset_id`.
3. **Seal previous month.** Single `INSERT … SELECT … FROM gamification_state` into `monthly_points_snapshot` per `(customer_id, points_period)` capturing final `monthly_points`, `current_tier`, `category_ranks`. Immutable thereafter except via explicit `late_credit_applied` audits.
4. **Compute rankings** from the snapshot; Top 3/category → `champions_league_roster` for the new month.
5. **Zero monthly_points** in batches of 50, each batch emitting `monthly_reset_applied_batch` with a `points_zeroed_at_reset_id` field; retries skip customers already zeroed in that reset_id.
6. Write `monthly_reset_completed`, close lock.

**Month-boundary attribution (the failure mode the incumbent only gestured at):** `lisbon_local_date` is derived from `created_at` at insert time using `AT TIME ZONE 'Europe/Lisbon'`; `points_period` is `strftime('%Y-%m', lisbon_local_date)`. Therefore: a check-in at 23:55 Jan 31 polled at 00:05 Feb 1 credits to January (Yogo's class-start timestamp drives `created_at`, not poll time). A renewal observed Feb 1 03:00 with `last_renewed_at = '2026-01-31 22:00 UTC'` credits to January. A late-arriving credit (≥ 6h after period end) updates `monthly_points_snapshot` AND writes `late_credit_applied`; the student's ranking does not change for prizes already awarded; admin queue surfaces deltas > 100 pts. Manual admin adjustments to sealed periods also write `late_credit_applied`. The audit log is truth; the snapshot is informational once sealed. This eliminates the entire class of "streak broke because timezone was wrong" bugs.

### 2.6 Event type enumeration

A finite, frozen list keyed by exact `event_type` string. Adding a new event type is a code change, not config. The v3.2 contract: `checkin_observed`; subscription lifecycle (`subscription_started|renewed|cancelled`); streak events (`streak_{5,10,15}_reached`, `streak_broken`, `streak_shield_applied|saved`); training milestones (`full_plan_completed_p{8,12}`, `plan_milestone_reached`, `livre_milestone_reached`, `perfect_week_completed`, `supera_teu_ritmo`); referrals (`referral_phase_{1,2}`, `referral_trial_only`); challenges (`weekly_challenge_completed|won`); UGC (`story_checkin`, `story_no_class`, `feed_post`, `reel`); `low_usage_checkin` (0 pts, message only); boost lifecycle (`boost_started|expired`); tier governance (`tier_change_proposed|confirmed|denied`); reset events (`monthly_reset_started|applied_batch|completed`); `late_credit_applied`; prize lifecycle (`prize_redeemed|stock_adjusted`); admin actions (`manual_adjustment`, `tier_override`); consent/identity (`opt_in|opt_out`, `consent_updated`, `pause_set|cleared`, `erasure_requested|applied`, `identity_link`, `identity_verify_ig`); anti-fraud (`duplicate_suspect_flagged|resolved`). Anything else is a bug.

### 2.7 Race condition handling

Append-then-materialize. Single-writer-per-customer queue partitioned by `hash(customer_id) % N`. Boost multipliers evaluated at materialisation against the boost set valid at the event's `created_at`, never at "now". Tier evaluation runs nightly + on admin demand, never per-credit.

---

## 3. Ledgers

### 3.1 Dual ledger

Identical to v3.1: `monthly_points` (zeroed day 1) drives rankings + prizes; `lifetime_xp` (accrues, never decays for active students) drives tier qualification; **XP receives base value, no boost multiplication**. Heavy-boost months don't permanently distort tier progression.

### 3.2 Right to erasure

1. `gamification_identity` → tombstone (PII nulled, `customer_id` retained as opaque hash for ranking-history reconciliation).
2. `gamification_state` → `lifetime_xp` and `monthly_points` = 0; `current_tier` = NULL.
3. `gamification_event_log` → payload PII stripped; retain `event_type`, `points_delta`, hashed `customer_id`, timestamp.
4. `monthly_points_snapshot` → student replaced by `[erased]` sentinel in historical references.
5. Wall photo: removed within 7 days.
6. WA group broadcasts: deleted where bot has rights, otherwise flagged `[student requested removal]`. Non-recoverable nature documented in privacy notice before consent.
7. `erasure_applied` audit retained 5 years (legitimate interest, legal defense).

### 3.3 Retention

24mo hot full payload → 60mo cold anonymised → purge. Enforced by a monthly retention cron, not policy.

---

## 4. Plans & Economic Model

### 4.1 Points per class + plan bonuses

Identical structure to v3.1 — but v3.2 publishes the economic break-even, which v3.1 asserted without showing.

| Plan | Price | classes/mo | pointsPerClass | Full-plan bonus | Perfect week | PW bonus |
|---|---|---|---|---|---|---|
| P8 | €50 | 8 | 110 | 600 | ≥2/wk | 300 |
| P12 | €60 | 12 | 80 | 700 | ≥3/wk | 280 |
| Livre | €75 | 16–20 | 55 | (milestones) | ≥4/wk | 220 |

### 4.2 Worked maxima (no UGC, no referrals)

| Plan | Max base pts/mo | Realistic median |
|---|---|---|
| P8 perfect (8 classes, 4 PW) | 8×110 + 600 + 4×300 = 2,680 | 6 × 110 + 200 = 860 |
| P12 perfect (12, 4 PW) | 12×80 + 700 + 4×280 = 2,780 | 9 × 80 + 350 = 1,070 |
| Livre (16, 4 PW, milestones 200/300/400/500) | 16×55 + 4×220 + 1,400 = 3,160 | 12 × 55 + 800 = 1,460 |

With stacked legitimate boosts (weekend ×1.8 on 2 classes, streak_10 ×1.6, renovação ×1.5 — capped at ×3.0) a maxed P8 in a renewal month lands 4,500–6,000 pts. So Silver (5,000) is reachable by a top P8 in a renewal month, Gold (8,500) only by a top Livre, Diamond (12,000) genuinely rare — the intended distribution.

### 4.3 Prize economics — break-even shown

Estimated monthly distribution at v3.2 thresholds (top quartile ≈ 38 students reaches at least one threshold):

| Prize | Threshold | Est. winners | Unit cost | Monthly |
|---|---|---|---|---|
| Bronze (merch pack) | 2,500 | ~25 | €8 | €200 |
| Silver (T-shirt) | 5,000 | ~8 | €25 | €200 |
| Gold (casaco) | 8,500 | ~3 | €40 | €120 |
| Diamond (25% next-month discount) | 12,000 | ~1 | €15 (opp.) | €15 |
| **Total** | | | | **~€535/mo** |

MRR at 150 × ~€60 ARPU ≈ €9,000. Prize cost ≈ **6% of MRR**; gym retention spend norms are 3–8%. Plus Vercel Pro (~€20) and ManyChat (~€15), total gamification opex < 7% of MRR. This is the break-even the incumbent omitted. If actual density is higher than estimated, the admin UI exposes a per-tier monthly cap with overflow → next-month entitlement (v3.2 ships caps OFF; toggle is the relief valve).

### 4.4 Plan milestones (unchanged from v3.1)

P8 (4/6/8 → 200/300/600) and P12 (6/9/12 → 250/350/700) milestones preserved. Livre keeps 200/300/400/500 progressive. `atleta` boost remains deleted.

---

## 5. Triggers

Identical to v3.1 (Kept / Inverted / Deleted) with two additions and one tightening:

### 5.1 Tightened

`renewal_processed` (+350 pts, ×1.5 boost 14d) requires a **paid renewal of an active recurring subscription** — Yogo invoice with status `paid` or `pending`. Free-month gifts, comped renewals, and migrated subscriptions do NOT trigger the bonus. Closes the surface where Marcelo's compassionate gestures inadvertently credit points.

### 5.2 Added

- `early_renewal` (+200, no boost): subscription renewed ≥ 5 days before period end. Tiny carrot for pre-paying.
- `comeback` (+250, neutral message): first check-in after ≥ 21 days absent. NOT a penalty — a positive event for returning. Idempotent per absence streak.

Two cheap engagement loops the incumbent cut too aggressively. No exploit surface (renewal is observed from Yogo, comeback is one-shot per absence), and they directly support the metrics the academy cares about: retention and reactivation.

### 5.3 Streak shield (semantics nailed down)

- One shield per calendar month, reset by the monthly cron.
- **Auto-apply**: at the moment a 5+ streak would break, if the student has not opted out, the shield activates retroactively, the counter is restored to its pre-break value, and `streak_shield_applied` is timestamped to the break moment.
- **Opt-out**: student sent `/poupar-escudo` previously → no auto-apply; student can then send `/usar-escudo` within 72h of the break to apply retroactively (current month's shield only; once used, gone).
- If the shield activates and the streak still breaks later in the same month, no penalty — streak ends, boost expires.

### 5.4 Trigger pairs (Dupla, Cross-training)

Deferred to V2. Cross-training needs a Yogo modality map that doesn't exist; Dupla manual-ack creates ops load with ~50% reporting drop-off. Return to MVP only if V2 ships them auto-detected.

---

## 6. Boosts

Identical to v3.1 §6 in mechanics and multipliers. Stack cap ×3.0; delta-sum formula; `atleta` and `embaixador_ratio` stay deleted. The only refinement:

### 6.1 Boost storage

`boosts` table: `(boost_id UUID, customer_id, kind, multiplier, started_at, expires_at, source_event)`. `weekend` is a calendar predicate, never stored; all others are rows. The materialiser queries `WHERE customer_id = ? AND started_at <= ? AND expires_at > ?` against the event's `created_at`; index `(customer_id, started_at, expires_at)` makes this O(log n) at our scale.

---

## 7. Weekly Challenges

One per week. Wed 12:00 → Sun 23:59 Lisbon. Pool of 5; no repeat within 4 weeks; Marcelo can override via admin UI. **Selection algorithm for "first-N" challenges (Flash Check-in):** a 5-min cron during the window scans new `checkin_observed` events whose `yogo.check_in_recorded_at` falls inside the window. Atomically: SELECT current winners ordered by Yogo timestamp ASC; for each new candidate not already in the set, INSERT into `challenge_winner` if `count < winners_max`; emit `weekly_challenge_completed` for new winners. Idempotency key: `challenge_win:{challenge_id}:{customer_id}`. Resolution is against Yogo time (not observation time), so it is race-free under polling lag and replay-deterministic.

Pool unchanged from v3.1: Flash Check-in, Aula Lotada, Hora H, Story-Treino, Combo Surpresa. The challenge-broadcasts toggle is separate from StrikeLab opt-in. Combo Surpresa is briefed to the coach Wednesday during the admin override step.

---

## 8. Tiers

Five tiers, lifetime status, benefits conditional on active subscription. Thresholds unchanged from v3.1 (0 / 5k / 15k / 40k / 80k XP). Diamante requires the §8.2 rubric. Wall photo requires a separately-signed paper consent, decoupled from the tier.

### 8.1 Tier benefit delivery — Yogo coupon decided

v3.1 left this as an open question. v3.2 decides: **assume CSV workflow; build API path only if Yogo confirms.** Day 1 monthly batch: admin UI generates a CSV (`customer_id, name, email, discount_pct, valid_from, valid_until, tier`). Marcelo reviews and submits to Yogo support or uploads if Yogo's UI accepts bulk. Per the Yogo API skill notes, programmatic coupon creation is unconfirmed — ship the lowest-common-denominator path. If Yogo confirms programmatic creation in time for Phase 1, the same button posts via API instead; user flow is identical. Decouples rollout from an unproven Yogo capability and keeps Marcelo in the loop.

Diamante `freeMonthsPerYear` stays deferred. MVP Diamante perks: 15% monthly discount + one private session/month (admin UI ticket → Marcelo's PT calendar) + wall photo opportunity (consent-gated) + recognition. Generous enough to matter without depending on Yogo automation that doesn't exist.

### 8.2 Diamante rubric (unchanged from v3.1)

Two-of-three: Conduct, Engagement, Continuity. Decision recorded with justification. Re-eval automatic in 6 months on denial.

---

## 9. Monthly Prizes

Thresholds and prizes unchanged from v3.1 (2,500 / 5,000 / 8,500 / 12,000 → merch / T-shirt / casaco / 25% next-month discount). Break-even shown in §4.3.

### 9.1 Liga dos Campeões — rules pinned down

v3.1 said Top 3 enter a parallel leaderboard the following month. v3.2 pins down re-entry to avoid perma-champions and permanent exile:

- Top 3 per category in month N enter Champions League for month N+1 only.
- During N+1, monthly_points still accumulate and the student still appears in the regular ranking but is not eligible for the regular monthly prize — visibility preserved.
- End of N+1: parallel-board winner gets a recognition badge (no monetary prize, no extra masterclass — kept cheap to discourage gaming).
- In N+2, all ex-champions return to regular ranking, eligible again.
- A student who would re-enter Champions League by winning their category in N+1 while in Champions League is **deferred one month** — they return to regular ranking in N+2 and enter Champions League in N+3.

### 9.2 Categories

`most_classes`, `biggest_streak`, `biggest_referrer`, `biggest_embaixador` (UGC paired with check-ins). `most_cross_trainer` deferred to V2.

### 9.3 Tie-breaking

In any category, ties are broken first by `lifetime_xp` ASC (favouring newer students for visibility), then by `customer_id` ASC for total determinism. The choice of "newer wins" is deliberate: it creates one more avenue for new students to win and reduces the structural advantage of long-term high-XP students stacking on already-high lifetime totals.

---

## 10. Anti-Abuse + GDPR

All v3.1 §10 mechanics preserved. v3.2 changes:

### 10.1 UGC path — reduce GDPR surface by reframing

v3.1 routed UGC through ManyChat watching IG (cross-system processing, IG handle verification, US-processor SCC paperwork, false-negative queue). v3.2 retains all of that as the "auto" path but adds and prefers a **bot-led submission path** as default:

- Within 24h of a check-in, student sends `/postei` to the bot with a link to their IG story/post/reel.
- Bot writes `story_checkin` / `feed_post` / `reel` with `source = bot_command`.
- Bot optionally fetches IG oEmbed to confirm the post exists; failure flags for admin review but does not block credit.

This removes ManyChat from the critical path for the majority of UGC (lawful basis becomes contract, since the student is explicitly submitting), eliminates IG scraping consent for those students, and keeps ManyChat as an opt-in "auto-detect my IG" upgrade for students who don't want to send `/postei` each time. ManyChat thus becomes optional, materially shrinking the SCC chain and DPIA footprint. The manual approve queue still exists for both paths.

### 10.2 Lawful basis table (updated)

| Processing category | Lawful basis |
|---|---|
| Check-in tracking (Yogo) | Contract |
| Subscription events | Contract |
| Bot UGC submission (`/postei`) | Contract (student-initiated) |
| Auto UGC detection (IG ↔ Yogo via ManyChat) | Explicit consent |
| Ranking participation | Explicit consent, default pseudonymous |
| Anti-fraud monitoring | Legitimate interest (LIA documented) |
| Tier evaluation with economic effect | Contract + explicit human confirmation (Art. 22) |
| Marketing-style broadcasts | Explicit consent, separately opt-in |

### 10.3 DPO

**Ricardo is designated controller contact**; external fractional DPO (€150–300/mo) is contracted only if a regulator inquiry materialises OR the subscriber base exceeds 250. Art. 37 mandatory DPO hinges on "large-scale" systematic monitoring; 150 subscribers with point-total profiling is not large-scale. DPIA + RoPA + Ricardo-as-controller + documented LIA for fraud monitoring is the proportionate posture.

### 10.4 Existing v3.1 GDPR sections preserved

Opt-in flow (4 granular toggles), DPIA, retention TTLs, DPA/SCC with ManyChat/Vercel/Turso, Art. 17 erasure, Art. 22 mitigation (admin tap for tier promotions), minors (<13 excluded, 13–17 parental consent), pseudonymous public ranking by default, no inactivity penalties, referral data minimisation.

---

## 11. Admin UI — MVP scope

All 13 v3.1 screens ship. v3.2 adds three:

14. **Late-credit review queue** — `late_credit_applied` with delta > 100 pts; admin confirms or reverses.
15. **Comeback wall** — students with `comeback` events in the last 14 days, with one-click "Send personal welcome" using a Marcelo-editable template. Converts the signal into a human reaching out.
16. **Prize-cap toggle** — per-tier monthly cap with overflow → next-month entitlement (relief valve for §4.3).

Every admin action writes to `gamification_event_log` with `source = admin_ui` and operator identity.

---

## 12. Phased Rollout — realistic capacity

v3.1 asserted MVP in 6 weeks. v3.2 grounds the estimate against one dev (Ricardo) part-time alongside operating the academy ≈ 15h/week of code time. Each "sprint" below is two calendar weeks. **MVP = Phase 0 + Phase 1 = 8 weeks of calendar time, not 6** — accommodating one week/month of unplanned ops work (sick coach, broken hot water, immigration paperwork).

### Phase 0 — Foundations (2 weeks, ~30h)

- Turso migration, schema, generated columns for `lisbon_local_date` / `points_period`.
- Bot onboarding flow with 4 granular consent toggles + IG verification challenge.
- Yogo polling tiers 1 and 2; idempotent event writes; event-type enum frozen.
- Identity resolution end-to-end.
- DPIA + privacy notice published; DPA/SCC processes initiated (paperwork only — no blocking).
- Admin UI shell + per-student view + manual adjustment + pause flags + erasure handler.

**Exit criteria for Phase 0:** A test student opt-in → IG verify → manual check-in event → state visible in admin UI → opt-out → erasure → data zeroed and audited. End-to-end demo to Marcelo.

### Phase 1 — MVP gamification (4 weeks, ~60h)

- Monthly points + lifetime XP credit on check-in with plan-aware values.
- Tier evaluation nightly + Art. 22 confirmation queue.
- Triggers: renewal_processed, early_renewal, comeback, streak_5/10/15 + shield, supera_teu_ritmo, full_plan_completion, plan milestones.
- Boosts: weekend, renovação, streak ×3, supera_ritmo.
- Monthly reset cron (idempotent), reset audit log, snapshot table.
- Monthly prize tiers + POS redemption + inventory + prize-cap toggle.
- Discount apply tool (CSV-first; Yogo API if confirmed).
- Diamante review queue.
- Late-credit review queue.
- Comeback wall.

**Exit criteria for Phase 1:** One full month of dual-ledger operation in shadow mode (events written, no student-facing UI). One month end-of-month reset successfully sealed a `monthly_points_snapshot`. One Marcelo-led prize redemption from end-to-end. One discount batch CSV delivered. Confirmation by Marcelo that the daily admin workload is < 15 min/day.

### Phase 2 — Social (4 weeks, ~60h)

- Bot UGC submission (`/postei`) with optional oEmbed verification.
- ManyChat auto-detect upgrade (opt-in per student).
- UGC manual approve queue.
- Referral with phased payout + anti-ring detection + duplicate suspect queue.
- One weekly challenge per week (rotation of 5).
- Champions League parallel leaderboard with §9.1 re-entry rules.
- Pseudonymous public ranking + opt-in broadcasts.

**Exit criteria for Phase 2:** 30 days of weekly challenges run without admin intervention beyond override toggles. ≥ 20 UGC events credited via `/postei`. One referral phase-2 payout completed. Champions League rotation observed across two months.

### Phase 3 — V2 (later)

Cross-training (post Yogo modality mapping), Dupla (auto-detected), Diamante `freeMonthsPerYear` (post Yogo coupon-for-month flow), music/store integrations, governance forum, story-organic re-evaluation (only if removal demonstrates economic damage).

---

## 13. Test Plan & Launch Criteria

The incumbent spec described what to build but not how to know it works. v3.2 adds:

### 13.1 Pre-launch checklist (Phase 1)

1. **Replay test**: take a 30-day Yogo CSV export, replay all events; verify resulting state matches a hand-computed expectation for 5 representative students (P8 disciplined, P8 lapsing, P12 average, Livre maxed, Iniciante new).
2. **Idempotency test**: re-run the same replay; assert no double-credits.
3. **Month-boundary test**: synthetic events at 23:59 Jan 31, 00:01 Feb 1, plus a renewal straddling the boundary; assert §2.5 attribution exactly.
4. **Reset cron dry-run**: simulate on a production snapshot copy in staging; verify sealed snapshot matches input state.
5. **Erasure walkthrough**: end-to-end erasure of a synthetic student; assert PII removed, audit intact, public artefacts triggered.
6. **Art. 22 queue**: synthetic tier promotion; assert no benefit applies until admin tap.
7. **Race test**: two concurrent check-in writes for same `(customer, class)`; assert one discarded by idempotency_key.

### 13.2 Launch criteria

Phase 1 ships to production only when:

- All §13.1 checks pass.
- DPIA signed off by Ricardo and one external reviewer (lawyer or experienced DPO).
- Marcelo has trained on the admin UI for 2 sessions and can complete a prize redemption, manual adjustment, and tier confirmation unassisted.
- At least 10 student opt-ins captured in shadow mode (real students, real consent — not test accounts).
- Rollback plan: a single config flag (`STRIKELAB_ENABLED=false`) suppresses all student-facing UI and broadcasts while preserving the event log for forensic recovery.

### 13.3 Post-launch metrics

Weekly review at Monday operations meeting:

- Opt-in rate (target: ≥ 40% of active subscribers in month 1).
- Opt-out rate (red flag: > 5% in any week).
- Median admin time per day (red flag: > 30 min).
- Erasure requests (any → discussion).
- Late-credit volume (red flag: > 5 events/week with delta > 100 pts).
- Prize redemption count vs forecast.

If any red flag triggers two consecutive weeks, the next sprint pauses new feature work to address it.

---

## 14. Cut List + Decisions

All v3.1 cuts preserved: `inactivity_long`, `broken_streak` and other penalties; `story_organic` separate trigger; `embaixador_ratio`, `atleta` boosts; `mini_random`; `multi_class_same_day "variable"`; `cross_training`, `dupla` manual-ack (deferred V2); `decisionVote` perk; `freeMonthsPerYear` Diamante (deferred V2); `music_choice`, `store_purchase`; 2× weekly challenges (cut to 1×); "1 mês grátis" replaced with 25% next-month discount.

v3.2 decisions previously listed as open questions:

| Item | Decision |
|---|---|
| Vercel Pro vs Hobby | **Pro.** Hobby fallback documented (§2.4, §15). |
| Yogo coupon API | **CSV-first.** API path if Yogo confirms (§8.1). |
| WhatsApp Cloud API timing | **Stay on existing bot for Phase 0–2.** WA Cloud is a separate roadmap effort. |
| Minors threshold | **<13 excluded; 13–17 parental consent (paper, scanned).** Marcelo audits register before Phase 1. |
| DPO designation | **Ricardo controller contact; fractional DPO triggered at >250 subscribers or regulator inquiry** (§10.3). |
| Legacy discounts conflict | **Grandfathered OR v3.2 tier benefit, whichever is greater.** `legacy_discount_override` flag on identity row. Marcelo audits during Phase 0. |
| Champions League prize | **Recognition badge + opt-in shoutout broadcast. No monetary prize.** |
| Anti-ring threshold | **Ship v3.1's 60-day window + 3-per-90-day cap. Tune at end of Phase 2.** |

No open questions remaining on the critical path. The spec is implementable as written.

---

## 15. Vercel Hobby Fallback (appendix)

If Pro is denied during Phase 0: peak windows (Mon–Fri 12:00–14:00 + 18:00–22:00 Lisbon, Sat–Sun 09:00–13:00 + 16:00–20:00) get 15-min polling via a daily cron that schedules a self-terminating windowed loop; off-peak gets 30 min. ~50 LOC, off-peak detection lag up to 30 min — invisible to students because no streak/challenge timer references off-peak hours. This is the only piece of v3.2 that gets harder without Pro.

---

End v3.2.
