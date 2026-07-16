"use client";
import { eur } from "@/lib/utils";

type ValueFormat = "currency" | "count";

interface BarChartProps { data: { label: string; value: number }[]; height?: number; currentIdx?: number; format?: ValueFormat; }

export function BarChart({ data, height = 240, currentIdx, format = "currency" }: BarChartProps) {
  const W = 700, H = height;
  const pad = { top: 10, right: 10, bottom: 30, left: 55 };
  const cw = W - pad.left - pad.right, ch = H - pad.top - pad.bottom;
  const maxV = Math.max(...data.map((d) => d.value), 1);
  const bw = (cw / data.length) * 0.7, gp = (cw / data.length) * 0.3;
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  const fmtTick = (v: number) => {
    if (format === "count") return String(Math.round(v));
    return v >= 1000 ? "€" + (v / 1000).toFixed(1) + "k" : "€" + Math.round(v);
  };

  const fmtTooltip = (v: number) => (format === "count" ? `${v}` : eur(v));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={pad.left} x2={W - pad.right} y1={pad.top + ch * (1 - t)} y2={pad.top + ch * (1 - t)} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
          <text x={pad.left - 6} y={pad.top + ch * (1 - t) + 4} fill="rgba(255,255,255,0.5)" fontSize="11" textAnchor="end">{fmtTick(maxV * t)}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = pad.left + i * (cw / data.length) + gp / 2;
        const h = (d.value / maxV) * ch, y = pad.top + ch - h;
        const fill = i === currentIdx ? "#00E5A0" : i < (currentIdx ?? -1) ? "rgba(0,229,160,0.6)" : "#15151C";
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw} height={h} fill={fill} rx={3}><title>{d.label}: {fmtTooltip(d.value)}</title></rect>
            <text x={x + bw / 2} y={H - pad.bottom + 16} fill="rgba(255,255,255,0.5)" fontSize="11" textAnchor="middle">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}
