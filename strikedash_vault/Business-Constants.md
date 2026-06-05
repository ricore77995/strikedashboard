---
title: Business Constants
type: reference
---

# Business Constants

Definidos em `src/lib/constants.ts`. Valores do Yogo Booking.

## Subscription IDs

```typescript
ALL_SUB_IDS = [6021, 6107, 6020, 6178, 6361, 6293, 6294, 6153]
RECURRING_SUB_IDS = [6021, 6107, 6020, 6153]  // mensais/recorrentes
```

## Class & Pass IDs

```typescript
TRIAL_CLASS_TYPE_ID = 21792   // Aula Experimental (class type)
TRIAL_CLASS_PASS_ID = 14172   // Trial class pass
```

## Plan Names & Monthly Revenue

Pricing is fetched dynamically from Yogo via `/api/yogo/pricing` and cached for 24h.

See `src/lib/yogo/pricing-cache.ts` for cache management and Yogo API integration.

## Plan Classification

`getPlan(desc)` em `utils.ts` classifica `membership_description` do Yogo por regex match:

```typescript
/PT 12 Passes/i  -> "PT 12 Passes"
/PT 8 Passes/i   -> "PT 8 Passes"
/PT 4 Passes/i   -> "PT 4 Passes"
/PT \(Marcelo\)/i -> "PT (Marcelo) | 3x/sem"
/24 sessões\/mês/i -> "24 sessoes/mes"
// etc.
```

`isPTPlan(plan)` — verifica se plano comeca com "PT"

## Lead Filtering

`isNonActionableLead(customer)` filtra leads falsos:
- `usc-*@urbansportsclub.com` — leads USC automaticos
- `@strikershouse.*` — emails internos
- `@striker.pt` — emails internos
- `@strikerhouse.com` — emails internos

## Route Visibility

```typescript
SALES_VISIBLE_ROUTES = [
  "/dashboard", "/dashboard/funnel", "/dashboard/leads",
  "/dashboard/trials", "/dashboard/classes"
]

ADMIN_ONLY_ROUTES = [
  "/dashboard/revenue", "/dashboard/churn", "/dashboard/failed",
  "/dashboard/subscribers", "/dashboard/pts"
]
```

## Types

```typescript
type Role = "admin" | "sales"
type ColorName = "emerald" | "blue" | "amber" | "red" | "purple" | "pink" | "cyan"
```

## Related

- [[Yogo-API]] — como estes IDs sao usados nos endpoints
- [[Yogo-Pricing-Cache]] — server-side pricing cache management
- [[Design-System]] — COLOR_MAP
- [[Gotchas]] — plan regex pode mudar
