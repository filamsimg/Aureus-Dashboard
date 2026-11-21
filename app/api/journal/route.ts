import { NextRequest, NextResponse } from "next/server";
import { recordTrade, updateTradeStatus, getTrades, getJournalStats, initDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await initDatabase();
    const [trades, stats] = await Promise.all([getTrades(), getJournalStats()]);
    return NextResponse.json({
      status: "success",
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
    const { id, status, exitPrice, pnlUsd, notes } = body;

    const ok = await updateTradeStatus(
      Number(id),
      status,
      parseFloat(exitPrice || "0"),
      parseFloat(pnlUsd || "0"),
      notes
    );

    return NextResponse.json({ status: ok ? "success" : "not_found" });
  } catch (error: any) {
    return NextResponse.json({ status: "error", message: error.message }, { status: 500 });
  }
}
