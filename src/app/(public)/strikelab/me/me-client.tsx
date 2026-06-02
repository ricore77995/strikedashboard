"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { tierLabel, eventLabel, boostLabel } from "@/lib/gamification/labels";
import { Leaderboard, type LeaderboardEntry } from "./leaderboard";

interface MeData {
  customerId: number;
  leaderboard: LeaderboardEntry[];
  challenge: {
    name: string;
    points: number;
    status: string;
    windowStart: string;
    windowEnd: string;
    won: boolean;
  } | null;
  state: {
    monthlyPoints: number;
    lifetimeXp: number;
    currentTier: string;
    currentStreakDays: number;
    streakShieldAvailable: boolean;
    lastClassAt: string | null;
    tierProgress: { current: string; next: string | null; xpToNext: number; progress: number };
  };
  events: Array<{
    id: string;
    eventType: string;
    pointsDelta: number;
    xpDelta: number;
    createdAt: string;
    className: string | null;
    boostsApplied: string[];
  }>;
}

/** Map an HTTP status to a friendly pt-PT message for the student. */
function errorMessage(status: number): string {
  switch (status) {
    case 401:
      return "Este link já não é válido. Pede um novo à equipa da Striker's House.";
    case 404:
      return "Ainda não tens um perfil StrikeLab. Fala com a recepção.";
    case 410:
      return "Este perfil foi removido.";
    case 503:
      return "O StrikeLab está a ser configurado. Tenta mais tarde.";
    default:
      return "Algo correu mal. Tenta novamente mais tarde.";
  }
}

export function MeClient() {
  const token = useSearchParams().get("t");
  const [data, setData] = useState<MeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setError("Link em falta. Abre o link que recebeste no WhatsApp.");
      setLoading(false);
      return;
    }
    fetch(`/api/strikelab/me?t=${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (r.ok) return (await r.json()) as MeData;
        throw new Error(String(r.status));
      })
      .then(setData)
      .catch((e: Error) => setError(errorMessage(Number(e.message))))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return <p className="text-zinc-500 text-sm text-center py-16">A carregar...</p>;
  }
  if (error || !data) {
    return (
      <div className="text-center py-16 px-6">
        <p className="text-4xl mb-3">🥊</p>
        <p className="text-zinc-400 text-sm">{error}</p>
      </div>
    );
  }

  const { state, events } = data;
  const tier = tierLabel(state.currentTier);
  const tp = state.tierProgress;

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <h1 className="text-zinc-500 text-xs tracking-widest uppercase text-center">StrikeLab</h1>

      {/* Tier hero */}
      <div className="text-center mt-4">
        <div className="text-5xl">{tier.emoji}</div>
        <div className="text-amber-400 text-xl font-bold mt-1">{tier.name}</div>
      </div>

      {/* Progress to next tier */}
      <div className="mt-4">
        <div className="flex justify-between text-[11px] text-zinc-500 mb-1">
          <span>{state.lifetimeXp.toLocaleString("pt-PT")} XP</span>
          {tp.next ? (
            <span>
              faltam {tp.xpToNext.toLocaleString("pt-PT")} XP → {tierLabel(tp.next).emoji} {tierLabel(tp.next).name}
            </span>
          ) : (
            <span>Nível máximo 🏆</span>
          )}
        </div>
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.round(tp.progress * 100)}%` }} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mt-6">
        <Stat label="Pontos do mês" value={state.monthlyPoints.toLocaleString("pt-PT")} color="text-emerald-400" />
        <Stat label="XP total" value={state.lifetimeXp.toLocaleString("pt-PT")} color="text-blue-400" />
        <Stat
          label="Streak"
          value={`${state.currentStreakDays}d${state.streakShieldAvailable ? " 🛡️" : ""}`}
          color="text-cyan-400"
        />
      </div>

      {/* Challenge card */}
      {data.challenge ? (
        <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🏆</span>
            <span className="text-white font-medium text-sm">Desafio da semana</span>
          </div>
          <div className="text-amber-400 text-base font-bold">{data.challenge.name}</div>
          <div className="text-zinc-500 text-xs mt-0.5">
            +{data.challenge.points} pts · {data.challenge.status === "active" ? "A decorrer" : "Concluído"}
          </div>
          {data.challenge.status === "resolved" && (
            <div className="mt-3 pt-2 border-t border-zinc-800">
              {data.challenge.won ? (
                <div className="flex items-center gap-2">
                  <span className="text-xl">🏆</span>
                  <span className="text-emerald-400 font-bold text-sm">Venceste!</span>
                </div>
              ) : (
                <div className="text-zinc-500 text-xs">Não venceste desta vez. Na próxima!</div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6 bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4">
          <div className="flex items-center gap-2">
            <span className="text-zinc-600 text-lg">🏆</span>
            <div>
              <div className="text-zinc-500 text-sm">Sem desafio esta semana</div>
              <div className="text-zinc-600 text-xs">Novos desafios às quartas ao meio-dia</div>
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <h2 className="text-sm font-medium text-zinc-400 mt-8 mb-2">Classificação do mês 🏆</h2>
      <Leaderboard entries={data.leaderboard} />

      {/* Activity feed */}
      <h2 className="text-sm font-medium text-zinc-400 mt-8 mb-2">Atividade recente</h2>
      {events.length === 0 ? (
        <p className="text-zinc-600 text-sm py-6 text-center">
          Ainda sem atividade. Aparece numa aula para começares a somar pontos! 💪
        </p>
      ) : (
        <div className="space-y-1.5">
          {events.map((e) => (
            <ActivityRow key={e.id} e={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-zinc-500 mt-0.5">{label}</p>
    </div>
  );
}

function ActivityRow({
  e,
}: {
  e: { eventType: string; pointsDelta: number; className: string | null; boostsApplied: string[]; createdAt: string };
}) {
  const when = new Date(e.createdAt).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
  return (
    <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-sm text-white">{eventLabel(e.eventType)}</div>
        {e.className && <div className="text-[11px] text-zinc-500 truncate">{e.className}</div>}
        {e.boostsApplied.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {e.boostsApplied.map((b) => (
              <span key={b} className="text-[10px] text-purple-300 bg-purple-500/10 rounded px-1.5 py-0.5">
                {boostLabel(b)}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="text-right shrink-0">
        {e.pointsDelta > 0 && <div className="text-emerald-400 text-sm font-semibold">+{e.pointsDelta}</div>}
        <div className="text-[10px] text-zinc-600 whitespace-nowrap">{when}</div>
      </div>
    </div>
  );
}
