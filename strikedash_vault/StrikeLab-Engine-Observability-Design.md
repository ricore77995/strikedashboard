---
title: StrikeLab Engine Observability + Challenge Creator
type: design
status: spec-draft
created: 2026-06-03
owner: Ricardo
slices: 4 (VA1 → VA2 → VA3 → VA4)
related:
  - "[[StrikeLab-Phase-1-Engine-Handoff]]"
  - "[[StrikeLab-Phase-2-Referral-Handoff]]"
  - "[[StrikeLab-Nav-Visibility-Plan]]"
  - "[[StrikeLab-Pontuacao-Mapa]]"
---

# StrikeLab Engine Observability + Challenge Creator

> The gamification engine runs silently across 3 phases of shipped work. This design adds full observability (engine dashboard, enriched events, per-student trigger cards) and replaces the hard-coded challenge catalog with an admin-defined challenge creator linked to trigger events.

## Goal

Ricardo and Marcelo can answer four questions without reading code or querying the database:

1. "Is the engine running? What happened this week?"
2. "Why did this event fire with these points?"
3. "Let me create a challenge tied to check-ins"
4. "What triggers are available to this student right now?"

## Architecture

No new tables. All data comes from existing models:
- `GamificationEventLog` — event history with payloads
- `CronRunLog` — poll health (last run, duration, errors)
- `StrikelabChallengeRun` — challenge state
- `Referral` — referral pipeline counts
- `GamificationState` — per-student state (streak, tier)

The challenge creator extends the existing `ChallengeDef` interface and `CHALLENGE_CATALOG` to be database-driven instead of hard-coded, but uses the same `StrikelabChallengeRun` model for execution.

## Slice VA1 — Engine Dashboard

### Page: `/dashboard/strikelab/engine`

New admin page. Four sections:

**1. Poll Health**
- Last `strikelab-poll-classes` run: timestamp, status, duration, events processed
- Last `strikelab-poll-memberships` run: same
- Source: `CronRunLog` ordered by `startedAt DESC`

**2. Event Breakdown**
- Table: event type | count today | count this week | count this month
- Source: aggregate `GamificationEventLog` grouped by `eventType` with `createdAt` filters
- Color-coded by category: check-in events (blue), retention (emerald), social (purple), admin (zinc)

**3. Referral Pipeline**
- Pending: X | Trial credited: X | Phase 1: X | Phase 2: X
- Source: `Referral` grouped by `status`
- Status pills with existing color mapping (amber/blue/emerald/gold)

**4. Challenge Status**
- Current week: challenge name, status (active/resolved), participant count, winner count
- Source: latest `StrikelabChallengeRun` + event count for `weekly_challenge_won`

### Files

| File | Change |
|---|---|
| `src/app/dashboard/strikelab/engine/page.tsx` | **New** — Engine dashboard page |
| `src/app/api/strikelab/admin/engine/route.ts` | **New** — API returning all aggregate data |
| `src/components/nav.tsx` | Already has StrikeLab link (from nav visibility slice) |

### API response shape

```ts
interface EngineData {
  polls: {
    classes: { lastRun: string | null; status: string; durationMs: number | null; eventsLastRun: number } | null;
    memberships: { lastRun: string | null; status: string; durationMs: number | null; eventsLastRun: number } | null;
  };
  eventBreakdown: { eventType: string; today: number; thisWeek: number; thisMonth: number }[];
  referralPipeline: { pending: number; trial_credited: number; phase1_credited: number; phase2_credited: number };
  challenge: { key: string; name: string; status: string; isoWeek: string; participants: number; winners: number } | null;
}
```

### Acceptance criteria

1. Admin sees "Engine" sub-tab on StrikeLab admin page
2. Poll health shows real timestamps from CronRunLog
3. Event breakdown shows counts for all 22 event types
4. Referral pipeline shows counts by status
5. Challenge section shows current week's challenge
6. `tsc --noEmit` clean, `npm test` green

---

## Slice VA2 — Event Enrichment

### What changes

Add richer `payloadJson` to events as they're emitted. No UI change — the enriched payloads flow into existing event feeds (student + admin) via `event-view.ts`.

### Events to enrich

| Event | Current payload | Enriched payload |
|---|---|---|
| `checkin_observed` | `{}` or null | `{ planCategory, yogoClassId, isWeekend }` |
| `comeback` | `{}` or null | `{ daysSinceLastCheckin }` |
| `subscription_renewed` | `{}` or null | `{ planDescription }` |
| `streak_5_activated` | `{}` | `{ currentStreakDays: 5 }` |
| `streak_10_activated` | `{}` | `{ currentStreakDays: 10 }` |
| `streak_15_activated` | `{}` | `{ currentStreakDays: 15 }` |
| `supera_teu_ritmo` | `{}` or null | `{ category, weekAverage }` |
| `perfect_week` | `{}` or null | `{ isoWeek }` |

Events already enriched (no change needed):
- `music_choice_accepted` — has `{ yogoClassId, trackName, artistName }`
- `referral_trial_only` / `referral_phase_1` / `referral_phase_2` — have `{ referredCustomerId }`
- `weekly_challenge_won` — has `{ challengeKey, isoWeek, rank }`
- `identity_created` — has `{ source, phone }`

### Files

| File | Change |
|---|---|
| `src/lib/gamification/poll/classes.ts` | Enrich `checkin_observed` payload with plan category, class ID, weekend flag |
| `src/lib/gamification/comeback.ts` | Enrich `comeback` payload with days since last check-in |
| `src/lib/gamification/streak.ts` | Enrich streak activation events with current days |
| `src/lib/gamification/supera-ritmo.ts` | Enrich payload with category + week average |
| `src/lib/gamification/perfect-week.ts` | Enrich payload with ISO week |
| `src/lib/gamification/poll/memberships.ts` | Enrich `subscription_renewed` with plan description |

### Acceptance criteria

1. New `checkin_observed` events include plan category and class ID in payload
2. New `comeback` events include days since last check-in
3. New `subscription_renewed` events include plan description
4. Existing tests updated for new payload shapes
5. Admin event log + student event feed display enriched data
6. `tsc --noEmit` clean, `npm test` green

---

## Slice VA3 — Challenge Creator

### Design

Replace the hard-coded `CHALLENGE_CATALOG` with a database-driven catalog. Admins create challenges by picking a trigger event type and setting parameters.

### Schema change

Add `triggerEventType` field to `ChallengeDef` interface (not a Prisma model — the catalog is in-memory). The `StrikelabChallengeRun` model gains this field:

```prisma
model StrikelabChallengeRun {
  id               String    @id @default(cuid())
  challengeKey     String
  challengeName    String    // Pt-PT display name (denormalised at launch)
  triggerEventType String    // event type that counts toward the challenge
  targetCount      Int       @default(1) // how many events needed to win
  points           Int       // prize points
  winnersMax       Int       @default(5)
  isoWeek          String    @unique
  status           String    // "active" | "resolved"
  windowStart      DateTime
  windowEnd        DateTime
  launchedAt       DateTime
  resolvedAt       DateTime?

  @@index([status])
}
```

### Challenge definition flow

1. Admin creates challenge: `{ name: "Triplo Check-in", triggerEventType: "checkin_observed", targetCount: 3, points: 500, winnersMax: 5 }`
2. Cron picks it up on launch (Monday 00:01 Lisbon) or admin triggers manually
3. Scorer counts `GamificationEventLog` events where `eventType === triggerEventType` and `createdAt` within the run window
4. Top N students by count (ties broken by earliest last event) win

### Scorer change

Replace the Yogo-direct scorer with an event-count scorer:

```ts
async function scoreEventCount(
  run: StrikelabChallengeRun,
): Promise<{ customerId: number; count: number; lastEventAt: number }[]> {
  const events = await db.gamificationEventLog.findMany({
    where: {
      eventType: run.triggerEventType,
      createdAt: { gte: run.windowStart, lte: run.windowEnd },
    },
    select: { customerId: true, createdAt: true },
  });
  // Group by customerId, count, find max createdAt per student
  const map = new Map<number, { count: number; lastEventAt: number }>();
  for (const e of events) {
    const entry = map.get(e.customerId) ?? { count: 0, lastEventAt: 0 };
    entry.count++;
    entry.lastEventAt = Math.max(entry.lastEventAt, e.createdAt.getTime());
    map.set(e.customerId, entry);
  }
  return [...map.entries()]
    .map(([customerId, data]) => ({ customerId, ...data }))
    .sort((a, b) => b.count - a.count || a.lastEventAt - b.lastEventAt);
}
```

### Admin UI

Challenge creator section on the engine page (`/dashboard/strikelab/engine`):

- **Challenge catalog table**: name, trigger type, target count, points, winners max
- **Create button** → modal with fields: name, trigger event type (dropdown of all `EventType` values), target count, points, winners max
- **Launch now button** → immediately creates a `StrikelabChallengeRun` for this week

### Files

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add fields to `StrikelabChallengeRun` |
| `src/lib/gamification/challenges/catalog.ts` | Replace hard-coded array with DB-backed catalog |
| `src/lib/gamification/challenges/resolve.ts` | Replace Yogo-direct scorer with event-count scorer |
| `src/lib/gamification/challenges/launch.ts` | Accept challenge definition from catalog |
| `src/app/api/strikelab/admin/challenges/route.ts` | **New** — CRUD API for challenges |
| `src/app/dashboard/strikelab/engine/page.tsx` | Add challenge creator section (from VA1) |
| Migration script | Map existing `flash_checkin` to `triggerEventType: "checkin_observed"` |

### Migration plan

1. Add new columns to `StrikelabChallengeRun` (nullable first)
2. Backfill existing rows: `flash_checkin` → `{ triggerEventType: "checkin_observed", targetCount: 1, points: 250, winnersMax: 5, challengeName: "Flash Check-in" }`
3. Make new columns required

### Acceptance criteria

1. Admin can create a new challenge definition via UI
2. Challenge definition includes: name, trigger event type, target count, points, winners max
3. Scorer counts events of the trigger type in the challenge window
4. Existing `flash_checkin` challenge continues to work after migration
5. Admin can see challenge catalog and create new entries
6. `tsc --noEmit` clean, `npm test` green

---

## Slice VA4 — Student Trigger Cards

### What changes

Enhance the admin student detail page (`/dashboard/strikelab/[customerId]`) with trigger status cards. These show the live state of all trigger systems for a given student.

### Cards

**Streak Card**
- Current streak: X days
- Next milestone: streak_10 (in X days) or streak_15
- Weekend boost: eligible (if current day is Sat/Sun)
- Source: `GamificationState.currentStreakDays`

**Referral Card**
- If student has a referral: show pipeline stage + what triggers next
  - "Referred by [code], status: trial_credited → waiting for subscription (phase 1)"
  - "Referred by [code], status: phase1_credited → waiting for 6 check-ins + 1 renewal (phase 2)"
- If student IS a referrer: show referral count + breakdown by status
- Source: `Referral` lookups by `inviterCustomerId` and `referredCustomerId`

**Challenge Card**
- Current challenge participation status
- Event count toward target (if challenge is event-count based)
- Source: `StrikelabChallengeRun` + `GamificationEventLog` count

**Music Card**
- Music credits used this ISO week: X / 2
- Last music credit: [date + track name]
- Source: `GamificationEventLog` count of `music_choice_accepted` since `getISOWeekStart(now())`

### Files

| File | Change |
|---|---|
| `src/app/dashboard/strikelab/[customerId]/page.tsx` | Add trigger status section with 4 cards |
| `src/app/api/strikelab/admin/[customerId]/route.ts` | Add trigger status data to API response |

### Acceptance criteria

1. Admin sees trigger status section on student detail page
2. Streak card shows current days + next milestone
3. Referral card shows pipeline stage for both referrer and referee
4. Challenge card shows participation + progress
5. Music card shows weekly cap usage
6. Cards gracefully handle missing data (no referral = "No referral")
7. `tsc --noEmit` clean, `npm test` green

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Event-count scorer differs from Yogo-direct scorer | Medium | High | Event timestamps lag Yogo check-in timestamps by poll interval. For weekly challenges resolved Monday, this is negligible. Run both in parallel during transition, compare results. |
| Empty-window guard changes | Low | Medium | Current scorer skips if `classes.length === 0` (Yogo returned nothing). Event-count scorer has no Yogo fetch — guard changes to "no participants found" (zero events in window). |
| CronRunLog may not exist for all crons | Low | Low | Poll health section shows "Never run" for missing entries |
| Challenge schema migration breaks active runs | Low | High | Add columns nullable first, backfill, then make required |
| Event payload enrichment increases DB size | Low | Low | Payloads are small JSON strings (~100-200 bytes each) |
| Event-count scorer is simpler but less flexible than Yogo-direct | Expected | Low | Phase 2 of challenge creator adds compound conditions |

## Out of scope

- Compound challenge conditions (AND/OR logic) — deferred to next iteration
- Real-time pipeline trace (poll → trigger → event → credit in real-time) — requires audit log (Approach B)
- Student-facing trigger cards (this is admin-only for now)
- Challenge participant detail view (who participated, individual scores) — follow-up slice
