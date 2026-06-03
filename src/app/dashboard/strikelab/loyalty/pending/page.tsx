"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface LoyaltyLevel {
  id: number;
  name: string;
  conditionType: string;
  conditionValue: string;
  rewardType: string;
  rewardValue: number;
  frequency: string;
}

interface Grant {
  id: number;
  yogoCustomerId: number;
  status: string;
  qualifyingValue: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  appliedAt: string | null;
  yogoDiscountCodeName: string | null;
  createdAt: string;
  loyaltyLevel: LoyaltyLevel;
}

const STATUS_COLORS: Record<string, string> = {
  pending_approval: "bg-amber-500/20 text-amber-400",
  approved: "bg-blue-500/20 text-blue-400",
  applied: "bg-emerald-500/20 text-emerald-400",
  rejected: "bg-red-500/20 text-red-400",
  expired: "bg-zinc-500/20 text-zinc-400",
};

const STATUS_LABELS: Record<string, string> = {
  pending_approval: "Pendente",
  approved: "Aprovado",
  applied: "Aplicado",
  rejected: "Rejeitado",
  expired: "Expirado",
};

const REWARD_LABELS: Record<string, (v: number) => string> = {
  free_month: () => "1 mês grátis",
  fixed_amount: (v) => `€${(v / 100).toFixed(2)} desconto`,
};

export default function LoyaltyPendingPage() {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [filter, setFilter] = useState("pending_approval");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/strikelab/admin/loyalty/grants?status=${filter}`);
    if (res.ok) {
      const data = await res.json();
      setGrants(data.grants);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [filter]);

  async function approve(id: number) {
    if (!confirm("Confirmar aprovação? Isto vai criar um código de desconto no Yogo e aplicá-lo à próxima renovação do aluno.")) return;
    const res = await fetch(`/api/strikelab/admin/loyalty/grants/${id}/approve`, { method: "POST" });
    if (res.ok) {
      load();
    } else {
      const data = await res.json();
      alert(data.error || "Erro ao aprovar");
    }
  }

  async function reject(id: number) {
    if (!confirm("Rejeitar este prémio?")) return;
    const res = await fetch(`/api/strikelab/admin/loyalty/grants/${id}/reject`, { method: "POST" });
    if (res.ok) {
      load();
    } else {
      const data = await res.json();
      alert(data.error || "Erro ao rejeitar");
    }
  }

  const filters = ["pending_approval", "applied", "rejected", "expired"];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/strikelab/loyalty" className="text-zinc-400 text-sm hover:text-white">← Níveis</Link>
        <h2 className="text-lg font-bold text-white">Fila de Aprovação</h2>
      </div>

      <div className="flex gap-2">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs font-medium rounded ${filter === f ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400 hover:text-zinc-300"}`}
          >
            {STATUS_LABELS[f]} ({f === filter && !loading ? grants.length : "…"})
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-zinc-500 text-sm">A carregar...</p>
      ) : grants.length === 0 ? (
        <p className="text-zinc-500 text-sm">Nenhum grant com estado &quot;{STATUS_LABELS[filter]}&quot;.</p>
      ) : (
        <div className="space-y-2">
          {grants.map((grant) => (
            <div key={grant.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">Customer #{grant.yogoCustomerId}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[grant.status] || "bg-zinc-800 text-zinc-400"}`}>
                      {STATUS_LABELS[grant.status] || grant.status}
                    </span>
                  </div>
                  <div className="text-zinc-400 text-sm mt-1">
                    Nível: <span className="text-white">{grant.loyaltyLevel.name}</span>
                    {" · "}
                    Prémio: {REWARD_LABELS[grant.loyaltyLevel.rewardType]?.(grant.loyaltyLevel.rewardValue)}
                  </div>
                  {grant.qualifyingValue && (
                    <div className="text-zinc-500 text-xs mt-1">Condição: {grant.qualifyingValue}</div>
                  )}
                  {grant.yogoDiscountCodeName && (
                    <div className="text-emerald-400 text-xs mt-1">Código Yogo: {grant.yogoDiscountCodeName}</div>
                  )}
                  <div className="text-zinc-600 text-xs mt-1">
                    Criado: {new Date(grant.createdAt).toLocaleString("pt-PT")}
                    {grant.appliedAt && ` · Aplicado: ${new Date(grant.appliedAt).toLocaleString("pt-PT")}`}
                  </div>
                </div>
                {grant.status === "pending_approval" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => approve(grant.id)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-black text-xs font-medium rounded"
                    >
                      Aprovar
                    </button>
                    <button
                      onClick={() => reject(grant.id)}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded"
                    >
                      Rejeitar
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
