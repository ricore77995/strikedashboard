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

const CONDITION_LABELS: Record<string, string> = {
  active_months: "Meses activos",
  xp_tier: "Tier XP",
};

const REWARD_LABELS: Record<string, (v: number) => string> = {
  free_month: () => "1 mês grátis",
  fixed_amount: (v) => `€${(v / 100).toFixed(2)} desconto`,
};

export default function LoyaltyLevelsPage() {
  const [levels, setLevels] = useState<LoyaltyLevel[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    conditionType: "active_months",
    conditionValue: "6",
    rewardType: "free_month",
    rewardValue: 0,
    frequency: "once",
  });

  async function load() {
    const res = await fetch("/api/strikelab/admin/loyalty/levels");
    if (res.ok) {
      const data = await res.json();
      setLevels(data.levels);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/strikelab/admin/loyalty/levels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setShowForm(false);
      setForm({ name: "", description: "", conditionType: "active_months", conditionValue: "6", rewardType: "free_month", rewardValue: 0, frequency: "once" });
      load();
    } else {
      const data = await res.json();
      alert(data.error || "Erro ao criar nível");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Níveis de Fidelidade</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-black text-sm font-medium rounded"
        >
          {showForm ? "Cancelar" : "+ Novo Nível"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="Nome (ex: Fidelidade 6 Meses)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="col-span-2 px-3 py-2 bg-black border border-zinc-800 rounded text-white text-sm"
              required
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
            Criar Nível
          </button>
        </form>
      )}

      {levels.length === 0 ? (
        <p className="text-zinc-500 text-sm">Nenhum nível de fidelidade definido.</p>
      ) : (
        <div className="space-y-2">
          {levels.map((level) => (
            <div key={level.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium">{level.name}</span>
                  {!level.active && <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">inactivo</span>}
                </div>
                <div className="text-zinc-400 text-sm mt-1">
                  Condição: {CONDITION_LABELS[level.conditionType] || level.conditionType} = {level.conditionValue}
                  {" · "}
                  Prémio: {REWARD_LABELS[level.rewardType]?.(level.rewardValue) || level.rewardType}
                  {" · "}
                  Frequência: {level.frequency === "once" ? "uma vez" : "anual"}
                </div>
              </div>
              <div className="text-zinc-500 text-sm">{level._count.grants} grants</div>
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
