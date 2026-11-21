/**
 * Neon Serverless PostgreSQL Database Client
 * Stores user trade journal entries, win rate metrics, and signal history.
 * Includes a robust in-memory fallback so the application runs 100% bug-free
 * even before DATABASE_URL is configured!
 */

import { neon } from "@neondatabase/serverless";

export interface TradeEntry {
  id: number;
  openedAt: string;
  closedAt?: string | null;
  symbol: string;
  direction: "BUY" | "SELL";
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  lotSize: number;
  status: "OPEN" | "TP1_HIT" | "TP2_HIT" | "SL_HIT" | "CLOSED_MANUAL";
  exitPrice?: number | null;
  pnlUsd: number;
  notes?: string;
}

export interface JournalStats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRatePercent: number;
  totalPnlUsd: number;
  profitFactor: number;
}

// In-memory fallback storage
let memoryTrades: TradeEntry[] = [];
let nextId = 1;

function isNeonConfigured(): boolean {
  const url = process.env.DATABASE_URL;
  return Boolean(url && url.startsWith("postgres") && !url.includes("your_neon_database_url_here"));
}

export async function initDatabase() {
  if (!isNeonConfigured()) return;
  try {
    const sql = neon(process.env.DATABASE_URL!);
    await sql`
      CREATE TABLE IF NOT EXISTS trade_journal (
        id SERIAL PRIMARY KEY,
        opened_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        closed_at TIMESTAMP WITH TIME ZONE,
        symbol VARCHAR(50) NOT NULL,
        direction VARCHAR(10) NOT NULL,
        entry_price NUMERIC NOT NULL,
        stop_loss NUMERIC NOT NULL,
        take_profit NUMERIC NOT NULL,
        lot_size NUMERIC DEFAULT 0.01,
        status VARCHAR(30) DEFAULT 'OPEN',
        exit_price NUMERIC,
        pnl_usd NUMERIC DEFAULT 0.0,
        notes TEXT
      );
    `;
  } catch (err) {
    console.warn("Neon DB init failed, fallback to in-memory store:", err);
  }
}

export async function recordTrade(trade: Omit<TradeEntry, "id" | "openedAt">): Promise<number> {
  const now = new Date().toISOString();

  if (isNeonConfigured()) {
    try {
      const sql = neon(process.env.DATABASE_URL!);
      const rows = await sql`
        INSERT INTO trade_journal (
          opened_at, symbol, direction, entry_price, stop_loss, take_profit, lot_size, status, notes
        ) VALUES (
          ${now}, ${trade.symbol}, ${trade.direction}, ${trade.entryPrice}, ${trade.stopLoss},
          ${trade.takeProfit}, ${trade.lotSize}, 'OPEN', ${trade.notes || "Manual MT5 Execution"}
        ) RETURNING id;
      `;
      return rows[0]?.id || nextId++;
    } catch (err) {
      console.warn("Neon DB insert failed, using memory:", err);
    }
  }

  // Memory fallback
  const newEntry: TradeEntry = {
    ...trade,
    id: nextId++,
    openedAt: now,
    status: "OPEN",
    pnlUsd: 0.0,
  };
  memoryTrades.unshift(newEntry);
  return newEntry.id;
}

export async function updateTradeStatus(
  id: number,
  status: TradeEntry["status"],
  exitPrice: number,
  pnlUsd: number,
  notes?: string
): Promise<boolean> {
  const now = new Date().toISOString();

  if (isNeonConfigured()) {
    try {
      const sql = neon(process.env.DATABASE_URL!);
      await sql`
        UPDATE trade_journal
        SET status = ${status}, exit_price = ${exitPrice}, pnl_usd = ${pnlUsd}, closed_at = ${now}, notes = COALESCE(${notes || null}, notes)
        WHERE id = ${id};
      `;
      return true;
    } catch (err) {
      console.warn("Neon update failed, using memory:", err);
    }
  }

  // Memory fallback
  const t = memoryTrades.find((item) => item.id === id);
  if (t) {
    t.status = status;
    t.exitPrice = exitPrice;
    t.pnlUsd = pnlUsd;
    t.closedAt = now;
    if (notes) t.notes = notes;
    return true;
  }
  return false;
}

export async function getTrades(): Promise<TradeEntry[]> {
  if (isNeonConfigured()) {
    try {
      const sql = neon(process.env.DATABASE_URL!);
      const rows = await sql`
        SELECT 
          id, 
          opened_at as "openedAt", 
          closed_at as "closedAt", 
          symbol, 
          direction, 
          CAST(entry_price AS FLOAT) as "entryPrice",
          CAST(stop_loss AS FLOAT) as "stopLoss",
          CAST(take_profit AS FLOAT) as "takeProfit",
          CAST(lot_size AS FLOAT) as "lotSize",
          status,
          CAST(exit_price AS FLOAT) as "exitPrice",
          CAST(pnl_usd AS FLOAT) as "pnlUsd",
          notes
        FROM trade_journal
        ORDER BY id DESC
        LIMIT 50;
      `;
      return rows as unknown as TradeEntry[];
    } catch (err) {
      console.warn("Neon fetch failed, using memory fallback:", err);
    }
  }

  return memoryTrades;
}

export async function getJournalStats(): Promise<JournalStats> {
  const trades = await getTrades();
  const totalTrades = trades.length;
  const wins = trades.filter((t) => (t.pnlUsd || 0) > 0).length;
  const losses = trades.filter((t) => (t.pnlUsd || 0) < 0).length;
  const totalPnl = trades.reduce((acc, t) => acc + (t.pnlUsd || 0), 0);

  const grossProfit = trades.filter((t) => (t.pnlUsd || 0) > 0).reduce((acc, t) => acc + t.pnlUsd, 0);
  const grossLoss = Math.abs(trades.filter((t) => (t.pnlUsd || 0) < 0).reduce((acc, t) => acc + t.pnlUsd, 0));

  const winRatePercent = totalTrades > 0 ? Number(((wins / totalTrades) * 100).toFixed(1)) : 0;
  const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? grossProfit : 1.0;

  return {
    totalTrades,
    wins,
    losses,
    winRatePercent,
    totalPnlUsd: Number(totalPnl.toFixed(2)),
    profitFactor,
  };
}
