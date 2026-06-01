"use client";

export interface LeaderboardEntry {
  rank: number;
  name: string;
  monthlyPoints: number;
  isViewer: boolean;
}

const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export function Leaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-zinc-600 text-sm py-4 text-center">
        Ainda sem pontos este mês. Sê o primeiro! 🔥
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {entries.map((e) => (
        <div
          key={e.rank}
          className={`flex items-center justify-between rounded-lg px-3 py-2 ${
            e.isViewer
              ? "bg-amber-500/10 border border-amber-500/40"
              : "bg-zinc-900/50 border border-zinc-800/50"
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm w-6 text-center shrink-0">{MEDALS[e.rank] ?? e.rank}</span>
            <span className={`text-sm truncate ${e.isViewer ? "text-amber-300 font-semibold" : "text-white"}`}>
              {e.name}
              {e.isViewer && " (tu)"}
            </span>
          </div>
          <span className="text-emerald-400 text-sm font-semibold shrink-0">
            {e.monthlyPoints.toLocaleString("pt-PT")}
          </span>
        </div>
      ))}
    </div>
  );
}
