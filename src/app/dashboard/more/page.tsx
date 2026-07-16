"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { ChevronIcon } from "@/components/icons";

interface Section {
  id: string;
  label: string;
  sub: string;
  icon: string;
  href: string;
  adminOnly?: boolean;
}

const SECTIONS: Section[] = [
  { id: "subs",     label: "Subscrições",          sub: "Membros activos e planos",           icon: "👥", href: "/dashboard/subscribers", adminOnly: true },
  { id: "revenue",  label: "Faturação",            sub: "Receita e histórico de pagamentos",  icon: "⚡", href: "/dashboard/revenue", adminOnly: true },
  { id: "pts",      label: "PTs",                  sub: "Personal trainers e sessões",        icon: "👤", href: "/dashboard/pts", adminOnly: true },
  { id: "churn",    label: "Churn",                sub: "Membros em risco de cancelamento",   icon: "📉", href: "/dashboard/churn", adminOnly: true },
  { id: "classes",  label: "Visitantes",           sub: "USC, ClassPass, Bruce App",          icon: "✨", href: "/dashboard/classes" },
  { id: "leads",    label: "Leads",                sub: "Interessados que se cadastraram",    icon: "🎯", href: "/dashboard/leads" },
  { id: "receber",  label: "A Receber",            sub: "Calendário de vencimentos mensais",  icon: "📅", href: "/dashboard/a-receber", adminOnly: true },
  { id: "saude",    label: "Saúde dos Clientes",   sub: "Inadimplentes, pausados, churn, PT migrar", icon: "🩺", href: "/dashboard/saude-clientes", adminOnly: true },
  { id: "wa",       label: "WhatsApp bot",         sub: "Saúde do bot, eventos e sessões activas",   icon: "💬", href: "/dashboard/wa", adminOnly: true },
  { id: "strikelab", label: "StrikeLab",           sub: "Gamificação, pontos e desafios",     icon: "🏆", href: "/dashboard/strikelab", adminOnly: true },
];

export default function MorePage() {
  const router = useRouter();
  const { role, logout } = useAuth();
  const isAdmin = role === "admin";
  const visibleSections = isAdmin ? SECTIONS : SECTIONS.filter((s) => !s.adminOnly);

  return (
    <div style={{ paddingBottom: 32 }}>
      {/* Section links */}
      <div style={{ padding: "4px 18px 10px" }}>
        <h3 className="head" style={{ margin: "14px 0 10px", fontSize: 18, color: "#fff" }}>Outras secções</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visibleSections.map((s) => (
            <div
              key={s.id}
              onClick={() => router.push(s.href)}
              style={{
                background: "#0F0F14",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 12,
                padding: "12px 14px",
                display: "flex",
                alignItems: "center",
                gap: 12,
                cursor: "pointer",
              }}
              className="tap"
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.04)",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                  fontSize: 18,
                }}
              >
                {s.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{s.label}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{s.sub}</div>
              </div>
              <span style={{ color: "rgba(255,255,255,0.3)" }}>
                <ChevronIcon className="w-4 h-4" />
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Account section */}
      <div style={{ padding: "0 18px" }}>
        <h3 className="head" style={{ margin: "18px 0 10px", fontSize: 18, color: "#fff" }}>Conta</h3>
        <div
          style={{
            background: "#0F0F14",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 12,
            padding: 14,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #00E5A0, rgba(0,229,160,0.6))",
              display: "grid",
              placeItems: "center",
              fontSize: 14,
              fontWeight: 800,
              color: "#0a0a0a",
              flexShrink: 0,
            }}
          >
            SH
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Striker&apos;s House · Carcavelos</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
              {isAdmin ? "Admin" : "Vendas"}
            </div>
          </div>
          <button
            onClick={logout}
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.72)",
              padding: "8px 12px",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 600,
              fontFamily: "inherit",
            }}
            className="tap"
          >
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}
