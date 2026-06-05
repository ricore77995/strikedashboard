"use client";

import { useEffect, useCallback, useState } from "react";
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
  membership_type_name?: string;
  paid_until?: string;
  status?: string;
  status_text?: string;
  next_payment?: { date?: string; amount?: number } | null;
}

interface EnrichedCustomer extends Customer {
  paidUntil: string;
  nextPaymentDate?: string;
  statusText?: string;
  plan: string;
  daysLeft: number;
  status: SubStatus;
  isPT: boolean;
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

export default function SubscribersPage() {
  const { refreshKey, setLastFetch } = useDashboard();
  const { fetchReport } = useYogoFetch();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allCustomers, setAllCustomers] = useState<EnrichedCustomer[]>([]);
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "risk" | "failed" | "paused">("all");
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

      const mbsByUser: Record<number, Membership[]> = {};
      for (const m of memberships) {
        if (!m.user_id) continue;
        if (!mbsByUser[m.user_id]) mbsByUser[m.user_id] = [];
        mbsByUser[m.user_id].push(m);
      }

      const enriched: EnrichedCustomer[] = customers.map((c) => {
        const best = pickBestMembership(mbsByUser[c.id] ?? []);
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
        let status: SubStatus = "active";
        if (isPaused) status = "paused";
        else if (!paidUntil || paidUntil < today) status = "expired";
        else if (daysLeft <= 7 && !willAutoRenew) status = "risk";
        return {
          ...c,
          paidUntil,
          nextPaymentDate,
          statusText,
          plan,
          daysLeft,
          status,
          isPT: isPTPlan(plan),
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
    activeFilter === "failed" ? allCustomers.filter((c) => c.status === "failed" || c.status === "expired") :
    allCustomers.filter((c) => c.status === activeFilter)
  ).slice().sort((a, b) => (b.paidUntil || "").localeCompare(a.paidUntil || ""));

  const grupoRows = filtered.filter((c) => !c.isPT);
  const ptRows = filtered.filter((c) => c.isPT);

  const totalCount = allCustomers.length;
  const grupoCount = allCustomers.filter((c) => !c.isPT).length;
  const ptCount = totalCount - grupoCount;
  const totalRevenue = allCustomers.reduce((sum, c) => sum + (planValues?.[c.plan] ?? 0), 0);
  const grupoRevenue = allCustomers.filter((c) => !c.isPT).reduce((s, c) => s + (planValues?.[c.plan] ?? 0), 0);
  const ptRevenue = totalRevenue - grupoRevenue;

  const filters = [
    { id: "all" as const,    label: "Todos",   count: allCustomers.length },
    { id: "active" as const, label: "Activos", count: allCustomers.filter((c) => c.status === "active").length },
    { id: "risk" as const,   label: "Risco",   count: allCustomers.filter((c) => c.status === "risk").length },
    { id: "paused" as const, label: "Pausa",   count: allCustomers.filter((c) => c.status === "paused").length },
    { id: "failed" as const, label: "Falhas",  count: allCustomers.filter((c) => c.status === "failed" || c.status === "expired").length },
  ];

  return (
    <div style={{ paddingBottom: 32 }}>
      {/* Summary cards */}
      <div style={{ padding: "4px 18px 14px", display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 10 }}>
        <div style={{ background: "#0F0F14", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 14 }}>
          <div className="head" style={{ fontSize: 10, color: "rgba(255,255,255,0.72)", marginBottom: 6 }}>SUBSCRITORES</div>
          <div className="num" style={{ fontSize: 38, color: "#fff" }}>{totalCount}</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            {grupoCount} grupo · {ptCount} PT
          </div>
        </div>
        <div style={{ background: "#0F0F14", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 14 }}>
          <div className="head" style={{ fontSize: 10, color: "rgba(255,255,255,0.72)", marginBottom: 6 }}>MRR ESTIMADO</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="num" style={{ fontSize: 38, color: "#00E5A0" }}>{eur(totalRevenue)}</div>
            {loadingPricing ? <Pill color="amber">A carregar preços...</Pill> : null}
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            {eur(grupoRevenue)} grupo · {eur(ptRevenue)} PT
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
              onClick={() => setActiveFilter(f.id)}
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
                detail={c.paidUntil ? `até ${c.paidUntil}` : "—"}
                status={c.status}
                daysUntilRenewal={c.daysLeft}
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
                detail={c.paidUntil ? `até ${c.paidUntil}` : "—"}
                status={c.status}
                daysUntilRenewal={c.daysLeft}
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
