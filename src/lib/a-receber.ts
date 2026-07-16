import { getPlan, isPTPlan } from "./utils";

/**
 * A Receber — cash-flow model built on Yogo's `next_payment` signal.
 *
 * `paid_until` day-of-month projection was the old (wrong) model: it assumed every
 * member renews monthly and summed a plan-level price, which over-counted quarterly
 * (Trimestral), prepaid, and overdue members. Yogo's `next_payment: { date, amount }`
 * is the authoritative "next charge queued" — exact date AND amount per membership.
 * PT packs have `next_payment: null`, so they drop out with no special-casing.
 *
 * See vault/Plans/2026-06-13-a-receber-cash-flow-fix.md and [[yogo-booking-api]].
 */

export interface ReceivableMembership {
  id: number;
  user_id?: number;
  user_full_name?: string;
  membership_type_name?: string;
  status?: string;
  status_text?: string;
  paid_until?: string;
  start_date?: string;
  created_at?: string;
  next_payment?: { date?: string; amount?: number } | null;
}

export interface DayBucket {
  amount: number;
  count: number;
}

export interface OverdueRow {
  id: number;
  name: string;
  plan: string;
  planKey: string;
  isPT: boolean;
  paidUntil: string;
  amount: number;
}

export interface OverdueResult {
  count: number;
  amount: number;
  rows: OverdueRow[];
}

export interface ScheduleSummary {
  total: number;
  renewals: number;
}

/** Paused memberships keep `status: "active"` — the real signal is status_text. */
export function isPaused(statusText?: string | null): boolean {
  return /^Paus/i.test(String(statusText || ""));
}

function nextPaymentDate(m: ReceivableMembership): string | null {
  const d = m.next_payment?.date;
  return d ? String(d) : null;
}

/**
 * A membership is "charging" (will produce a receivable) when Yogo has a future
 * next payment queued and it is not paused. Cancelled-in-notice members count only
 * if Yogo still has a next payment queued for them.
 */
export function isCharging(m: ReceivableMembership, todayStr: string): boolean {
  if (isPaused(m.status_text)) return false;
  const date = nextPaymentDate(m);
  return date !== null && date >= todayStr;
}

/**
 * Buckets next_payment amounts by day for the selected month.
 * Only charging memberships whose next_payment.date falls in (year, month) are counted.
 */
export function buildSchedule(
  memberships: ReceivableMembership[],
  year: number,
  month: number, // 0-indexed
  todayStr: string,
): { days: Map<string, DayBucket>; summary: ScheduleSummary } {
  const days = new Map<string, DayBucket>();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  let total = 0;
  let renewals = 0;

  for (const m of memberships) {
    if (!isCharging(m, todayStr)) continue;
    const date = nextPaymentDate(m)!;
    if (!date.startsWith(monthPrefix)) continue;
    const amount = Number(m.next_payment?.amount) || 0;
    const bucket = days.get(date) ?? { amount: 0, count: 0 };
    bucket.amount += amount;
    bucket.count += 1;
    days.set(date, bucket);
    total += amount;
    renewals += 1;
  }

  return { days, summary: { total, renewals } };
}

/**
 * Overdue snapshot (present-tense): active/cancelled-running, not paused, paid period
 * has ended, AND no future renewal queued (a queued next_payment means renewal is
 * processing, not overdue). Amount = the missed next_payment.amount when available.
 */
export function computeOverdue(memberships: ReceivableMembership[], todayStr: string): OverdueResult {
  const rows: OverdueRow[] = [];
  let amount = 0;

  for (const m of memberships) {
    const status = m.status;
    if (status !== "active" && status !== "cancelled_running") continue;
    if (isPaused(m.status_text)) continue;
    if (!m.paid_until || m.paid_until >= todayStr) continue;

    // Renewal queued in the future → mid-renewal, not overdue.
    const npDate = nextPaymentDate(m);
    if (npDate && npDate >= todayStr) continue;

    const planKey = getPlan(m.membership_type_name);
    const val = Number(m.next_payment?.amount) || 0;
    amount += val;
    rows.push({
      id: m.id,
      name: (m.user_full_name || "").trim() || `#${m.id}`,
      plan: m.membership_type_name || "—",
      planKey,
      isPT: isPTPlan(planKey),
      paidUntil: m.paid_until,
      amount: val,
    });
  }

  rows.sort((a, b) => a.paidUntil.localeCompare(b.paidUntil));
  return { count: rows.length, amount, rows };
}
