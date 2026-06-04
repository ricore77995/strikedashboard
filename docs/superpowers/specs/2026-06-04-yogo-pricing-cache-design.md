---
title: Yogo Pricing Cache — Replace Hardcoded PLAN_VALUES
type: technical
date: 2026-06-04
---

# Yogo Pricing Cache — Replace Hardcoded PLAN_VALUES

## Problem

`PLAN_VALUES` in `src/lib/constants.ts` is hardcoded with monthly revenue values:
```typescript
export const PLAN_VALUES: Record<string, number> = {
  "24 sessões/mês": 60,
  "12 sessões/mês": 50,
  // ... etc
};
```

This causes wrong data in dashboard pages when Yogo refreshes pricing. The comment in `constants.ts` notes: *"Yogo lets the studio archive old types and create new ones (e.g. price refreshes), and this hardcoded list goes stale."*

## Solution

Fetch pricing data from Yogo's `/membership-types?populate[]=payment_options` endpoint, cache server-side for 24h, and serve via API. Replace hardcoded values with async calls.

## Architecture

```
Browser → /api/yogo/pricing → cached in-memory response → Yogo API (if stale)
```

**Cache Strategy:**
- In-memory cache with 24h TTL
- Auto-refresh on stale access (lazy refresh)
- Manual refresh endpoint for admin control
- Fallback to last known good cache if Yogo fails

## Components

### New Files

**`src/lib/yogo/pricing-cache.ts`**
- In-memory cache management
- Fetch logic from Yogo API
- TTL checking and auto-refresh
- Fallback handling
- Export: `getCachedPricing()`, `forceRefreshPricing()`

**`src/app/api/yogo/pricing/route.ts`**
- GET endpoint returning cached pricing data
- Response shape:
  ```json
  {
    "updatedAt": "2026-06-04T14:30:00Z",
    "values": { "24 sessões/mês": 60, ... },
    "source": "yogo" | "fallback"
  }
  ```

**`src/app/api/yogo/admin/pricing/refresh/route.ts`**
- POST endpoint to force cache refresh
- Response:
  ```json
  { "success": true, "updatedAt": "2026-06-04T14:35:00Z" }
  ```

### Modified Files

**`src/lib/constants.ts`**
- Replace `PLAN_VALUES` export with function:
  ```typescript
  export async function getPlanValues(): Promise<Record<string, number>> {
    const res = await fetch('/api/yogo/pricing');
    const data = await res.json();
    return data.values || { Outros: 0 };
  }
  ```
- Keep other constants unchanged

**Client Pages (6 files):**
- `src/app/dashboard/page.tsx`
- `src/app/dashboard/a-receber/page.tsx`
- `src/app/dashboard/pts/page.tsx`
- `src/app/dashboard/subscribers/page.tsx`
- Add async pricing fetch pattern:
  ```typescript
  const [planValues, setPlanValues] = useState<Record<string, number> | null>(null);
  const [loadingPricing, setLoadingPricing] = useState(true);
  useEffect(() => {
    fetch('/api/yogo/pricing')
      .then(r => r.json())
      .then(data => {
        setPlanValues(data.values);
        setLoadingPricing(false);
      })
      .catch(() => setLoadingPricing(false)); // On error, use fallback values
  }, []);
  const value = planValues?.[plan] ?? 0;
  ```
  
  **Loading state:** Show "A carregar preços..." pill in stats cards during initial fetch

## Data Flow

1. **Server Startup:** Cache empty, first request triggers fetch
2. **First Request:** `/api/yogo/pricing` → fetch Yogo → store in memory → return
3. **Subsequent Requests:** Return cached data if `< 24h` old
4. **Stale Cache:** Next request re-fetches from Yogo → updates cache → returns fresh data
5. **Yogo Failure:** Return last known good cache with `source: "fallback"`
6. **Manual Refresh:** `/api/yogo/admin/pricing/refresh` forces immediate re-fetch

## Yogo Data Extraction

From `GET /membership-types?populate[]=payment_options`:

```typescript
interface YogoMembershipType {
  id: number;
  name: string;
  archived: boolean;
  membershipCount: number;
  payment_options: Array<{
    payment_amount: number;  // e.g., 60.00
    name: string;             // e.g., "Mensal"
    for_sale: boolean;
    number_of_months_payment_covers: number;
  }>;
}
```

**Extraction Logic:**
1. Filter: `archived === 0 && membershipCount > 0`
2. For each type, apply `getPlan(name)` regex mapping
3. Extract `payment_amount` from `payment_options` where `for_sale=true`
4. Handle multiple payment_options:
   - For recurring plans: prefer option with name matching /Mensal/i
   - If no match: use the first `for_sale=true` option
   - For PT packs: use total payment_amount (these are one-time)
5. Map to existing plan keys: `{"24 sessões/mês": 60, ...}`
6. Fallback: if no payment_options found, default to 0 (shows as "Outros")

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Yogo fetch succeeds | Store cache, return `source: "yogo"` |
| Yogo fetch fails | Return last cache with `source: "fallback"` |
| No cache yet | Return `{Outros: 0}` with `source: "initializing"` |
| Invalid Yogo data | Log error, return last good cache |
| Client fetch errors | Show "Pricing unavailable" pill, render zero revenue |

## API Endpoints

### `GET /api/yogo/pricing`
Returns cached pricing data.

**Response (200):**
```json
{
  "updatedAt": "2026-06-04T14:30:00Z",
  "values": {
    "24 sessões/mês": 60,
    "12 sessões/mês": 50,
    "8 sessões/mês": 40,
    "Striking Trimestral": 50,
    "PT (Marcelo) | 3x/sem": 60,
    "PT 4 Passes": 200,
    "PT 8 Passes": 400,
    "PT 12 Passes": 600,
    "Outros": 0
  },
  "source": "yogo"
}
```

### `POST /api/yogo/admin/pricing/refresh`
Forces immediate cache refresh (admin only).

**Response (200):**
```json
{
  "success": true,
  "updatedAt": "2026-06-04T14:35:00Z"
}
```

## Testing Strategy

### Unit Tests
- Mock Yogo responses in `pricing-cache.ts` tests
- Test cache TTL logic (24h boundary)
- Test fallback behavior on Yogo failure
- Test data extraction logic from Yogo response

### Integration Tests
- Mock `/api/yogo/pricing` returning various states
- Test client pages handle loading/error states
- Test manual refresh endpoint forces re-fetch

### E2E Test
- Fetch pricing → Verify matches Yogo structure
- Simulate Yogo data change → Wait 24h → Verify cache refreshes
- Call refresh endpoint → Verify immediate update

### Manual Test Checklist
- [ ] Start dev server → First call triggers Yogo fetch (check network tab)
- [ ] Subsequent calls return cached data (no network activity)
- [ ] Wait 25h or modify timestamp → Verify fresh fetch from Yogo
- [ ] Kill Yogo token temporarily → Verify fallback still works
- [ ] Call manual refresh → Verify immediate update in cache

## Implementation Phases

### Phase 1: Backend (No client changes)
1. Create `src/lib/yogo/pricing-cache.ts`
2. Create `src/app/api/yogo/pricing/route.ts`
3. Create `src/app/api/yogo/admin/pricing/refresh/route.ts`
4. Test endpoints with curl
5. Verify manual refresh works

### Phase 2: Client Migration (One page at a time)
1. **First:** `src/app/dashboard/pts/page.tsx` (simplest revenue calc)
2. Add async fetch + loading state
3. Test locally with dev server
4. Repeat for remaining pages:
   - `src/app/dashboard/a-receber/page.tsx`
   - `src/app/dashboard/page.tsx`
   - `src/app/dashboard/subscribers/page.tsx`

### Phase 3: Cleanup
1. Remove hardcoded `PLAN_VALUES` from `constants.ts`
2. Update comments to reference API
3. Update vault documentation

## Rollback Plan

If issues arise:
- **Phase 2 changes** can be reverted independently — backend API stays live
- **Phase 1** is safe to ship (new endpoints don't break existing code)
- Fallback logic ensures dashboard never breaks, only shows "Pricing unavailable"

## Future Extensions

This design enables a future **configuration page** to override Yogo pricing:

1. Add SQLite table `PricingOverride` for manual overrides
2. Add `/api/yogo/admin/pricing` CRUD endpoints
3. Create `/dashboard/admin/pricing` page to manage overrides
4. Merge strategy: `override ?? yogo_base_price`
5. Same client fetch pattern — no changes needed in dashboard pages

## Acceptance Criteria

- [ ] `/api/yogo/pricing` returns correct pricing from Yogo
- [ ] Cache persists for 24h between refreshes
- [ ] Manual refresh forces immediate update
- [ ] Yogo failure returns last known good cache
- [ ] All 6 client pages use async pricing fetch
- [ ] Revenue calculations match Yogo data
- [ ] Loading states display during initial fetch
- [ ] No errors in console during normal operation
- [ ] Manual test checklist passes

## Related

- [[Yogo-API]] — Yogo API reference
- [[Business-Constants]] — Current hardcoded constants
- [[Arquitectura]] — Proxy pattern for Yogo integration