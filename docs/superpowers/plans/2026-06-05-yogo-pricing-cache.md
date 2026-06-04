# Yogo Pricing Cache — Replace Hardcoded PLAN_VALUES

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded `PLAN_VALUES` with Yogo API data, cached server-side for 24h, to fix wrong pricing data in dashboard pages.

**Architecture:** Server-side in-memory cache → API endpoints → Client async fetch. Cache auto-refreshes after 24h or via manual admin endpoint. Fallback to last known good cache if Yogo fails.

**Tech Stack:** Next.js 15, TypeScript, Yogo API, In-memory caching (no external deps)

---

## Phase 1: Backend Implementation

### Task 1: Create Pricing Cache Module

**Files:**
- Create: `src/lib/yogo/pricing-cache.ts`

- [ ] **Step 1: Write the pricing cache module**

```typescript
import { yogoFetch } from "@/lib/yogo/fetch";
import { getPlan } from "@/lib/utils";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  data: Record<string, number>;
  updatedAt: Date;
  source: "yogo" | "fallback" | "initializing";
}

let cache: CacheEntry | null = null;

interface YogoPaymentOption {
  payment_amount: number;
  name: string;
  for_sale: boolean;
  number_of_months_payment_covers: number;
}

interface YogoMembershipType {
  id: number;
  name: string;
  archived: boolean;
  membershipCount: number;
  payment_options: YogoPaymentOption[];
}

async function fetchFromYogo(): Promise<CacheEntry> {
  try {
    const response = await yogoFetch<YogoMembershipType[]>(
      "membership-types?populate[]=payment_options&populate[]=membershipCount"
    );

    if (!response.ok || !Array.isArray(response.data)) {
      throw new Error("Invalid Yogo response");
    }

    const types = response.data.filter(
      (t) => !t.archived && t.membershipCount > 0
    );

    const values: Record<string, number> = { Outros: 0 };

    for (const type of types) {
      const planKey = getPlan(type.name);
      if (planKey === "Outros") continue;

      const saleableOptions = type.payment_options.filter((opt) => opt.for_sale);
      if (saleableOptions.length === 0) continue;

      let selectedOption = saleableOptions[0];

      // For recurring plans, prefer "Mensal" option
      const monthlyOption = saleableOptions.find((opt) =>
        /Mensal/i.test(opt.name)
      );
      if (monthlyOption) {
        selectedOption = monthlyOption;
      }

      // For PT packs, use total amount (they're one-time)
      if (planKey.startsWith("PT")) {
        values[planKey] = selectedOption.payment_amount;
      } else {
        // For recurring plans, store monthly value
        values[planKey] = selectedOption.payment_amount;
      }
    }

    return {
      data: values,
      updatedAt: new Date(),
      source: "yogo",
    };
  } catch (error) {
    console.error("Failed to fetch pricing from Yogo:", error);
    throw error;
  }
}

export async function getCachedPricing(): Promise<CacheEntry> {
  const now = Date.now();

  // Return existing cache if fresh
  if (cache && now - cache.updatedAt.getTime() < CACHE_TTL_MS) {
    return cache;
  }

  // Cache is stale or doesn't exist, fetch fresh data
  try {
    const fresh = await fetchFromYogo();
    cache = fresh;
    return cache;
  } catch (error) {
    // Fallback to last known good cache if available
    if (cache) {
      return { ...cache, source: "fallback" };
    }

    // No cache yet, return empty fallback
    return {
      data: { Outros: 0 },
      updatedAt: new Date(),
      source: "initializing",
    };
  }
}

export async function forceRefreshPricing(): Promise<CacheEntry> {
  try {
    const fresh = await fetchFromYogo();
    cache = fresh;
    return fresh;
  } catch (error) {
    if (cache) {
      return { ...cache, source: "fallback" };
    }

    return {
      data: { Outros: 0 },
      updatedAt: new Date(),
      source: "initializing",
    };
  }
}
```

- [ ] **Step 2: Run TypeScript check to verify no type errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/yogo/pricing-cache.ts
git commit -m "feat(pricing): add server-side pricing cache module

- In-memory cache with 24h TTL
- Fetch from Yogo /membership-types endpoint
- Extract pricing from payment_options
- Prefer 'Mensal' option for recurring plans
- Fallback to last known good cache on Yogo failure
- Export getCachedPricing() and forceRefreshPricing()"
```

---

### Task 2: Create Pricing API Endpoint

**Files:**
- Create: `src/app/api/yogo/pricing/route.ts`

- [ ] **Step 1: Write the pricing API endpoint**

```typescript
import { getCachedPricing } from "@/lib/yogo/pricing-cache";
import { NextResponse } from "next/server";

export async function GET() {
  const pricing = await getCachedPricing();

  return NextResponse.json({
    updatedAt: pricing.updatedAt.toISOString(),
    values: pricing.data,
    source: pricing.source,
  });
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Start dev server and test endpoint**

Run: `npm run dev`

Then in another terminal:
```bash
curl http://localhost:3000/api/yogo/pricing
```

Expected: JSON response with pricing values (first call triggers Yogo fetch)

- [ ] **Step 4: Call endpoint again to verify caching**

Run: `curl http://localhost:3000/api/yogo/pricing`

Expected: Same response, faster (no Yogo fetch triggered)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/yogo/pricing/route.ts
git commit -m "feat(pricing): add GET /api/yogo/pricing endpoint

- Returns cached pricing data with updatedAt timestamp
- Source indicates if data is from Yogo, fallback, or initializing
- Lazy cache refresh on stale access"
```

---

### Task 3: Create Manual Refresh Endpoint

**Files:**
- Create: `src/app/api/yogo/admin/pricing/refresh/route.ts`

- [ ] **Step 1: Write the manual refresh endpoint**

```typescript
import { forceRefreshPricing } from "@/lib/yogo/pricing-cache";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const fresh = await forceRefreshPricing();

    return NextResponse.json({
      success: true,
      updatedAt: fresh.updatedAt.toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to refresh pricing",
      },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Test manual refresh endpoint**

With dev server running:
```bash
curl -X POST http://localhost:3000/api/yogo/admin/pricing/refresh
```

Expected: `{ "success": true, "updatedAt": "2026-06-05T..." }`

- [ ] **Step 4: Verify pricing updated**

Run: `curl http://localhost:3000/api/yogo/pricing`

Expected: Fresh pricing data with new `updatedAt` timestamp

- [ ] **Step 5: Commit**

```bash
git add src/app/api/yogo/admin/pricing/refresh/route.ts
git commit -m "feat(pricing): add POST /api/yogo/admin/pricing/refresh

- Forces immediate cache refresh from Yogo
- Returns success status and updated timestamp
- Admin-only endpoint for manual pricing sync control"
```

---

## Phase 2: Client Migration

### Task 4: Update PTS Page (First Client Migration)

**Files:**
- Modify: `src/app/dashboard/pts/page.tsx`

- [ ] **Step 1: Read the current PTS page to find PLAN_VALUES usage**

Run: `grep -n "PLAN_VALUES" src/app/dashboard/pts/page.tsx`

Expected: Lines where `PLAN_VALUES[g.plan]` or similar patterns appear

- [ ] **Step 2: Add state for pricing data**

Find the component function definition and add after existing useState calls:

```typescript
const [planValues, setPlanValues] = useState<Record<string, number> | null>(null);
const [loadingPricing, setLoadingPricing] = useState(true);
```

- [ ] **Step 3: Add useEffect to fetch pricing**

Add after the other useEffect hooks:

```typescript
useEffect(() => {
  fetch('/api/yogo/pricing')
    .then((r) => r.json())
    .then((data) => {
      setPlanValues(data.values);
      setLoadingPricing(false);
    })
    .catch(() => setLoadingPricing(false));
}, []);
```

- [ ] **Step 4: Replace PLAN_VALUE references**

Find all uses of `PLAN_VALUES[g.plan]` or `PLAN_VALUES[plan]` and replace with:

```typescript
planValues?.[g.plan] ?? 0
```

or

```typescript
planValues?.[plan] ?? 0
```

- [ ] **Step 5: Add loading state indicator in UI**

Find where the revenue summary is displayed (usually in a stats card or header). Add a loading indicator:

```typescript
{loadingPricing ? (
  <Pill color="amber">A carregar preços...</Pill>
) : null}
```

Place this near the revenue display or at the top of the page.

- [ ] **Step 6: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Test locally**

With dev server running, navigate to `/dashboard/pts` in browser:
- Should see "A carregar preços..." briefly
- Then see normal revenue data
- Check network tab for `/api/yogo/pricing` call

- [ ] **Step 8: Commit**

```bash
git add src/app/dashboard/pts/page.tsx
git commit -m "feat(pricing): migrate PTS page to async pricing fetch

- Add state for planValues and loadingPricing
- Fetch from /api/yogo/pricing on mount
- Replace hardcoded PLAN_VALUES references
- Add loading indicator during initial fetch
- Fallback to 0 if pricing unavailable"
```

---

### Task 5: Update A-Receber Page

**Files:**
- Modify: `src/app/dashboard/a-receber/page.tsx`

- [ ] **Step 1: Find PLAN_VALUES usage**

Run: `grep -n "PLAN_VALUES" src/app/dashboard/a-receber/page.tsx`

- [ ] **Step 2: Add state for pricing data**

After existing useState calls:

```typescript
const [planValues, setPlanValues] = useState<Record<string, number> | null>(null);
const [loadingPricing, setLoadingPricing] = useState(true);
```

- [ ] **Step 3: Add useEffect to fetch pricing**

After other useEffect hooks:

```typescript
useEffect(() => {
  fetch('/api/yogo/pricing')
    .then((r) => r.json())
    .then((data) => {
      setPlanValues(data.values);
      setLoadingPricing(false);
    })
    .catch(() => setLoadingPricing(false));
}, []);
```

- [ ] **Step 4: Replace PLAN_VALUE references**

Replace `PLAN_VALUES[plan]` with `planValues?.[plan] ?? 0`

- [ ] **Step 5: Add loading indicator**

Add near revenue display:

```typescript
{loadingPricing ? (
  <Pill color="amber">A carregar preços...</Pill>
) : null}
```

- [ ] **Step 6: Run TypeScript check**

Run: `npx tsc --noEmit`

- [ ] **Step 7: Test locally**

Navigate to `/dashboard/a-receber`, verify pricing loads correctly

- [ ] **Step 8: Commit**

```bash
git add src/app/dashboard/a-receber/page.tsx
git commit -m "feat(pricing): migrate A-Receber page to async pricing fetch

- Same async fetch pattern as PTS page
- Add loading indicator during fetch
- Replace hardcoded PLAN_VALUES references"
```

---

### Task 6: Update Dashboard Page

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Find PLAN_VALUES usage**

Run: `grep -n "PLAN_VALUES" src/app/dashboard/page.tsx`

- [ ] **Step 2: Add state for pricing data**

After existing useState calls:

```typescript
const [planValues, setPlanValues] = useState<Record<string, number> | null>(null);
const [loadingPricing, setLoadingPricing] = useState(true);
```

- [ ] **Step 3: Add useEffect to fetch pricing**

After other useEffect hooks:

```typescript
useEffect(() => {
  fetch('/api/yogo/pricing')
    .then((r) => r.json())
    .then((data) => {
      setPlanValues(data.values);
      setLoadingPricing(false);
    })
    .catch(() => setLoadingPricing(false));
}, []);
```

- [ ] **Step 4: Replace PLAN_VALUE references**

Replace `PLAN_VALUES[plan]` with `planValues?.[plan] ?? 0`

- [ ] **Step 5: Add loading indicator**

Add near revenue display:

```typescript
{loadingPricing ? (
  <Pill color="amber">A carregar preços...</Pill>
) : null}
```

- [ ] **Step 6: Run TypeScript check**

Run: `npx tsc --noEmit`

- [ ] **Step 7: Test locally**

Navigate to `/dashboard`, verify pricing loads correctly

- [ ] **Step 8: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat(pricing): migrate dashboard page to async pricing fetch

- Same async fetch pattern as other pages
- Add loading indicator during fetch
- Replace hardcoded PLAN_VALUES references"
```

---

### Task 7: Update Subscribers Page

**Files:**
- Modify: `src/app/dashboard/subscribers/page.tsx`

- [ ] **Step 1: Find PLAN_VALUES usage**

Run: `grep -n "PLAN_VALUES" src/app/dashboard/subscribers/page.tsx`

- [ ] **Step 2: Add state for pricing data**

After existing useState calls:

```typescript
const [planValues, setPlanValues] = useState<Record<string, number> | null>(null);
const [loadingPricing, setLoadingPricing] = useState(true);
```

- [ ] **Step 3: Add useEffect to fetch pricing**

After other useEffect hooks:

```typescript
useEffect(() => {
  fetch('/api/yogo/pricing')
    .then((r) => r.json())
    .then((data) => {
      setPlanValues(data.values);
      setLoadingPricing(false);
    })
    .catch(() => setLoadingPricing(false));
}, []);
```

- [ ] **Step 4: Replace PLAN_VALUE references**

Replace `PLAN_VALUES[plan]` with `planValues?.[plan] ?? 0`

- [ ] **Step 5: Add loading indicator**

Add near revenue display:

```typescript
{loadingPricing ? (
  <Pill color="amber">A carregar preços...</Pill>
) : null}
```

- [ ] **Step 6: Run TypeScript check**

Run: `npx tsc --noEmit`

- [ ] **Step 7: Test locally**

Navigate to `/dashboard/subscribers`, verify pricing loads correctly

- [ ] **Step 8: Commit**

```bash
git add src/app/dashboard/subscribers/page.tsx
git commit -m "feat(pricing): migrate subscribers page to async pricing fetch

- Same async fetch pattern as other pages
- Add loading indicator during fetch
- Replace hardcoded PLAN_VALUES references"
```

---

## Phase 3: Cleanup

### Task 8: Remove Hardcoded PLAN_VALUES

**Files:**
- Modify: `src/lib/constants.ts`

- [ ] **Step 1: Read the current PLAN_VALUES**

Run: `grep -A 10 "export const PLAN_VALUES" src/lib/constants.ts`

- [ ] **Step 2: Remove PLAN_VALUES constant**

Delete the entire `PLAN_VALUES` export block.

- [ ] **Step 3: Update comments**

Update the comment about membership type verification:

Replace:
```typescript
// Yogo membership_type_id list. Verify against /membership-types?populate[]=membershipCount
// when a customer seems invisible — Yogo lets the studio archive old types and create new
// ones (e.g. price refreshes), and this hardcoded list goes stale.
```

With:
```typescript
// Pricing is now fetched from Yogo via /api/yogo/pricing
// See src/lib/yogo/pricing-cache.ts for cache management
```

- [ ] **Step 4: Run TypeScript check**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Test all pages still work**

Navigate to `/dashboard/pts`, `/dashboard/a-receber`, `/dashboard`, `/dashboard/subscribers` - all should load correctly

- [ ] **Step 6: Commit**

```bash
git add src/lib/constants.ts
git commit -m "refactor(pricing): remove hardcoded PLAN_VALUES

- Pricing now fetched from Yogo API with 24h cache
- Update comments to reference pricing-cache module
- All client pages now use async fetch pattern"
```

---

### Task 9: Update Vault Documentation

**Files:**
- Modify: `strikedash_vault/Business-Constants.md`

- [ ] **Step 1: Read the current business constants doc**

Run: `obsidian-cli print "Business-Constants"`

- [ ] **Step 2: Update the Plan Names & Monthly Revenue section**

Replace the hardcoded table with:

```markdown
## Plan Names & Monthly Revenue

Pricing is fetched dynamically from Yogo via `/api/yogo/pricing` and cached for 24h.

See `src/lib/yogo/pricing-cache.ts` for cache management and Yogo API integration.
```

- [ ] **Step 3: Update the Related section**

Add reference to the new pricing cache:

```markdown
## Related

- [[Yogo-API]] — como estes IDs sao usados nos endpoints
- [[Yogo-Pricing-Cache]] — server-side pricing cache management
- [[Design-System]] — COLOR_MAP
- [[Gotchas]] — plan regex pode mudar
```

- [ ] **Step 4: Commit**

```bash
git add strikedash_vault/Business-Constants.md
git commit -m "docs(vault): update Business-Constants for dynamic pricing

- Replace hardcoded pricing table with API reference
- Add Yogo-Pricing-Cache to related documentation"
```

---

## Acceptance Criteria Verification

- [ ] `/api/yogo/pricing` returns correct pricing from Yogo
- [ ] Cache persists for 24h between refreshes
- [ ] Manual refresh forces immediate update
- [ ] Yogo failure returns last known good cache
- [ ] All 4 client pages use async pricing fetch
- [ ] Revenue calculations match Yogo data
- [ ] Loading states display during initial fetch
- [ ] No errors in console during normal operation
- [ ] Manual test checklist passes

---

Plan complete and saved to `docs/superpowers/plans/2026-06-05-yogo-pricing-cache.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**