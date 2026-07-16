// src/components/sub-row.tsx
"use client";

import { StatusPill, type SubStatus } from "./status-pill";

interface SubRowProps {
  name: string;
  plan: string;
  detail: string;
  status?: SubStatus;
  daysUntilRenewal?: number;
  badges?: { status: SubStatus; daysUntilRenewal?: number }[];
  onClick?: () => void;
}

export function SubRow({ name, plan, detail, status, daysUntilRenewal, badges, onClick }: SubRowProps) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      onClick={onClick}
      style={{
        background: "#0F0F14",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 12,
        padding: "11px 12px",
        display: "flex",
        alignItems: "center",
        gap: 11,
        cursor: onClick ? "pointer" : "default",
      }}
      className="tap"
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: "linear-gradient(135deg, #1f1f28 0%, #15151c 100%)",
          border: "1px solid rgba(255,255,255,0.06)",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
          fontSize: 12,
          fontWeight: 700,
          color: "#fff",
          letterSpacing: "0.02em",
        }}
      >
        {initials}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 2 }}>{name}</div>
        <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)", display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{plan}</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span style={{ flexShrink: 0 }}>{detail}</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {(badges ?? (status ? [{ status, daysUntilRenewal }] : [])).map((b, i) => (
          <StatusPill key={i} status={b.status} daysUntilRenewal={b.daysUntilRenewal} />
        ))}
      </div>
    </div>
  );
}
