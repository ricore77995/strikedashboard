"use client";

import { tierLabel, eventLabel, boostLabel } from "@/lib/gamification/labels";

/** Presentational leaf components for the admin student detail page. */

export function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}

export function Consent({ label, on }: { label: string; on: boolean }) {
  return (
    <span className={on ? "text-emerald-400" : "text-zinc-600"}>
      {on ? "✓" : "✗"} {label}
    </span>
  );
}

export function TierProgress({
  tp,
}: {
  tp: { current: string; next: string | null; xpToNext: number; progress: number };
}) {
  return (
    <div className="mt-3">
      <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
        <span>{tierLabel(tp.current).emoji} {tierLabel(tp.current).name}</span>
        {tp.next ? (
          <span>{tp.xpToNext.toLocaleString("pt-PT")} XP → {tierLabel(tp.next).emoji} {tierLabel(tp.next).name}</span>
        ) : (
          <span>Nível máximo</span>
        )}
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-amber-400 rounded-full"
          style={{ width: `${Math.round(tp.progress * 100)}%` }}
        />
      </div>
    </div>
  );
}

export interface EventItem {
  id: string;
  eventType: string;
  source: string;
  pointsDelta: number;
  xpDelta: number;
  createdAt: string;
  className: string | null;
  boostsApplied: string[];
}

export function EventRow({ e }: { e: EventItem }) {
  const when = new Date(e.createdAt).toLocaleString("pt-PT");
  return (
    <div className="bg-zinc-900/50 border border-zinc-800/50 rounded px-3 py-2 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-white">{eventLabel(e.eventType)}</span>
          <span className="text-[10px] text-zinc-600">{e.source}</span>
        </div>
        {e.className && <span className="text-[10px] text-zinc-500 block truncate">{e.className}</span>}
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
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right">
          {e.pointsDelta !== 0 && (
            <span className={e.pointsDelta > 0 ? "text-emerald-400 text-xs block" : "text-red-400 text-xs block"}>
              {e.pointsDelta > 0 ? "+" : ""}{e.pointsDelta} pts
            </span>
          )}
          {e.xpDelta !== 0 && (
            <span className="text-blue-400/80 text-[10px] block">+{e.xpDelta} XP</span>
          )}
        </div>
        <span className="text-[10px] text-zinc-600 whitespace-nowrap">{when}</span>
      </div>
    </div>
  );
}
