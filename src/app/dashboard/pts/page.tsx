"use client";

import { useEffect, useCallback, useState } from "react";
import { useYogoFetch } from "@/hooks/use-yogo";
import { useDashboard } from "@/app/dashboard/layout";
import { StatCard } from "@/components/stat-card";
import { PaymentBadge } from "@/components/payment-badge";
import { LoaderIcon, UsersIcon, EuroIcon } from "@/components/icons";
import { getPlan, isPTPlan, planColor, eur } from "@/lib/utils";
import { ALL_SUB_IDS, PLAN_ORDER } from "@/lib/constants";
import { Pill } from "@/components/pill";
import type { ColorName } from "@/lib/constants";

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
}

interface PlanGroup {
  plan: string;
  customers: (Customer & { paid_until?: string })[];
}

export default function PTsPage() {
  const { refreshKey, setLastFetch } = useDashboard();
  const { fetchReport } = useYogoFetch();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [planGroups, setPlanGroups] = useState<PlanGroup[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalPTs, setTotalPTs] = useState(0);
  const [planValues, setPlanValues] = useState<Record<string, number> | null>(null);
  const [loadingPricing, setLoadingPricing] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
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

      // paid_until lookup
      const paidUntilByUser: Record<number, string> = {};
      for (const m of memberships) {
        if (m.user_id && m.paid_until) {
          const existing = paidUntilByUser[m.user_id];
          if (!existing || m.paid_until > existing) {
            paidUntilByUser[m.user_id] = m.paid_until;
          }
        }
      }

      // Filter to PT plans only
      const ptCustomers = customers
        .filter((c) => isPTPlan(getPlan(c.has_membership_membership_description)))
        .map((c) => ({ ...c, paid_until: paidUntilByUser[c.id] }));

      // Group by plan
      const grouped: Record<string, (Customer & { paid_until?: string })[]> = {};
      for (const c of ptCustomers) {
        const plan = getPlan(c.has_membership_membership_description);
        if (!grouped[plan]) grouped[plan] = [];
        grouped[plan].push(c);
      }

      const ordered = PLAN_ORDER
        .filter((p) => isPTPlan(p) && grouped[p])
        .map((p) => ({ plan: p, customers: grouped[p] }));

      const rev = ordered.reduce((sum, g) => sum + g.customers.length * (planValues?.[g.plan] ?? 0), 0);

      setPlanGroups(ordered);
      setTotalRevenue(rev);
      setTotalPTs(ptCustomers.length);
      setLastFetch(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [fetchReport, setLastFetch]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

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

  // Sort all PT customers by paid_until for "próximos pagamentos"
  const allPTsSorted = planGroups
    .flatMap((g) => g.customers)
    .filter((c) => c.paid_until)
    .sort((a, b) => (a.paid_until || "").localeCompare(b.paid_until || ""))
    .slice(0, 10);

  return (
    <div className="space-y-8">
      <h1 className="head text-xl font-bold">PTs do Marcelo (<span className="num">{totalPTs}</span>)</h1>

      {loadingPricing ? (
        <Pill color="amber">A carregar preços...</Pill>
      ) : null}

      <div className="grid grid-cols-2 gap-4">
        <StatCard icon={<UsersIcon />} label="Total clientes PT" value={totalPTs} color="cyan" />
        <StatCard icon={<EuroIcon />} label="Receita estimada / mês" value={eur(totalRevenue)} color="emerald" />
      </div>

      {allPTsSorted.length > 0 && (
        <div className="bg-tone-mint/8 border border-tone-mint/20 rounded-xl p-5">
          <h2 className="head text-sm font-semibold text-tone-mint uppercase tracking-wide mb-3">Próximos pagamentos</h2>
          <div className="space-y-2">
            {allPTsSorted.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2 border-b border-border-subtle last:border-0">
                <div>
                  <div className="text-sm font-medium text-white">{[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}</div>
                  <div className="text-xs text-muted flex items-center gap-2"><Pill color={planColor(getPlan(c.has_membership_membership_description)) as ColorName}>{getPlan(c.has_membership_membership_description)}</Pill>{c.phone && <span>{c.phone}</span>}</div>
                </div>
                <PaymentBadge paidUntil={c.paid_until} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-6">
        {planGroups.map(({ plan, customers }) => (
          <div key={plan} className="bg-surface rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <Pill color={planColor(plan) as ColorName}>{plan}</Pill>
              <span className="text-muted-strong text-sm"><span className="num">{customers.length}</span> cliente{customers.length !== 1 ? "s" : ""} · {eur(customers.length * (planValues?.[plan] ?? 0))}/mês</span>
            </div>
            <div className="space-y-2">
              {[...customers]
                .sort((a, b) => (b.paid_until || "").localeCompare(a.paid_until || ""))
                .map((c) => (
                <div key={c.id} className="flex items-center justify-between py-2 border-b border-border-subtle last:border-0">
                  <div>
                    <div className="text-sm font-medium text-white">{[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}</div>
                    <div className="text-xs text-muted">{c.email || "—"}{c.phone ? ` · ${c.phone}` : ""}</div>
                  </div>
                  <PaymentBadge paidUntil={c.paid_until} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
