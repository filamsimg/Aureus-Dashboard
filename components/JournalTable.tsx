"use client";

import React from "react";
import { TradeEntry, JournalStats } from "@/lib/db";
import { BookOpen, CheckCircle2, AlertTriangle, User, Bot } from "lucide-react";

interface JournalTableProps {
  trades: TradeEntry[];
  stats: JournalStats;
  onUpdateStatus?: (id: number, status: TradeEntry["status"], exitPrice: number, pnlUsd: number) => void;
}

export default function JournalTable({ trades, stats }: JournalTableProps) {
  return (
    <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 shadow-sm text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-3 border-b border-zinc-800/60">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-zinc-400" />
          <span className="font-semibold text-zinc-200">
            Riwayat Transaksi Real MetaTrader 5 (Ground Truth Exness)
          </span>
        </div>

        {/* Stats Pills */}
        <div className="flex flex-wrap items-center gap-2 text-zinc-400 text-xs">
          <span className="bg-zinc-900/80 px-2.5 py-1 rounded-lg border border-zinc-800">
            Total Trade: <strong className="text-zinc-100 font-bold ml-1">{stats.totalTrades}</strong>
          </span>
          <span className="bg-zinc-900/80 px-2.5 py-1 rounded-lg border border-zinc-800">
            Menang: <strong className="text-emerald-400 font-bold ml-1">{stats.wins}</strong>
          </span>
          <span className="bg-zinc-900/80 px-2.5 py-1 rounded-lg border border-zinc-800">
            Rugi: <strong className="text-rose-400 font-bold ml-1">{stats.losses}</strong>
          </span>
          <span className="bg-zinc-900/80 px-2.5 py-1 rounded-lg border border-zinc-800">
            Win Rate: <strong className="text-emerald-400 font-bold ml-1">{stats.winRatePercent}%</strong>
          </span>
          <span className="bg-zinc-900/80 px-2.5 py-1 rounded-lg border border-zinc-800">
            Akumulasi PnL:{" "}
            <strong className={`font-bold ml-1 ${stats.totalPnlUsd >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {stats.totalPnlUsd >= 0 ? "+" : ""}${stats.totalPnlUsd.toFixed(2)} USD
            </strong>
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto custom-scroll">
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead className="bg-zinc-900/60 text-zinc-400 border-b border-zinc-800/60">
            <tr>
              <th className="py-2.5 px-3 font-semibold text-[11px] uppercase tracking-wider">Waktu</th>
              <th className="py-2.5 px-3 font-semibold text-[11px] uppercase tracking-wider">Tiket</th>
              <th className="py-2.5 px-3 font-semibold text-[11px] uppercase tracking-wider">Aksi</th>
              <th className="py-2.5 px-3 font-semibold text-[11px] uppercase tracking-wider">Harga</th>
              <th className="py-2.5 px-3 font-semibold text-[11px] uppercase tracking-wider">Lot</th>
              <th className="py-2.5 px-3 font-semibold text-[11px] uppercase tracking-wider">Hasil (PnL)</th>
              <th className="py-2.5 px-3 font-semibold text-[11px] uppercase tracking-wider">Sumber</th>
              <th className="py-2.5 px-3 font-semibold text-[11px] uppercase tracking-wider">Keterangan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50 text-zinc-300">
            {trades.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-zinc-500">
                  Belum ada riwayat transaksi di akun Exness MT5. Bot akan mencatat otomatis begitu order selesai.
                </td>
              </tr>
            ) : (
              trades.slice(0, 20).map((t) => {
                const isBuy = t.direction === "BUY";
                const isProfit = t.pnlUsd > 0;
                const isLoss = t.pnlUsd < 0;
                const isBot = t.notes?.includes("Sniper Bot");

                return (
                  <tr key={t.id} className="hover:bg-zinc-900/40 transition">
                    <td className="py-2.5 px-3 text-zinc-400">
                      {new Date(t.openedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </td>
                    <td className="py-2.5 px-3 text-zinc-400 font-mono text-[11px]">#{t.id}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isBuy
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                            : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                        }`}
                      >
                        {t.direction}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-zinc-100 tabular-nums">
                      ${t.entryPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-3 text-zinc-400 tabular-nums">{t.lotSize}</td>
                    <td className="py-2.5 px-3 tabular-nums font-bold">
                      {t.pnlUsd !== 0 ? (
                        <span className={isProfit ? "text-emerald-400" : "text-rose-400"}>
                          {isProfit ? "+" : ""}${t.pnlUsd.toFixed(2)} USD
                        </span>
                      ) : (
                        <span className="text-zinc-500">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                          isBot
                            ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/30"
                            : "bg-zinc-800 text-zinc-300 border-zinc-700"
                        }`}
                      >
                        {isBot ? <Bot className="w-3 h-3 text-cyan-400" /> : <User className="w-3 h-3 text-zinc-400" />}
                        <span>{isBot ? "Bot MT5" : "Manual MT5"}</span>
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-zinc-400 text-[11px] truncate max-w-[220px]">
                      {t.notes}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
