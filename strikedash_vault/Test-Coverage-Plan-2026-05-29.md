---
title: Test Coverage Plan
type: technical
status: active
date: 2026-05-29
related: "[[WA-Bot-Interaction-Tree-2026-05-29]]", "[[Spotify-Artists-Endpoint-Deprecation-2026-05-29]]"
---

# Test Coverage Plan

## Current State

| Metric | Value |
|--------|-------|
| Source files (src/lib) | 72 |
| Test files | 27 |
| Tests passing | 227 |
| Tests skipped | 62 (all gamification — missing migration) |
| Critical files with ZERO tests | dispatch.ts, cancelar.ts, reservar.ts, session.ts, meta.ts, recurring-subs.ts |

## Priority Principle

**Risk-first, not breadth-first.** Test the files where production bugs actually live:
- Handlers that call external APIs (Yogo signup create/delete) → highest bug density
- State machine with optimistic locking → foundation correctness
- Routing switch → lowest bug density (pure dispatch, no API calls)

## Sprint 0: Unblock 62 Skipped Tests (30 min)

```bash
npx prisma migrate dev
```

The gamification test suites are complete — they just need the `strikelab_foundations` migration applied to the local DB. Zero new test code.

## Sprint 1: Handler Tests — Where Production Bugs Live

### 1a. `cancelar.test.ts` — NEW (highest priority)

**Why first:** 267 lines, 5 exported functions, touches Yogo API (deleteSignup), has song-removal best-effort path, payment cutoff logic. This is where today's bugs get found.

**18 test cases:**

| Function | Case | Asserts |
|---|---|---|
| handleCancelar | customer not found | LOOKUP_MISS + endInteraction |
| handleCancelar | no signups | "Não tens aulas" + endInteraction |
| handleCancelar | all locked (<2h) | "Não tens canceláveis" + endInteraction |
| handleCancelar | N=1 fast-path | AWAIT_CONFIRM_CANCEL + sendButton |
| handleCancelar | N=2-10 list | AWAIT_CANCEL_PICK + sendList |
| handleCancelar | N>10 text | AWAIT_CANCEL_PICK + sendText |
| handleCancelar | transition race | SESSION_RACE event |
| handleCancelPick | _locked suffix | "menos de 2h" (stays in state) |
| handleCancelPick | invalid id | "Selecção inválida" |
| handleCancelPick | lookup miss | endInteraction |
| handleCancelPick | not cancellable | endInteraction |
| handleCancelPick | valid pick | AWAIT_CONFIRM_CANCEL + sendButton |
| handleCancelPickByText | bad format | "Formato inválido" |
| handleCancelPickByText | no match | "Não encontrei" |
| handleCancelPickByText | valid match | AWAIT_CONFIRM_CANCEL + sendButton |
| handleConfirmCancel | delete ok | CANCELLED_OK + removeSongOnCancel called |
| handleConfirmCancel | delete not_found | CANCEL_FAIL event |
| handleConfirmCancel | song removal throws | cancel still succeeds |

### 1b. `reservar.test.ts` — NEW

**Why second:** 157 lines, booking = revenue. Already_booked, no_plan, server_error paths all untested.

**14 test cases:**

| Function | Case | Asserts |
|---|---|---|
| handleReservar | lookup miss | endInteraction |
| handleReservar | no classes | endInteraction |
| handleReservar | classes available | AWAIT_CLASS_PICK + sendList |
| handleClassPick | non-numeric id | "Selecção inválida" |
| handleClassPick | class gone | endInteraction |
| handleClassPick | valid pick | AWAIT_CONFIRM_BOOK + sendButton |
| handleConfirmBook | no pendingClassId | endInteraction |
| handleConfirmBook | lookup miss | endInteraction |
| handleConfirmBook | signup ok | BOOKED_OK + offerSongRequest |
| handleConfirmBook | already booked | "Já estás inscrito" |
| handleConfirmBook | no plan | "Sem plano" |
| handleConfirmBook | server error | ERR_SERVER |
| handleConfirmBook | offerSongRequest throws | booking still succeeds |
| handleCancelBook | cancel | endInteraction |

## Sprint 2: Foundation Tests

### 2a. `session.test.ts` — NEW

**Why:** 90 lines, optimistic locking is the foundation every handler depends on. Tiny file, high impact.

**10 test cases:** loadSession (upsert path), isExpired (past/future/null), ttlFromNow, transition (version match/mismatch/partial fields), resetToIdle.

### 2b. `meta.test.ts` — NEW

**Why:** 110 lines, validates request body format for Meta API (title max 20 chars, button payload shape). A formatting bug = Meta rejects silently.

**8 test cases:** sendText body shape, env-var guard, sendList truncation, sendButton payload, sendTemplate with/without params, error response.

## Sprint 3: Routing Tests (lower priority)

### 3a. `dispatch.test.ts` — NEW

**Honest scope:** This is a **unit test of a switch statement**, not an integration test. It verifies that state X + intent Y routes to handler Z. It does NOT verify handler correctness (Sprint 1 does that).

**20 test cases:** btn_voltar_menu escape, IDLE→menu, btn_reservar→handleReservar, btn_agenda→handleCancelar, btn_outros→handleOutros, btn_playlist→handlePlaylistList, session expiry, ensureIdle guard, AWAIT_CLASS_PICK routing, AWAIT_CANCEL_PICK routing, AWAIT_CONFIRM_CANCEL routing, AWAIT_SONG_INPUT button/text routing, AWAIT_SONG_CONFIRM button/text routing, AWAIT_SWAP_CONFIRM routing.

## Sprint 4: When Convenient

| File | Cases | Why low priority |
|---|---|---|
| group-coverage.test.ts | 8 | Pure set logic, no external API, admin-only |
| group-import.test.ts | 7 | CSV parsing, admin-only, rarely used |
| utils.test.ts | 10 | Pure functions, trivial |
| recurring-subs.test.ts | 6 | Reporting-only, read-only |

## Summary

| Sprint | What | Cases | Effort |
|---|---|---|---|
| 0 | Prisma migrate | 0 (unblocks 62) | 30 min |
| 1 | cancelar + reservar | 32 | 1 sprint |
| 2 | session + meta | 18 | 1 sprint |
| 3 | dispatch routing | 20 | 1 sprint |
| 4 | Remaining | 31 | when convenient |
| **Total** | | **101 new + 62 unblocked** | |

## Mock Convention

Follow `song-request.test.ts`:
1. `vi.hoisted()` for all mock fns
2. `vi.mock("@/lib/db")` with hand-rolled collections
3. `vi.mock("@/lib/wa/meta")` → `{ ok: true, status: 200, body: "" }`
4. `vi.mock("@/lib/wa/session")` → for handler tests; real `isExpired` for dispatch tests
5. `vi.mock("@/lib/wa/handlers/*")` → `vi.fn()` for dispatch tests only
