import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { COOKIE_NAME } from "@/lib/auth";

/** GET /api/strikelab/admin/loyalty/grants?status=pending_approval — list grants */
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(COOKIE_NAME);
  if (!cookie?.value) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const where = status ? { status } : {};

  const grants = await db.loyaltyGrant.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { loyaltyLevel: true },
    take: 100,
  });

  return NextResponse.json({ grants });
}
