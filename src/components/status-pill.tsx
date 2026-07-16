// src/components/status-pill.tsx
"use client";

export type SubStatus = "active" | "risk" | "failed" | "expired" | "paused" | "overdue" | "churn";

interface StatusPillProps {
  status: SubStatus;
  daysUntilRenewal?: number;
}

const CFG: Record<SubStatus, { bg: string; fg: string; label: (d?: number) => string }> = {
  active:  { bg: "rgba(0,229,160,0.14)",  fg: "#00E5A0", label: (d) => d != null && d >= 0 ? `renova em ${d}d` : "activo" },
  risk:    { bg: "rgba(255,182,39,0.14)", fg: "#FFB627", label: (d) => d != null ? `risco · ${d}d` : "risco" },
  failed:  { bg: "rgba(255,61,46,0.14)",  fg: "#FF6B5E", label: (d) => d != null ? `falha · ${Math.abs(d)}d` : "falha" },
  expired: { bg: "rgba(255,61,46,0.18)",  fg: "#FF6B5E", label: (d) => d != null ? `venceu há ${Math.abs(d)}d` : "vencido" },
  paused:  { bg: "rgba(155,162,177,0.18)", fg: "#C7CCD6", label: () => "pausada" },
  overdue: { bg: "rgba(255,61,46,0.18)",  fg: "#FF6B5E", label: (d) => d != null ? `devedor · ${Math.abs(d)}d` : "devedor" },
  churn:   { bg: "rgba(120,120,130,0.18)", fg: "#9BA2B1", label: (d) => d != null ? `churn · ${Math.abs(d)}d` : "churn" },
};

export function StatusPill({ status, daysUntilRenewal }: StatusPillProps) {
  const cfg = CFG[status] ?? CFG.active;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 8px",
        borderRadius: 6,
        background: cfg.bg,
        color: cfg.fg,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.fg, flexShrink: 0 }} />
      {cfg.label(daysUntilRenewal)}
    </span>
  );
}
