import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { COOKIE_NAME } from "@/lib/auth";

/**
 * POST /api/strikelab/admin/backfill-consent
 *
 * One-time backfill: set consentTraining=true + optInAt=createdAt for all
 * existing non-erased identities that haven't opted in yet.
 */
export async function POST(req: NextRequest) {
  const cookie = req.cookies.get(COOKIE_NAME);
  if (!cookie?.value) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await db.gamificationIdentity.updateMany({
    where: {
      consentTraining: false,
      erasedAt: null,
      optInAt: null,
    },
    data: {
      consentTraining: true,
      optInAt: new Date(),
    },
  });

  return NextResponse.json({ updated: result.count });
}
