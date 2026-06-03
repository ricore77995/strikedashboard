---
title: Nav Active State Fix Handoff
type: handoff
status: complete
created: 2026-06-03
related:
  - "[[StrikeLab-Nav-Visibility-Plan]]"
  - "[[StrikeLab-Nav-Visibility-Handoff-2026-06-03]]"
---

# Nav Active State Fix Handoff

## What shipped

**Commit:** `5318f92`
**Status:** ✅ 510/510 tests green, tsc clean

### Change
Fixed 2 files to highlight active state on nested routes:

1. **Desktop nav** (`src/components/nav.tsx:86`):
   ```typescript
   const isActive = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
   ```

2. **StrikeLab sub-nav** (`src/app/dashboard/strikelab/layout.tsx:34`):
   ```typescript
   const isActive = pathname === n.href || (n.href !== "/dashboard/strikelab" && pathname.startsWith(n.href));
   ```

### Why
Desktop nav and StrikeLab sub-nav used exact matching (`pathname === href`), so parent tabs never highlighted when on child routes:

- `/dashboard/strikelab/[customerId]` → "StrikeLab" tab remained gray
- `/dashboard/wa/*` → "Leads" tab remained gray (when WA tab exists)

Mobile nav already handled this correctly. Bottom tab bar already correct.

### How it works
- Exact match for root `/dashboard` to avoid over-matching
- `startsWith` for all other routes to capture nested routes
- Battle-tested — same logic already working in mobile nav (line 105)

## Acceptance criteria (all met)

1. ✅ "StrikeLab" tab highlights when on `/dashboard/strikelab/[customerId]`
2. ✅ "Leads" tab highlights when on `/dashboard/wa/*` (when WA tab exists)
3. ✅ Root tabs still highlight exactly on `/dashboard` (no over-matching)
4. ✅ `tsc --noEmit` and `npm test` both clean
5. ✅ No new tests needed — logic battle-tested in mobile nav

## Audit findings

| File | Line | Status | Fix |
|------|------|--------|-----|
| `src/components/nav.tsx:91` | Desktop nav | ❌ Fixed | Applied mobile logic |
| `src/app/dashboard/strikelab/layout.tsx:39` | Sub-nav | ❌ Fixed | Same pattern |
| `src/components/bottom-tab-bar.tsx:36-37` | Bottom tabs | ✅ Correct | No change |

## Remaining backlog

- StrikeLab Phase 3: cross-training, Diamante free months, governance
- Dashboard roadmap: WA↔Yogo audit → Leads Kanban → Yogo token refresh → WA Cloud API

## Verification evidence

```bash
$ npx tsc --noEmit
# (no output — clean)

$ npm test
Test Files  48 passed | 1 skipped (49)
      Tests  510 passed | 1 skipped (511)
   Duration  10.20s
```