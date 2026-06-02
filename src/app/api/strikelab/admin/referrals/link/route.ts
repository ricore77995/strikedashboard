import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * POST /api/strikelab/admin/referrals/link
 *
 * Admin-only. Manually link a referral relationship by customer IDs.
 * Bypasses code lookup — admin specifies inviter and referred directly.
 * Body: { inviterCustomerId: number, referredCustomerId: number }
 */
export async function POST(req: NextRequest) {
  const cookie = req.cookies.get("session");
  if (!cookie?.value) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { inviterCustomerId, referredCustomerId } = body;

    if (typeof inviterCustomerId !== "number" || typeof referredCustomerId !== "number") {
      return NextResponse.json(
        { error: "Required: inviterCustomerId (number), referredCustomerId (number)" },
        { status: 400 },
      );
    }

    // Anti-ring: no self-referral
    if (inviterCustomerId === referredCustomerId) {
      return NextResponse.json({ error: "self_referral" }, { status: 400 });
    }

    // Anti-ring: no duplicate (one inviter per referee)
    const existing = await db.referral.findUnique({
      where: { referredCustomerId },
    });
    if (existing) {
      return NextResponse.json({ error: "already_referred" }, { status: 409 });
    }

    // Verify both identities exist
    const inviter = await db.gamificationIdentity.findUnique({
      where: { customerId: inviterCustomerId },
    });
    if (!inviter) {
      return NextResponse.json({ error: "inviter_not_found" }, { status: 404 });
    }

    const referred = await db.gamificationIdentity.findUnique({
      where: { customerId: referredCustomerId },
    });
    if (!referred) {
      return NextResponse.json({ error: "referred_not_found" }, { status: 404 });
    }

    // Create referral row directly
    const referral = await db.referral.create({
      data: {
        inviterCustomerId,
        referredCustomerId,
        referralCodeUsed: inviter.referralCode ?? `admin:${inviterCustomerId}`,
        status: "pending",
      },
    });

    return NextResponse.json({ ok: true, referralId: referral.id });
  } catch (err: unknown) {
    // P2002 on referredCustomerId unique
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "already_referred" }, { status: 409 });
    }
    console.error("[referrals/link] Error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
