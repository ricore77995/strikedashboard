---
title: StrikeLab Phase 2 — Referral System Handoff
type: handoff
status: complete
created: 2026-06-03
updated: 2026-06-03
owner: Ricardo
slices: 4/4 shipped
related:
  - "[[StrikeLab-Phase-2-Referral-Design]]"
  - "[[StrikeLab-Phase-1-Engine-Handoff]]"
  - "[[StrikeLab-Sprint-8-Handoff]]"
---

# StrikeLab Phase 2 — Referral System Handoff

> ✅ All 4 slices shipped. Referral system is fully operational — student UI, admin page, WhatsApp bot onboarding, credit logic, poll hooks.

## What shipped

### R1a — Schema + Types (`bba81c9`)

- `Referral` model in Prisma with status state machine + `linkedAt` temporal field
- `referralCode` field on `GamificationIdentity` (unique, 6-char)
- 3 event types: `referral_trial_only`, `referral_phase_1`, `referral_phase_2`
- 3 event labels + 1 boost label (pt-PT)
- Migration deployed to Turso production (6 statements, verified)

### R1b — Logic + Boost + Poll Hooks + Admin Link (`4aa24b4` + `0b2c7fd`)

- `src/lib/gamification/referral.ts` (~180 LOC):
  - `linkReferral(code, referredCustomerId)` — anti-ring (no self, no duplicate), P2002-safe
  - `tryReferralTrial()` — pending→trial_credited, +200
  - `tryReferralPhase1()` — trial→phase1, +800, handles pending→phase1 skip
  - `tryReferralPhase2()` — phase1→phase2, +1200, temporal scoping (`createdAt >= linkedAt`)
- `embaixador_referral` boost (1.4× on check-ins for 14 days after phase 1)
- Poll hooks wired into `poll/classes.ts` and `poll/memberships.ts`
- `POST /api/strikelab/admin/referrals/link` — manual admin linking
- 15 unit/integration tests (code gen, link+credit+gates, boost active)

### R2 — Student UI + Admin Page (`8b40bee`)

- Student API returns `referralCode` + referral count
- Student card: code display + "Partilhar código" clipboard + friend counter
- Admin API `GET /api/strikelab/admin/referrals` — list with status filter
- Admin page `/dashboard/strikelab/referrals` — table with status pills

### R3 — WhatsApp Bot Onboarding (`2d80c56`)

- New state `STRIKELAB_AWAIT_REFERRAL` between consent acceptance and welcome
- After consent, bot asks: "Tens um código de indicação de um amigo?"
- Valid code → `linkReferral()` → bonus message + welcome
- Invalid code → graceful "não encontrado" + welcome (no retry loop)
- Skip words (não, nao, n, skip, nao tenho) → direct welcome
- 5 new tests + 1 updated consent test (510/510 green)

## Key numbers

- **510/510 tests green**
- **~490 LOC net production code** (referral.ts ~180, onboard R3 ~55, student UI ~100, admin ~80, routes ~75)
- 2 FATAL + 4 MAJOR adversarial findings fixed before code was written
- 4 new routes: `/api/strikelab/admin/referrals`, `/api/strikelab/admin/referrals/link`, `/dashboard/strikelab/referrals`, `STRIKELAB_AWAIT_REFERRAL` state

## Files changed (production)

| File | Slice | Purpose |
|---|---|---|
| `prisma/schema.prisma` | R1a | Referral model + referralCode field |
| `src/lib/gamification/types.ts` | R1a | 3 referral event types |
| `src/lib/gamification/labels.ts` | R1a | 3 event labels + embaixador boost label |
| `src/lib/gamification/identity.ts` | R1a | Code generation + `findByReferralCode` |
| `src/lib/gamification/referral.ts` | R1b | Link + 3-tier credit logic |
| `src/lib/gamification/boosts.ts` | R1b | Embaixador 1.4× boost |
| `src/lib/gamification/poll/classes.ts` | R1b | `tryReferralTrial` + `tryReferralPhase2` hooks |
| `src/lib/gamification/poll/memberships.ts` | R1b | `tryReferralPhase1` + `tryReferralPhase2` hooks |
| `src/app/api/strikelab/admin/referrals/link/route.ts` | R1b | Admin manual link API |
| `src/app/api/strikelab/me/route.ts` | R2 | Return referralCode + count |
| `src/app/(protected)/strikelab/me/me-client.tsx` | R2 | Referral code card + share |
| `src/app/api/strikelab/admin/referrals/route.ts` | R2 | Admin list API |
| `src/app/(protected)/strikelab/referrals/page.tsx` | R2 | Admin referrals page |
| `src/lib/wa/session.ts` | R3 | `STRIKELAB_AWAIT_REFERRAL` state |
| `src/lib/wa/handlers/strikelab-onboard.ts` | R3 | Referral question handler |
| `src/lib/wa/dispatch.ts` | R3 | Route new state |

## Commits

| Slice | Commit | Message |
|---|---|---|
| R1a | `bba81c9` | feat(strikelab): add referral model, event types, and labels (R1a) |
| R1b | `4aa24b4` | feat(strikelab): add referral credit logic, boost, poll hooks, and admin link (R1b) |
| Tests | `0b2c7fd` | test(strikelab): add referral system tests (15 tests, all green) |
| R2 | `8b40bee` | feat(strikelab): add referral student UI and admin tracking page (R2) |
| R3 | `2d80c56` | feat(strikelab): add referral code question during WhatsApp onboarding (R3) |
