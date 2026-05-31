---
title: StrikeLab Phase 1 — Engine Handoff
type: reference
status: deployed-flags-off
created: 2026-05-31
tags:
  - strikelab
  - phase-1
  - handoff
  - gamification
related:
  - "[[StrikeLab-Phase-0-Handoff]]"
  - "[[StrikeLab-Phase-1-TODOs]]"
  - "[[StrikeLab-Pontuacao-Mapa]]"
  - "[[StrikeLab-v3.2-final]]"
---

# StrikeLab Phase 1 — Engine Handoff

**Date:** 2026-05-31 · **Commits:** 8 · **Branch:** `main`
**Status:** Code live in production. All feature flags OFF. Engine ready.

## TL;DR

Phase 1 turns on real gamification. Phase 0 ran silently (`pointsDelta=0`). Phase 1 adds: points per class by plan, boost multipliers, tier progression from XP, streak mechanics with shields, plan milestones, perfect week bonuses, comeback rewards, renewal bonuses, and a retroactive replay job for Phase 0 events.

**Numbers:** 18 source files · 15 test files · 110 gamification tests (446 total) · 0 TS errors

## Points Per Class

| Plan Category | Points/Class | Monthly Base (typical) |
|---------------|-------------|----------------------|
| P8 (8 sessões/mês) | **110** | 880 pts (8 classes) |
| P12 (12 sessões/mês) | **80** | 960 pts (12 classes) |
| Livre (24 sessões/mês) | **55** | 880-1100 pts (16-20 classes) |
| PT | 0 | — |
| OTHER | 0 | — |

## Boosts (apply ONLY to checkin_observed)

**Stacking formula:** `min(1.0 + Σ(multiplier - 1.0), 3.0)` — hard cap 3.0×

| Boost | Multiplier | Trigger |
|-------|-----------|---------|
| weekend | 1.8× | Sat/Sun (predicate, no storage) |
| renovacao | 1.5× | subscription_renewed event within 14 days |
| streak_5 | 1.3× | currentStreakDays ≥ 5 |
| streak_10 | 1.6× | currentStreakDays ≥ 10 (replaces 5) |
| streak_15 | 1.8× | currentStreakDays ≥ 15 (replaces 10) |
| supera_ritmo | 1.2× | weekly checkins > plan threshold |

Streak boosts are mutually exclusive (highest wins). XP is always unboosted.

## Tiers (Lifetime XP)

| Tier | Min XP | Approx Time (P8) |
|------|--------|-----------------|
| Iniciante 🥚 | 0 | — |
| Bronze 🥉 | 5,000 | ~3 months |
| Prata 🥈 | 15,000 | ~9-12 months |
| Ouro 🥇 | 40,000 | ~24-30 months |
| Diamante 💎 | 80,000 | ~45 months + rubric |

XP = base value only, NO boosts applied. Tier names in Pt-PT in the database.

## Streak Mechanics

- Track consecutive training days via checkin events (Lisbon timezone)
- Streak shield: 1×/month, auto-applied, renewed on monthly reset
- Streak milestones: `streak_5_activated`, `streak_10_activated`, `streak_15_activated`
- Shield event: `streak_shield_used`

## Milestones (one-shot, no boosts)

| Plan | Thresholds (classes → bonus) |
|------|------------------------------|
| P8 | 4→200, 6→300, 8→600 |
| P12 | 6→250, 9→350, 12→700 |
| Livre | 8→200, 12→300, 16→400, 20→500 |

## Other Triggers

| Trigger | Points | Details |
|---------|--------|---------|
| perfect_week | 300/280/220 | P8≥2, P12≥3, Livre≥4 classes/week |
| comeback | +250 | Return after ≥21 days absence |
| supera_teu_ritmo | +250 | Weekly checkins > plan threshold |
| subscription_renewed | +350 | paid_until advances ≥25 days |
| milestone_achieved | varies | Plan-based thresholds |

## Credit Gates (5 checks before points > 0)

1. Identity exists and not erased
2. `consentTraining === true`
3. Not paused (medical/vacation/personal)
4. `classify(membership) === "active"`
5. Not aggregator (`!isNonActionableLead()`)

## Feature Flags

| Flag | Purpose | Default |
|------|---------|---------|
| `STRIKELAB_ENABLED` | Master kill switch | false |
| `STRIKELAB_POLL_CLASSES_ENABLED` | Class poller gate | false |
| `STRIKELAB_POLL_MEMBERSHIPS_ENABLED` | Membership sweep gate | false |
| `STRIKELAB_REAL_POINTS_ENABLED` | **Phase 1 engine** | false |
| `STRIKELAB_OPS_START_HOUR` | Lisbon start hour | 6 |
| `STRIKELAB_OPS_END_HOUR` | Lisbon end hour | 23 |

## Cron Routes

| Route | Schedule | Purpose |
|-------|----------|---------|
| `/api/cron/strikelab-poll-classes` | */15 min | Class poller (now with real points + boosts) |
| `/api/cron/strikelab-poll-memberships` | Daily 2am | Membership sweep (now with renewal +350) |
| `/api/cron/strikelab-monthly-reset` | 1st of month 00:05 UTC | Reset + shield renewal |
| `/api/cron/strikelab-retroactive-replay` | Manual trigger | One-shot Phase 0 replay |

## Retroactive Replay

One-shot job that finds all Phase 0 `checkin_observed` events with `pointsDelta=0`, resolves the plan at the time, and creates NEW event rows with base points (no boosts). Phase 0 rows untouched for audit. Idempotent per-customer.

## File Index — Phase 1 New Files

### Library (`src/lib/gamification/`)

| File | Sprint | Purpose |
|------|---------|---------|
| `constants.ts` | 1 | Points, tiers, milestones, boosts — all values |
| `plan-resolver.ts` | 1 | Yogo plan name → category mapping |
| `gates.ts` | 1 | Consolidated 5-gate credit check |
| `boosts.ts` | 2 | Boost computation + stacking engine |
| `tier.ts` | 3 | XP → tier resolution + progress |
| `streak.ts` | 4 | Streak tracking + shield + milestone events |
| `milestones.ts` | 4 | Plan milestone detection |
| `perfect-week.ts` | 4 | Perfect week detection |
| `comeback.ts` | 4 | Comeback bonus after 21 days |
| `supera-ritmo.ts` | 4 | Supera teu ritmo detection |
| `retroactive-replay.ts` | 6 | One-shot Phase 0 replay job |

### Cron Routes

| File | Purpose |
|------|---------|
| `cron/strikelab-retroactive-replay/route.ts` | Retro replay endpoint |

### Test Files

| File | ~Tests | Covers |
|------|--------|--------|
| `plan-resolver.test.ts` | 10 | Plan name → category mapping |
| `gates.test.ts` | 5 | Each credit gate independently |
| `boosts.test.ts` | 12 | Stacking, cap, predicates, mutual exclusion |
| `tier.test.ts` | 14 | Boundaries, progress calculations |
| `streak.test.ts` | 5 | Increment, break, shield, milestones |
| `milestones.test.ts` | 4 | P8 milestones, idempotency |

## Go-Live Sequence

1. Flip `STRIKELAB_ENABLED=true` in Vercel
2. Flip `STRIKELAB_POLL_CLASSES_ENABLED=true`
3. Flip `STRIKELAB_POLL_MEMBERSHIPS_ENABLED=true`
4. Flip `STRIKELAB_REAL_POINTS_ENABLED=true`
5. Trigger retroactive replay: `curl -H "Authorization: Bearer $CRON_SECRET" https://strikehousedashboard.vercel.app/api/cron/strikelab-retroactive-replay`
6. Verify first class poll runs with real points
7. Check admin UI shows tier/streak/milestone data

## What's Next

- **Student UI** — mobile dashboard showing tier, points, streak, milestones
- **Enhanced admin detail** — tier progress, active boosts, streak/shield status
- **Music choice** — +50 cap 2/week (Spotify integration exists)
- **Weekly challenges** — deferred to Phase 2
- **Referrals** — deferred to Phase 2
- **UGC boosts** — deferred to Phase 2
