import { forceRefreshPricing } from "@/lib/yogo/pricing-cache";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const fresh = await forceRefreshPricing();

    return NextResponse.json({
      success: true,
      updatedAt: fresh.updatedAt.toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to refresh pricing",
      },
      { status: 500 }
    );
  }
}