"use client";

import { useEffect, useCallback, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useYogoFetch } from "@/hooks/use-yogo";
import { useDashboard } from "@/app/dashboard/layout";
import { LoaderIcon } from "@/components/icons";
import { getPlan, isPTPlan, eur } from "@/lib/utils";
import { ALL_SUB_IDS } from "@/lib/constants";
import { SubRow } from "@/components/sub-row";
import { Pill } from "@/components/pill";
import { type SubStatus } from "@/components/status-pill";

interface Customer {
  id: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  has_membership_membership_description?: string;
}

interface Membership {
  id: number;
  user_id?: number;
  membership_type_id?: number;
  membership_type_name?: string;
  paid_until?: string;
  status?: string;
  status_text?: string;
  next_payment?: { date?: string; amount?: number } | null;
}

const LATE_DAYS_CUTOFF = 20;
const ALL_SUB_IDS_SET = new Set(ALL_SUB_IDS);

interface EnrichedCustomer extends Customer {
  paidUntil: string;
  nextPaymentDate?: string;
  statusText?: string;
  plan: string;
  daysLeft: number;
  status: SubStatus;
  isPT: boolean;
  technicalStatus: "active" | "paused" | "ended" | "cancelled_running" | null;
  isActiveCustomer: boolean;
  isPaused: boolean;
  isLate: boolean;
  isChurn: boolean;
  isRisk: boolean;
  isFailedEnded: boolean;
  daysOverdue: number;
  badges: { status: SubStatus; daysUntilRenewal?: number }[];
}

const STATUS_PRIORITY: Record<string, number> = { active: 0, cancelled_running: 1, ended: 2 };

function pickBestMembership(mbs: Membership[]): Membership | null {
  if (mbs.length === 0) return null;
  return [...mbs].sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status ?? ""] ?? 99;
    const pb = STATUS_PRIORITY[b.status ?? ""] ?? 99;
    if (pa !== pb) return pa - pb;
    return (b.paid_until ?? "").localeCompare(a.paid_until ?? "");
  })[0];
}

const VALID_FILTERS = ["all", "active", "healthy", "risk", "failed", "churn", "paused"] as const;
type ValidFilter = typeof VALID_FILTERS[number];

function isValidFilter(v: string | null): v is ValidFilter {
  return VALID_FILTERS.includes(v as ValidFilter);
}

export default function SubscribersPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { refreshKey, setLastFetch } = useDashboard();
  const { fetchReport } = useYogoFetch();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allCustomers, setAllCustomers] = useState<EnrichedCustomer[]>([]);
  const [activeFilter, setActiveFilter] = useState<ValidFilter>(() => {
    const fromUrl = searchParams.get("filter");
    return isValidFilter(fromUrl) ? fromUrl : "active";
  });
  const [planValues, setPlanValues] = useState<Record<string, number> | null>(null);
  const [loadingPricing, setLoadingPricing] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [customersRaw, membershipsRaw] = await Promise.all([
        fetchReport("reports/customers", {
          filters: [{
            type: "hasMembershipOrClassPass",
            membershipTypeId: ALL_SUB_IDS,
            classPassTypeId: [],
            onlyActiveMembershipsOrClassPasses: false,
          }],
          returnColumnHeaders: true,
        }),
        fetchReport("reports/memberships-list", {}),
      ]);

      const customers = customersRaw as unknown as Customer[];
      const memberships = membershipsRaw as unknown as Membership[];

      const subMbsByUser: Record<number, Membership[]> = {};
      for (const m of memberships) {
        if (!m.user_id) continue;
        if (!ALL_SUB_IDS_SET.has(m.membership_type_id ?? -1)) continue;
        if (!subMbsByUser[m.user_id]) subMbsByUser[m.user_id] = [];
        subMbsByUser[m.user_id].push(m);
      }

      const enriched: EnrichedCustomer[] = customers.map((c) => {
        const best = pickBestMembership(subMbsByUser[c.id] ?? []);
        const planFromMb = best ? getPlan(best.membership_type_name) : null;
        const planFromCustomer = getPlan(c.has_membership_membership_description);
        // Trust the best membership's plan over the customer-report description
        // (the report can show the "wrong" plan when a customer has multiple memberships)
        const plan = planFromMb && planFromMb !== "Outros" ? planFromMb : planFromCustomer;
        const paidUntil = best?.paid_until ?? "";
        const daysLeft = paidUntil
          ? Math.round((new Date(paidUntil).getTime() - Date.now()) / 86400000)
          : 0;
        const statusText = best?.status_text ?? "";
        const nextPaymentDate = best?.next_payment?.date ?? undefined;
        const isPaused = /^Paus/i.test(statusText);
        const willAutoRenew = !!nextPaymentDate && nextPaymentDate >= today;
        const technicalStatus = (best?.status as EnrichedCustomer["technicalStatus"]) ?? null;
        const daysOverdue = paidUntil
          ? Math.round((new Date(today).getTime() - new Date(paidUntil).getTime()) / 86400000)
          : 0;

        // A customer is "active" if any of their subscription memberships is active or paused.
        // This matches Yogo's onlyActiveMembershipsOrClassPasses semantics used by the dashboard KPI.
        const isActiveCustomer = (subMbsByUser[c.id] ?? []).some(
          (m) => m.status === "active" || m.status === "paused"
        );

        // Late = active/paused membership with paid_until in the past but still recoverable.
        // Churn = ended membership with failed payment (shown in /dashboard/subscribers?filter=churn).
        const isLate = isActiveCustomer && !!paidUntil && paidUntil < today && !willAutoRenew;
        const isChurn = technicalStatus === "ended" && /falhou/i.test(statusText ?? "");
        const isFailedEnded = technicalStatus === "ended" && /falhou/i.test(statusText ?? "");
        const isRisk = !!paidUntil && paidUntil >= today && daysLeft <= 7 && !willAutoRenew && !isPaused;

        let primaryStatus: SubStatus = "active";
        if (isPaused) {
          primaryStatus = "paused";
        } else if (isChurn) {
          primaryStatus = "churn";
        } else if (isLate) {
          primaryStatus = "overdue";
        } else if (!paidUntil || paidUntil < today) {
          primaryStatus = "expired";
        } else if (isRisk) {
          primaryStatus = "risk";
        }

        // Extra badges: active label for active/paused customers in non-active states.
        const extraBadges: { status: SubStatus; daysUntilRenewal?: number }[] = [];
        if (isActiveCustomer && primaryStatus !== "active" && primaryStatus !== "churn") {
          extraBadges.push({ status: "active" });
        }

        return {
          ...c,
          paidUntil,
          nextPaymentDate,
          statusText,
          plan,
          daysLeft,
          status: primaryStatus,
          isPT: isPTPlan(plan),
          technicalStatus,
          isActiveCustomer,
          isPaused,
          isLate,
          isChurn,
          isRisk,
          isFailedEnded,
          daysOverdue,
          badges: extraBadges,
        };
      });

      setAllCustomers(enriched);
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

  if (loading) return <div className="py-20 flex justify-center"><LoaderIcon /></div>;
  if (error) return <div className="py-20 text-center text-tone-coral text-sm">Erro: {error}</div>;

  const filtered = (
    activeFilter === "all" ? allCustomers :
    activeFilter === "active" ? allCustomers.filter((c) => c.isActiveCustomer) :
    activeFilter === "healthy" ? allCustomers.filter((c) =>
      c.isActiveCustomer && !c.isPaused && !c.isLate && !c.isChurn && !c.isRisk) :
    activeFilter === "failed" ? allCustomers.filter((c) => c.isLate) :
    activeFilter === "churn" ? allCustomers.filter((c) => c.isChurn && !c.isPT) :
    allCustomers.filter((c) => c.status === activeFilter)
  ).slice().sort((a, b) => (b.paidUntil || "").localeCompare(a.paidUntil || ""));

  const grupoRows = filtered.filter((c) => !c.isPT);
  const ptRows = activeFilter === "churn" ? [] : filtered.filter((c) => c.isPT);

  const summaryByFilter: Record<ValidFilter, { label: string; count: number; grupo: number; pt: number; revenue: number; grupoRevenue: number; ptRevenue: number }> = {
    all: (() => {
      const rows = allCustomers;
      const grupo = rows.filter((c) => !c.isPT).length;
      const pt = rows.length - grupo;
      const rev = rows.reduce((sum, c) => sum + (planValues?.[c.plan] ?? 0), 0);
      return { label: "TOTAL DE SUBSCRITORES", count: rows.length, grupo, pt, revenue: rev, grupoRevenue: rows.filter((c) => !c.isPT).reduce((s, c) => s + (planValues?.[c.plan] ?? 0), 0), ptRevenue: rev - rows.filter((c) => !c.isPT).reduce((s, c) => s + (planValues?.[c.plan] ?? 0), 0) };
    })(),
    active: (() => {
      const rows = allCustomers.filter((c) => c.isActiveCustomer);
      const grupo = rows.filter((c) => !c.isPT).length;
      const pt = rows.length - grupo;
      const rev = rows.reduce((sum, c) => sum + (planValues?.[c.plan] ?? 0), 0);
      return { label: "SUBSCRITORES ACTIVOS", count: rows.length, grupo, pt, revenue: rev, grupoRevenue: rows.filter((c) => !c.isPT).reduce((s, c) => s + (planValues?.[c.plan] ?? 0), 0), ptRevenue: rev - rows.filter((c) => !c.isPT).reduce((s, c) => s + (planValues?.[c.plan] ?? 0), 0) };
    })(),
    healthy: (() => {
      const rows = allCustomers.filter((c) => c.isActiveCustomer && !c.isPaused && !c.isLate && !c.isChurn && !c.isRisk);
      const grupo = rows.filter((c) => !c.isPT).length;
      const pt = rows.length - grupo;
      const rev = rows.reduce((sum, c) => sum + (planValues?.[c.plan] ?? 0), 0);
      return { label: "SUBSCRITORES SAUDÁVEIS", count: rows.length, grupo, pt, revenue: rev, grupoRevenue: rows.filter((c) => !c.isPT).reduce((s, c) => s + (planValues?.[c.plan] ?? 0), 0), ptRevenue: rev - rows.filter((c) => !c.isPT).reduce((s, c) => s + (planValues?.[c.plan] ?? 0), 0) };
    })(),
    risk: (() => {
      const rows = allCustomers.filter((c) => c.isRisk);
      return { label: "SUBSCRITORES EM RISCO", count: rows.length, grupo: rows.filter((c) => !c.isPT).length, pt: rows.filter((c) => c.isPT).length, revenue: 0, grupoRevenue: 0, ptRevenue: 0 };
    })(),
    paused: (() => {
      const rows = allCustomers.filter((c) => c.isPaused);
      return { label: "SUBSCRITORES PAUSADOS", count: rows.length, grupo: rows.filter((c) => !c.isPT).length, pt: rows.filter((c) => c.isPT).length, revenue: 0, grupoRevenue: 0, ptRevenue: 0 };
    })(),
    failed: (() => {
      const rows = allCustomers.filter((c) => c.isLate);
      return { label: "PAGAMENTOS EM FALHA", count: rows.length, grupo: rows.filter((c) => !c.isPT).length, pt: rows.filter((c) => c.isPT).length, revenue: 0, grupoRevenue: 0, ptRevenue: 0 };
    })(),
    churn: (() => {
      const rows = allCustomers.filter((c) => c.isChurn && !c.isPT);
      return { label: "CHURN", count: rows.length, grupo: rows.length, pt: 0, revenue: 0, grupoRevenue: 0, ptRevenue: 0 };
    })(),
  };
  const summary = summaryByFilter[activeFilter];

  const filters = [
    { id: "all" as const,     label: "Todos",     count: allCustomers.length },
    { id: "active" as const,  label: "Activos",   count: allCustomers.filter((c) => c.isActiveCustomer).length },
    { id: "healthy" as const, label: "Saudáveis", count: allCustomers.filter((c) =>
      c.isActiveCustomer && !c.isPaused && !c.isLate && !c.isChurn && !c.isRisk).length },
    { id: "risk" as const,    label: "Risco",     count: allCustomers.filter((c) => c.isRisk).length },
    { id: "paused" as const,  label: "Pausa",     count: allCustomers.filter((c) => c.isPaused).length },
    { id: "failed" as const,  label: "Falhas",    count: allCustomers.filter((c) => c.isLate).length },
    { id: "churn" as const,   label: "Churn",     count: allCustomers.filter((c) => c.isChurn && !c.isPT).length },
  ];

  return (
    <div style={{ paddingBottom: 32 }}>
      {/* Summary cards */}
      <div style={{ padding: "4px 18px 14px", display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 10 }}>
        <div style={{ background: "#0F0F14", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 14 }}>
          <div className="head" style={{ fontSize: 10, color: "rgba(255,255,255,0.72)", marginBottom: 6 }}>{summary.label}</div>
          <div className="num" style={{ fontSize: 38, color: "#fff" }}>{summary.count}</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            {summary.grupo} grupo · {summary.pt} PT
          </div>
        </div>
        <div style={{ background: "#0F0F14", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 14 }}>
          <div className="head" style={{ fontSize: 10, color: "rgba(255,255,255,0.72)", marginBottom: 6 }}>MRR ESTIMADO</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="num" style={{ fontSize: 38, color: "#00E5A0" }}>{eur(summary.revenue)}</div>
            {loadingPricing ? <Pill color="amber">A carregar preços...</Pill> : null}
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            {eur(summary.grupoRevenue)} grupo · {eur(summary.ptRevenue)} PT
          </div>
        </div>
      </div>

      {/* Filter chips */}
      <div style={{ padding: "0 18px 10px", display: "flex", gap: 6, overflowX: "auto" }} className="scrollbox">
        {filters.map((f) => {
          const isActive = activeFilter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => {
                setActiveFilter(f.id);
                const params = new URLSearchParams(searchParams.toString());
                if (f.id === "active") params.delete("filter");
                else params.set("filter", f.id);
                router.replace(`/dashboard/subscribers?${params.toString()}`, { scroll: false });
              }}
              style={{
                flexShrink: 0, padding: "7px 12px", borderRadius: 999,
                background: isActive ? "#00E5A0" : "#0F0F14",
                color: isActive ? "#0a0a0a" : "rgba(255,255,255,0.72)",
                border: `1px solid ${isActive ? "#00E5A0" : "rgba(255,255,255,0.06)"}`,
                fontSize: 11, fontWeight: 700, letterSpacing: "0.02em",
                cursor: "pointer", fontFamily: "inherit",
                display: "inline-flex", alignItems: "center", gap: 5,
              }}
              className="tap"
            >
              {f.label}
              <span style={{ fontSize: 10, opacity: 0.7 }}>{f.count}</span>
            </button>
          );
        })}
      </div>

      {/* Aulas em grupo */}
      {grupoRows.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ padding: "4px 18px 6px", display: "flex", alignItems: "baseline", gap: 8 }}>
            <h3 className="head" style={{ margin: 0, fontSize: 14, color: "#fff", fontWeight: 700, letterSpacing: "0.02em" }}>
              Aulas em grupo
            </h3>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>{grupoRows.length}</span>
          </div>
          <div style={{ padding: "0 18px", display: "flex", flexDirection: "column", gap: 6 }}>
            {grupoRows.map((c) => (
              <SubRow
                key={c.id}
                name={`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Sem nome"}
                plan={c.plan}
                detail={c.isLate || c.isChurn ? `venceu há ${c.daysOverdue} dias` : c.paidUntil ? `até ${c.paidUntil}` : "—"}
                status={c.status}
                daysUntilRenewal={c.isLate || c.isChurn ? c.daysOverdue : c.daysLeft}
                badges={c.badges.length > 0 ? c.badges : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {/* Personal Trainer */}
      {ptRows.length > 0 && (
        <div>
          <div style={{ padding: "4px 18px 6px", display: "flex", alignItems: "baseline", gap: 8 }}>
            <h3 className="head" style={{ margin: 0, fontSize: 14, color: "#fff", fontWeight: 700, letterSpacing: "0.02em" }}>
              Personal Trainer
            </h3>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>{ptRows.length}</span>
          </div>
          <div style={{ padding: "0 18px", display: "flex", flexDirection: "column", gap: 6 }}>
            {ptRows.map((c) => (
              <SubRow
                key={c.id}
                name={`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Sem nome"}
                plan={c.plan}
                detail={c.isLate || c.isChurn ? `venceu há ${c.daysOverdue} dias` : c.paidUntil ? `até ${c.paidUntil}` : "—"}
                status={c.status}
                daysUntilRenewal={c.isLate || c.isChurn ? c.daysOverdue : c.daysLeft}
                badges={c.badges.length > 0 ? c.badges : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {grupoRows.length === 0 && ptRows.length === 0 && (
        <div style={{ padding: "20px 18px", fontSize: 13, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>
          Nenhum subscritor nesta categoria.
        </div>
      )}
    </div>
  );
}
