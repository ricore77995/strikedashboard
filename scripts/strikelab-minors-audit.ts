/**
 * StrikeLab Minors Audit Script
 *
 * Fetches all active subscribers from Yogo, checks DOB availability,
 * and outputs two reports:
 *   1. StrikeLab-DOB-Missing.csv — subscribers without date_of_birth
 *   2. StrikeLab-Minors-Audit.csv — subscribers under 18
 *
 * Usage: npx tsx scripts/strikelab-minors-audit.ts
 *
 * Output: strikedash_vault/StrikeLab-DOB-Missing.csv
 *         strikedash_vault/StrikeLab-Minors-Audit.csv
 *
 * Run BEFORE go-live. Marcelo updates Yogo to fill missing DOBs.
 * Phase 0 launch gated on: "all active subscribers have DOB populated OR documented exception".
 */

import { ALL_SUB_IDS } from "../src/lib/constants";

const YOGO_BASE = process.env.YOGO_BASE || "https://api.yogo.dk";
const YOGO_TOKEN = process.env.YOGO_TOKEN;
const YOGO_ORIGIN = process.env.YOGO_ORIGIN || "https://strikershouse.yogobooking.pt";

if (!YOGO_TOKEN) {
  console.error("Error: YOGO_TOKEN env var required");
  process.exit(1);
}

interface YogoCustomer {
  id: number;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  date_of_birth?: string | null;
}

async function yogoFetch<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${YOGO_BASE}/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${YOGO_TOKEN}`,
      "x-yogo-request-context": "admin",
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*",
      Origin: YOGO_ORIGIN,
      Referer: `${YOGO_ORIGIN}/`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Yogo ${res.status}: ${await res.text()}`);
  return res.json();
}

function extractRows(data: unknown): YogoCustomer[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray((data as { customers?: unknown }).customers)) {
    return (data as { customers: YogoCustomer[] }).customers;
  }
  return [];
}

function computeAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

async function main() {
  console.log("=== StrikeLab Minors Audit ===\n");

  // Fetch all subscribers with memberships
  console.log("Fetching subscribers from Yogo...");
  const queries = [
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

  const allCustomers: Map<number, YogoCustomer> = new Map();
  for (const body of queries) {
    const data = await yogoFetch<unknown>("reports/customers", body);
    for (const row of extractRows(data)) {
      if (typeof row.id === "number" && !allCustomers.has(row.id)) {
        allCustomers.set(row.id, row);
      }
    }
  }

  // Fetch detailed user info (including DOB) for each subscriber
  console.log(`Found ${allCustomers.size} subscribers. Fetching DOB details...`);

  const dobMissing: Array<{ id: number; name: string; phone: string; email: string }> = [];
  const minors: Array<{ id: number; name: string; phone: string; email: string; dob: string; age: number }> = [];
  let adults = 0;

  let i = 0;
  for (const [id, customer] of allCustomers) {
    i++;
    if (i % 50 === 0) console.log(`  Processing ${i}/${allCustomers.size}...`);

    // Get user detail for DOB
    try {
      const detail = await yogoFetch<YogoCustomer>(`users/${id}`);
      const dob = detail.date_of_birth;
      const name = `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim();

      if (!dob) {
        dobMissing.push({
          id,
          name,
          phone: customer.phone ?? "",
          email: customer.email ?? "",
        });
      } else {
        const age = computeAge(dob);
        if (age < 18) {
          minors.push({ id, name, phone: customer.phone ?? "", email: customer.email ?? "", dob, age });
        } else {
          adults++;
        }
      }
    } catch (err) {
      // If user detail fetch fails, mark as missing
      const name = `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim();
      dobMissing.push({
        id,
        name,
        phone: customer.phone ?? "",
        email: customer.email ?? "(fetch failed)",
      });
    }
  }

  // Output CSV reports
  const missingCsv = [
    "id,name,phone,email",
    ...dobMissing.map((r) => `${r.id},"${r.name}","${r.phone}","${r.email}"`),
  ].join("\n");

  const minorsCsv = [
    "id,name,phone,email,dob,age",
    ...minors.map((r) => `${r.id},"${r.name}","${r.phone}","${r.email}","${r.dob}",${r.age}`),
  ].join("\n");

  // Write to vault
  const fs = await import("fs");
  const path = await import("path");

  const vaultDir = path.resolve(__dirname, "../strikedash_vault");
  fs.writeFileSync(path.join(vaultDir, "StrikeLab-DOB-Missing.csv"), missingCsv);
  fs.writeFileSync(path.join(vaultDir, "StrikeLab-Minors-Audit.csv"), minorsCsv);

  // Summary
  console.log("\n=== Audit Results ===");
  console.log(`Total subscribers: ${allCustomers.size}`);
  console.log(`Adults (≥18): ${adults}`);
  console.log(`Minors (<18): ${minors.length}`);
  console.log(`DOB missing: ${dobMissing.length}`);
  console.log(`\nReports written to strikedash_vault/`);
  console.log(`  - StrikeLab-DOB-Missing.csv (${dobMissing.length} rows)`);
  console.log(`  - StrikeLab-Minors-Audit.csv (${minors.length} rows)`);

  if (dobMissing.length > 0) {
    console.log(`\n⚠️  ACTION REQUIRED: ${dobMissing.length} subscribers need DOB filled in Yogo.`);
    console.log("   Share StrikeLab-DOB-Missing.csv with Marcelo for manual update.");
  }

  if (minors.length > 0) {
    console.log(`\n📋 ${minors.length} minors require parental consent flow (handled by bot).`);
  }
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
