// Pricing is now fetched from Yogo via /api/yogo/pricing
// See src/lib/yogo/pricing-cache.ts for cache management
export const ALL_SUB_IDS = [
  6020, 6021, 6107,           // legacy 8 / 12 / 24 sessões/mês
  6519, 6520, 6521,           // 2026-05 refreshed 24 / 8 / 12 sessões/mês
  6153,                       // Striking Trimestral
  6178,                       // PT (Marcelo) 3x/sem
  6294, 6361,                 // PT 8 Passes, PT 12 Passes
  6293,                       // PT 4 Passes (archived — kept for historical rows)
];
export const RECURRING_SUB_IDS = [
  6020, 6021, 6107,           // legacy monthly recurring
  6519, 6520, 6521,           // refreshed monthly recurring
  6153,                       // Striking Trimestral (quarterly auto-renew)
];
export const TRIAL_CLASS_TYPE_ID = 21792;
export const TRIAL_CLASS_PASS_ID = 14172;

export const PLAN_ORDER = [
  "24 sessões/mês",
  "12 sessões/mês",
  "8 sessões/mês",
  "Striking Trimestral",
  "PT (Marcelo) | 3x/sem",
  "PT 4 Passes",
  "PT 8 Passes",
  "PT 12 Passes",
  "Outros",
] as const;

export type Role = "admin" | "sales";

export const SALES_VISIBLE_ROUTES = [
  "/dashboard",
  "/dashboard/funnel",
  "/dashboard/leads",
  "/dashboard/trials",
  "/dashboard/classes",
] as const;

export const ADMIN_ONLY_ROUTES = [
  "/dashboard/revenue",
  "/dashboard/churn",
  "/dashboard/failed",
  "/dashboard/subscribers",
  "/dashboard/pts",
  "/dashboard/a-receber",
  "/dashboard/saude-clientes",
  "/dashboard/pausas",
  "/dashboard/wa",
  "/dashboard/strikelab",
] as const;

export const COLOR_MAP = {
  // New semantic tones
  electric: { bg: "bg-tone-electric/10", text: "text-tone-electric", pill: "bg-tone-electric/15 text-tone-electric" },
  coral:    { bg: "bg-tone-coral/10",    text: "text-tone-coral",    pill: "bg-tone-coral/15 text-tone-coral" },
  amber:    { bg: "bg-tone-amber/10",    text: "text-tone-amber",    pill: "bg-tone-amber/15 text-tone-amber" },
  lime:     { bg: "bg-tone-lime/10",     text: "text-tone-lime",     pill: "bg-tone-lime/15 text-tone-lime" },
  magenta:  { bg: "bg-tone-magenta/10",  text: "text-tone-magenta",  pill: "bg-tone-magenta/15 text-tone-magenta" },
  blue:     { bg: "bg-tone-blue/10",     text: "text-tone-blue",     pill: "bg-tone-blue/15 text-tone-blue" },
  mint:     { bg: "bg-tone-mint/10",     text: "text-tone-mint",     pill: "bg-tone-mint/15 text-tone-mint" },
  // Backward-compatible aliases
  emerald:  { bg: "bg-tone-electric/10", text: "text-tone-electric", pill: "bg-tone-electric/15 text-tone-electric" },
  red:      { bg: "bg-tone-coral/10",    text: "text-tone-coral",    pill: "bg-tone-coral/15 text-tone-coral" },
  purple:   { bg: "bg-tone-magenta/10",  text: "text-tone-magenta",  pill: "bg-tone-magenta/15 text-tone-magenta" },
  pink:     { bg: "bg-tone-magenta/10",  text: "text-tone-magenta",  pill: "bg-tone-magenta/15 text-tone-magenta" },
  cyan:     { bg: "bg-tone-mint/10",     text: "text-tone-mint",     pill: "bg-tone-mint/15 text-tone-mint" },
} as const;

export type ColorName = keyof typeof COLOR_MAP;
