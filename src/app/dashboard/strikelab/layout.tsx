"use client";

import { useAuth } from "@/hooks/use-auth";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard/strikelab", label: "Alunos" },
  { href: "/dashboard/strikelab/engine", label: "Motor" },
  { href: "/dashboard/strikelab/loyalty", label: "Fidelidade" },
  { href: "/dashboard/strikelab/erasure", label: "Apagamentos" },
  { href: "/dashboard/strikelab/reset-audit", label: "Resets" },
];

export default function StrikeLabLayout({ children }: { children: React.ReactNode }) {
  const { role, loading } = useAuth();
  const pathname = usePathname();

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-black"><span className="text-zinc-500">A carregar...</span></div>;

  if (role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black p-6">
        <div className="text-center">
          <p className="text-zinc-400 text-sm">Acesso restrito a administradores.</p>
          <Link href="/dashboard" className="text-emerald-400 text-sm mt-2 inline-block">← Voltar ao dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Sub-nav */}
      <div className="flex gap-1 px-4 py-2 border-b border-zinc-800 overflow-x-auto">
        {NAV.map((n) => {
          const isActive = pathname === n.href || (n.href !== "/dashboard/strikelab" && pathname.startsWith(n.href));
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`px-3 py-1.5 rounded text-sm whitespace-nowrap transition-colors ${
                isActive
                  ? "bg-emerald-500/20 text-emerald-400 font-medium"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {n.label}
            </Link>
          );
        })}
      </div>
      {/* Content */}
      <div className="p-4">{children}</div>
    </div>
  );
}
