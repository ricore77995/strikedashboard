"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface ReferralRow {
  id: string;
  inviterCustomerId: number;
  inviterPhone: string;
  inviterEmail: string | null;
  referredCustomerId: number;
  referredPhone: string;
  referredEmail: string | null;
  referralCodeUsed: string;
  status: string;
  linkedAt: string;
  trialCreditedAt: string | null;
  phase1CreditedAt: string | null;
  phase2CreditedAt: string | null;
  createdAt: string;
}

type StatusFilter = "all" | "pending" | "trial_credited" | "phase1_credited" | "phase2_credited";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendente", color: "bg-amber-500/20 text-amber-400" },
  trial_credited: { label: "Trial", color: "bg-blue-500/20 text-blue-400" },
  phase1_credited: { label: "Subscrição", color: "bg-emerald-500/20 text-emerald-400" },
  phase2_credited: { label: "Retenção", color: "bg-yellow-500/20 text-yellow-400" },
};

export default function ReferralsPage() {
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [total, setTotal] = useState(0);

  const fetchReferrals = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/strikelab/admin/referrals?${params}`);
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setReferrals(data.referrals);
      setTotal(data.total);
    } catch {
      setReferrals([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchReferrals(); }, [fetchReferrals]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Indicações</h1>
          <p className="text-zinc-500 text-sm mt-1">{total} referral{total !== 1 ? "s" : ""}</p>
        </div>
        <Link
          href="/dashboard/strikelab"
          className="text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
        >
          ← StrikeLab
        </Link>
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(["all", "pending", "trial_credited", "phase1_credited", "phase2_credited"] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
              statusFilter === s
                ? "bg-purple-500/20 text-purple-300"
                : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {s === "all" ? "Todas" : STATUS_CONFIG[s]?.label ?? s}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-zinc-600 text-sm text-center py-8">A carregar...</p>
      ) : referrals.length === 0 ? (
        <p className="text-zinc-600 text-sm text-center py-8">Sem indicações registadas.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-500 text-[11px] uppercase tracking-wider border-b border-zinc-800">
                <th className="text-left py-2 px-2">Indicador</th>
                <th className="text-left py-2 px-2">Referido</th>
                <th className="text-left py-2 px-2">Código</th>
                <th className="text-left py-2 px-2">Estado</th>
                <th className="text-left py-2 px-2">Link</th>
                <th className="text-left py-2 px-2">Trial</th>
                <th className="text-left py-2 px-2">P1</th>
                <th className="text-left py-2 px-2">P2</th>
              </tr>
            </thead>
            <tbody>
              {referrals.map((r) => {
                const cfg = STATUS_CONFIG[r.status] ?? { label: r.status, color: "bg-zinc-800 text-zinc-400" };
                return (
                  <tr key={r.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/50">
                    <td className="py-2 px-2">
                      <Link href={`/dashboard/strikelab/${r.inviterCustomerId}`} className="text-blue-400 hover:underline">
                        {r.inviterCustomerId}
                      </Link>
                      <div className="text-[10px] text-zinc-600">{r.inviterPhone}</div>
                    </td>
                    <td className="py-2 px-2">
                      <Link href={`/dashboard/strikelab/${r.referredCustomerId}`} className="text-blue-400 hover:underline">
                        {r.referredCustomerId}
                      </Link>
                      <div className="text-[10px] text-zinc-600">{r.referredPhone}</div>
                    </td>
                    <td className="py-2 px-2 font-mono text-purple-400 text-xs">{r.referralCodeUsed}</td>
                    <td className="py-2 px-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                    </td>
                    <td className="py-2 px-2 text-[10px] text-zinc-600">{formatDate(r.linkedAt)}</td>
                    <td className="py-2 px-2 text-[10px] text-zinc-600">{r.trialCreditedAt ? formatDate(r.trialCreditedAt) : "—"}</td>
                    <td className="py-2 px-2 text-[10px] text-zinc-600">{r.phase1CreditedAt ? formatDate(r.phase1CreditedAt) : "—"}</td>
                    <td className="py-2 px-2 text-[10px] text-zinc-600">{r.phase2CreditedAt ? formatDate(r.phase2CreditedAt) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
}
