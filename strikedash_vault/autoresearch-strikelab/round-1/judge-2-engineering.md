---
title: Judge 2 — Engineering Feasibility
type: reference
judge_role: software engineering feasibility (blind)
date: 2026-05-28
round: 1
---

```
WINNER: Y
RUNNER-UP: X
REASONING: Y is a buildable spec; X is a feature catalogue. Y defines the actual storage primitives engineering needs (gamification_event_log with idempotency_key UNIQUE index, gamification_state as a materialized projection, gamification_identity as the IG/WA/Yogo junction), commits to Turso/libSQL as the production write path, and specifies a single-writer-per-customer append-then-materialize pipeline (§2.5) that mechanically eliminates the concurrent-boost-calculation races. X, by contrast, gives only a "stackingFormula" string and an `operationalNotes.monthlyReset` one-liner ("Day 1 at 00:00 Europe/Lisbon -> Pontos do Mes = 0") with no `reset_id`, no idempotency field, and no behaviour for events arriving mid-reset — which is exactly the race condition the prompt probes. Y also resolves DST by moving the cron to 02:30 Lisbon (§2.4), defines a sealed `monthly_points_snapshot` for late-arriving events, and adds a 04:00 reconciliation that rebuilds state from the event log and alerts on drift — a maintainability and observability stance X never approaches.
WINNING_STRENGTH: Y treats every operationally hostile reality of the stated stack as a first-class concern: polling tiers with explicit lag tolerance and Yogo-side timestamps (§2.3), idempotency keys keyed to `checkin:{customer_id}:{class_id}` (§2.5), retention TTLs enforced by cron rather than policy (§3.3), and an Art. 22 admin confirmation queue (§10.5, §11.1) that doubles as a safety valve against bad automated tier flips.
RUNNER_UP_GAP: X is a JSON game-design dictionary with zero schema, zero polling strategy, zero idempotency strategy, no identity resolution, no retention/growth controls, and ManyChat false-negatives entirely unaddressed — every hard engineering question in the prompt would have to be invented downstream.
```

## Detailed engineering evidence

### Storage (Turso writes, event-log growth, retention)

- **Y** commits the production write path to Turso (§2.1), defines three logical stores including an append-only `gamification_event_log` with `idempotency_key` UNIQUE, and a materialized `gamification_state` rebuildable by event replay. Retention is enforced (§3.3): 24mo hot, 25–60mo cold-anonymized, then aggregate-and-purge — by monthly cron, not policy. This directly answers the storage-growth probe.
- **X** mentions nothing about storage at all. There is no schema, no log table, no retention, no growth control. `integrations.yogo.connection` is literally "WhatsApp bot pulls data on demand", which is incompatible with the polling stack the prompt names. The CLAUDE.md note that Vercel + SQLite is read-only in serverless is silently ignored.

### Polling strategy (Yogo, lag tolerance, idempotency)

- **Y** §2.3 defines a two-tier poll: 15-min class-window poll during operating hours and a daily memberships sweep at 03:00 Lisbon, explicitly noting that Vercel Hobby's daily cron is insufficient and Pro is required (a real budget decision surfaced in Open Question #1, §14). Crucially, lag-sensitive triggers reference Yogo-side timestamps rather than poll-detection time (§2.3, "Lag tolerance"), and renewal uses Yogo `last_renewed_at` with `observed_at` stored separately (Engineer MAJOR 8 mapping in the final section). Idempotency is per-event: `idempotency_key = checkin:{customer_id}:{class_id}` (§2.5).
- **X** does not mention polling cadence, idempotency, or lag at all. The `streak_5` boost trigger is `consecutiveDays >= 5` (boosts.definitions) without any definition of "day" relative to polling — exactly the streak-vs-polling failure the prompt probes.

### Race conditions (concurrent boost calc, monthly reset)

- **Y** §2.5 specifies single-writer-per-customer (hash-partitioned) replay, with boost multipliers computed at materialization time from the event's `created_at`, not from `now()` — making the system deterministic and replay-safe. Reset (§2.4) is bracketed by `monthly_reset_started` / `monthly_reset_completed` events with a `reset_id` UUID, advisory lock, batch idempotency via `points_zeroed_at_reset_id`, and an explicit `points_period` field on every event so events arriving mid-reset credit the correct snapshot.
- **X** says `tierEvaluation: "Continuous — tier re-evaluated on every XP credit"` and `embaixador_ratio` is "Calculado em tempo real" — both of which fight the materialize-on-write pattern needed at this scale and create exactly the concurrent-boost race the prompt asks about. The boost-stacking example is arithmetic, not a concurrency strategy.

### Identity resolution (IG ↔ WhatsApp ↔ Yogo)

- **Y** §2.2 defines `gamification_identity` with `customer_id` as PK (Yogo authoritative), normalized `phone_e164`, `whatsapp_wa_id`, `manychat_subscriber`, `instagram_handle`, and an `ig_verified_at` set only after a bot-issued challenge code is echoed back from the IG account. UGC credits gate on `ig_verified_at IS NOT NULL`. This is the only design in either candidate that closes the "credit the wrong student" failure mode.
- **X** never describes identity resolution. The closest it gets is `antiAbuse.duplicateAccountDetection: "Monitor name + phone + email + payment_method overlap"` — a free-text wish without a schema or join key.

### Failure modes (cron miss, ManyChat false negatives, DST)

- **Y** addresses each: nightly reconciliation at 04:00 flags drift (§2.4); ManyChat false negatives have a dedicated `UGC manual approve queue` (§11.1.7) that writes events identical to the auto path with `source = admin_ui`; DST is handled by the 02:30 cron offset (§2.4).
- **X** has no observability story. Cron-miss recovery is undefined; `manychat.events` lists detections but there is no fallback if a detection is missed; the reset string says "Day 1 at 00:00 Europe/Lisbon" with no DST consideration.

### Maintainability tradeoffs

Y explicitly defers items the stack can't yet support (`freeMonthsPerYear`, `cross_training`, `dupla`, music/store) with reasons listed in §13. X promises Spotify and store integrations as future triggers but couples points formulas to them ("variable") with no schema for evaluating them. Y also produces an Open Questions list (§14) calibrated to engineering reality (Yogo coupon API, Vercel Pro budget, bot migration timing) — exactly the surface a builder would need to scope a sprint.

Net: on every engineering axis the prompt names, Y is operational and X is aspirational. Y wins.
