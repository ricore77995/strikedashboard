/**
 * Pure Flash Check-in scorer. Given Yogo classes and the window bounds (ms),
 * returns every athlete's EARLIEST in-window check-in, ranked ascending by
 * check-in time, tie-broken by customerId. No DB, no gates, no cap — resolve
 * applies credit gates + winnersMax with backfill.
 */
export interface ScorerSignup {
  user: { id: number };
  checked_in: number; // Yogo Unix ms, 0 = not checked in
}
export interface ScorerClass {
  signups: ScorerSignup[];
}
export interface RankedCheckin {
  customerId: number;
  checkedInAt: number;
}

export function scoreFlashCheckin(
  classes: ScorerClass[],
  windowStartMs: number,
  windowEndMs: number,
): RankedCheckin[] {
  const earliest = new Map<number, number>();
  for (const cls of classes) {
    for (const s of cls.signups ?? []) {
      const ts = s.checked_in;
      if (!ts || ts < windowStartMs || ts > windowEndMs) continue;
      const id = s.user?.id;
      if (typeof id !== "number") continue;
      const prev = earliest.get(id);
      if (prev === undefined || ts < prev) earliest.set(id, ts);
    }
  }
  return [...earliest.entries()]
    .map(([customerId, checkedInAt]) => ({ customerId, checkedInAt }))
    .sort((a, b) => a.checkedInAt - b.checkedInAt || a.customerId - b.customerId);
}
