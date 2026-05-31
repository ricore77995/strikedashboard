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
| 1 | Enhanced admin student detail page | ✅ Done (branch `feat/strikelab-admin-detail-enhance`) |
| 2 | Student self-service API (`/api/strikelab/me`) | ⏳ Blocked on auth decision (now made — see below) |
| 3 | Student-facing dashboard page | ⏳ Depends on #2 |

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
