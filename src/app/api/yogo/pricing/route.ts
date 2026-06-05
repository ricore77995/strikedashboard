import { getCachedPricing } from "@/lib/yogo/pricing-cache";
import { NextResponse } from "next/server";

export async function GET() {
  const pricing = await getCachedPricing();

  return NextResponse.json({
    updatedAt: pricing.updatedAt.toISOString(),
    values: pricing.data,
    source: pricing.source,
  });
}