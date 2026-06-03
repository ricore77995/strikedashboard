---
title: StrikeLab Nav Visibility Plan
type: plan
status: ready
created: 2026-06-03
slices: 1
related:
  - "[[StrikeLab-Next-Phase-Visibility]]"
  - "[[StrikeLab-Phase-2-Referral-Handoff]]"
  - "[[StrikeLab-Phase-1-Engine-Handoff]]"
---

# StrikeLab Nav Visibility Plan

> **Karpathy-verified:** Surgical change, one file, no new abstractions.

## 1. Goal

Admin users can click a "StrikeLab" tab in the dashboard navigation to reach the gamification admin overview — making 3 phases of shipped work discoverable without typing URLs.

## 2. Files likely to change

| File | Change |
|---|---|
| `src/components/nav.tsx` | Add `{ href: "/dashboard/strikelab", label: "StrikeLab" }` to `ALL_LINKS` array |

**One file. One line added to one array.**

## 3. Existing patterns found

- **`ALL_LINKS` array** (`nav.tsx:17-31`) — the 13-tab desktop nav. New entry goes here.
- **`ADMIN_ONLY_ROUTES`** (`constants.ts:56-67`) — `/dashboard/strikelab` is already in this array (line 66). Sales role filtering works without changes.
- **Active state matching** (`nav.tsx:90`) — uses `pathname === href`. Will correctly highlight `/dashboard/strikelab` on the overview page. Will NOT highlight on child routes like `/dashboard/strikelab/[customerId]` — this is a pre-existing issue affecting `/dashboard/wa/*` too. Not this slice's scope.
- **Mobile bottom nav** (`nav.tsx:38-44`) — 5 hardcoded slots for primary flows. StrikeLab stays out of the mobile bottom bar (it's a secondary admin surface, not a reception-action flow).
- **Overview page exists** — `/dashboard/strikelab/page.tsx` renders student list, search, tier badges, streak days, challenge stats. Fully functional, just unreachable from nav.

## 4. Smallest implementation plan

**Slice VA — Nav link (~1 LOC)**

1. Add `{ href: "/dashboard/strikelab", label: "StrikeLab" }` to `ALL_LINKS` in `nav.tsx`, after the "Visitantes" entry (position makes sense — gamification is a secondary concern after core business tabs).
2. Verify: `npx tsc --noEmit` clean.
3. Verify: `npm test` green.
4. Verify manually: click "StrikeLab" tab → lands on overview page, tab highlights.
5. Commit.

**Total: ~1 line of production code. No new tests needed** — the nav component is not unit-tested (it's a static link array), and the admin page it links to has its own test coverage.

## 5. Risks and unknowns

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Desktop nav overflows on small screens | Low | Low | `overflow-x-auto` already on the container (line 84). Tabs scroll horizontally. |
| Mobile users can't find StrikeLab | Expected | None | By design — StrikeLab is admin-only, not a reception action. Admins use desktop. |
| Active state doesn't highlight on child pages | Pre-existing | Low | Affects `/dashboard/wa/*` too. Fix once with `pathname.startsWith(href)` in a follow-up if it bothers anyone. |

## Acceptance criteria

1. "StrikeLab" tab appears in desktop nav for admin role.
2. "StrikeLab" tab does NOT appear for sales role.
3. Clicking it navigates to `/dashboard/strikelab`.
4. Tab highlights when on `/dashboard/strikelab`.
5. `tsc --noEmit` and `npm test` both clean.
