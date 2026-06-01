---
title: StrikeLab Sprint 8 — Student UI
type: technical
status: in-progress
created: 2026-05-31
tags:
  - strikelab
  - phase-1
  - sprint-8
  - student-ui
related:
  - "[[StrikeLab-Phase-1-Engine-Handoff]]"
  - "[[StrikeLab-Phase-0-Handoff]]"
---

# StrikeLab Sprint 8 — Student UI

Sprint 8 makes the gamification engine visible — first to admins (enhanced detail
page), then to students (self-service). One verified slice at a time.

## Slices

| # | Slice | Status |
|---|-------|--------|
| 1 | Enhanced admin student detail page | ✅ Done (merged to `main`) |
| 2 | Student self-service API (`/api/strikelab/me`) | ✅ Done |
| 3 | Student-facing dashboard page (`/strikelab/me`) | ✅ Done |
| 4 | Wire the magic link into the WhatsApp menu | ✅ Done |
| 5 | Ranked leaderboard (cross-student) | ✅ Done |

## Decision — Student authentication = WhatsApp magic-link token

**Chosen 2026-05-31.** Students have no dashboard login (the dashboard is admin/sales
only). To let a student see their own StrikeLab progress, the WhatsApp bot sends a
**signed, expiring magic link** (e.g. `/strikelab/me?t=<token>`) tied to their
`customerId`. No passwords, no signup. Fits the existing WhatsApp onboarding flow
(`src/lib/wa/handlers/strikelab-onboard.ts`).

**Why:** lowest friction, no credential storage, reuses the channel students already
use. **How to apply (next slice):** design the token (HMAC-signed `{customerId, exp}`,
short TTL), a verify helper, and a public `/strikelab/me` route + page that reads
state via a *student-scoped* endpoint — NOT the admin endpoint.

## Slice 1 — Enhanced admin detail page (done)

**Goal:** surface real engine data the admin page was hiding.

**Changed:**
- `src/app/api/strikelab/admin/[customerId]/route.ts` — response now includes
  `state.proposedTier`, `state.streakShieldAvailable`, and `state.tierProgress`
  (computed via the previously-unused `getTierProgress()`); each event now carries
  `className` + `boostsApplied`, parsed defensively from `payloadJson`.
- `src/app/dashboard/strikelab/[customerId]/page.tsx` — tier emoji + name, tier
  progress bar (XP to next tier), streak shield badge (🛡️), proposed-tier note,
  Pt-PT event labels, XP deltas, and boost chips. Slimmed to 182 lines.
- `src/app/dashboard/strikelab/[customerId]/parts.tsx` — extracted leaf components
  (`Stat`, `Row`, `Consent`, `TierProgress`, `EventRow`) to keep the page under the
  ~200-line guideline.
- `src/lib/gamification/labels.ts` — **new** shared Pt-PT label maps
  (`TIER_LABELS`, `EVENT_LABELS`, `BOOST_LABELS` + safe-fallback helpers). Built to
  be reused by the student page in slice 2/3.

**Verification:** `tsc --noEmit` clean · production build compiles · 110 gamification
tests pass · endpoint returns HTTP 200 with correct shape (verified live against a
seeded local `prisma/dev.db`, then DB restored) · page route serves HTTP 200.

## Slice 2 — Student self-service API (done)

**Goal:** a student opens a WhatsApp magic link → sees their own progress, no login.

**New files:**
- `src/lib/gamification/student-link.ts` — `mintStudentToken()` / `verifyStudentToken()`.
  HMAC-SHA256 over `{cid, exp}`, format `1.<b64url(payload)>.<b64url(sig)>`, timing-safe
  compare (mirrors `lib/wa/verify.ts`). TTL **30 days** (`STUDENT_LINK_TTL_DAYS`).
  Fails closed: `verify` returns `{ok:false,reason:"no_secret"}` and `mint` throws when
  `STRIKELAB_LINK_SECRET` is unset. Signature checked **before** the payload is trusted.
- `tests/lib/gamification/student-link.test.ts` — 8 tests (round-trip, tampered payload,
  tampered sig, wrong secret, expired, TTL boundary, malformed, no-secret). TDD'd.
- `src/lib/gamification/event-view.ts` — shared `parseEventPayload()` extracted from the
  admin route so both endpoints share one parser (no duplication). Admin route refactored
  to use it.
- `src/app/api/strikelab/me/route.ts` — `GET ?t=<token>`. Verifies → returns student-safe
  view (monthlyPoints, lifetimeXp, tier, tierProgress, streak, shield, last 20 events).
  **No phone/email/consent/pause data.** Status map: missing/invalid/expired → 401,
  `no_secret` → 503, unknown customer → 404, erased identity → 410. Null state → zeroed
  defaults so the page always renders.
- `.env.example` — added `STRIKELAB_LINK_SECRET`.

**Verification:** `tsc` clean · build compiles (`/api/strikelab/me` route present) · 118
gamification tests pass (8 new) · all endpoint paths verified live against seeded local DB
(200 / 401 missing / 401 tampered / 401 expired / 404 unknown). A hand-minted token
(independent reimplementation of the format) verified against the real lib.

### ⚠️ Deploy TODO
Set **`STRIKELAB_LINK_SECRET`** in Vercel (all envs) before slice 3 ships —
`openssl rand -base64 32`. Until set, `/api/strikelab/me` returns **503** (fail-closed),
so deploying without it is safe but the student page won't work.

## Slice 3 — Student-facing page (done)

**Goal:** student opens the WhatsApp magic link → sees a motivational pt-PT
progress view. No login.

**New files (route `/strikelab/me`, in the `(public)` group — outside the proxy
auth guard, which only matches `/dashboard/:path*` + `/login`):**
- `src/app/(public)/strikelab/me/page.tsx` — server component, wraps the client in
  `<Suspense>` (required for `useSearchParams` in Next 15).
- `src/app/(public)/strikelab/me/me-client.tsx` — reads `?t=`, fetches
  `/api/strikelab/me`, renders tier hero + progress bar, 3 stat cards (pontos do mês,
  XP total, streak + shield), and a recent-activity feed with friendly labels + boost
  chips. Reuses `labels.ts`. Each HTTP status → a friendly pt-PT message; empty-events
  encouragement state.

**Verification:** `tsc` clean · build compiles (`/strikelab/me` present as a public
route) · 118 tests pass · live: page serves **HTTP 200 with 0 redirects** (confirms it
is NOT behind the auth guard) both with and without a token · endpoint returns correct
rich data (bronze, 6200 XP, tierProgress 8800→prata, streak+shield, Muay Thai +143 with
weekend+streak_5 boosts) against a seeded local DB, then DB restored exactly.

**Not visually screenshot-verified** (no Playwright installed; judged disproportionate
to install for one page). Layout is standard Tailwind over a verified data contract —
recommend eyeballing on a phone with a real link once `STRIKELAB_LINK_SECRET` is set.

## Slice 4 — Magic link in the WhatsApp menu (done)

**Goal:** an onboarded student gets their personal `/strikelab/me` link from the
WhatsApp menu.

**Changed:**
- `lib/gamification/student-link.ts` — added `buildStudentLink(customerId)`:
  `STRIKELAB_PUBLIC_BASE_URL` + `mintStudentToken` → full URL. Returns null (fails
  closed) if base URL or secret is unset. +4 tests.
- `lib/wa/handlers/strikelab-onboard.ts` — added `handleStrikelabMe(phone)`: looks up
  identity by phone, sends the personal link only if onboarded + `consentTraining` +
  not erased; otherwise nudges to onboard / "a ser configurado" / "removido". +5 tests.
- `lib/wa/render.ts` — `renderOutrosMenu()` converted from a 3-button message to a
  **list** (WhatsApp buttons cap at 3; the menu was full). Rows: Playlist · 🏆 Os Meus
  Pontos · Contacto · Voltar.
- `lib/wa/handlers/menu.ts` — `handleOutros` now sends a list (`sendList`).
- `lib/wa/dispatch.ts` — unified menu routing via a kind-agnostic `navId` (button OR
  list_pick), so the "Outros" rows route correctly; added `btn_strikelab_me` →
  `handleStrikelabMe`. Numeric class-pick ids don't match `btn_*`, so the booking flow
  is unaffected.
- `.env.example` — added `STRIKELAB_PUBLIC_BASE_URL`.

**Verification:** `tsc` clean · build compiles · **full suite 462 passed / 1 skipped**
(no regression in booking/menu flows from the button→list change) · token + link +
handler unit-tested.

### Naming note
The user asked for "Leaderboard", but the two answers conflicted (format = *personal
progress link, not rankings*). Built the personal-link delivery and labeled the menu row
**"🏆 Os Meus Pontos"** (accurate) rather than "Leaderboard" (would mislead — no
rankings). One string to change if a different label is wanted.

## Slice 5 — Monthly leaderboard (done)

**Goal:** the student page shows a top-10 monthly ranking with the viewer highlighted.

**Privacy decision (user, informed):** ranked students shown by **first name + last
initial for all** eligible participants. User was warned twice this is higher GDPR risk
than consent-gated naming and **explicitly accepted** it. Eligibility is still guarded:
only `optInAt` set + `consentTraining` + not erased + monthlyPoints > 0 appear. **Metric:
monthly points, top 10 only** (viewer not shown a position if outside the top 10).

**Changed:**
- `lib/gamification/leaderboard.ts` — **new.** `formatLeaderName(first,last)` → "João S."
  (null if no first name); `getMonthlyLeaderboard(viewerId, limit)` → top-N eligible
  states by monthlyPoints (tie-break lifetimeXp, customerId), each flagged `isViewer`.
  Pure-DB, +7 tests.
- `lib/yogo/lookup.ts` — added `getCustomersByIds()` with a 60s id-keyed cache over the
  existing `fetchAllCustomers`, so all top-10 names resolve from one warm fetch instead
  of N per-user calls.
- `api/strikelab/me/route.ts` — response now includes `leaderboard[]` (rank, name,
  monthlyPoints, isViewer); names resolved via Yogo, fall back to "Atleta #N".
- `(public)/strikelab/me/leaderboard.tsx` — **new** component (medals, viewer highlight,
  empty state). Wired into `me-client.tsx` as "Classificação do mês".

**Verification:** `tsc` clean · build compiles · **full suite 469 passed / 1 skipped** ·
leaderboard verified live in `/me` (ranked 500/300/100, isViewer correct, name fallback
working) against seeded local data, then DB restored.

**Surface:** lives on the existing `/strikelab/me` page — reachable via the WhatsApp
"🏆 Os Meus Pontos" menu item from slice 4. No new menu plumbing.

### ⚠️ Deploy TODO (now two vars)
Set in Vercel (all envs) before the menu item works:
- `STRIKELAB_LINK_SECRET` — `openssl rand -base64 32`
- `STRIKELAB_PUBLIC_BASE_URL` — e.g. `https://dash.strikershouse.pt`
Until both are set, the bot replies "a ser configurado" (fail-closed).

## Gotchas found

- **Cookie-name inconsistency (pre-existing):** the admin endpoint
  `/api/strikelab/admin/[customerId]` checks a cookie named **`session`**, but the
  rest of the app's auth (`src/lib/auth.ts`, middleware) uses **`striker_session`**.
  Not introduced by this slice and not fixed here (out of scope). Worth a follow-up:
  the endpoint's auth check is weaker/different than every other guarded route.
- **Local vs prod DB:** `.env` has `DATABASE_URL=file:./dev.db` but `.env.local`
  points at **Turso** (remote), and `.env.local` wins. So `npm run dev` talks to the
  *remote* DB by default, which does **not** have the gamification tables. To render
  StrikeLab pages locally, run with `DATABASE_URL=file:<abs>/prisma/dev.db` override.
- `next lint` is broken in this repo (Next 15 deprecation reads `lint` as a dir);
  `npx eslint` also fails on a flat-config/`eslintrc` circular-structure error.
  Lint is non-functional repo-wide — verification leans on `tsc` + build + tests.
