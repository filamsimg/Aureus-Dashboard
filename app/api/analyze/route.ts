import { NextRequest, NextResponse } from "next/server";
import { fetchCandles } from "@/lib/marketData";
import { evaluateScalp } from "@/lib/scalpEngine";
import { reviewScalpWithGemini } from "@/lib/gemini";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode") || "active";
    const capital = parseFloat(searchParams.get("capital") || "20.0");

    // 100% Token & Bandwidth Saving when in Standby Mode!
    if (mode === "standby") {
      return NextResponse.json({
        status: "standby",
        message: "Mode Standby Aktif: Pemindaian pasar dihentikan (Hemat Token)",
        signal: null,
      });
    }

    // Parallel fetch multi-timeframe candles
    const [m1, m5, m15, h1] = await Promise.all([
      fetchCandles("M1", 40),
      fetchCandles("M5", 40),
      fetchCandles("M15", 40),
      fetchCandles("H1", 40),
    ]);

    const signal = evaluateScalp(m1, m5, m15, h1, capital);

    return NextResponse.json({
      status: "success",
      timestamp: new Date().toISOString(),
      signal,
    });
  } catch (error: any) {
    return NextResponse.json({ status: "error", message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { signal, customApiKey } = body;

    if (!signal) {
      return NextResponse.json({ status: "error", message: "Signal payload required" }, { status: 400 });
    }

    const aiReview = await reviewScalpWithGemini(signal, customApiKey);

    return NextResponse.json({
      status: "success",
      review: aiReview,
    });
  } catch (error: any) {
    return NextResponse.json({ status: "error", message: error.message }, { status: 500 });
  }
}
