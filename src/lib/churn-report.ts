import { getPlan, isPTPlan, parseYogoDate } from "@/lib/utils";

export interface YogoMembershipRow {
  id: number;
  user_id: number;
  user_full_name?: string;
  user_first_name?: string;
  user_last_name?: string;
  user_email?: string;
  user_phone?: string;
  membership_type_name?: string;
  status: "ended";
  status_text?: string;
  paid_until?: string | null;
  start_date?: string | null;
  created_at?: string | null;
  ended_because?: "payment_failed" | "admin_action" | "cancelled" | string | null;
  next_payment?: { date?: string; amount?: number } | null;
}

export interface YogoCustomer {
  id: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
}

export interface YogoClass {
  id: number;
  date: string;
  signups?: Array<{
    user_id?: number;
    user?: { id?: number };
    checked_in?: number | boolean;
    cancelled_at?: number | null;
  }>;
}

export interface ChurnRow {
  customerId: number;
  name: string;
  email: string | null;
  phone: string | null;
  plan: string;
  startDate: string | null;
  endDate: string | null;
  exitReason: "payment_failed" | "cancelled" | "admin_action" | "ended_other";
  durationDays: number;
  durationLabel: string;
  totalClasses: number;
  checkedInClasses: number;
  classesPerMonth: number;
  lastClassDate: string | null;
  cohortMonth: string | null;
  churnMonth: string | null;
}

export interface ChurnReport {
  rows: ChurnRow[];
  aggregates: {
    total: number;
    averageDurationDays: number;
    thisMonthCount: number;
    topPlan: { plan: string; count: number } | null;
    averageAttendanceRate: number;
  };
  period: {
    startDate: string;
    endDate: string;
  };
}

export function formatDuration(days: number): string {
  if (days < 30) return `${days} dia${days === 1 ? "" : "s"}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${months === 1 ? "mês" : "meses"}`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (rem === 0) return `${years} ano${years === 1 ? "" : "s"}`;
  return `${years} ano${years === 1 ? "" : "s"} ${rem} ${rem === 1 ? "mês" : "meses"}`;
}

function parseStartDate(m: YogoMembershipRow): string | null {
  if (m.start_date) return m.start_date;
  if (m.created_at) {
    const ts = parseYogoDate(m.created_at);
    if (ts) return new Date(ts).toISOString().slice(0, 10);
  }
  return null;
}

function toMonth(d: string | null): string | null {
  return d ? d.slice(0, 7) : null;
}

function isTruthy(v: unknown): boolean {
  return v === true || v === 1 || v === "1";
}

function getUserId(signup: { user_id?: number; user?: { id?: number } }): number | undefined {
  return signup.user_id ?? signup.user?.id;
}

export function buildChurnReport(
  memberships: YogoMembershipRow[],
  classes: YogoClass[],
  customers: YogoCustomer[],
  period: { startDate: string; endDate: string }
): ChurnReport {
  const customerById = new Map(customers.map((c) => [c.id, c]));

  // Index signups by userId
  const signupsByUser = new Map<number, { date: string; checkedIn: boolean }[]>();
  for (const klass of classes) {
    for (const signup of klass.signups ?? []) {
      const uid = getUserId(signup);
      if (!uid) continue;
      if (signup.cancelled_at) continue;
      const list = signupsByUser.get(uid) ?? [];
      list.push({ date: klass.date, checkedIn: isTruthy(signup.checked_in) });
      signupsByUser.set(uid, list);
    }
  }

  const rows: ChurnRow[] = [];
  for (const m of memberships) {
    const plan = getPlan(m.membership_type_name);
    if (isPTPlan(plan)) continue;

    const customer = customerById.get(m.user_id);
    const startDate = parseStartDate(m);
    const endDate = m.paid_until ?? null;

    let durationDays = 0;
    if (startDate && endDate) {
      durationDays = Math.max(
        0,
        Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000)
      );
    }

    const userSignups = signupsByUser.get(m.user_id) ?? [];
    const periodSignups =
      startDate && endDate
        ? userSignups.filter((s) => s.date >= startDate && s.date <= endDate)
        : userSignups;

    const totalClasses = periodSignups.length;
    const checkedInClasses = periodSignups.filter((s) => s.checkedIn).length;
    const classesPerMonth = totalClasses / Math.max(durationDays / 30, 1);
    const lastClassDate =
      periodSignups.length > 0
        ? periodSignups.sort((a, b) => b.date.localeCompare(a.date))[0].date
        : null;

    let exitReason: ChurnRow["exitReason"] = "ended_other";
    if (m.ended_because === "payment_failed") exitReason = "payment_failed";
    else if (m.ended_because === "cancelled") exitReason = "cancelled";
    else if (m.ended_because === "admin_action") exitReason = "admin_action";

    const customerName = customer
      ? `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim() || `#${m.user_id}`
      : `#${m.user_id}`;

    rows.push({
      customerId: m.user_id,
      name: m.user_full_name || [m.user_first_name, m.user_last_name].filter(Boolean).join(" ") || customerName,
      email: customer?.email ?? m.user_email ?? null,
      phone: customer?.phone ?? m.user_phone ?? null,
      plan,
      startDate,
      endDate,
      exitReason,
      durationDays,
      durationLabel: formatDuration(durationDays),
      totalClasses,
      checkedInClasses,
      classesPerMonth,
      lastClassDate,
      cohortMonth: toMonth(startDate),
      churnMonth: toMonth(endDate),
    });
  }

  const total = rows.length;
  const averageDurationDays = total > 0 ? Math.round(rows.reduce((s, r) => s + r.durationDays, 0) / total) : 0;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const thisMonthCount = rows.filter((r) => r.churnMonth === thisMonth).length;

  const planCounts = new Map<string, number>();
  for (const r of rows) {
    planCounts.set(r.plan, (planCounts.get(r.plan) ?? 0) + 1);
  }
  let topPlan: { plan: string; count: number } | null = null;
  for (const [plan, count] of planCounts) {
    if (!topPlan || count > topPlan.count || (count === topPlan.count && plan < topPlan.plan)) {
      topPlan = { plan, count };
    }
  }

  const totalSignups = rows.reduce((s, r) => s + r.totalClasses, 0);
  const totalCheckedIn = rows.reduce((s, r) => s + r.checkedInClasses, 0);
  const averageAttendanceRate = totalSignups > 0 ? totalCheckedIn / totalSignups : 0;

  return {
    rows,
    aggregates: {
      total,
      averageDurationDays,
      thisMonthCount,
      topPlan,
      averageAttendanceRate,
    },
    period,
  };
}
