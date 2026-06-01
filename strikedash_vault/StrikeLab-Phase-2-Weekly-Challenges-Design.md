---
title: StrikeLab Phase 2 — Weekly Challenge Engine (slice 1) Design Spec
type: technical
status: shipped
created: 2026-06-01
shipped: 2026-06-01
merge_commit: ab1e7ff
tags:
  - strikelab
  - phase-2
  - gamification
  - weekly-challenges
  - design-spec
related:
  - "[[StrikeLab-Phase-2-Music-Choice-Design]]"
  - "[[StrikeLab-Phase-1-Engine-Handoff]]"
  - "[[StrikeLab-v3.2-final]]"
  - "[[StrikeLab-Pontuacao-Mapa]]"
---

# StrikeLab Phase 2 — Weekly Challenge Engine (slice 1)

**Date:** 2026-06-01 · **Status:** Approved, pre-implementation · **Branch:** TBD
(off `main`). Second Phase 2 slice. Engine only — prod flags stay **OFF**.

> Brainstormed + adversarially reviewed (9 risks surfaced; the foundational one
> reshaped the design). Read-only UI is a **separate slice 2**. Spec §7 of
> [[StrikeLab-v3.2-final]] is the product source.

## Goal

A weekly **Flash Check-in** challenge runs automatically: launched Wed 12:00,
window closes Sun 23:59 (Lisbon), and on Monday the **first 5 athletes to check in
during the window** each earn **250 points** (XP 0), credit-gated. "Done" = the two
crons + scorer work end-to-end, winners are awarded idempotently and replay-safely,
and it's covered by unit tests + a manual e2e proof. No UI in this slice.

## The foundational decision: the scorer reads Yogo, not our event log

The check-in poller (`poll/classes.ts`) fetches **only today's** classes
(`startDate=today&endDate=today`), is ops-hours gated, and is *designed* as a 15-min
cron but **deployed daily** (`vercel.json`: `0 5 * * *`; 15-min needs Vercel Pro). So
the `checkin_observed` event log is **not a complete record** of a challenge window —
Sunday's check-ins may not be captured before Monday's resolve.

Therefore the scorer **fetches the window's classes directly from Yogo** (the source
of truth per CLAUDE.md) over the Wed–Sun date range and computes winners from the real
`checked_in` Unix-ms timestamps. This makes the challenge self-sufficient and immune to
poller cadence/gaps.

## Architecture

```
CRON strikelab-challenge-launch  (Wed ~12:00 Lisbon)
  → launchWeeklyChallenge():
      isoWeek = current ISO-week id (Lisbon, tz-correct)
      pick challengeKey via rotation (least-recently-run; 1-item pool → flash_checkin)
      upsert StrikelabChallengeRun { isoWeek (unique), challengeKey, status:"active",
        windowStart = Wed 12:00 Lisbon, windowEnd = Sun 23:59:59 Lisbon, launchedAt }
      (idempotent — unique isoWeek)

CRON strikelab-challenge-resolve  (Mon ~06:00 Lisbon)
  → resolveWeeklyChallenge():
      if STRIKELAB_REAL_POINTS_ENABLED !== "true" → return (leave run unresolved; replay later)
      find the most recent run with status:"active"
      winners = scorer(run):  Yogo classes in [windowStart..windowEnd] dates
                              → checked-in signups with checked_in ∈ window ms
                              → dedupe to each customer's EARLIEST checked_in
                              → sort (checkedInAt ASC, customerId ASC)  [deterministic]
                              → take first winnersMax that PASS credit gates  [backfill]
      for each winner (rank 1..N):
          appendEvent("weekly_challenge_won", +250, xp 0,
            payload {challengeKey, isoWeek, rank, runId, checkedInAt},
            idempotencyKey `challenge:{runId}:{customerId}`, pointsPeriod)
      mark run status:"resolved", resolvedAt   [AFTER all awards]
```

## Data model (1 new Prisma model)

```prisma
model StrikelabChallengeRun {
  id           String    @id @default(cuid())
  challengeKey String                       // "flash_checkin"
  isoWeek      String    @unique            // tz-correct Lisbon ISO-week id, one run/week
  status       String                       // "active" | "resolved"
  windowStart  DateTime
  windowEnd    DateTime
  launchedAt   DateTime
  resolvedAt   DateTime?
  @@index([status])
}
```
Winners are **not** a separate table — they are immutable `weekly_challenge_won`
events (auditable, replayable, consistent with the event-sourced model). The run row
exists once per week regardless of winners, powering rotation history and (slice 2)
the read-only "this week's challenge" view.

## Files

| File | Change |
|---|---|
| `prisma/schema.prisma` | **New** `StrikelabChallengeRun` model + migration |
| `src/lib/gamification/challenges/window.ts` | **New** — tz-correct Lisbon ISO-week id + Wed-12:00 / Sun-23:59:59 bounds |
| `src/lib/gamification/challenges/catalog.ts` | **New** — challenge catalog (slice 1: `flash_checkin` → 250 pts, winnersMax 5) |
| `src/lib/gamification/challenges/rotation.ts` | **New** — least-recently-run pick from run history |
| `src/lib/gamification/challenges/scorer-flash-checkin.ts` | **New** — Yogo-direct scorer |
| `src/lib/gamification/challenges/launch.ts` | **New** — `launchWeeklyChallenge()` |
| `src/lib/gamification/challenges/resolve.ts` | **New** — `resolveWeeklyChallenge()` |
| `src/lib/gamification/types.ts` | Add `"weekly_challenge_won"` to `EventType` |
| `src/lib/gamification/labels.ts` | Add `weekly_challenge_won: "Desafio semanal"` |
| `src/app/api/cron/strikelab-challenge-launch/route.ts` | **New** cron route (CRON_SECRET + STRIKELAB_ENABLED) |
| `src/app/api/cron/strikelab-challenge-resolve/route.ts` | **New** cron route |
| `vercel.json` | 2 cron entries (launch Wed, resolve Mon) |
| `tests/lib/gamification/challenges/*` | **New** — window, rotation, scorer, launch, resolve tests |

## Existing patterns reused (search-before-create)

- **Cron route shape:** `strikelab-monthly-reset/route.ts` — `CRON_SECRET` bearer +
  `STRIKELAB_ENABLED` gate → lib fn. Copy verbatim.
- **Yogo class fetch with check-in data:** `poll/classes.ts:128` uses
  `classes?startDate&endDate&populate[]=signups.user` and reads `signup.checked_in`
  (Unix ms). The scorer reuses this fetch shape over the window date range.
- **Award + idempotency:** `appendEvent` (UNIQUE `idempotencyKey`, P2002-swallow) —
  same as music-choice / comeback.
- **Credit gates:** `checkCreditGates(customerId)` (`gates.ts`).
- **Replay discipline:** `strikelab-retroactive-replay/route.ts` refuses unless
  `STRIKELAB_REAL_POINTS_ENABLED` — resolve mirrors this (leave run unresolved when off).
- **Exhaustive labels:** `EVENT_LABELS: Record<EventType,string>` forces the new label.
- **Period:** `getCurrentPeriod()` for `pointsPeriod`.

## Decisions (locked)

1. **Scorer source = Yogo direct** (not the event log) — completeness + correctness.
2. **Window derived from `isoWeek`, computed tz-correctly in Lisbon** — NOT from `now`,
   NOT via the buggy `getISOWeekStart` (which resolves the boundary in UTC — see
   [[StrikeLab-Phase-2-Music-Choice-Design]] follow-up). New `window.ts` does it right.
3. **XP = 0, points only** — challenge wins don't accelerate tier XP (consistent with
   music-choice; tiers reflect training effort).
4. **Replay-safe resolve:** flag off → leave unresolved; deterministic ordering
   `(checkedInAt ASC, customerId ASC)`; award (idempotent) THEN mark resolved; status is
   never the award guard.
5. **Gate-failure backfill:** drop a winner who fails gates at resolve time, fill the
   slot from the next-ranked eligible (take first `winnersMax` that pass).
6. **Idempotency key** `challenge:{runId}:{customerId}` — one award per athlete per run.

## Accepted v1 limitations (from adversarial review)

- **Launch-skipped week:** if the Wed cron misses, no run row exists → resolve no-ops
  cleanly. Rotation is dormant (1-item pool). Acceptable; revisit rotation robustness
  when the pool grows >1.
- **`appendEvent` `max(eventId)+1` not concurrency-safe:** two overlapping resolve runs
  could collide on `eventId` (P2002) and silently skip an award. Single cron makes this
  low-risk; mitigated by a status guard (`active`→ scored in one pass). Documented.
- **Cron DST drift ±1h:** Vercel cron is UTC; Wed-12:00 / Mon-06:00 Lisbon drift across
  WET/WEST. Challenge windows are days, not minutes — acceptable. The *scoring* window
  bounds are tz-correct regardless (decision 2); only the trigger wall-clock drifts.
- **Gate timing = resolve time:** an athlete who churned/paused after a valid in-window
  check-in forfeits (and backfills). This is intended (don't reward someone who left).

## Error handling / edge cases

- No active run at resolve → return `{skipped, reason:"no_active_run"}`.
- Yogo fetch fails at resolve → throw (cron returns 500), run stays `active` for retry.
- Fewer than `winnersMax` eligible check-ins → award those that exist (no padding).
- Flag off → no awards, run left `active` (replayable).
- Re-run of resolve → identical deterministic winner set; per-customer idempotency key
  prevents double-award; re-mark resolved is harmless.

## Testing (acceptance bar)

1. **Engine + unit tests** (`tests/lib/gamification/challenges/`):
   - `window.ts`: Wed-12:00 / Sun-23:59:59 Lisbon bounds for a known isoWeek; DST week.
   - `rotation.ts`: 1-item pool returns flash_checkin; (forward) least-recently-run pick.
   - scorer: earliest-per-customer dedupe; window filtering by `checked_in` ms;
     deterministic tie-break; top-5; gate-failure backfill (mock Yogo + gates).
   - `resolve`: awards 5 winners once; idempotent re-run (no double-pay); flag-off leaves
     run `active` and awards nothing; marks resolved after awards.
   - `launch`: creates one run per isoWeek; idempotent.
   - Full `npx vitest run` green; `npx tsc --noEmit` 0 errors.
2. **Manual e2e proof (local):** seed a `StrikelabChallengeRun` + mock/seed Yogo check-in
   data for the window (or point at a fixture), run resolve with flags on against
   `prisma/dev.db`, confirm 5 `weekly_challenge_won` events at +250/xp 0 in rank order,
   re-run → no duplicates. Evidence pasted.

## Out of scope (separate slices)

- **Read-only UI (slice 2):** student "this week's challenge" + admin run/winners view.
- **Aula Lotada + the other 3 challenges:** Aula Lotada needs booking-order data Yogo
  doesn't expose in the signups populate (a separate spike); Story Theme / Combo Surpresa
  depend on the UGC/bot-report feature.
- **Rotation hardening** for pool >1 across skipped weeks.
- **Prod go-live:** flipping `STRIKELAB_*` flags stays a separate decision.

## Shipped — 2026-06-01 (merge `ab1e7ff`)

Built via subagent-driven TDD (9 tasks, two-stage review each + final whole-branch
review). 15 challenge tests, **491/492 full suite**, `tsc` 0, `npm run build` passes
(both cron routes register); manual e2e confirmed 5 winners at +250/xp0 in rank order,
6th capped, run resolved, idempotent re-run. **Prod flags remain OFF.**

Net code (`src/lib/gamification/challenges/`): `window.ts`, `catalog.ts`, `rotation.ts`,
`scorer-flash-checkin.ts`, `launch.ts`, `resolve.ts` + 2 cron routes + the
`StrikelabChallengeRun` model + `weekly_challenge_won` type/label.

Two review-driven hardenings landed beyond the original plan:
- **±1-day padded Yogo date range** in `fetchWindowClasses` (Yogo dates are Lisbon-local;
  the scorer trims by ms, so over-fetch is harmless) — prevents a tz-edge class miss.
- **Empty-fetch guard** in `resolveWeeklyChallenge`: zero classes fetched = transient
  Yogo hiccup → skip without resolving (don't burn the week); a genuinely quiet week
  (classes present, no check-ins) still resolves.

### Known follow-ups (not this slice)

- **Period attribution at a month boundary:** `resolve` stamps `pointsPeriod =
  getCurrentPeriod()` at resolve time (Mon of week N+1). For a week straddling month-end,
  points bucket into the new month if the monthly reset ran between the check-in week and
  the Monday resolve. Consistent with the music-choice resolve-time pattern; fix in the
  leaderboard slice by deriving the period from `run.windowEnd`.
- **`getISOWeekStart` UTC-vs-Lisbon drift** (shared engine follow-up from the music slice)
  — the challenge window deliberately avoids it via the tz-correct `window.ts`.
