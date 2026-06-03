import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { COOKIE_NAME } from "@/lib/auth";

interface RouteParams { params: Promise<{ id: string }> }

function checkAdmin(req: NextRequest): NextResponse | null {
  const cookie = req.cookies.get(COOKIE_NAME);
  if (!cookie?.value) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return null;
}

/** PATCH /api/strikelab/admin/loyalty/levels/[id] — update a loyalty level */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const err = checkAdmin(req);
  if (err) return err;

  const { id } = await params;
  const levelId = parseInt(id, 10);
  if (isNaN(levelId)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (typeof body.name === "string") updates.name = body.name;
  if (typeof body.description === "string") updates.description = body.description;
  if (body.active === true || body.active === false) updates.active = body.active;
  if (typeof body.conditionType === "string") {
    if (!["active_months", "xp_tier"].includes(body.conditionType)) {
      return NextResponse.json({ error: "conditionType must be active_months or xp_tier" }, { status: 400 });
    }
    updates.conditionType = body.conditionType;
  }
  if (typeof body.conditionValue === "string") updates.conditionValue = body.conditionValue;
  if (typeof body.rewardType === "string") {
    if (!["free_month", "fixed_amount"].includes(body.rewardType)) {
      return NextResponse.json({ error: "rewardType must be free_month or fixed_amount" }, { status: 400 });
    }
    updates.rewardType = body.rewardType;
  }
  if (typeof body.rewardValue === "number") updates.rewardValue = body.rewardValue;
  if (typeof body.frequency === "string") {
    if (!["once", "yearly"].includes(body.frequency)) {
      return NextResponse.json({ error: "frequency must be once or yearly" }, { status: 400 });
    }
    updates.frequency = body.frequency;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const level = await db.loyaltyLevel.update({
    where: { id: levelId },
    data: updates,
  });

  return NextResponse.json({ level });
}
