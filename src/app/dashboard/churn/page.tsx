"use client";

import { useEffect, useCallback, useState } from "react";
import { useDashboard } from "@/app/dashboard/layout";
import { DataTable } from "@/components/data-table";
import { LoaderIcon } from "@/components/icons";
import { BarChart } from "@/components/bar-chart";

interface ChurnRow {
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

interface ChurnReport {
  rows: ChurnRow[];
  aggregates: {
    total: number;
    averageDurationDays: number;
    thisMonthCount: number;
    topPlan: { plan: string; count: number } | null;
    averageAttendanceRate: number;
  };
  period: { startDate: string; endDate: string };
}

const EXIT_LABELS: Record<ChurnRow["exitReason"], string> = {
  payment_failed: "Pagamento falhado",
  cancelled: "Cancelado pelo cliente",
  admin_action: "Terminado pelo estúdio",
  ended_other: "Terminado",
};

export default function ChurnPage() {
  const { refreshKey, setLastFetch } = useDashboard();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ChurnReport | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/churn-report");
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as ChurnReport;
      setReport(data);
      setLastFetch(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [setLastFetch]);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (loading) return <div className="py-20 flex justify-center"><LoaderIcon /></div>;
  if (error) return <div className="py-20 text-center text-tone-coral text-sm">Erro: {error}</div>;
  if (!report) return null;

  const { rows, aggregates } = report;

  const monthlyChartData = (() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (!r.churnMonth) continue;
      counts.set(r.churnMonth, (counts.get(r.churnMonth) ?? 0) + 1);
    }
    const months = Array.from(counts.keys()).sort();
    return months.map((m) => ({ label: `${m.slice(5)}/${m.slice(2, 4)}`, value: counts.get(m) ?? 0 }));
  })();

  const durationChartData = (() => {
    const buckets: { label: string; min: number; max: number | null }[] = [
      { label: "< 1 mês", min: 0, max: 30 },
      { label: "1-3 m", min: 30, max: 90 },
      { label: "3-6 m", min: 90, max: 180 },
      { label: "6-12 m", min: 180, max: 365 },
      { label: "1-2 a", min: 365, max: 730 },
      { label: "> 2 a", min: 730, max: null },
    ];
    const counts = buckets.map((b) => ({
      label: b.label,
      value: rows.filter((r) => r.durationDays >= b.min && (b.max === null || r.durationDays < b.max)).length,
    }));
    return counts;
  })();

  const tableRows = rows
    .slice()
    .sort((a, b) => (b.endDate || "").localeCompare(a.endDate || ""))
    .map((r) => ({
      Nome: r.name,
      Plano: r.plan,
      Início: r.startDate ?? "—",
      Saída: r.endDate ?? "—",
      Permanência: r.durationLabel,
      Aulas: `${r.checkedInClasses}/${r.totalClasses}`,
      "Aulas/mês": r.classesPerMonth.toFixed(1),
      "Última aula": r.lastClassDate ?? "—",
      Motivo: EXIT_LABELS[r.exitReason],
    }));

  const topPlanLabel = aggregates.topPlan
    ? `${aggregates.topPlan.plan} (${aggregates.topPlan.count})`
    : "—";
  const attendancePct = Math.round(aggregates.averageAttendanceRate * 100);

  return (
    <div style={{ padding: "4px 18px 32px" }}>
      <div style={{ marginBottom: 14 }}>
        <h1 className="head text-xl font-bold" style={{ fontSize: 20, color: "#fff", margin: 0 }}>Histórico de churn</h1>
        <p className="text-muted text-sm mt-1" style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: "4px 0 0" }}>
          Subscrições terminadas nos últimos 6 meses · aulas em grupo
        </p>
      </div>

      {/* Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <Card label="Total churns" value={String(aggregates.total)} />
        <Card label="Permanência média" value={formatDuration(aggregates.averageDurationDays)} />
        <Card label="Churns este mês" value={String(aggregates.thisMonthCount)} />
        <Card label="Plano mais churnado" value={topPlanLabel} />
      </div>

      {/* Charts */}
      {monthlyChartData.length > 0 && (
        <div
          style={{
            background: "#0F0F14",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 14,
            padding: 14,
            marginBottom: 14,
          }}
        >
          <div
            className="head"
            style={{ fontSize: 10, color: "rgba(255,255,255,0.72)", marginBottom: 10, letterSpacing: "0.02em" }}
          >
            CHURN POR MÊS
          </div>
          <BarChart data={monthlyChartData} height={180} format="count" />
        </div>
      )}

      {durationChartData.length > 0 && (
        <div
          style={{
            background: "#0F0F14",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 14,
            padding: 14,
            marginBottom: 14,
          }}
        >
          <div
            className="head"
            style={{ fontSize: 10, color: "rgba(255,255,255,0.72)", marginBottom: 10, letterSpacing: "0.02em" }}
          >
            PERMANÊNCIA ATÉ CHURN
          </div>
          <BarChart data={durationChartData} height={180} format="count" />
        </div>
      )}

      {/* Attendance note */}
      <div
        style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 14, padding: "0 2px" }}
      >
        Taxa média de assiduidade:{" "}
        <span style={{ color: "#fff", fontWeight: 600 }}>{attendancePct}%</span>
      </div>

      {/* Table */}
      <DataTable
        rows={tableRows}
        title="Detalhe por subscritor"
        empty="Nenhum churn nos últimos 6 meses"
      />
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "#0F0F14",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 14,
        padding: 14,
      }}
    >
      <div
        className="head"
        style={{ fontSize: 10, color: "rgba(255,255,255,0.72)", marginBottom: 6, letterSpacing: "0.02em" }}
      >
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 22, color: "#fff", fontWeight: 700, lineHeight: 1.2 }}>{value}</div>
    </div>
  );
}

function formatDuration(days: number): string {
  if (days < 30) return `${days} dia${days === 1 ? "" : "s"}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${months === 1 ? "mês" : "meses"}`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (rem === 0) return `${years} ano${years === 1 ? "" : "s"}`;
  return `${years} ano${years === 1 ? "" : "s"} ${rem} ${rem === 1 ? "mês" : "meses"}`;
}
