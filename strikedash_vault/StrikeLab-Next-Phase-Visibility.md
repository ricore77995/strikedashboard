---
title: StrikeLab — Next Phase: Visibility & Operability
type: design
status: planned
created: 2026-06-02
tags:
  - strikelab
  - roadmap
  - visibility
  - phase-2.5
related:
  - "[[StrikeLab-Phase-2-Weekly-Challenges-Design]]"
  - "[[StrikeLab-Phase-2-Music-Choice-Design]]"
  - "[[StrikeLab-v3.2-final]]"
  - "[[StrikeLab-Phase-1-Engine-Handoff]]"
---

# StrikeLab — Next Phase: Visibility & Operability ("Phase 2.5")

**Date:** 2026-06-02 · **Status:** Planned (chosen after go-live re-evaluation).

## Re-evaluation — where we actually are (post go-live, 2026-06-01 night)

The v3.2 §12 plan assumed Phase 0 runs **silently in prod for 2-3 weeks**, then Phase 1
launch **replays history**. That arc **never happened**: the gamification schema was
never migrated to the prod Turso DB, so nothing accumulated. On 2026-06-01 we
cold-started straight to live (schema installed, code deployed, all 4 flags ON, replay
a no-op over 0 events). See the go-live record in
[[StrikeLab-Phase-2-Weekly-Challenges-Design]] shipped notes.

| Layer | Real status |
|---|---|
| Phase 0 Foundations | **live** — schema, identity, admin 5-screen shell, GDPR |
| Phase 1 Engine | **live, flags ON** — points/XP/tiers/boosts/streaks/milestones/reset |
| Phase 2 (partial) | **`music_choice` ✅, `weekly_challenge` engine ✅** (UI deferred) |
| Phase 3 V2 | future |

**The gym is cold:** zero athletes, zero points. Nothing shows until students
**onboard via the WhatsApp bot** (identity + training consent) **and attend** (the
~06:00 Lisbon poll credits them). Adoption is now the gating factor, not code.

## Why this phase

The engine is **live but invisible**: no nav link to the StrikeLab admin section, no
challenge UI, no overview. "Visibility & Operability" turns the cold invisible engine
into something the team can watch work as athletes onboard — before building more
backend social features (referrals, UGC).

## Slice A — StrikeLab reachable + overview

**Goal:** the StrikeLab admin section is reachable from the nav, and there's an
at-a-glance overview of engine health.

- **Nav link** to `/dashboard/strikelab` (currently an orphan — no link anywhere).
  Admin-only (sales role does not see StrikeLab per the role rules).
- **StrikeLab overview** (likely `/dashboard/strikelab` itself, enhanced, or a small
  header on it): # athletes (opted-in), points awarded this month, active this week,
  this week's challenge + its status, last poll run. Read-only, dark theme, mobile-first.
- Surfaces the **cold-start reality** honestly (e.g. "0 athletes onboarded yet").

**Existing to reuse:** `/api/strikelab/admin` (athlete list), `getMonthlyLeaderboard`,
the admin detail page + `parts.tsx`, `labels.ts`. Search before create.

## Slice B — Challenge read-only UI

**Goal:** see "this week's challenge + winners" (the engine from this session, currently
blind).

- **Admin:** this week's `StrikelabChallengeRun` (challenge, window, status) + winners
  once resolved (query `weekly_challenge_won` events for the run).
- **Student** (`/strikelab/me`): a small "Desafio da semana" card — the active challenge
  name + mechanic, and whether they won after resolve.
- Pure read; no challenge creation UI (challenges stay a code catalog).

## Sequencing

1. **Slice A** first (nav link + overview) — smallest, unblocks "I can see it".
2. **Slice B** next (challenge UI).
3. Fold in carried follow-ups opportunistically when touching related code:
   `getISOWeekStart` tz fix, challenge period-attribution, consent-gated leaderboard
   naming.

## After this phase (roadmap)

Phase 2 social remainder — **referrals** (3-tier + anti-ring), **UGC/ManyChat**
(unblocks Story Theme + Combo Surpresa challenges), **Champions League** (monthly
multi-category leaderboards). Then Phase 3 V2.

## Operational note (not code)

For any of this to show real data, drive **athlete onboarding** through the WhatsApp
consent flow. Until athletes onboard + attend, every StrikeLab surface is correctly
empty.
