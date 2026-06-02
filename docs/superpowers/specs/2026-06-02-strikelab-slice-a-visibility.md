# StrikeLab Slice A — Visibility: Nav Link + Overview

**Date:** 2026-06-02
**Status:** Spec-locked
**Phase:** 2.5 (Visibility & Operability)
**Parent plan:** [[StrikeLab-Next-Phase-Visibility]]

## Goal

StrikeLab admin section is reachable from the "Mais" page and shows honest engine health (opted-in athletes, points this month, active this week, challenge status) above the existing student list.

## Scope

Slice A only. No new routes, no new files. Four existing files modified.

| File | Change |
|------|--------|
| `src/app/dashboard/more/page.tsx` | Add StrikeLab card to `SECTIONS` + add `adminOnly` flag to type, filter in render |
| `src/lib/constants.ts` | Add `/dashboard/strikelab` to `ADMIN_ONLY_ROUTES` |
| `src/app/api/strikelab/admin/route.ts` | Add aggregate `stats` field to GET response |
| `src/app/dashboard/strikelab/page.tsx` | Import + render `StrikeLabStats` component above student list |
| `src/app/dashboard/strikelab/strikelab-stats.tsx` | New component: stats header (3 stat cards + challenge status) |

5 files. 1 new file (extracted component keeps page.tsx under 200 lines).

## Design Decisions

### Nav placement: "Mais" page

StrikeLab is admin-only and fits the existing `more/page.tsx` SECTIONS pattern (same level as WA bot, Pausas, etc.). No desktop tab, no bottom tab. The page won't have meaningful data for weeks — prominent placement would show empty state to no benefit.

New SECTIONS entry:
```ts
{ id: "strikelab", label: "StrikeLab", sub: "Gamificação, pontos e desafios", icon: "🏆", href: "/dashboard/strikelab", adminOnly: true }
```

**Bug fix (adversarial finding):** `more/page.tsx` currently renders ALL SECTIONS regardless of role. Add `adminOnly?: boolean` to the `Section` type and filter `SECTIONS` by role in the render, matching the pattern in `BottomTabBar`. Prevents sales users from seeing StrikeLab, Churn, WA bot, etc. and getting bounced.

### Stats component extracted

`StrikeLabStats` extracted to its own file (`strikelab-stats.tsx`) to keep page.tsx under 200 lines. The component receives a `stats` prop from the API response and renders 3 stat cards + challenge status. No internal state, no fetch logic.

### Overview: stats header on existing page

The existing `/dashboard/strikelab/page.tsx` shows a student list. Add a stats section above the search bar. Three stat boxes + challenge status.

Layout (mobile-first, dark theme):
```
┌─────────────────────────────────┐
│  StrikeLab              0 alunos │
├─────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌────┐ │
│ │ 0       │ │ 0       │ │ 0  │ │
│ │ Alunos  │ │ Pts/mês │ │ Sem│ │
│ │ activos │ │         │ │ act│ │
│ └─────────┘ └─────────┘ └────┘ │
│ ┌─────────────────────────────┐ │
│ │ 🏆 Desafio: Sem desafio     │ │
│ │    activo esta semana       │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ [Pesquisar...]                  │
│ (existing student list)         │
└─────────────────────────────────┘
```

### API: stats in existing admin response

Extend the existing `GET /api/strikelab/admin` response with a `stats` object. No new endpoint.

```ts
// Added to response:
stats: {
  optedIn: number;          // identities with optInAt != null && erasedAt == null
  totalPointsThisMonth: number; // sum of GamificationState.monthlyPoints
  activeThisWeek: number;   // states where lastClassAt >= now - 7 days
  challenge: {              // null if no active challenge this week
    key: string;            // e.g. "flash_checkin"
    status: string;         // "active" | "resolved"
    windowStart: string;    // ISO date
    windowEnd: string;      // ISO date
  } | null;
}
```

### Stats queries (Prisma + SQLite)

Reuses existing helpers: `challengeWindow()` from `challenges/window.ts`, `getChallenge()` from `challenges/catalog.ts`.
All new queries batched into the existing `Promise.all` to avoid sequential round-trips (especially on Turso).

```ts
import { challengeWindow } from "@/lib/gamification/challenges/window";
import { getChallenge } from "@/lib/gamification/challenges/catalog";

// All inside the existing Promise.all:
const { isoWeek, windowStart } = challengeWindow(new Date());

// 1. Opted-in count — MUST match the per-row predicate in the response mapper
// (optInAt != null && consentTraining == true && erasedAt == null)
const optedIn = await db.gamificationIdentity.count({
  where: { optInAt: { not: null }, consentTraining: true, erasedAt: null }
});

// 2. Total points this month — coalesce null (empty table returns null)
const pointsAgg = await db.gamificationState.aggregate({
  _sum: { monthlyPoints: true }
});
const totalPointsThisMonth = pointsAgg._sum.monthlyPoints ?? 0;

// 3. Active this week — lastClassAt >= start of current ISO week (Monday, Lisbon tz)
// Uses windowStart from challengeWindow, not a rolling 7-day window
const activeThisWeek = await db.gamificationState.count({
  where: { lastClassAt: { gte: windowStart } }
});

// 4. This week's challenge — isoWeek is YYYY-MM-DD (Monday of ISO week, Lisbon tz)
const run = await db.strikelabChallengeRun.findUnique({ where: { isoWeek } });
const challengeDef = run ? getChallenge(run.challengeKey) : null;
// challengeDef.name → "Flash Check-in" (Pt-PT label from catalog)
```

### Cold-start honesty

When all values are zero / no challenge exists, the UI shows:
- "0 alunos activos" (not hidden or faked)
- "Sem desafio activo esta semana" (not an error state)
- The student list already says "Nenhum aluno inscrito ainda."

### "Last poll run" — deferred

The plan asked for "last poll run" timestamp, but there is no tracking mechanism in the DB or code. Adding one is scope creep for Slice A. The challenge `launchedAt` serves as a proxy. Follow-up: add a simple `StrikelabCronLog` table or a key-value setting for last poll timestamp.

## Implementation Order

1. Nav link (SECTIONS + ADMIN_ONLY_ROUTES + adminOnly filter) → verify: link appears for admin, hidden for sales
2. API stats (extend admin route, batch in Promise.all) → verify: API returns stats object with correct null handling
3. Stats component (`strikelab-stats.tsx`) → verify: renders stats cards + challenge status
4. Wire stats into strikelab page → verify: page shows stats above student list

## Adversarial Review Findings (post-critique corrections)

- **`more/page.tsx` admin-only filter** — pre-existing bug: SECTIONS renders regardless of role. Added `adminOnly` flag + filter.
- **`optedIn` predicate alignment** — aggregate must match per-row: `optInAt != null && consentTraining == true && erasedAt == null`.
- **Prisma null coalescing** — `_sum.monthlyPoints` returns `null` on empty table. Coalesced to `0`.
- **`activeThisWeek` precision** — redefined from "rolling 7 days" to `lastClassAt >= windowStart` (ISO week Monday, Lisbon tz).
- **File size** — extracted `StrikeLabStats` to keep page.tsx under 200 lines. 5 files, not 4.
- **Turso perf** — all new queries batched into existing `Promise.all`.
- **API auth** — pre-existing (cookie existence, not role check). Follow-up, not this slice.
- **Aggregates on every fetch** — acceptable for cold start. Follow-up: separate `/stats` endpoint.

## Net Change Estimate

~120-140 LOC across 5 files. 1 new file (stats component).

## Follow-ups (not this slice)

- "Last poll run" tracking mechanism
- Slice B — Challenge read-only UI (admin detail + student card)
- getISOWeekStart tz fix (fold in when touching challenge code)
- Consent-gated leaderboard naming
