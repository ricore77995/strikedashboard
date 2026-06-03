"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TrophyIcon, RefreshIcon, LogoutIcon, UsersIcon } from "./icons";
import { Pill } from "./pill";
import type { Role } from "@/lib/constants";
import { ADMIN_ONLY_ROUTES } from "@/lib/constants";

interface NavProps {
  role: Role;
  onRefresh: () => void;
  onLogout: () => void;
  lastFetch: Date | null;
}

const ALL_LINKS = [
  { href: "/dashboard", label: "Visão Geral" },
  { href: "/dashboard/revenue", label: "Faturação" },
  { href: "/dashboard/funnel", label: "Funil" },
  { href: "/dashboard/subscribers", label: "Subscritores" },
  { href: "/dashboard/saude-clientes", label: "Saúde" },
  { href: "/dashboard/pts", label: "PTs" },
  { href: "/dashboard/leads", label: "Leads" },
  { href: "/dashboard/trials", label: "Experimentais" },
  { href: "/dashboard/trials-no-conv", label: "Trial s/ conv." },
  { href: "/dashboard/churn", label: "Churn" },
  { href: "/dashboard/failed", label: "Falhas" },
  { href: "/dashboard/classes", label: "Visitantes" },
  { href: "/dashboard/strikelab", label: "StrikeLab" },
  { href: "/dashboard/a-receber", label: "A Receber" },
];

const HomeIconSmall = <svg className="w-[17px] h-[17px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
const FunnelIconSmall = <svg className="w-[17px] h-[17px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>;
const FlameIconSmall = <svg className="w-[17px] h-[17px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>;
const HealthIconSmall = <svg className="w-[17px] h-[17px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>;

const mobileLinks = [
  { href: "/dashboard", label: "Home", icon: HomeIconSmall },
  { href: "/dashboard/funnel", label: "Funil", icon: FunnelIconSmall },
  { href: "/dashboard/subscribers", label: "Subs", icon: <UsersIcon className="w-[17px] h-[17px]" /> },
  { href: "/dashboard/leads", label: "Leads", icon: FlameIconSmall },
  { href: "/dashboard/saude-clientes", label: "Saúde", icon: HealthIconSmall },
];

export function Nav({ role, onRefresh, onLogout, lastFetch }: NavProps) {
  const pathname = usePathname();
  const isAdmin = role === "admin";

  const links = isAdmin
    ? ALL_LINKS
    : ALL_LINKS.filter((l) => !ADMIN_ONLY_ROUTES.some((r) => l.href.startsWith(r)));

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-gradient-to-br from-accent to-accent/80 shadow-lg shadow-accent/25 rounded-lg flex items-center justify-center">
            <TrophyIcon />
          </div>
          <div>
            <h1 className="head text-2xl font-bold">Striker&apos;s House</h1>
            <p className="text-muted text-sm">
              {isAdmin ? "Dashboard de controlo · Carcavelos" : "Leads & Conversão · Carcavelos"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Pill color={isAdmin ? "emerald" : "purple"}>{isAdmin ? "Admin" : "Vendas"}</Pill>
          {lastFetch && (
            <span className="text-muted text-xs hidden md:block">
              Última act.: {lastFetch.toLocaleTimeString("pt-PT")}
            </span>
          )}
          <button onClick={onRefresh} className="p-2 hover:bg-surface2 rounded-lg" title="Atualizar">
            <RefreshIcon />
          </button>
          <button onClick={onLogout} className="p-2 hover:bg-surface2 rounded-lg text-muted-strong" title="Sair">
            <LogoutIcon />
          </button>
        </div>
      </div>

      <div className="hidden md:flex gap-1 border-b border-border-subtle overflow-x-auto">
        {links.map(({ href, label }) => {
          const isActive = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`px-4 py-2 text-sm border-b-2 whitespace-nowrap ${
                isActive
                  ? "border-accent text-white"
                  : "border-transparent text-muted-strong hover:text-white"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {/* Mobile bottom nav */}
      <div className="fixed bottom-3 left-3 right-3 z-30 md:hidden">
        <div className="flex gap-1 p-1.5 rounded-full bg-[rgba(15,15,20,0.92)] border border-border-strong backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
          {mobileLinks.map(({ href, label, icon }) => {
            const isActive = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
            return (
              <Link key={href} href={href} className={`flex-1 flex items-center justify-center gap-1.5 h-11 rounded-full text-[11px] font-bold transition-all ${isActive ? "bg-accent text-black" : "text-muted-strong"}`}>
                {icon}
                {isActive && <span className="uppercase tracking-wide">{label}</span>}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
