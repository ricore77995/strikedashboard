"use client";

interface Stats {
  optedIn: number;
  totalPointsThisMonth: number;
  activeThisWeek: number;
  challenge: {
    key: string;
    name: string;
    points: number;
    status: string;
    windowStart: string;
    windowEnd: string;
    winners: { customerId: number; rank: number; points: number }[];
  } | null;
}

interface StrikeLabStatsProps {
  stats: Stats;
}

function StatBox({ value, label, color }: { value: string | number; label: string; color?: string }) {
  return (
    <div
      className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center"
    >
      <div className={`text-xl font-bold ${color ?? "text-white"}`}>{value}</div>
      <div className="text-zinc-500 text-xs mt-0.5">{label}</div>
    </div>
  );
}

export function StrikeLabStats({ stats }: StrikeLabStatsProps) {
  return (
    <div className="space-y-3 mb-4">
      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-2">
        <StatBox value={stats.optedIn} label="Alunos activos" color={stats.optedIn > 0 ? "text-emerald-400" : undefined} />
        <StatBox value={stats.totalPointsThisMonth.toLocaleString("pt-PT")} label="Pts este mês" color={stats.totalPointsThisMonth > 0 ? "text-blue-400" : undefined} />
        <StatBox value={stats.activeThisWeek} label="Activos semana" color={stats.activeThisWeek > 0 ? "text-purple-400" : undefined} />
      </div>

      {/* Challenge status */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
        {stats.challenge ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-amber-400 text-sm">🏆</span>
              <span className="text-white text-sm font-medium">{stats.challenge.name}</span>
              <span className="text-zinc-600 text-xs">+{stats.challenge.points} pts</span>
              {stats.challenge.status === "resolved" && (
                <span className="text-xs text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">Resolvido</span>
              )}
            </div>
            <div className="text-zinc-500 text-xs mt-1">
              {stats.challenge.status === "active"
                ? "Desafio activo esta semana"
                : "Desafio desta semana resolvido"}
            </div>

            {/* Winners list */}
            {stats.challenge.winners.length > 0 && (
              <div className="mt-2 pt-2 border-t border-zinc-800">
                <div className="text-zinc-500 text-xs mb-1.5">Vencedores</div>
                <div className="space-y-1">
                  {stats.challenge.winners.map((w) => (
                    <div key={w.customerId} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="text-amber-400">
                          {w.rank === 1 ? "🥇" : w.rank === 2 ? "🥈" : w.rank === 3 ? "🥉" : `#${w.rank}`}
                        </span>
                        <span className="text-zinc-300">#{w.customerId}</span>
                      </div>
                      <span className="text-emerald-400">+{w.points}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-zinc-600 text-sm">🏆</span>
              <span className="text-zinc-500 text-sm">Sem desafio activo esta semana</span>
            </div>
            <div className="text-zinc-600 text-xs mt-1">
              Os desafios são lançados às quartas ao meio-dia
            </div>
          </>
        )}
      </div>
    </div>
  );
}
