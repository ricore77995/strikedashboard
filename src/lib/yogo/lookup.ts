import { yogoFetch } from "@/lib/yogo/fetch";
import { normalize } from "@/lib/phone";
import { ALL_SUB_IDS } from "@/lib/constants";

export interface YogoCustomer {
  id: number;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  date_of_birth?: string | null;
}

/** Fetch a single user's details including date_of_birth. */
export async function getYogoUserDetail(userId: number): Promise<YogoCustomer | null> {
  const res = await yogoFetch<YogoCustomer>(`users/${userId}`);
  if (!res.ok) return null;
  return res.data;
}

// Yogo has no documented per-phone lookup endpoint. Per-message fetching of
// the full customer list would burn ~200KB every inbound, so we cache the
// list in-process for 60s and probe it via the variants from phone.ts. Fluid
// Compute instance reuse keeps this hot across requests.
const TTL_MS = 60_000;
let cache: { map: Map<string, YogoCustomer>; expiresAt: number } | null = null;

export async function findCustomerByPhone(e164: string): Promise<YogoCustomer | null> {
  const { variants } = normalize(e164);
  if (variants.length === 0) return null;

  const map = await getPhoneIndex();
  for (const v of variants) {
    const hit = map.get(v);
    if (hit) return hit;
  }
  return null;
}

export function clearCustomerCache(): void {
  cache = null;
  idCache = null;
}

// Id-keyed index over the same customer list used for phone lookups. Cached
// 60s so a top-N leaderboard resolves all names from one (already-warm) fetch
// instead of N per-user calls.
let idCache: { map: Map<number, YogoCustomer>; expiresAt: number } | null = null;

export async function getCustomersByIds(ids: number[]): Promise<Map<number, YogoCustomer>> {
  const now = Date.now();
  if (!idCache || idCache.expiresAt <= now) {
    const customers = await fetchAllCustomers();
    const map = new Map<number, YogoCustomer>();
    for (const c of customers) {
      if (typeof c.id === "number") map.set(c.id, c);
    }
    idCache = { map, expiresAt: now + TTL_MS };
  }
  const out = new Map<number, YogoCustomer>();
  for (const id of ids) {
    const c = idCache.map.get(id);
    if (c) out.set(id, c);
  }
  return out;
}

async function getPhoneIndex(): Promise<Map<string, YogoCustomer>> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.map;

  const customers = await fetchAllCustomers();
  const map = new Map<string, YogoCustomer>();
  for (const c of customers) {
    const raw = (c.phone ?? "").trim();
    if (!raw) continue;
    const { variants } = normalize(raw);
    for (const v of variants) {
      // First-write wins -- duplicates in Yogo (rare) keep the first record;
      // miscalibration shows up as LOOKUP_MISS for the second account.
      if (!map.has(v)) map.set(v, c);
    }
  }
  cache = { map, expiresAt: now + TTL_MS };
  return map;
}

// Mirrors the union used by the G2 spike and the funnel page so the bot's
// addressable population matches what the dashboard considers a customer.
async function fetchAllCustomers(): Promise<YogoCustomer[]> {
  const queries = [
    {
      filters: [
        { type: "hasNoMembership", membershipTypeId: [], onlyActiveMemberships: false },
        { type: "hasNoClassPass", classPassTypeId: [], onlyActiveClassPasses: false },
      ],
      returnColumnHeaders: true,
    },
    {
      filters: [
        {
          type: "hasMembershipOrClassPass",
          membershipTypeId: ALL_SUB_IDS,
          classPassTypeId: [],
          onlyActiveMembershipsOrClassPasses: false,
        },
      ],
      returnColumnHeaders: true,
    },
  ];

  const byId = new Map<number, YogoCustomer>();
  for (const body of queries) {
    const res = await yogoFetch<unknown>("reports/customers", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!res.ok) continue;
    for (const row of extractRows(res.data)) {
      if (typeof row.id === "number" && !byId.has(row.id)) byId.set(row.id, row);
    }
  }
  return Array.from(byId.values());
}

function extractRows(data: unknown): YogoCustomer[] {
  if (Array.isArray(data)) return data as YogoCustomer[];
  if (data && typeof data === "object" && Array.isArray((data as { customers?: unknown }).customers)) {
    return (data as { customers: YogoCustomer[] }).customers;
  }
  return [];
}
