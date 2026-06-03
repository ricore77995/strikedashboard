"use client";

import { useEffect, useState } from "react";
import { eventLabel } from "@/lib/gamification/labels";

interface PollInfo {
  lastRun: string;
  status: string;
  durationMs: number | null;
  message: string | null;
}

interface EngineData {
  polls: {
    classes: PollInfo | null;
    memberships: PollInfo | null;
  };
  eventBreakdown: { eventType: string; today: number; thisWeek: number; thisMonth: number }[];
  referralPipeline: { pending: number; trialCredited: number; phase1: number; phase2: number };
  challenge: {
    key: string;
    name: string;
    status: string;
    isoWeek: string;
    windowStart: string;
    windowEnd: string;
    winners: number;
    points: number;
  } | null;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function fmtDuration(ms: number | null) {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const STATUS_COLORS: Record<string, string> = {
  success: "text-emerald-400",
  error: "text-red-400",
  skipped: "text-zinc-500",
};

function PollCard({ label, poll }: { label: string; poll: PollInfo | null }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
      <div className="text-zinc-500 text-xs mb-1">{label}</div>
      {poll ? (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${STATUS_COLORS[poll.status] ?? "text-zinc-400"}`}>
              {poll.status.toUpperCase()}
            </span>
            <span className="text-zinc-600 text-xs">{fmtDuration(poll.durationMs)}</span>
          </div>
          <div className="text-zinc-400 text-xs">{fmtTime(poll.lastRun)}</div>
          {poll.message && (
            <div className="text-zinc-600 text-xs truncate" title={poll.message}>{poll.message}</div>
          )}
        </div>
      ) : (
        <div className="text-zinc-600 text-sm">Nunca executou</div>
      )}
    </div>
  );
}

export default function EnginePage() {
  const [data, setData] = useState<EngineData | null>(null);

  async function load() {
    const res = await fetch("/api/strikelab/admin/engine");
    if (res.ok) setData(await res.json());
  }

  useEffect(() => { load(); }, []);

  if (!data) {
    return <p className="text-zinc-500 text-sm">A carregar dados do motor...</p>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-white">Motor do StrikeLab</h2>

      {/* Poll Health */}
      <div>
        <h3 className="text-sm font-medium text-zinc-400 mb-2">Polls (última execução)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PollCard label="Classes (05:00)" poll={data.polls.classes} />
          <PollCard label="Membresias (02:00)" poll={data.polls.memberships} />
        </div>
      </div>

      {/* Event Breakdown */}
      <div>
        <h3 className="text-sm font-medium text-zinc-400 mb-2">Eventos</h3>
        {data.eventBreakdown.length === 0 ? (
          <p className="text-zinc-600 text-sm">Nenhum evento este mês.</p>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-xs">
                  <th className="text-left px-3 py-2">Evento</th>
                  <th className="text-right px-3 py-2">Hoje</th>
                  <th className="text-right px-3 py-2">Semana</th>
                  <th className="text-right px-3 py-2">Mês</th>
                </tr>
              </thead>
              <tbody>
                {data.eventBreakdown.map((row) => (
                  <tr key={row.eventType} className="border-b border-zinc-800/50">
                    <td className="px-3 py-1.5 text-white">{eventLabel(row.eventType)}</td>
                    <td className="px-3 py-1.5 text-right text-zinc-300">{row.today || "—"}</td>
                    <td className="px-3 py-1.5 text-right text-zinc-300">{row.thisWeek || "—"}</td>
                    <td className="px-3 py-1.5 text-right text-white font-medium">{row.thisMonth}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Referral Pipeline */}
      <div>
        <h3 className="text-sm font-medium text-zinc-400 mb-2">Pipeline de Indicações</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Pendentes", value: data.referralPipeline.pending, color: "text-amber-400" },
            { label: "Trial", value: data.referralPipeline.trialCredited, color: "text-blue-400" },
            { label: "Fase 1", value: data.referralPipeline.phase1, color: "text-purple-400" },
            { label: "Fase 2", value: data.referralPipeline.phase2, color: "text-emerald-400" },
          ].map((item) => (
            <div key={item.label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
              <div className="text-zinc-500 text-xs">{item.label}</div>
              <div className={`text-xl font-bold ${item.color}`}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Challenge Status */}
      <div>
        <h3 className="text-sm font-medium text-zinc-400 mb-2">Desafio Semanal</h3>
        {data.challenge ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
            <div className="flex items-center gap-3">
              <span className="text-white font-medium">{data.challenge.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded ${
                data.challenge.status === "active"
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-zinc-700 text-zinc-300"
              }`}>
                {data.challenge.status === "active" ? "Activo" : "Resolvido"}
              </span>
            </div>
            <div className="text-zinc-400 text-sm mt-1">
              Semana {data.challenge.isoWeek}
              {" · "}
              {data.challenge.points > 0 ? `${data.challenge.points} pts` : ""}
              {data.challenge.status === "resolved" && ` · ${data.challenge.winners} vencedor${data.challenge.winners !== 1 ? "es" : ""}`}
            </div>
          </div>
        ) : (
          <p className="text-zinc-600 text-sm">Nenhum desafio activo.</p>
        )}
      </div>
    </div>
  );
}
