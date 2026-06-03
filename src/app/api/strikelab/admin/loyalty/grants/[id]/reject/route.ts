import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { COOKIE_NAME } from "@/lib/auth";

interface RouteParams { params: Promise<{ id: string }> }

/** POST /api/strikelab/admin/loyalty/grants/[id]/reject */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const cookie = req.cookies.get(COOKIE_NAME);
  if (!cookie?.value) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const grantId = parseInt(id, 10);
  if (isNaN(grantId)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const grant = await db.loyaltyGrant.findUnique({ where: { id: grantId } });
  if (!grant) return NextResponse.json({ error: "grant not found" }, { status: 404 });
  if (grant.status !== "pending_approval") {
    return NextResponse.json({ error: `grant is ${grant.status}, not pending_approval` }, { status: 400 });
  }

  await db.loyaltyGrant.update({
    where: { id: grantId },
    data: {
      status: "rejected",
      approvedBy: "admin",
      approvedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
