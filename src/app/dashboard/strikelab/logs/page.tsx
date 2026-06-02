"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { eventLabel } from "@/lib/gamification/labels";

type Tab = "events" | "cron" | "challenges";

interface EventRow {
  id: string;
  eventId: number;
  customerId: number;
  eventType: string;
  pointsDelta: number;
  xpDelta: number;
  source: string;
  pointsPeriod: string | null;
  createdAt: string;
}

interface CronRow {
  id: string;
  cronName: string;
  status: string;
  message: string | null;
  durationMs: number | null;
  startedAt: string;
  finishedAt: string;
}

interface ScheduleEntry {
  cronName: string;
  schedule: string;
  label: string;
  lastRun: { status: string; startedAt: string; durationMs: number | null } | null;
}

interface ChallengeRow {
  id: string;
  challengeKey: string;
  isoWeek: string;
  status: string;
  windowStart: string;
  windowEnd: string;
  launchedAt: string;
  resolvedAt: string | null;
}

export default function StrikeLabLogsPage() {
  const [tab, setTab] = useState<Tab>("events");
  const [events, setEvents] = useState<EventRow[]>([]);
  const [cronRuns, setCronRuns] = useState<CronRow[]>([]);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [challenges, setChallenges] = useState<ChallengeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/strikelab/admin/logs?type=${tab}&page=${page}`);
      if (!res.ok) return;
      const data = await res.json();
      if (tab === "events") {
        setEvents(data.events ?? []);
        setTotal(data.total ?? 0);
      } else if (tab === "cron") {
        setCronRuns(data.runs ?? []);
        setSchedule(data.schedule ?? []);
        setTotal(data.total ?? 0);
      } else {
        setChallenges(data.runs ?? []);
        setTotal(data.runs?.length ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [tab, page]);

  useEffect(() => {
    setPage(1);
  }, [tab]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  const pages = Math.ceil(total / 50);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Link href="/dashboard/strikelab" className="text-zinc-500 hover:text-white text-sm">← StrikeLab</Link>
        <h1 className="text-lg font-bold text-white">Painel de controlo</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-800 mb-4">
        {(["events", "cron", "challenges"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm border-b-2 ${
              tab === t ? "border-emerald-500 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t === "events" ? "Eventos" : t === "cron" ? "Cron" : "Desafios"}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <p className="text-zinc-500 text-sm text-center py-8">A carregar...</p>
      ) : total === 0 ? (
        <p className="text-zinc-500 text-sm text-center py-8">
          {tab === "events" ? "Sem eventos registados." : tab === "cron" ? "Sem execuções de cron." : "Sem desafios registados."}
        </p>
      ) : (
        <>
          {tab === "events" && <EventsTable events={events} fmt={fmt} />}
          {tab === "cron" && (
            <>
              {/* Schedule overview */}
              <ScheduleOverview schedule={schedule} fmt={fmt} />
              {cronRuns.length > 0 && (
                <>
                  <h3 className="text-sm font-medium text-zinc-400 mt-6 mb-2">Histórico de execuções</h3>
                  <CronTable runs={cronRuns} fmt={fmt} />
                </>
              )}
            </>
          )}
          {tab === "challenges" && <ChallengeTable runs={challenges} fmt={fmt} />}

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1 text-xs bg-zinc-900 border border-zinc-800 rounded text-zinc-400 disabled:opacity-30"
              >
                ← Anterior
              </button>
              <span className="text-zinc-500 text-xs">{page} / {pages}</span>
              <button
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page >= pages}
                className="px-3 py-1 text-xs bg-zinc-900 border border-zinc-800 rounded text-zinc-400 disabled:opacity-30"
              >
                Próximo →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EventsTable({ events, fmt }: { events: EventRow[]; fmt: (d: string) => string }) {
  return (
    <div className="space-y-1.5">
      {events.map((e) => (
        <div key={e.id} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm text-white">{eventLabel(e.eventType)}</div>
            <div className="text-[11px] text-zinc-500">
              #{e.customerId} · {e.source} {e.pointsPeriod && `· ${e.pointsPeriod}`}
            </div>
          </div>
          <div className="text-right shrink-0">
            {e.pointsDelta > 0 && <div className="text-emerald-400 text-sm font-semibold">+{e.pointsDelta}</div>}
            {e.xpDelta > 0 && <div className="text-blue-400 text-xs">+{e.xpDelta} XP</div>}
            <div className="text-[10px] text-zinc-600">{fmt(e.createdAt)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CronTable({ runs, fmt }: { runs: CronRow[]; fmt: (d: string) => string }) {
  const statusColor = (s: string) => {
    if (s === "success") return "text-emerald-400";
    if (s === "error") return "text-red-400";
    return "text-amber-400";
  };

  return (
    <div className="space-y-1.5">
      {runs.map((r) => (
        <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm text-white font-mono">{r.cronName}</div>
            {r.message && (
              <div className="text-[11px] text-zinc-500 truncate max-w-[250px]">{r.message}</div>
            )}
          </div>
          <div className="text-right shrink-0">
            <span className={`text-xs font-medium ${statusColor(r.status)}`}>
              {r.status === "success" ? "✓" : r.status === "error" ? "✗" : "⊘"} {r.status}
            </span>
            {r.durationMs != null && (
              <div className="text-[10px] text-zinc-600">{r.durationMs}ms</div>
            )}
            <div className="text-[10px] text-zinc-600">{fmt(r.startedAt)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ChallengeTable({ runs, fmt }: { runs: ChallengeRow[]; fmt: (d: string) => string }) {
  return (
    <div className="space-y-1.5">
      {runs.map((r) => (
        <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-white text-sm font-medium">{r.challengeKey}</span>
              <span className="text-zinc-600 text-xs ml-2">{r.isoWeek}</span>
            </div>
            <span className={`text-xs font-medium ${r.status === "active" ? "text-amber-400" : "text-emerald-400"}`}>
              {r.status === "active" ? "● Activo" : "✓ Resolvido"}
            </span>
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            Lançado: {fmt(r.launchedAt)}
            {r.resolvedAt && ` · Resolvido: ${fmt(r.resolvedAt)}`}
          </div>
        </div>
      ))}
    </div>
  );
}

function ScheduleOverview({ schedule, fmt }: { schedule: ScheduleEntry[]; fmt: (d: string) => string }) {
  return (
    <div>
      <h3 className="text-sm font-medium text-zinc-400 mb-2">Agendados</h3>
      <div className="space-y-1.5">
        {schedule.map((s) => (
          <div key={s.cronName} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm text-white font-mono">{s.cronName}</div>
              <div className="text-[11px] text-zinc-500">{s.label}</div>
            </div>
            <div className="text-right shrink-0">
              {s.lastRun ? (
                <>
                  <span className={`text-xs font-medium ${s.lastRun.status === "success" ? "text-emerald-400" : s.lastRun.status === "error" ? "text-red-400" : "text-amber-400"}`}>
                    {s.lastRun.status === "success" ? "✓" : s.lastRun.status === "error" ? "✗" : "⊘"}
                  </span>
                  <span className="text-[10px] text-zinc-500 ml-1">
                    {fmt(s.lastRun.startedAt)}
                  </span>
                  {s.lastRun.durationMs != null && (
                    <span className="text-[10px] text-zinc-600 ml-1">{s.lastRun.durationMs}ms</span>
                  )}
                </>
              ) : (
                <span className="text-[11px] text-zinc-600">Aguardando</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
