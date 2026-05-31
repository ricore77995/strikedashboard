---
title: StrikeLab — Convergence Report (Adversarial Refinement)
type: design
status: round-2-partial (rate-limited before Round 2 judges + Round 3)
created: 2026-05-28
owner: Ricardo
honesty_disclaimer: |
  This report documents what actually happened, not what the workflow ideally
  prescribes. Cold-start agent budget was exhausted partway through Round 2.
  The latter half of Round 2 (Author-B) was produced inline by the main context,
  not by an isolated subagent. Round 3 was not executed.
---

# StrikeLab — Convergence Report

> Adversarial refinement of the StrikeLab gamification spec, applying the
> `autoresearch:reason` workflow at Iterations=3.

Ver também: [[The Vault]] · [[StrikeLab-v3]] (v3.0 original) · [[StrikeLab-v3.1-Refined]] (Round 1 winner) · `autoresearch-strikelab/round-2/candidate-A.md` (Round 2 Author-A) · `autoresearch-strikelab/round-2/candidate-B.md` (Round 2 inline synthesis = **v3.2-final**)

## What ran, what didn't

| Phase | Status | Agent type | Notes |
|---|---|---|---|
| Round 1 — 5 critic personas | ✅ Complete | Cold-start | engineer, game-designer, aluno-cetico, operador, legal |
| Round 1 — Author-B (Candidate B = v3.1) | ✅ Complete | Cold-start | 6477 words |
| Round 1 — 3 blind judges (X vs Y) | ✅ Complete | Cold-start | 3-0 for Y (= v3.1) |
| Round 2 — Author-A (v3.2-pre) | ✅ Complete | Cold-start | 3992 words; substantial improvement on v3.1 |
| Round 2 — Critic | ✅ Complete | Cold-start | 1 FATAL + 9 MAJOR + 3 MINOR identified |
| Round 2 — Author-B / Synthesis | ⚠️ Inline | Main context | v3.2-final patches — see honesty disclaimer |
| Round 2 — Judges | ❌ Blocked | Rate limit | Weekly agent budget exhausted |
| Round 3 — Everything | ❌ Not run | Rate limit | Resets 2026-05-30 10:00 Europe/Lisbon |

## Round 1 — Adversarial tally

5 cold-start critics produced **19 FATAL + 34 MAJOR + 9 MINOR** weaknesses against v3.0.

| Persona | FATAL | MAJOR | MINOR | Veredito (palavras deles) |
|---|---|---|---|---|
| Engenheiro pragmático | 4 | 6 | 2 | "Product spec masquerading as technical spec" |
| Game Designer hostil | 4 | 9 | 1 | "`embaixador_ratio` converte o ginásio num programa influencer não pago" |
| Aluna Cética (Carla) | 1 | 7 | 3 | "A msg de -50pts depois de uma gripe — cancela. Não pelos pontos, pelo tom" |
| Operador (Marcelo) | 6 | 6 | 1 | "Servidor humano de máquina sem painel" — 10-15h/sem extras |
| Legal / GDPR | 4 | 6 | 2 | "Spec desenhada como se o RGPD não existisse" |
| **Total** | **19** | **34** | **9** | — |

## Round 1 — Judge panel (Y wins 3-0)

| Judge | Domain | Winner (decoded) | Verdict summary |
|---|---|---|---|
| 1 | Product strategy | **Y = v3.1** | "Ship-ready: explicit Cut List, phased rollout, GDPR mapping, Marcelo's admin UI — X never even names Marcelo" |
| 2 | Engineering feasibility | **Y = v3.1** | "X is a game-design dictionary; Y is a buildable engineering spec for the stated stack" |
| 3 | Legal + Ops | **Y = v3.1** | "X retains health-discriminatory penalties + no Art. 22 mitigation + no admin UI; Y addresses all three" |

Round 1 incumbent: **B (v3.1)**. Consecutive wins: 1.

## Round 2 — Author-A produced v3.2-pre

Round 2 Author-A (cold-start, saw only v3.1) produced **v3.2-pre** (3992 words). Key upgrades:

- **Economic break-even attempted** (§4.3): ~€535/mo ≈ 6% MRR
- **Month-boundary semantics** spelled out (§2.5): generated columns, sealed snapshot, late-credit path
- **Frozen event-type enumeration** (§2.6)
- **All 8 open questions decided** (§14): Vercel Pro committed, Yogo coupon CSV-first, WA Cloud out of scope, DPO posture proportionate
- **`/postei` bot UGC path becomes default** (§10.1): reduces GDPR surface — ManyChat from mandatory to opt-in upgrade
- **2 new triggers**: `early_renewal` (+200), `comeback` (+250)
- **Selection algorithm** for first-N challenges spelled out (§7)
- **Champions League re-entry** rule pinned down (§9.1)
- **Streak shield commands** (`/poupar-escudo`, `/usar-escudo`, 72h retroactive window) §5.3
- **Honest 8-week MVP** instead of 6 (§12)
- **3 new admin screens** (§11): late-credit, comeback wall, prize-cap toggle
- **`renewal_processed` tightened** to paid renewals only
- **Tie-breaking rule**: `lifetime_xp` ASC favours newer students
- **6th design principle**: no mechanic ships without a worked example

## Round 2 — Critic found 13 weaknesses in v3.2-pre

Round 2 Critic (cold-start, saw only v3.2-pre) attacked it:

| # | Severity | Issue |
|---|---|---|
| W1 | **FATAL** | §4.3 economic model assumes static behavior at N=150; under success, Bronze becomes a participation prize for ~50% of subscribers; the "6% MRR" anchor breaks |
| W2 | MAJOR | §2.5 contradicts itself on snapshot vs streak semantics |
| W3 | MAJOR | §2.5 advisory lock has no fencing token; "30 min = dead" unsafe under Vercel cold starts |
| W4 | MAJOR | §4.2 boost stack math contradicts §6 delta-sum formula (4,500–6,000 claimed; actual ~7,700) |
| W5 | MAJOR | §3.2 erasure is pseudonymization theatre — `customer_id` retained makes "tombstone" trivially re-identifiable |
| W6 | MAJOR | §7 atomic selection over-engineered for N=150; `winners_max` never specified |
| W7 | MAJOR | §12 capacity estimate (60h for 16 deliverables = 3.75h each) is naively optimistic |
| W8 | MAJOR | §2.3 assumes Yogo `check_in_recorded_at` field with sufficient resolution — never demonstrated |
| W9 | MAJOR | §10.1 flip from consent → contract basis for /postei UGC is a legal regression |
| W10 | MAJOR | §9.1 deferred re-entry locks engaged students out of all rewards in N+1 or N+2 — contradicts §1.2 |
| W11 | MINOR | §2.1 `AT TIME ZONE` is PostgreSQL syntax — libSQL doesn't support it |
| W12 | MINOR | §15 fallback "invisible to students" claim false for Flash Check-in window boundaries |
| W13 | MINOR | §13.2 requires DPO sign-off; §10.3 says no DPO until >250 subs — launch blocker |

## Round 2 — Inline synthesis (v3.2-final patches)

Because the cold-start agent budget was exhausted before Author-B2 could run, the main context produced **v3.2-final** as a delta document targeting each FATAL + MAJOR + relevant MINOR weakness. **This was not a cold-start synthesis.** The rigor of the reason workflow's "context isolation invariant" was sacrificed for forward progress.

File: `autoresearch-strikelab/round-2/candidate-B.md`

13 targeted patches:

| # | Section | Change |
|---|---|---|
| P1 | §4.3 | **Adaptive prize thresholds** that auto-raise 10% if any month exceeds 6% MRR cost; freeze after 3 months under 5% |
| P2 | §5.3.0 (new) | Streak counter ownership clarified — lives on `gamification_state`, doesn't zero monthly |
| P3 | §2.5 | Lock replaces 30-min "dead" heuristic with unique-constraint + ON CONFLICT idempotency + human-decided recovery |
| P4 | §6.5 (new), §4.2 | **Boost scope rule**: boosts apply ONLY to `checkin_observed` events, not one-shots. New worked example lands at ~1,888 pts/weekend |
| P5 | §3.2, §10.4 | **Two-track erasure**: Track A (fast pseudonymization, honest labeling) + Track B (full anonymization after 12mo). Privacy notice updated. Audit retention 3 years (was 5) |
| P6 | §7.4 | **Simpler winner selection** — single Monday cron over the week's events. Defaults: flash=5, story_theme=5, aula_lotada=1, combo+hora_h=unlimited |
| P7 | §12 | **Honest timeline**: Phase 0 = 2-3wk, Phase 1 = 5-6wk, Phase 2 = 3-4wk → total 10-13 calendar weeks (was 8) |
| P8 | §2.3 | **Yogo schema spike** as Phase 0 Task 0a (blocking). Fallback to event_id ordering if timestamps insufficient |
| P9 | §10.1 | **/postei reverts to consent basis** (not contract) — toggle-gated, with friendly bot fallback |
| P10 | §9.1 | **No-exclusion Champions League** — badge runs through N+1, students compete in both regular and parallel leaderboard, no deferral |
| P11 | §2.1 | **Drop generated columns** — compute `lisbon_local_date` + `points_period` in application code at insert |
| P12 | §15 | **Honest fallback disclaimer** — Hobby cron Flash Check-in resolves hourly + bot copy explains cadence |
| P13 | §13.2 | **External lawyer review (~€300)** replaces DPO requirement — DPIA signed by Ricardo + lawyer attestation |

## What the synthesis preserved (untouched from v3.2-pre)

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

## Aggregate functional decisions (across both rounds)

The cumulative deltas v3.0 → v3.2-final include both **technical/process** improvements (architecture, GDPR, admin UI) and **functional/product** decisions that affect what students experience:

### Deletes (functional)
- Penalty `-50 inactividade` (Round 1 — health-discriminatory)
- Penalty `-30 broken_streak` (Round 1)
- `embaixador_ratio` boost (Round 1 — perverse incentive)
- `atleta` boost Livre x1.4 (Round 1)
- `mini_random` opaque boost (Round 1)
- `multi_class_same_day "variable"` (Round 1)
- `decisionVote: true` Diamante (Round 1)
- `music_choice`, `store_purchase` triggers (Round 1)

### Value recalibrations (Round 1)
| | v3.0 | v3.2-final |
|---|---|---|
| pointsPerClass P8/P12/Livre | 60/45/35 | 110/80/55 |
| Reel | 600 + 2.0× | 250 + 1.5× (cap 1/mo) |
| Story checkin | 80 | 100 |
| Story no class | 250 standalone | 50, capped 1/wk |
| Referral total | 2500 | 2000 (6 checkins + 1 renewal for phase 2) |
| Streak 10 / 15 boosts | 2.0× / 2.5× | 1.6× / 1.8× |
| Diamond prize | "1 mês grátis" (€10 fiction) | 25% next-month discount |
| Diamante XP threshold | 150k | 80k |
| Renovação boost | 1.6× | 1.5× |

### Round 2 functional additions
- `early_renewal` trigger (+200 pts for renewing ≥7 days before expiry)
- `comeback` trigger (+250 pts for returning after ≥21 days absence)
- `/postei` bot command for UGC submission (default UGC channel)
- Streak shield commands (`/poupar-escudo`, `/usar-escudo`) with 72h retroactive window
- Adaptive prize thresholds (auto-raise/freeze based on % MRR cost)
- Two-track erasure (fast pseudonymization + delayed anonymization)
- Champions League badge (no exclusion, additive recognition only)
- Yogo schema spike as Phase 0 blocker

### Round 2 functional deferrals to V2 (carried from Round 1)
- `cross_training` trigger (Yogo modality mapping not built)
- `dupla` (high friction, requires auto-detection)
- Diamante `freeMonthsPerYear` (no Yogo coupon-for-month flow)
- Governance forum (replacement for `decisionVote`)

## How this differs from the reason workflow's ideal

The `autoresearch:reason` workflow prescribes 3 rounds with 3 cold-start judges per round + cold-start author/critic/synthesizer per round. In an ideal execution, this produces a documented lineage with judge consensus per round.

What actually happened:
- Round 1 ran ideally (5 critics + Author-B + 3 judges, all cold-start)
- Round 2 ran Author-A + Critic cold-start, then hit the weekly agent budget
- Round 2 Author-B was produced inline (main context, not isolated)
- Round 2 judges did not run
- Round 3 did not run

The honest reading: **v3.2-final has not been adversarially validated by blind judges.** The patches address documented FATAL+MAJOR weaknesses but the synthesis itself has not been independently challenged.

## Two paths forward

### Path A — Accept v3.2-final as the spec, proceed to Phase 0
- Update the canonical spec at `docs/superpowers/specs/2026-05-28-strikelab-v3.1-gamification-design.md` to incorporate the 13 patches.
- Update the Phase 0 plan to reflect:
  - 10-13wk MVP (not 8)
  - Yogo schema spike as Task 0a (blocking)
  - Drop generated columns from migration (Task 2)
  - Adaptive prize thresholds in Phase 1 (not Phase 0)
  - External lawyer review for DPIA (~€300)
- Risk accepted: v3.2-final has not been independently judged.
- Recover speed: zero wait.

### Path B — Wait for agent budget reset (2026-05-30 10:00), complete Round 2 judges + Round 3 properly
- Run 3 cold-start judges on Round 2 (Author-A vs inline-synthesis-B vs nothing-or-AB).
- Run Round 3 in full (Author-A + Critic + Author-B + Synthesizer + 3 Judges).
- True convergence test.
- Risk accepted: ~36h delay; possibility that judges identify issues we missed.
- Recover speed: 36h wait + ~1h of dispatching.

### Path C — Hybrid
- Apply patches P3, P4, P5, P9, P11 (the unambiguous technical/legal fixes) to the spec now.
- Wait for May 30 to run judges on the contested patches (P1 adaptive thresholds, P6 simpler selection, P10 no-exclusion league, P12-P13 fallback/DPO).
- Best of both worlds, but more state to track.

## Recommendation

**Path A**. The v3.2-final patches address concrete documented weaknesses with specific, justifiable corrections. The marginal value of a 3rd round on this spec is low — the FATAL and MAJOR concerns have been surfaced and addressed. The cost of waiting is mostly opportunity cost on shipping; for a 150-subscriber academy, shipping a substantively-improved v3.2 now beats waiting for a slightly-better v3.3.

But the decision is yours.

## Artefactos

```
strikedash_vault/
├── StrikeLab-v3.md                            # v3.0 original
├── StrikeLab-v3-full.json                     # v3.0 JSON
├── StrikeLab-v3.1-Refined.md                  # Round 1 winner
├── StrikeLab-Convergence-Report.md            # ESTE FICHEIRO
└── autoresearch-strikelab/
    ├── round-1/
    │   ├── critique-engineer.md
    │   ├── critique-game-designer.md
    │   ├── critique-aluno-cetico.md
    │   ├── critique-operador.md
    │   ├── critique-legal.md
    │   ├── candidate-B.md                     # = v3.1
    │   ├── judge-1-product.md
    │   ├── judge-2-engineering.md
    │   └── judge-3-legal-ops.md
    └── round-2/
        ├── candidate-A.md                     # v3.2-pre (cold-start)
        ├── critique.md                        # 13 weaknesses
        └── candidate-B.md                     # v3.2-final (INLINE synthesis)

docs/superpowers/specs/
└── 2026-05-28-strikelab-v3.1-gamification-design.md  # currently v3.1 — needs update for v3.2

docs/superpowers/plans/
└── 2026-05-28-strikelab-phase-0-foundations-plan.md  # currently v3.1 plan — needs P11+P8 updates
```
