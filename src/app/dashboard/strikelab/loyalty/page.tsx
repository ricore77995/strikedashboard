"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface LoyaltyLevel {
  id: number;
  name: string;
  description: string | null;
  active: boolean;
  conditionType: string;
  conditionValue: string;
  rewardType: string;
  rewardValue: number;
  frequency: string;
  _count: { grants: number };
}

interface LoyaltySummary {
  totalApplied: number;
  pendingCount: number;
  totalCostCents: number;
  monthly: Record<string, { count: number; costCents: number }>;
  recent: Array<{
    id: number;
    yogoCustomerId: number;
    levelName: string;
    rewardType: string;
    rewardValue: number;
    appliedAt: string | null;
    discountCode: string | null;
  }>;
}

const CONDITION_LABELS: Record<string, string> = {
  active_months: "Meses activos",
  xp_tier: "Tier XP",
};

const REWARD_LABELS: Record<string, (v: number) => string> = {
  free_month: () => "1 mês grátis",
  fixed_amount: (v) => `€${(v / 100).toFixed(2)} desconto`,
};

type FormData = {
  name: string;
  description: string;
  conditionType: string;
  conditionValue: string;
  rewardType: string;
  rewardValue: number;
  frequency: string;
};

const EMPTY_FORM: FormData = {
  name: "",
  description: "",
  conditionType: "active_months",
  conditionValue: "6",
  rewardType: "free_month",
  rewardValue: 0,
  frequency: "once",
};

function LevelForm({ initial, onSubmit, submitLabel }: {
  initial: FormData;
  onSubmit: (data: FormData) => Promise<void>;
  submitLabel: string;
}) {
  const [form, setForm] = useState<FormData>(initial);

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}
      className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <input
          placeholder="Nome (ex: Fidelidade 6 Meses)"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="col-span-2 px-3 py-2 bg-black border border-zinc-800 rounded text-white text-sm"
          required
        />
        <input
          placeholder="Descrição (opcional)"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="col-span-2 px-3 py-2 bg-black border border-zinc-800 rounded text-white text-sm"
        />
        <select
          value={form.conditionType}
          onChange={(e) => setForm({ ...form, conditionType: e.target.value })}
          className="px-3 py-2 bg-black border border-zinc-800 rounded text-white text-sm"
        >
          <option value="active_months">Meses activos</option>
          <option value="xp_tier">Tier XP</option>
        </select>
        <input
          placeholder={form.conditionType === "active_months" ? "Meses (ex: 6)" : "Tier (ex: diamante)"}
          value={form.conditionValue}
          onChange={(e) => setForm({ ...form, conditionValue: e.target.value })}
          className="px-3 py-2 bg-black border border-zinc-800 rounded text-white text-sm"
          required
        />
        <select
          value={form.rewardType}
          onChange={(e) => setForm({ ...form, rewardType: e.target.value, rewardValue: e.target.value === "free_month" ? 0 : form.rewardValue })}
          className="px-3 py-2 bg-black border border-zinc-800 rounded text-white text-sm"
        >
          <option value="free_month">1 mês grátis</option>
          <option value="fixed_amount">Desconto fixo (€)</option>
        </select>
        {form.rewardType === "fixed_amount" && (
          <input
            type="number"
            placeholder="Valor em cêntimos (ex: 1500 = €15.00)"
            value={form.rewardValue || ""}
            onChange={(e) => setForm({ ...form, rewardValue: parseInt(e.target.value) || 0 })}
            className="px-3 py-2 bg-black border border-zinc-800 rounded text-white text-sm"
          />
        )}
        <select
          value={form.frequency}
          onChange={(e) => setForm({ ...form, frequency: e.target.value })}
          className="px-3 py-2 bg-black border border-zinc-800 rounded text-white text-sm"
        >
          <option value="once">Uma vez (lifetime)</option>
          <option value="yearly">Anual</option>
        </select>
      </div>
      <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-black text-sm font-medium rounded">
        {submitLabel}
      </button>
    </form>
  );
}

export default function LoyaltyLevelsPage() {
  const [levels, setLevels] = useState<LoyaltyLevel[]>([]);
  const [summary, setSummary] = useState<LoyaltySummary | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  async function load() {
    const [levelsRes, summaryRes] = await Promise.all([
      fetch("/api/strikelab/admin/loyalty/levels"),
      fetch("/api/strikelab/admin/loyalty/summary"),
    ]);
    if (levelsRes.ok) {
      const data = await levelsRes.json();
      setLevels(data.levels);
    }
    if (summaryRes.ok) {
      const data = await summaryRes.json();
      setSummary(data);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(data: FormData) {
    const res = await fetch("/api/strikelab/admin/loyalty/levels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setShowForm(false);
      load();
    } else {
      const d = await res.json();
      alert(d.error || "Erro ao criar nível");
    }
  }

  async function handleUpdate(id: number, data: FormData) {
    const res = await fetch(`/api/strikelab/admin/loyalty/levels/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setEditingId(null);
      load();
    } else {
      const d = await res.json();
      alert(d.error || "Erro ao actualizar nível");
    }
  }

  async function toggleActive(level: LoyaltyLevel) {
    const res = await fetch(`/api/strikelab/admin/loyalty/levels/${level.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !level.active }),
    });
    if (res.ok) {
      load();
    } else {
      const d = await res.json();
      alert(d.error || "Erro ao alterar estado");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Níveis de Fidelidade</h2>
        <button
          onClick={() => { setShowForm(!showForm); setEditingId(null); }}
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-black text-sm font-medium rounded"
        >
          {showForm ? "Cancelar" : "+ Novo Nível"}
        </button>
      </div>

      {showForm && (
        <LevelForm initial={EMPTY_FORM} onSubmit={handleCreate} submitLabel="Criar Nível" />
      )}

      {/* Summary dashboard */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
            <div className="text-zinc-500 text-xs">Total aplicados</div>
            <div className="text-white text-xl font-bold">{summary.totalApplied}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
            <div className="text-zinc-500 text-xs">Pendentes</div>
            <div className="text-amber-400 text-xl font-bold">{summary.pendingCount}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
            <div className="text-zinc-500 text-xs">Custo descontos</div>
            <div className="text-emerald-400 text-xl font-bold">
              {summary.totalCostCents > 0 ? `€${(summary.totalCostCents / 100).toFixed(2)}` : "—"}
            </div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
            <div className="text-zinc-500 text-xs">Meses com actividade</div>
            <div className="text-blue-400 text-xl font-bold">{Object.keys(summary.monthly).length}</div>
          </div>
        </div>
      )}

      {/* Recent applied grants */}
      {summary && summary.recent.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-zinc-400">Últimos prémios aplicados</h3>
          <div className="space-y-1">
            {summary.recent.slice(0, 5).map((g) => (
              <div key={g.id} className="flex items-center justify-between bg-zinc-900/50 border border-zinc-800/50 rounded px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-white">#{g.yogoCustomerId}</span>
                  <span className="text-zinc-500">·</span>
                  <span className="text-zinc-400">{g.levelName}</span>
                  <span className="text-zinc-600 text-xs">
                    {g.appliedAt ? new Date(g.appliedAt).toLocaleDateString("pt-PT") : ""}
                  </span>
                </div>
                <span className="text-emerald-400 text-xs">
                  {g.rewardType === "free_month" ? "1 mês grátis" : `€${(g.rewardValue / 100).toFixed(2)}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {levels.length === 0 ? (
        <p className="text-zinc-500 text-sm">Nenhum nível de fidelidade definido.</p>
      ) : (
        <div className="space-y-2">
          {levels.map((level) => (
            <div key={level.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              {editingId === level.id ? (
                <LevelForm
                  initial={{
                    name: level.name,
                    description: level.description ?? "",
                    conditionType: level.conditionType,
                    conditionValue: level.conditionValue,
                    rewardType: level.rewardType,
                    rewardValue: level.rewardValue,
                    frequency: level.frequency,
                  }}
                  onSubmit={(data) => handleUpdate(level.id, data)}
                  submitLabel="Guardar Alterações"
                />
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{level.name}</span>
                      {!level.active && (
                        <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">inactivo</span>
                      )}
                    </div>
                    <div className="text-zinc-400 text-sm mt-1">
                      Condição: {CONDITION_LABELS[level.conditionType] || level.conditionType} = {level.conditionValue}
                      {" · "}
                      Prémio: {REWARD_LABELS[level.rewardType]?.(level.rewardValue) || level.rewardType}
                      {" · "}
                      Frequência: {level.frequency === "once" ? "uma vez" : "anual"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500 text-sm">{level._count.grants} grants</span>
                    <button
                      onClick={() => toggleActive(level)}
                      className={`px-2.5 py-1 text-xs font-medium rounded ${
                        level.active
                          ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                          : "bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30"
                      }`}
                    >
                      {level.active ? "Desactivar" : "Activar"}
                    </button>
                    <button
                      onClick={() => { setEditingId(level.id); setShowForm(false); }}
                      className="px-2.5 py-1 bg-zinc-800 text-zinc-400 hover:bg-zinc-700 text-xs font-medium rounded"
                    >
                      Editar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Link href="/dashboard/strikelab/loyalty/pending" className="text-emerald-400 text-sm hover:underline block">
        → Ver fila de aprovação
      </Link>
    </div>
  );
}
