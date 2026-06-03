import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { COOKIE_NAME } from "@/lib/auth";

function checkAdmin(req: NextRequest): NextResponse | null {
  const cookie = req.cookies.get(COOKIE_NAME);
  if (!cookie?.value) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return null;
}

/** GET /api/strikelab/admin/loyalty/levels — list all loyalty levels */
export async function GET(req: NextRequest) {
  const err = checkAdmin(req);
  if (err) return err;

  const levels = await db.loyaltyLevel.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { grants: true } } },
  });

  return NextResponse.json({ levels });
}

/** POST /api/strikelab/admin/loyalty/levels — create a new loyalty level */
export async function POST(req: NextRequest) {
  const err = checkAdmin(req);
  if (err) return err;

  const body = await req.json();
  const { name, description, conditionType, conditionValue, rewardType, rewardValue, frequency } = body;

  if (!name || !conditionType || !conditionValue || !rewardType) {
    return NextResponse.json({ error: "name, conditionType, conditionValue, and rewardType are required" }, { status: 400 });
  }

  if (!["active_months", "xp_tier"].includes(conditionType)) {
    return NextResponse.json({ error: "conditionType must be active_months or xp_tier" }, { status: 400 });
  }

  if (!["free_month", "fixed_amount"].includes(rewardType)) {
    return NextResponse.json({ error: "rewardType must be free_month or fixed_amount" }, { status: 400 });
  }

  const level = await db.loyaltyLevel.create({
    data: {
      name,
      description: description || null,
      conditionType,
      conditionValue,
      rewardType,
      rewardValue: rewardValue ?? 0,
      frequency: frequency || "once",
    },
  });

  return NextResponse.json({ level }, { status: 201 });
}
