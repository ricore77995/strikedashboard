import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { COOKIE_NAME } from "@/lib/auth";

/**
 * GET /api/strikelab/admin/referrals?status=...&page=1
 *
 * Admin-only. Lists referral relationships with inviter/referred details.
 * Optional status filter: pending, trial_credited, phase1_credited, phase2_credited.
 */
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(COOKIE_NAME);
  if (!cookie?.value) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status");
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = 50;
  const skip = (page - 1) * limit;

  const where = statusFilter ? { status: statusFilter } : {};

  const [referrals, total] = await Promise.all([
    db.referral.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        inviter: { select: { customerId: true, phoneE164: true, email: true } },
        referred: { select: { customerId: true, phoneE164: true, email: true } },
      },
    }),
    db.referral.count({ where }),
  ]);

  const data = referrals.map((r) => ({
    id: r.id,
    inviterCustomerId: r.inviterCustomerId,
    inviterPhone: r.inviter.phoneE164,
    inviterEmail: r.inviter.email,
    referredCustomerId: r.referredCustomerId,
    referredPhone: r.referred.phoneE164,
    referredEmail: r.referred.email,
    referralCodeUsed: r.referralCodeUsed,
    status: r.status,
    linkedAt: r.linkedAt.toISOString(),
    trialCreditedAt: r.trialCreditedAt?.toISOString() ?? null,
    phase1CreditedAt: r.phase1CreditedAt?.toISOString() ?? null,
    phase2CreditedAt: r.phase2CreditedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  return NextResponse.json({ referrals: data, total, page, limit });
}
