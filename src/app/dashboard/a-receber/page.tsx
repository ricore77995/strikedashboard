"use client";

import { useEffect, useCallback, useState } from "react";
import { useYogoFetch } from "@/hooks/use-yogo";
import { useDashboard } from "@/app/dashboard/layout";
import { LoaderIcon } from "@/components/icons";
import { Pill } from "@/components/pill";
import { getPlan, isPTPlan, eur } from "@/lib/utils";

interface Membership {
  user_id?: number;
  user_full_name?: string;
  membership_type_name?: string;
  paid_until?: string;
  start_date?: string;
  created_at?: string;
  status?: string;
}

type DayEntry = { recurring: number; pt: number };

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// Returns 0=Mon … 6=Sun (European calendar)
function getFirstWeekday(year: number, month: number): number {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1;
}

function buildDayMap(memberships: Membership[], year: number, month: number, todayStr: string, planValues: Record<string, number> | null): Map<string, DayEntry> {
  const map = new Map<string, DayEntry>();
  const daysInMonth = getDaysInMonth(year, month);
  const selectedYM = year * 12 + month;
  const todayParts = todayStr.split("-");
  const todayYM = parseInt(todayParts[0]) * 12 + (parseInt(todayParts[1]) - 1);
  // "active this month" threshold: paid_until >= first day of current month
  const currentMonthStart = `${todayParts[0]}-${todayParts[1]}-01`;

  for (const m of memberships) {
    if (!m.paid_until) continue;
    const plan = getPlan(m.membership_type_name);
    const value = planValues?.[plan] ?? 0;
    if (value === 0) continue;

    const parts = m.paid_until.split("-");
    const baseYear = parseInt(parts[0]);
    const baseMonth = parseInt(parts[1]) - 1;
    const baseDay = parseInt(parts[2]);
    const baseYM = baseYear * 12 + baseMonth;

    if (isPTPlan(plan)) {
      // PT passes: only show on their actual paid_until date
      if (baseYear === year && baseMonth === month) {
        const entry = map.get(m.paid_until) ?? { recurring: 0, pt: 0 };
        map.set(m.paid_until, { ...entry, pt: entry.pt + value });
      }
    } else {
      // Recurring: project renewal day to selected month
      // Past/current months: show members whose paid_until was in/after that month
      // Future months: show all members active in the current month (same base as today's view)
      const include = selectedYM <= todayYM
        ? baseYM >= selectedYM
        : m.paid_until >= currentMonthStart;

      if (!include) continue;

      const projectedDay = Math.min(baseDay, daysInMonth);
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(projectedDay).padStart(2, "0")}`;
      const entry = map.get(key) ?? { recurring: 0, pt: 0 };
      map.set(key, { ...entry, recurring: entry.recurring + value });
    }
  }

  return map;
}

export default function AReceberPage() {
  const today = new Date();
  const { refreshKey, setLastFetch } = useDashboard();
  const { fetchReport } = useYogoFetch();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [planValues, setPlanValues] = useState<Record<string, number> | null>(null);
  const [loadingPricing, setLoadingPricing] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await fetchReport("reports/memberships-list", {});
      setMemberships(raw as unknown as Membership[]);
      setLastFetch(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [fetchReport, setLastFetch]);

  useEffect(() => { load(); }, [load, refreshKey]);

  useEffect(() => {
    fetch('/api/yogo/pricing')
      .then((r) => r.json())
      .then((data) => {
        setPlanValues(data.values);
        setLoadingPricing(false);
      })
      .catch(() => setLoadingPricing(false));
  }, []);

  const prevMonth = () => {
    if (selectedMonth === 0) { setSelectedYear((y) => y - 1); setSelectedMonth(11); }
    else setSelectedMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (selectedMonth === 11) { setSelectedYear((y) => y + 1); setSelectedMonth(0); }
    else setSelectedMonth((m) => m + 1);
  };

  if (loading) return <div className="py-20 flex justify-center"><LoaderIcon /></div>;
  if (error) return <div className="py-20 text-center text-tone-coral text-sm">Erro: {error}</div>;

  const isFuture =
    selectedYear > today.getFullYear() ||
    (selectedYear === today.getFullYear() && selectedMonth > today.getMonth());
  const isCurrentMonth =
    selectedYear === today.getFullYear() && selectedMonth === today.getMonth();
  const todayStr = today.toISOString().slice(0, 10);

  const dayMap = buildDayMap(memberships, selectedYear, selectedMonth, todayStr, planValues);

  let totalRecurring = 0;
  let totalPT = 0;
  for (const entry of dayMap.values()) {
    totalRecurring += entry.recurring;
    totalPT += entry.pt;
  }

  const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
  const firstWeekday = getFirstWeekday(selectedYear, selectedMonth);
  const trailingCells = (7 - ((firstWeekday + daysInMonth) % 7)) % 7;

  return (
    <div style={{ paddingBottom: 32 }}>
      {/* Month navigation */}
      <div style={{ padding: "4px 18px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button
          onClick={prevMonth}
          className="tap"
          style={{ padding: "8px 16px", background: "#0F0F14", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, color: "rgba(255,255,255,0.72)", cursor: "pointer", fontSize: 18, fontFamily: "inherit" }}
        >
          ←
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="head" style={{ fontSize: 17, color: "#fff" }}>
            {MONTH_NAMES[selectedMonth]} {selectedYear}
          </span>
          {isFuture && (
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", padding: "3px 8px", borderRadius: 999, background: "rgba(245,158,11,0.12)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.18)" }}>
              ESTIMATIVA
            </span>
          )}
        </div>

        <button
          onClick={nextMonth}
          className="tap"
          style={{ padding: "8px 16px", background: "#0F0F14", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, color: "rgba(255,255,255,0.72)", cursor: "pointer", fontSize: 18, fontFamily: "inherit" }}
        >
          →
        </button>
      </div>

      {/* KPI cards */}
      <div style={{ padding: "0 18px 16px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {[
          { label: "TOTAL", value: eur(totalRecurring + totalPT), color: "#fff" },
          { label: "GRUPO", value: eur(totalRecurring), color: "#00E5A0" },
          { label: "PT", value: eur(totalPT), color: "#A78BFA" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: "#0F0F14", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "12px 10px" }}>
            <div className="head" style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", marginBottom: 6, letterSpacing: "0.06em" }}>
              {label}
            </div>
            <div className="num" style={{ fontSize: 20, color, fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>

      {loadingPricing ? (
        <div style={{ padding: "0 18px 8px" }}>
          <Pill color="amber">A carregar preços...</Pill>
        </div>
      ) : null}

      {/* Calendar */}
      <div style={{ padding: "0 18px" }}>
        {/* Weekday headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, marginBottom: 3 }}>
          {WEEKDAYS.map((d) => (
            <div key={d} style={{ textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 700, padding: "3px 0" }}>
              {d}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
          {/* Leading empty cells */}
          {Array.from({ length: firstWeekday }).map((_, i) => (
            <div key={`s${i}`} style={{ minHeight: 58, borderRadius: 8 }} />
          ))}

          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const entry = dayMap.get(dateStr);
            const hasValue = !!entry && (entry.recurring > 0 || entry.pt > 0);
            const isPast = isCurrentMonth && dateStr < todayStr;
            const isToday = isCurrentMonth && dateStr === todayStr;

            return (
              <div
                key={day}
                style={{
                  minHeight: 58,
                  background: hasValue ? "#1A1A24" : "#0D0D12",
                  border: `1px solid ${isToday ? "rgba(0,229,160,0.35)" : hasValue ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)"}`,
                  borderRadius: 8,
                  padding: "5px 5px 4px",
                  display: "flex",
                  flexDirection: "column",
                  opacity: isPast ? 0.45 : 1,
                }}
              >
                <span style={{ fontSize: 10, color: isToday ? "#00E5A0" : "rgba(255,255,255,0.3)", marginBottom: 3 }}>
                  {day}
                </span>
                {entry?.recurring ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#00E5A0", lineHeight: 1.3 }}>
                    {eur(entry.recurring)}
                  </span>
                ) : null}
                {entry?.pt ? (
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#A78BFA", marginTop: 1, lineHeight: 1.3 }}>
                    {eur(entry.pt)}
                  </span>
                ) : null}
              </div>
            );
          })}

          {/* Trailing empty cells */}
          {Array.from({ length: trailingCells }).map((_, i) => (
            <div key={`e${i}`} style={{ minHeight: 58, borderRadius: 8 }} />
          ))}
        </div>
      </div>

      {/* Weekly summary table */}
      {(() => {
        const numWeeks = Math.ceil((firstWeekday + daysInMonth) / 7);
        const weeks = Array.from({ length: numWeeks }, (_, w) => {
          let recurring = 0;
          let pt = 0;
          for (let d = 1; d <= daysInMonth; d++) {
            if (Math.ceil((d + firstWeekday) / 7) !== w + 1) continue;
            const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const entry = dayMap.get(dateStr);
            if (entry) { recurring += entry.recurring; pt += entry.pt; }
          }
          return { week: w + 1, recurring, pt };
        });

        return (
          <div style={{ padding: "16px 18px 0" }}>
            <div className="head" style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: "0.06em", marginBottom: 8 }}>
              RESUMO POR SEMANA
            </div>
            <div style={{ background: "#0F0F14", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, overflow: "hidden" }}>
              {/* Header */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                {["SEMANA", "GRUPO", "PT", "TOTAL"].map((h) => (
                  <div key={h} style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: "0.06em" }}>{h}</div>
                ))}
              </div>
              {/* Rows */}
              {weeks.map(({ week, recurring, pt }) => (
                <div key={week} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>Sem. {week}</div>
                  <div style={{ fontSize: 12, color: recurring > 0 ? "#00E5A0" : "rgba(255,255,255,0.2)", fontWeight: 700 }}>{recurring > 0 ? eur(recurring) : "—"}</div>
                  <div style={{ fontSize: 12, color: pt > 0 ? "#A78BFA" : "rgba(255,255,255,0.2)", fontWeight: 700 }}>{pt > 0 ? eur(pt) : "—"}</div>
                  <div style={{ fontSize: 12, color: "#fff", fontWeight: 700 }}>{recurring + pt > 0 ? eur(recurring + pt) : "—"}</div>
                </div>
              ))}
              {/* Total row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", padding: "10px 14px", background: "rgba(255,255,255,0.03)" }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 700, letterSpacing: "0.04em" }}>TOTAL</div>
                <div style={{ fontSize: 12, color: "#00E5A0", fontWeight: 800 }}>{eur(totalRecurring)}</div>
                <div style={{ fontSize: 12, color: "#A78BFA", fontWeight: 800 }}>{eur(totalPT)}</div>
                <div style={{ fontSize: 13, color: "#fff", fontWeight: 800 }}>{eur(totalRecurring + totalPT)}</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Recent renewals */}
      {(() => {
        const recent = memberships
          .filter((m) => m.user_full_name && (m.start_date || m.created_at))
          .map((m) => {
            const plan = getPlan(m.membership_type_name);
            const startDate = m.start_date ?? m.created_at ?? "";
            return { name: m.user_full_name!, startDate, paid_until: m.paid_until ?? "", plan, value: planValues?.[plan] ?? 0 };
          })
          .filter((m) => m.value > 0)
          .sort((a, b) => b.startDate.localeCompare(a.startDate))
          .slice(0, 15);

        if (recent.length === 0) return null;

        return (
          <div style={{ padding: "16px 18px 0" }}>
            <div className="head" style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: "0.06em", marginBottom: 8 }}>
              ÚLTIMAS SUBSCRIÇÕES
            </div>
            <div style={{ background: "#0F0F14", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, overflow: "hidden" }}>
              {recent.map((m, i) => {
                const isPT = isPTPlan(m.plan);
                return (
                  <div
                    key={i}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: i < recent.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
                  >
                    {/* Avatar */}
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: isPT ? "rgba(167,139,250,0.12)" : "rgba(0,229,160,0.1)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: isPT ? "#A78BFA" : "#00E5A0" }}>
                        {m.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                      </span>
                    </div>
                    {/* Name + plan */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>{m.plan}</div>
                    </div>
                    {/* Date */}
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", flexShrink: 0, textAlign: "right" }}>
                      {m.startDate}
                    </div>
                    {/* Value */}
                    <div style={{ fontSize: 13, fontWeight: 700, color: isPT ? "#A78BFA" : "#00E5A0", flexShrink: 0, minWidth: 44, textAlign: "right" }}>
                      {eur(m.value)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
