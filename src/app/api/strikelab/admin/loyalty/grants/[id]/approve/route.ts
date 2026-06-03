import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { COOKIE_NAME } from "@/lib/auth";
import { grantLoyaltyReward, type RewardConfig } from "@/lib/yogo/discount-codes";
import { yogoFetch } from "@/lib/yogo/fetch";

interface YogoMembership {
  id: number;
  status: string;
  status_text?: string;
  user?: { id: number };
  [key: string]: unknown;
}

interface RouteParams { params: Promise<{ id: string }> }

/** POST /api/strikelab/admin/loyalty/grants/[id]/approve */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const cookie = req.cookies.get(COOKIE_NAME);
  if (!cookie?.value) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const grantId = parseInt(id, 10);
  if (isNaN(grantId)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const grant = await db.loyaltyGrant.findUnique({
    where: { id: grantId },
    include: { loyaltyLevel: true },
  });

  if (!grant) return NextResponse.json({ error: "grant not found" }, { status: 404 });
  if (grant.status !== "pending_approval") {
    return NextResponse.json({ error: `grant is ${grant.status}, not pending_approval` }, { status: 400 });
  }

  // Fetch active membership from Yogo to get the membershipId
  const memRes = await yogoFetch<YogoMembership[]>(
    `memberships?user=${grant.yogoCustomerId}&status=active&populate[]=status_text`,
  );

  if (!memRes.ok || !Array.isArray(memRes.data) || memRes.data.length === 0) {
    return NextResponse.json(
      { error: "no active membership found in Yogo for this student" },
      { status: 400 },
    );
  }

  // Pick the best membership: active > cancelled_running, then by paidUntil desc
  const membership = memRes.data
    .filter((m) => m.status === "active" || m.status === "cancelled_running")
    .sort((a, b) => {
      const pa = a.status === "active" ? 0 : 1;
      const pb = b.status === "active" ? 0 : 1;
      return pa - pb;
    })[0];

  if (!membership) {
    return NextResponse.json(
      { error: "no active or cancelled-running membership found" },
      { status: 400 },
    );
  }

  // Check not paused
  const statusText = (membership as Record<string, unknown>).status_text as string | undefined;
  if (statusText && /^Paus/i.test(statusText)) {
    return NextResponse.json(
      { error: `membership is paused: ${statusText}` },
      { status: 400 },
    );
  }

  // Build reward config
  const reward: RewardConfig =
    grant.loyaltyLevel.rewardType === "free_month"
      ? { type: "free_month" }
      : { type: "fixed_amount", amountCents: grant.loyaltyLevel.rewardValue };

  try {
    const result = await grantLoyaltyReward(
      membership.id,
      grant.yogoCustomerId,
      grant.loyaltyLevelId,
      reward,
    );

    // Update grant
    await db.loyaltyGrant.update({
      where: { id: grantId },
      data: {
        status: "applied",
        approvedBy: "admin",
        approvedAt: new Date(),
        appliedAt: new Date(),
        yogoDiscountCodeId: result.discountCodeId,
        yogoDiscountCodeName: result.discountCodeName,
      },
    });

    return NextResponse.json({ ok: true, discountCodeName: result.discountCodeName });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: `Yogo API error: ${message}` }, { status: 502 });
  }
}
