---
title: StrikeLab Nav Visibility Handoff
type: handoff
status: complete
created: 2026-06-03
related:
  - "[[StrikeLab-Nav-Visibility-Plan]]"
  - "[[StrikeLab-Phase-2-Referral-Handoff]]"
---

# StrikeLab Nav Visibility Handoff

## What shipped

**Commit:** `26ec49c`
**Status:** ✅ 510/510 tests green, tsc clean

### Change
Added StrikeLab link to admin navigation (`src/components/nav.tsx:30`):
```typescript
{ href: "/dashboard/strikelab", label: "StrikeLab" },
```

### Why
Admin users could not discover StrikeLab without typing URLs manually. 3 phases of shipped work (Music Choice, Challenges, Referrals) were invisible in the UI.

### How it works
- Desktop nav: new "StrikeLab" tab appears after "Visitantes"
- Mobile nav: StrikeLab stays out of bottom bar (admin-only, not a reception flow)
- Role filtering: pre-wired via `/dashboard/strikelab` in `ADMIN_ONLY_ROUTES`
- Active state: correctly highlights on `/dashboard/strikelab` overview page

## Acceptance criteria (all met)

1. ✅ "StrikeLab" tab appears in desktop nav for admin role
2. ✅ "StrikeLab" tab does NOT appear for sales role
3. ✅ Clicking it navigates to `/dashboard/strikelab`
4. ✅ Tab highlights when on `/dashboard/strikelab`
5. ✅ `tsc --noEmit` and `npm test` both clean

## Remaining backlog

- Desktop nav active-state fix: `pathname.startsWith(href)` instead of `===` (affects `/dashboard/strikelab/[customerId]` and `/dashboard/wa/*`)
- StrikeLab Phase 3: cross-training, Diamante free months, governance
- Dashboard roadmap: WA↔Yogo audit → Leads Kanban → Yogo token refresh → WA Cloud API

## Verification evidence

```bash
$ npx tsc --noEmit
# (no output — clean)

$ npm test
Test Files  48 passed | 1 skipped (49)
      Tests  510 passed | 1 skipped (511)
   Duration  9.24s
```