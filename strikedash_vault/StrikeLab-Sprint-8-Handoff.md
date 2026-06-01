---
title: StrikeLab Sprint 8 — Student UI Handoff
type: reference
status: deployed-needs-env-vars
created: 2026-06-01
tags:
  - strikelab
  - phase-1
  - sprint-8
  - student-ui
  - handoff
  - whatsapp
related:
  - "[[StrikeLab-Sprint-8-Student-UI]]"
  - "[[StrikeLab-Phase-1-Engine-Handoff]]"
  - "[[StrikeLab-Phase-0-Handoff]]"
  - "[[StrikeLab-Pontuacao-Mapa]]"
---

# StrikeLab Sprint 8 — Student UI Handoff

**Date:** 2026-06-01 · **Branch:** `main` (merged through `ce28671`) · **Status:**
Code live in production. **Two env vars must be set in Vercel before students can use
it** (see Deploy below). All Phase 1 engine flags still OFF.

> Detailed per-slice working log: [[StrikeLab-Sprint-8-Student-UI]]. This doc is the
> cold-start handoff — read this to understand the whole student loop.

## TL;DR

Sprint 8 makes the gamification engine **visible** — first to admins, then to students.
The full loop is now live:

```
WhatsApp menu (Outros → 🏆 Os Meus Pontos)
   → bot sends a signed magic link
      → /strikelab/me?t=<token>  (public page)
         → fetch /api/strikelab/me?t=<token>
            → student sees: tier + progress bar, monthly points, XP, streak + shield,
              recent activity (with boosts), and the monthly Top-10 leaderboard
```

**Numbers:** 12 new files · 8 modified · +1,157 / −71 LOC · 24 new tests · full suite
**469 passing / 1 skipped** · 0 TS errors.

## What shipped (5 slices)

| # | Slice | Surface | Merge |
|---|-------|---------|-------|
| 1 | Enhanced admin student detail page | `/dashboard/strikelab/[customerId]` | `2af7d16` |
| 2 | Student self-service API + magic-link tokens | `/api/strikelab/me` | `28c4cda` |
| 3 | Student-facing progress page | `/strikelab/me` (public) | `c612f14` |
| 4 | Magic link in the WhatsApp menu | `Outros → Os Meus Pontos` | `9e514e4` |
| 5 | Monthly Top-10 leaderboard | on `/strikelab/me` | `cefed92` |

## Authentication model — magic-link tokens

Students have **no dashboard login**. They prove identity with a signed, expiring token
sent over WhatsApp.

- **Token** (`src/lib/gamification/student-link.ts`): `1.<base64url(payload)>.<base64url(hmac-sha256)>`
  where payload = `{ cid, exp }` (exp = unix seconds). HMAC-SHA256 over the payload with
  `STRIKELAB_LINK_SECRET`, timing-safe compare (mirrors `src/lib/wa/verify.ts`).
- **TTL:** 30 days (`STUDENT_LINK_TTL_DAYS`).
- **Fails closed:** `verifyStudentToken` returns `{ok:false, reason:"no_secret"}` and
  `mintStudentToken` throws when the secret is unset. Signature is checked **before** the
  payload is trusted, then expiry.
- **`buildStudentLink(customerId)`** = `STRIKELAB_PUBLIC_BASE_URL` + minted token →
  full URL; returns null (fail-closed) if either env var is missing.

## Data flow / endpoints

### `GET /api/strikelab/me?t=<token>` (public)
Verifies the token, returns the student's **own** data — **no PII** (no phone/email/
consent/pauses):
- `state`: monthlyPoints, lifetimeXp, currentTier, currentStreakDays,
  streakShieldAvailable, lastClassAt, `tierProgress` (via `getTierProgress`). Zeroed
  defaults if no state row yet.
- `events`: last 20, each with `className` + `boostsApplied` (parsed defensively from
  `payloadJson` via shared `parseEventPayload`).
- `leaderboard`: Top-10 (see below).
- **Status map:** missing/invalid/expired token → 401 · `no_secret` → 503 · unknown
  customer → 404 · erased identity → 410.

### `GET /api/strikelab/admin/[customerId]` (admin, cookie-guarded)
Enhanced in slice 1: added `proposedTier`, `streakShieldAvailable`, `tierProgress`, and
per-event `className`/`boostsApplied`.

### Leaderboard
- `getMonthlyLeaderboard(viewerId, limit=10)` (`src/lib/gamification/leaderboard.ts`):
  top-N **eligible** states by `monthlyPoints` (tie-break lifetimeXp, customerId), each
  flagged `isViewer`. **Eligibility:** `optInAt` set + `consentTraining` + not erased +
  monthlyPoints > 0.
- Names resolved by `getCustomersByIds()` (`src/lib/yogo/lookup.ts`) — 60s id-keyed
  cache over the existing customer fetch, so all 10 names come from **one** warm request.
  `formatLeaderName` → "João S."; falls back to "Atleta #N" if unresolved.

## Privacy decision (⚠️ GDPR — attributed to the user)

The leaderboard shows ranked students by **first name + last initial for ALL eligible
participants**. The user was warned **twice** that this is higher GDPR risk than the
recommended consent-gated naming (only `consentRealName` students named, others
anonymized) and **explicitly accepted the risk**. Implemented as chosen; eligibility is
still gated to opted-in + training-consented + non-erased students. If this is ever
revisited, switch the name rule in `route.ts` to honour `consentRealName`.

## File inventory

**New (12):**
```
src/lib/gamification/student-link.ts      magic-link mint/verify + buildStudentLink
src/lib/gamification/labels.ts            Pt-PT tier/event/boost labels (shared)
src/lib/gamification/event-view.ts        parseEventPayload (shared by both endpoints)
src/lib/gamification/leaderboard.ts       formatLeaderName + getMonthlyLeaderboard
src/app/api/strikelab/me/route.ts         student self-service endpoint
src/app/(public)/strikelab/me/page.tsx    public page (Suspense wrapper)
src/app/(public)/strikelab/me/me-client.tsx   student progress view
src/app/(public)/strikelab/me/leaderboard.tsx  leaderboard component
src/app/dashboard/strikelab/[customerId]/parts.tsx   admin page leaf components
tests/lib/gamification/student-link.test.ts    (12 tests)
tests/lib/gamification/leaderboard.test.ts      (7 tests)
tests/lib/wa/handlers/strikelab-me.test.ts      (5 tests)
```

**Modified (8):**
```
src/app/api/strikelab/admin/[customerId]/route.ts   richer admin payload
src/app/dashboard/strikelab/[customerId]/page.tsx   tier bar, shield, labels, slimmed
src/lib/yogo/lookup.ts                              getCustomersByIds (cached)
src/lib/wa/dispatch.ts                              kind-agnostic navId + strikelab_me route
src/lib/wa/handlers/strikelab-onboard.ts            handleStrikelabMe
src/lib/wa/handlers/menu.ts                         handleOutros sends a list
src/lib/wa/render.ts                                Outros menu: buttons → list
.env.example                                        2 new vars
```

## WhatsApp menu change

The "Outros" sub-menu was a 3-button message (full; WhatsApp caps buttons at 3). It is
now a **list** (up to 10 rows): Playlist · 🏆 Os Meus Pontos · Contacto · Voltar.
`dispatch.ts` routes menu/sub-menu picks via a kind-agnostic `navId` (button OR
`list_pick`); numeric class-pick ids never match the `btn_*` names, so the booking flow
is unaffected (verified by the full suite).

## Deploy checklist ⚠️

The code is live but inert for students until these are set in **Vercel (all envs)**:

| Var | Value | Effect if unset |
|-----|-------|-----------------|
| `STRIKELAB_LINK_SECRET` | `openssl rand -base64 32` | `/api/strikelab/me` → 503; bot replies "a ser configurado" |
| `STRIKELAB_PUBLIC_BASE_URL` | e.g. `https://dash.strikershouse.pt` | `buildStudentLink` → null; bot replies "a ser configurado" |

Both fail **closed** — deploying without them is safe.

Manual smoke test once set: WhatsApp → menu → **Outros → 🏆 Os Meus Pontos** → open the
link on a phone → confirm tier/points/streak/activity/leaderboard render.

## Testing

- `npx vitest run` → **469 passed / 1 skipped** (24 new this sprint).
- `npx tsc --noEmit` → 0 errors. `npm run build` → compiles.
- Token, link-builder, leaderboard ranking/eligibility, name formatting, and the WA
  handler are unit-tested. Endpoints verified **live** against a seeded local DB (then
  restored): `/api/strikelab/me` 200/401/404 + leaderboard ordering + isViewer; public
  page serves 200 with 0 redirects.
- **Not** screenshot-verified (no Playwright; judged disproportionate). Layout is
  standard Tailwind over verified data contracts.

## Gotchas / notes for the next session

- **No source middleware** — auth guard is `src/proxy.ts` (Next 15 "proxy"), matcher
  only `/dashboard/:path*` + `/login`. That is why `/strikelab/me` is public.
- **Admin endpoint cookie inconsistency (pre-existing):** `/api/strikelab/admin/*`
  checks cookie `session`; the rest of the app uses `striker_session`. Untouched —
  worth a follow-up.
- **Local vs prod DB:** `.env` = `file:./dev.db`, `.env.local` = Turso (wins). `npm run
  dev` talks to **Turso** (no gamification tables). To render StrikeLab locally:
  `DATABASE_URL=file:<abs>/prisma/dev.db npm run dev`.
- **Lint broken repo-wide** (`next lint` deprecation + ESLint flat-config circular
  error). Verification leans on tsc + build + tests.
- **Leaderboard tests** must assert *relative* order among seeded CIDs (the query is
  global; concurrent suites share the test DB) — never absolute ranks.

## Not done / possible follow-ups

- **Consent-gated leaderboard naming** (the GDPR-safer model) — currently names all.
- **Auto-send the link after onboarding** — today only via the menu item.
- **Caching name resolution beyond 60s / pagination** if the gym grows.
- **Phase 1 go-live** — flipping `STRIKELAB_*` engine flags is a separate decision
  (see [[StrikeLab-Phase-1-Engine-Handoff]]).
