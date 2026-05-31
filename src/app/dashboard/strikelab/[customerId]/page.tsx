"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { tierLabel } from "@/lib/gamification/labels";
import { Stat, Row, Consent, TierProgress, EventRow } from "./parts";

interface StudentData {
  identity: {
    customerId: number;
    phoneE164: string | null;
    email: string | null;
    instagramHandle: string | null;
    igVerifiedAt: string | null;
    optInAt: string | null;
    optOutAt: string | null;
    consentTraining: boolean;
    consentUgc: boolean;
    consentRealName: boolean;
    consentBroadcasts: boolean;
    birthYear: number | null;
    erasedAt: string | null;
    medicalPauseUntil: string | null;
    vacationPauseUntil: string | null;
    personalPauseUntil: string | null;
    createdAt: string;
  };
  state: {
    monthlyPoints: number;
    lifetimeXp: number;
    currentTier: string;
    proposedTier: string | null;
    currentStreakDays: number;
    streakShieldAvailable: boolean;
    lastClassAt: string | null;
    tierProgress: {
      current: string;
      next: string | null;
      xpToNext: number;
      progress: number;
    };
  } | null;
  events: Array<{
    id: string;
    eventId: number;
    eventType: string;
    pointsDelta: number;
    xpDelta: number;
    source: string;
    pointsPeriod: string | null;
    createdAt: string;
    className: string | null;
    boostsApplied: string[];
  }>;
}

export default function StudentDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const [data, setData] = useState<StudentData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerId) return;
    fetch(`/api/strikelab/admin/${customerId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false));
  }, [customerId]);

  if (loading) return <p className="text-zinc-500 text-sm text-center py-8">A carregar...</p>;
  if (!data) return <p className="text-red-400 text-sm text-center py-8">Aluno não encontrado.</p>;

  const { identity, state, events } = data;

  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString("pt-PT") : "—";

  return (
    <div>
      {/* Back */}
      <Link href="/dashboard/strikelab" className="text-zinc-500 text-sm hover:text-zinc-300">← Alunos</Link>

      <h1 className="text-lg font-bold text-white mt-2">#{identity.customerId}</h1>
      {identity.erasedAt && (
        <p className="text-red-400 text-xs mt-1">Apagado em {fmt(identity.erasedAt)}</p>
      )}

      {/* State card */}
      {state && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mt-3">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Pontos (mês)" value={String(state.monthlyPoints)} color="text-emerald-400" />
            <Stat label="XP (total)" value={String(state.lifetimeXp)} color="text-blue-400" />
            <Stat
              label="Nível"
              value={`${tierLabel(state.currentTier).emoji} ${tierLabel(state.currentTier).name}`}
              color="text-amber-400"
            />
            <Stat
              label="Streak"
              value={`${state.currentStreakDays}d${state.streakShieldAvailable ? " 🛡️" : ""}`}
              color="text-cyan-400"
            />
          </div>

          {/* Tier progress */}
          <TierProgress tp={state.tierProgress} />

          {state.proposedTier && state.proposedTier !== state.currentTier && (
            <p className="text-xs text-amber-400/80 mt-2">
              Nível proposto: {tierLabel(state.proposedTier).emoji} {tierLabel(state.proposedTier).name}
            </p>
          )}
        </div>
      )}

      {/* Identity card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mt-3">
        <h2 className="text-sm font-medium text-zinc-400 mb-2">Identidade</h2>
        <div className="space-y-1 text-sm">
          <Row label="Telefone" value={identity.phoneE164 ?? "—"} />
          <Row label="Email" value={identity.email ?? "—"} />
          <Row label="Instagram" value={identity.instagramHandle ?? "—"} />
          <Row label="Ano nasc." value={identity.birthYear ? String(identity.birthYear) : "—"} />
          <Row label="Inscrito" value={fmt(identity.optInAt)} />
          <Row label="Desinscrito" value={fmt(identity.optOutAt)} />
        </div>
      </div>

      {/* Consent toggles */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mt-3">
        <h2 className="text-sm font-medium text-zinc-400 mb-2">Consentimentos</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Consent label="Treino" on={identity.consentTraining} />
          <Consent label="UGC" on={identity.consentUgc} />
          <Consent label="Nome real" on={identity.consentRealName} />
          <Consent label="Broadcasts" on={identity.consentBroadcasts} />
        </div>
      </div>

      {/* Pause flags */}
      {(identity.medicalPauseUntil || identity.vacationPauseUntil || identity.personalPauseUntil) && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mt-3">
          <h2 className="text-sm font-medium text-amber-400 mb-2">Pausas activas</h2>
          <div className="space-y-1 text-sm">
            {identity.medicalPauseUntil && <Row label="Médica" value={fmt(identity.medicalPauseUntil)} />}
            {identity.vacationPauseUntil && <Row label="Férias" value={fmt(identity.vacationPauseUntil)} />}
            {identity.personalPauseUntil && <Row label="Pessoal" value={fmt(identity.personalPauseUntil)} />}
          </div>
        </div>
      )}

      {/* Events */}
      <div className="mt-4">
        <h2 className="text-sm font-medium text-zinc-400 mb-2">Últimos eventos ({events.length})</h2>
        <div className="space-y-1">
          {events.map((e) => (
            <EventRow key={e.id} e={e} />
          ))}
        </div>
      </div>

      {/* Actions */}
      {!identity.erasedAt && (
        <div className="flex gap-2 mt-4">
          <Link
            href={`/dashboard/strikelab/${customerId}/adjust`}
            className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded text-sm hover:bg-emerald-500/30"
          >
            Ajustar pontos
          </Link>
          <Link
            href={`/dashboard/strikelab/${customerId}/pause`}
            className="px-3 py-1.5 bg-amber-500/20 text-amber-400 rounded text-sm hover:bg-amber-500/30"
          >
            Pausas
          </Link>
        </div>
      )}
    </div>
  );
}
