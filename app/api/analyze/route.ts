import { NextRequest, NextResponse } from "next/server";
import { fetchCandles } from "@/lib/marketData";
import { evaluateScalp, ScalpSignal, RiskProfile } from "@/lib/scalpEngine";
import { analyzeCandles } from "@/lib/indicators";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode") || "active";
    const capital = parseFloat(searchParams.get("capital") || "31.85");

    if (mode === "standby") {
      return NextResponse.json({
        status: "standby",
        message: "Mode Standby Aktif: Pemindaian pasar dihentikan (Hemat Token)",
        signal: null,
      });
    }

    // 1. PRIORITY 1: Fetch Ground Truth Analysis directly from VPS Autonomous Engine (SSOT)
    const vpsUrl = process.env.VPS_BRIDGE_URL;
    if (vpsUrl) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1800); // 1.8s timeout
        const vpsRes = await fetch(`${vpsUrl}/api/analysis`, {
          signal: controller.signal,
          cache: "no-store",
        });
        clearTimeout(timeout);

        if (vpsRes.ok) {
          const vpsData = await vpsRes.json();
          const ana = vpsData?.analysis;
          if (ana && ana.status === "active") {
            // Fetch candles for chart price reference and Multi-Timeframe Matrix calculation
            const [cM1, cM5, cM15, cH1] = await Promise.all([
              fetchCandles("M1", 50),
              fetchCandles("M5", 50),
              fetchCandles("M15", 50),
              fetchCandles("H1", 50),
            ]);
            const currentPrice = cM5[cM5.length - 1]?.close || 60000;
            const slDist = 80.0;
            const tp1Dist = 120.0;
            const tp2Dist = 200.0;

            const isBuy = ana.direction === "BUY";
            const isSell = ana.direction === "SELL";
            const slPrice = isBuy ? currentPrice - slDist : isSell ? currentPrice + slDist : currentPrice - slDist;
            const tp1Price = isBuy ? currentPrice + tp1Dist : isSell ? currentPrice - tp1Dist : currentPrice + tp1Dist;
            const tp2Price = isBuy ? currentPrice + tp2Dist : isSell ? currentPrice - tp2Dist : currentPrice + tp2Dist;

            const maxLossUsd = Number((slDist * 0.01).toFixed(2));
            const maxLossPct = Number(((maxLossUsd / capital) * 100).toFixed(1));

            const risk: RiskProfile = {
              accountType: "Exness Real Standard (BTCUSD)",
              capital,
              fixedLot: 0.01,
              slDistancePoints: slDist,
              maxLossUsd,
              maxLossPercent: maxLossPct,
              profitTp1Usd: Number((tp1Dist * 0.01).toFixed(2)),
              profitTp2Usd: Number((tp2Dist * 0.01).toFixed(2)),
              profitTp3Usd: Number(((tp1Dist + 100) * 0.01).toFixed(2)),
              marginRequiredUsd: Number(((currentPrice * 0.01) / 2000).toFixed(2)),
              safetyRating: ana.signal === "PASAR LIAR (TUNGGU)" ? "PASAR LIAR (DITOLAK)" : "AMAN",
              volatilityWarning: ana.signal === "PASAR LIAR (TUNGGU)",
              advice: ana.is_paused
                ? "Bot sedang dijeda via Telegram (/start untuk mengaktifkan order)."
                : "Bot berjalan 24/7 otonom di VPS Exness Real.",
            };

            const ssg: ScalpSignal & { isPaused?: boolean; vpsLive?: boolean } = {
              signal: ana.signal,
              direction: ana.direction,
              score: ana.score,
              confidencePercent: ana.confidencePercent,
              entryPrice: currentPrice,
              stopLoss: Number(slPrice.toFixed(2)),
              slDistance: slDist,
              takeProfit1: Number(tp1Price.toFixed(2)),
              takeProfit2: Number(tp2Price.toFixed(2)),
              takeProfit3: Number(tp2Price.toFixed(2)),
              rrTp1: "1:1.5",
              rrTp2: "1:2.5",
              risk,
              indicators: {
                m1: analyzeCandles(cM1),
                m5: analyzeCandles(cM5),
                m15: analyzeCandles(cM15),
                h1: analyzeCandles(cH1),
              },
              reasons: ana.reasons || [],
              invalidation: `Cut loss terukur di $${slPrice.toFixed(2)} (-$0.80 USD)`,
              actionGuide: ana.is_paused
                ? "Bot saat ini berstatus DIJEDA. Ketik /start di Telegram untuk mengaktifkan kembali."
                : "Bot beroperasi otonom di VPS. Eksekusi 0.01 lot otomatis saat setup terkonfirmasi.",
              isPaused: ana.is_paused,
              vpsLive: true,
            };

            return NextResponse.json({
              status: "success",
              source: "VPS_AUTONOMOUS_ENGINE_SSOT",
              timestamp: new Date().toISOString(),
              signal: ssg,
            });
          }
        }
      } catch (vpsErr) {
        // Fall through to standalone calculation if VPS offline
      }
    }

    // 2. PRIORITY 2: Standalone Fallback Calculation
    const [m1, m5, m15, h1] = await Promise.all([
      fetchCandles("M1", 50),
      fetchCandles("M5", 50),
      fetchCandles("M15", 50),
      fetchCandles("H1", 50),
    ]);

    const signal = evaluateScalp(m1, m5, m15, h1, capital);

    return NextResponse.json({
      status: "success",
      source: "STANDALONE_FALLBACK",
      timestamp: new Date().toISOString(),
      signal,
    });
  } catch (error: any) {
    return NextResponse.json({ status: "error", message: error.message }, { status: 500 });
  }
}
