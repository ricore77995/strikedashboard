---
title: StrikeLab Phase 2 — Music Choice (+50) Design Spec
type: technical
status: approved-pre-implementation
created: 2026-06-01
tags:
  - strikelab
  - phase-2
  - gamification
  - music-choice
  - spotify
  - design-spec
related:
  - "[[StrikeLab-Phase-1-Engine-Handoff]]"
  - "[[StrikeLab-Sprint-8-Handoff]]"
  - "[[StrikeLab-Pontuacao-Mapa]]"
  - "[[StrikeLab-v3.2-final]]"
---

# StrikeLab Phase 2 — Music Choice (+50) Design Spec

**Date:** 2026-06-01 · **Status:** Approved, pre-implementation · **Branch:** TBD
(off `main`). First Phase 2 slice. Engine work only — prod flags stay **OFF**.

> Brainstormed + adversarially reviewed before writing (development-workflow Steps
> 0–3). This is the canonical design; the implementation plan follows via
> writing-plans.

## Goal

A student who picked the music for a class earns **+50 monthly points** when they
**actually check in** to that class — capped at **2 classes per ISO week**, gated by
the same credit gates as every other event. One sentence of "done": the
`music_choice_accepted` event fires on attendance, is visible in the student + admin
activity feeds, and is covered by unit tests + a manual e2e proof.

## Why credit on attendance (not on playlist acceptance)

The v3.2 spec literally says award on `WaSongRequest.status === "active"` (playlist
acceptance). We deliberately **diverge**: crediting on acceptance opens a
book → request → unbook farming vector (bounded only by the weekly cap). Crediting on
**check-in** ties the reward to real attendance and removes the vector entirely —
chosen by the user (Ricardo).

## Architecture — one new post-checkin hook

Plugs into the existing checkin pipeline exactly like `comeback` / `perfect-week`:

```
poll/classes.ts  (after checkin_observed written; inside `if (realPointsEnabled && pointsDelta > 0)`)
   └─ checkMusicChoice(customerId, identity.phoneE164, classId)        ← NEW
         0. guard: STRIKELAB_REAL_POINTS_ENABLED !== "true" → return
         1. guard: !phoneE164 → return                       (adversarial #1)
         2. find active WaSongRequest { contactId: phoneE164, yogoClassId: classId, status:"active" }
              → none → return
         3. idempotency: music_choice_accepted with key music_choice:{cid}:{classId} exists → return
         4. weekly cap: count music_choice_accepted where createdAt >= getISOWeekStart(now); ≥ 2 → return
         5. appendEvent("music_choice_accepted", +50 pts, xp 0, payload{classId,track,artist})
```

`identity.phoneE164` is already fetched in `pollClasses` (the `findByCustomerId`
result), so the hook needs no extra lookup.

## Files

| File | Change |
|---|---|
| `src/lib/gamification/music-choice.ts` | **New** — `checkMusicChoice()` (mirrors `comeback.ts`) |
| `src/lib/gamification/poll/classes.ts` | Call hook in the existing post-checkin block; pass `identity.phoneE164` |
| `src/lib/gamification/types.ts` | Add `"music_choice_accepted"` to `EventType` |
| `src/lib/gamification/labels.ts` | Add `music_choice_accepted: "Música escolhida"` (TS-enforced exhaustive record) |
| `src/lib/gamification/poll/shared.ts` | **Consolidate** `getISOWeekStart` here |
| `src/lib/gamification/perfect-week.ts` | Import shared helper; delete private copy |
| `src/lib/gamification/supera-ritmo.ts` | Import shared helper; delete private copy |
| `tests/lib/gamification/music-choice.test.ts` | **New** — cap, idempotency, no-request skip, flag-off skip, null-phone skip |

## Existing patterns reused (search-before-create)

- **One-shot crediting:** `src/lib/gamification/comeback.ts` — flag guard, idempotency
  `findFirst`, `appendEvent`. `checkMusicChoice` mirrors it.
- **Weekly count window:** `getISOWeekStart` in `perfect-week.ts` / `supera-ritmo.ts`
  (Mon–Sun, Europe/Lisbon). **Duplicated in two places** → consolidate into
  `poll/shared.ts` rather than adding a third copy (process invariant 5).
- **Identity resolution:** `findByPhone` / `findByCustomerId` (`identity.ts`) — the
  `pollClasses` loop already holds the identity row with `phoneE164`.
- **Idempotency backing:** `GamificationEventLog.idempotencyKey String @unique`;
  `appendEvent` catches P2002 → safe under concurrency / Turso (adversarial #7
  mitigated by schema, no app change needed).
- **Labels / activity feed:** `labels.ts` `EVENT_LABELS` is an exhaustive
  `Record<EventType,string>`; `event-view.ts` already enriches events for both the
  student `/strikelab/me` and admin detail pages — the new label flows through with
  no UI code change.
- **Bonus constant:** `MUSIC_CHOICE_BONUS = 50` already exists in `constants.ts`.

## Decisions

1. **XP = 0, points only.** Music boosts the *monthly* leaderboard standing (and the
   future "Curador do Mês"), but does **not** accelerate lifetime tier XP — tiers
   reflect training effort. (Differs from `comeback`, which grants XP. Max impact
   either way is ~100 XP/week, negligible.)
2. **Consolidation refactor in-scope.** `getISOWeekStart` extracted to
   `poll/shared.ts`, all three callers point at it. Behaviour-identical move.
3. **Idempotency keyed per class** (`music_choice:{cid}:{classId}`) → song *swaps*
   never double-pay; one credit per attended class.
4. **Cap = 2 per ISO week** (Mon–Sun Lisbon), counted via `getISOWeekStart`.
5. **Credit fires on attendance** (see rationale above).

## Accepted v1 limitations (from adversarial review)

- **#2 cross-week slot:** if a Sunday class's song is accepted/credited just after the
  week rollover, it consumes a slot in the new week. Never double-pays (permanent
  idempotency key). Cosmetic accounting only.
- **#3 PT / OTHER plans excluded:** the hook sits inside the `pointsDelta > 0` block,
  so PT (base 0) check-ins don't earn the music bonus. PT is 1-on-1 with no class
  playlist, so this is effectively moot. Documented, not fixed.
- **#4 swap-vs-poll timing:** if a song is swapped to a different track between the
  poll reading the row and crediting, the conservative outcome (miss, never
  double-pay) holds. Acceptable.

## Error handling / edge cases

- No identity / null phone / no active request → silent skip (consistent with the
  poller's existing skip behaviour).
- Same student re-polled / same class twice → blocked by unique idempotency key.
- Flag off (`STRIKELAB_REAL_POINTS_ENABLED=false`) → no-op, like all Phase 1 triggers.

## Testing (acceptance bar)

1. **Engine + unit tests** (`tests/lib/gamification/music-choice.test.ts`): awards +50
   once for an attended class with an active request; caps at 2/week (3rd skipped);
   skips when no active request, when flag off, when phone null; per-class idempotency
   (no double-pay on re-poll). Full `npx vitest run` green; `npx tsc --noEmit` 0
   errors.
2. **Activity feeds:** "Música escolhida" renders in student `/strikelab/me` and the
   admin detail page (label-only, via `event-view`).
3. **Manual e2e proof (local):** seed a check-in + active `WaSongRequest` for the same
   class, run the poller with flags on against `prisma/dev.db`, confirm +50 lands once
   and a 3rd-in-week is capped. Evidence pasted before "done".

## Out of scope (separate slices)

"Curador do Mês" monthly leaderboard, real-time bot confirmation of music points,
unbook claw-back (unnecessary — credit only fires on attendance), prod go-live
(flipping `STRIKELAB_REAL_POINTS_ENABLED` stays a separate decision per
[[StrikeLab-Phase-1-Engine-Handoff]]).
