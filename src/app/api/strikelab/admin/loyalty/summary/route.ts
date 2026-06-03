import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { COOKIE_NAME } from "@/lib/auth";

/** GET /api/strikelab/admin/loyalty/summary — cost dashboard data */
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(COOKIE_NAME);
  if (!cookie?.value) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Total applied grants with level details for cost calculation
  const applied = await db.loyaltyGrant.findMany({
    where: { status: "applied" },
    include: { loyaltyLevel: true },
    orderBy: { appliedAt: "desc" },
  });

  // Pending count
  const pendingCount = await db.loyaltyGrant.count({
    where: { status: "pending_approval" },
  });

  // Monthly breakdown: group by YYYY-MM of appliedAt
  const monthly: Record<string, { count: number; costCents: number }> = {};

  let totalCostCents = 0;

  for (const grant of applied) {
    const month = grant.appliedAt
      ? grant.appliedAt.toISOString().slice(0, 7)
      : "unknown";

    const cost = grant.loyaltyLevel.rewardType === "free_month"
      ? 0 // free month cost is plan-dependent, track as 0 for now
      : grant.loyaltyLevel.rewardValue;

    if (!monthly[month]) monthly[month] = { count: 0, costCents: 0 };
    monthly[month].count++;
    monthly[month].costCents += cost;
    totalCostCents += cost;
  }

  // Recent applied grants (last 20)
  const recent = applied.slice(0, 20).map((g) => ({
    id: g.id,
    yogoCustomerId: g.yogoCustomerId,
    levelName: g.loyaltyLevel.name,
    rewardType: g.loyaltyLevel.rewardType,
    rewardValue: g.loyaltyLevel.rewardValue,
    appliedAt: g.appliedAt,
    discountCode: g.yogoDiscountCodeName,
  }));

  return NextResponse.json({
    totalApplied: applied.length,
    pendingCount,
    totalCostCents,
    monthly,
    recent,
  });
}
