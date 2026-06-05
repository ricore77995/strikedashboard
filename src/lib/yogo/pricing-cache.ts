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

    // Include all non-archived types — new plans may have 0 members but carry current prices
    const types = response.data.filter((t) => !t.archived);

    // Sort by ID ascending so newer plans (higher ID) overwrite legacy plans with same name
    types.sort((a, b) => a.id - b.id);

    const values: Record<string, number> = { Outros: 0 }; // Default for unclassified plans (never matches getPlan())

    for (const type of types) {
      const planKey = getPlan(type.name);
      if (planKey === "Outros") continue;

      if (!Array.isArray(type.payment_options) || type.payment_options.length === 0) continue;

      // Match monthly option by name pattern or by covering exactly 1 month
      const monthlyOption = type.payment_options.find((opt) =>
        /Mensal|1\s*Month|Monthly/i.test(opt.name)
      ) || type.payment_options.find((opt) =>
        opt.number_of_months_payment_covers === 1
      );

      let selectedOption = monthlyOption || type.payment_options[0];

      // Basic validation: skip invalid payment amounts (0, negative, NaN)
      if (!selectedOption.payment_amount || selectedOption.payment_amount <= 0) continue;

      // Both PT packs and recurring plans use the same logic:
      // Extract the selected option's payment_amount directly.
      // For PT packs: this is the one-time total (correct).
      // For recurring plans: we matched the monthly option, so this is monthly value.
      values[planKey] = selectedOption.payment_amount;
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
  // Note: No race condition protection - acceptable for low-traffic internal dashboard
  try {
    const fresh = await fetchFromYogo();
    cache = fresh;
    return cache; // Return cache, not fresh (per spec)
  } catch (error) {
    console.error("Failed to fetch fresh pricing, using fallback:", error);
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
    return cache; // Return cache, not fresh (per spec)
  } catch (error) {
    console.error("Failed to force refresh pricing:", error);
    // Silent fallback is acceptable here - admin endpoint can still indicate success/failure
    // via the API response, and caller will see the source="fallback" tag
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