/**
 * Tz-correct weekly-challenge window bounds, in Europe/Lisbon.
 *
 * Deliberately does NOT use getISOWeekStart (which resolves the boundary in
 * UTC, off by ~1h during WEST). Window = Wed 12:00:00 → Sun 23:59:59 Lisbon
 * of the ISO week (Mon–Sun) containing `now`. isoWeek id = that Monday's
 * Lisbon calendar date "YYYY-MM-DD".
 */

const LISBON = "Europe/Lisbon";
const DAY_MS = 86_400_000;
const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
};

interface LisbonParts {
  year: number; month: number; day: number;
  hour: number; minute: number; second: number; weekday: string;
}

function lisbonParts(at: Date): LisbonParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LISBON, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short",
  }).formatToParts(at);
  const m: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") m[p.type] = p.value;
  return {
    year: Number(m.year), month: Number(m.month), day: Number(m.day),
    hour: Number(m.hour) % 24, minute: Number(m.minute), second: Number(m.second),
    weekday: m.weekday,
  };
}

/** Minutes to add to a UTC instant to get Lisbon wall time (+60 in summer). */
function lisbonOffsetMinutes(at: Date): number {
  const lp = lisbonParts(at);
  const asUTC = Date.UTC(lp.year, lp.month - 1, lp.day, lp.hour, lp.minute, lp.second);
  return Math.round((asUTC - at.getTime()) / 60000);
}

/** UTC instant for a Lisbon wall-clock time on a Lisbon Y-M-D. */
function lisbonInstant(y: number, mo: number, d: number, hh: number, mm: number, ss: number): Date {
  const naive = Date.UTC(y, mo - 1, d, hh, mm, ss);
  const off = lisbonOffsetMinutes(new Date(naive));
  return new Date(naive - off * 60000);
}

export interface ChallengeWindow {
  isoWeek: string;
  windowStart: Date;
  windowEnd: Date;
}

export function challengeWindow(now: Date): ChallengeWindow {
  const lp = lisbonParts(now);
  const dow = WEEKDAY_INDEX[lp.weekday];
  const monday = new Date(Date.UTC(lp.year, lp.month - 1, lp.day) - dow * DAY_MS);
  const wed = new Date(monday.getTime() + 2 * DAY_MS);
  const sun = new Date(monday.getTime() + 6 * DAY_MS);

  const isoWeek = `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, "0")}-${String(monday.getUTCDate()).padStart(2, "0")}`;
  const windowStart = lisbonInstant(wed.getUTCFullYear(), wed.getUTCMonth() + 1, wed.getUTCDate(), 12, 0, 0);
  const windowEnd = lisbonInstant(sun.getUTCFullYear(), sun.getUTCMonth() + 1, sun.getUTCDate(), 23, 59, 59);
  return { isoWeek, windowStart, windowEnd };
}
