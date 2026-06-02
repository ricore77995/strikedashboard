"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { StrikeLabStats } from "./strikelab-stats";

interface Student {
  customerId: number;
  phoneE164: string | null;
  email: string | null;
  instagramHandle: string | null;
  optedIn: boolean;
  birthYear: number | null;
  state: { monthlyPoints: number; lifetimeXp: number; currentTier: string; currentStreakDays: number } | null;
}

interface Stats {
  optedIn: number;
  totalPointsThisMonth: number;
  activeThisWeek: number;
  challenge: {
    key: string;
    name: string;
    status: string;
    windowStart: string;
    windowEnd: string;
  } | null;
}

interface ApiResponse {
  students: Student[];
  total: number;
  page: number;
  pages: number;
  stats: Stats;
}

export default function StrikeLabStudentsPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const q = search ? `&search=${encodeURIComponent(search)}` : "";
      const res = await fetch(`/api/strikelab/admin?page=1${q}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  const tierColor = (t: string) => {
    switch (t) {
      case "diamond": return "text-cyan-400";
      case "platinum": return "text-zinc-300";
      case "gold": return "text-amber-400";
      case "silver": return "text-zinc-400";
      default: return "text-amber-700";
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-white">StrikeLab</h1>
        <span className="text-xs text-zinc-500">{data?.total ?? 0} alunos</span>
      </div>

      {/* Stats overview */}
      {data?.stats && <StrikeLabStats stats={data.stats} />}

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Pesquisar telefone, email ou ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50"
        />
      </div>

      {/* List */}
      {loading ? (
        <p className="text-zinc-500 text-sm text-center py-8">A carregar...</p>
      ) : !data?.students.length ? (
        <p className="text-zinc-500 text-sm text-center py-8">
          {search ? "Nenhum resultado." : "Nenhum aluno inscrito ainda."}
        </p>
      ) : (
        <div className="space-y-2">
          {data.students.map((s) => (
            <Link
              key={s.customerId}
              href={`/dashboard/strikelab/${s.customerId}`}
              className="block bg-zinc-900 border border-zinc-800 rounded-lg p-3 hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-white text-sm font-medium">#{s.customerId}</span>
                  {s.email && <span className="text-zinc-500 text-xs ml-2">{s.email}</span>}
                  {s.instagramHandle && <span className="text-purple-400 text-xs ml-2">{s.instagramHandle}</span>}
                </div>
                <div className="flex items-center gap-2">
                  {s.optedIn ? (
                    <span className="text-xs text-emerald-400">✓ activo</span>
                  ) : (
                    <span className="text-xs text-zinc-600">opt-out</span>
                  )}
                  {s.state && (
                    <span className={`text-xs font-medium ${tierColor(s.state.currentTier)}`}>
                      {s.state.currentTier}
                    </span>
                  )}
                </div>
              </div>
              {s.state && (
                <div className="flex gap-4 mt-1">
                  <span className="text-zinc-500 text-xs">{s.state.monthlyPoints} pts</span>
                  <span className="text-zinc-500 text-xs">{s.state.lifetimeXp} XP</span>
                  <span className="text-zinc-500 text-xs">{s.state.currentStreakDays}d streak</span>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
