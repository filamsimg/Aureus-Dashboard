import { NextRequest, NextResponse } from "next/server";
import { fetchCandles } from "@/lib/marketData";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tf = searchParams.get("tf") || "M5";
    const limit = parseInt(searchParams.get("limit") || "60", 10);

    const candles = await fetchCandles(tf, limit);
    return NextResponse.json({
      status: "success",
      timeframe: tf,
      count: candles.length,
      candles,
    });
  } catch (error: any) {
    return NextResponse.json({ status: "error", message: error.message }, { status: 500 });
  }
}
