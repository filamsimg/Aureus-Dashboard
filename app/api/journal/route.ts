import { NextRequest, NextResponse } from "next/server";
import { recordTrade, updateTradeStatus, getTrades, getJournalStats, initDatabase, TradeEntry, JournalStats } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // 1. PRIORITY 1: Fetch Real Deals directly from VPS MT5 Terminal (Ground Truth)
    const vpsUrl = process.env.VPS_BRIDGE_URL;
    if (vpsUrl) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(`${vpsUrl}/api/history`, {
          signal: controller.signal,
          cache: "no-store",
        });
        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json();
          const deals = data.deals;
          if (Array.isArray(deals) && deals.length > 0) {
            const formattedTrades: TradeEntry[] = deals.map((d: any) => {
              const isProfit = d.profit > 0;
              const isLoss = d.profit < 0;
              let status: TradeEntry["status"] = "OPEN";
              if (isProfit) status = "TP1_HIT";
              else if (isLoss) status = "SL_HIT";
              else status = "CLOSED_MANUAL";

              return {
                id: d.ticket,
                openedAt: new Date(d.time * 1000).toISOString(),
                symbol: d.symbol || "BTCUSDm",
                direction: d.type === "BUY" ? "BUY" : "SELL",
                entryPrice: d.price,
                stopLoss: 0,
                takeProfit: 0,
                lotSize: d.volume || 0.01,
                status,
                exitPrice: d.price,
                pnlUsd: d.profit,
                notes: d.is_bot
                  ? "🤖 Aureus Sniper Bot (Magic #778898)"
                  : d.comment
                  ? `👤 Manual MT5 Trade (${d.comment})`
                  : "👤 Manual MT5 Trade",
              };
            });

            // Calculate live stats from real MT5 deals
            const closed = formattedTrades.filter((t) => t.pnlUsd !== 0);
            const wins = closed.filter((t) => t.pnlUsd > 0).length;
            const losses = closed.filter((t) => t.pnlUsd < 0).length;
            const totalPnl = closed.reduce((acc, t) => acc + t.pnlUsd, 0);
            const grossProfit = closed.filter((t) => t.pnlUsd > 0).reduce((acc, t) => acc + t.pnlUsd, 0);
            const grossLoss = Math.abs(closed.filter((t) => t.pnlUsd < 0).reduce((acc, t) => acc + t.pnlUsd, 0));

            const stats: JournalStats = {
              totalTrades: closed.length,
              wins,
              losses,
              winRatePercent: closed.length > 0 ? Number(((wins / closed.length) * 100).toFixed(1)) : 0,
              totalPnlUsd: Number(totalPnl.toFixed(2)),
              profitFactor: grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? 99.0 : 1.0,
            };

            return NextResponse.json({
              status: "success",
              source: "VPS_MT5_REAL_DEALS",
              trades: formattedTrades,
              stats,
            });
          }
        }
      } catch (vpsErr) {
        // Fall through to Neon DB if VPS is unreachable
      }
    }

    // 2. Fallback to Neon DB
    await initDatabase();
    const [trades, stats] = await Promise.all([getTrades(), getJournalStats()]);
    return NextResponse.json({
      status: "success",
      source: "NEON_DATABASE_FALLBACK",
      trades,
      stats,
    });
  } catch (error: any) {
    return NextResponse.json({ status: "error", message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await initDatabase();
    const body = await req.json();
    const tradeId = await recordTrade({
      symbol: body.symbol || "BTCUSD",
      direction: body.direction || "BUY",
      entryPrice: parseFloat(body.entryPrice),
      stopLoss: parseFloat(body.stopLoss),
      takeProfit: parseFloat(body.takeProfit),
      lotSize: parseFloat(body.lotSize || "0.01"),
      status: "OPEN",
      pnlUsd: 0.0,
      notes: body.notes || "Manual MT5 Scalp",
    });

    return NextResponse.json({ status: "success", tradeId });
  } catch (error: any) {
    return NextResponse.json({ status: "error", message: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await initDatabase();
    const body = await req.json();
    const { id, status, exitPrice, pnlUsd } = body;

    await updateTradeStatus(
      parseInt(id),
      status as TradeEntry["status"],
      parseFloat(exitPrice),
      parseFloat(pnlUsd)
    );

    return NextResponse.json({ status: "success" });
  } catch (error: any) {
    return NextResponse.json({ status: "error", message: error.message }, { status: 500 });
  }
}
