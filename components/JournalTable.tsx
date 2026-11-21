"use client";

import React from "react";
import { TradeEntry, JournalStats } from "@/lib/db";
import { BookOpen } from "lucide-react";

interface JournalTableProps {
  trades: TradeEntry[];
  stats: JournalStats;
  onUpdateStatus: (id: number, status: TradeEntry["status"], exitPrice: number, pnlUsd: number) => void;
}

export default function JournalTable({ trades, stats, onUpdateStatus }: JournalTableProps) {
  return (
    <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 shadow-sm text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-3 border-b border-zinc-800/60">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-zinc-400" />
          <span className="font-semibold text-zinc-200">
            Jurnal Riwayat Trade & Evaluasi Manual
          </span>
        </div>

        {/* Stats Pills */}
        <div className="flex flex-wrap items-center gap-2 text-zinc-400 text-xs">
          <span className="bg-zinc-900/80 px-2.5 py-1 rounded-lg border border-zinc-800">
            Total: <strong className="text-zinc-100 font-bold ml-1">{stats.totalTrades}</strong>
          </span>
          <span className="bg-zinc-900/80 px-2.5 py-1 rounded-lg border border-zinc-800">
            Win Rate: <strong className="text-emerald-400 font-bold ml-1">{stats.winRatePercent}%</strong>
          </span>
          <span className="bg-zinc-900/80 px-2.5 py-1 rounded-lg border border-zinc-800">
            PnL:{" "}
            <strong className={`font-bold ml-1 ${stats.totalPnlUsd >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {stats.totalPnlUsd >= 0 ? "+" : ""}${stats.totalPnlUsd.toFixed(2)}
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
              <th className="py-2.5 px-3 font-semibold text-[11px] uppercase tracking-wider">Aksi</th>
              <th className="py-2.5 px-3 font-semibold text-[11px] uppercase tracking-wider">Entry</th>
              <th className="py-2.5 px-3 font-semibold text-[11px] uppercase tracking-wider">Batas Rugi</th>
              <th className="py-2.5 px-3 font-semibold text-[11px] uppercase tracking-wider">Target Untung</th>
              <th className="py-2.5 px-3 font-semibold text-[11px] uppercase tracking-wider">Lot</th>
              <th className="py-2.5 px-3 font-semibold text-[11px] uppercase tracking-wider">Status</th>
              <th className="py-2.5 px-3 font-semibold text-[11px] uppercase tracking-wider">Hasil ($)</th>
              <th className="py-2.5 px-3 font-semibold text-[11px] uppercase tracking-wider text-right">Update Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50 text-zinc-300">
            {trades.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-zinc-500">
                  Belum ada catatan order di jurnal. Klik tombol <strong>&quot;Catat Order Ini ke Jurnal&quot;</strong> saat sinyal muncul.
                </td>
              </tr>
            ) : (
              trades.map((t) => {
                const isBuy = t.direction === "BUY";
                const isWin = t.status === "TP1_HIT" || t.status === "TP2_HIT";
                const isLoss = t.status === "SL_HIT";

                return (
                  <tr key={t.id} className="hover:bg-zinc-900/40 transition">
                    <td className="py-2.5 px-3 text-zinc-400">
                      {new Date(t.openedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isBuy ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                        }`}
                      >
                        {t.direction}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-zinc-100 tabular-nums">${t.entryPrice}</td>
                    <td className="py-2.5 px-3 text-rose-400 tabular-nums">${t.stopLoss}</td>
                    <td className="py-2.5 px-3 text-emerald-400 tabular-nums">${t.takeProfit}</td>
                    <td className="py-2.5 px-3 text-zinc-400 tabular-nums">{t.lotSize}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isWin
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                            : isLoss
                            ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      {t.pnlUsd !== undefined && t.status !== "OPEN" ? (
                        <span className={`font-bold tabular-nums ${t.pnlUsd >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {t.pnlUsd >= 0 ? "+" : ""}${t.pnlUsd.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-zinc-600">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {t.status === "OPEN" ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onUpdateStatus(t.id, "TP1_HIT", t.takeProfit, 1.30)}
                            className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded-lg text-[11px] font-semibold transition active:scale-95"
                          >
                            Untung (TP)
                          </button>
                          <button
                            onClick={() => onUpdateStatus(t.id, "SL_HIT", t.stopLoss, -0.90)}
                            className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2 py-1 rounded-lg text-[11px] font-semibold transition active:scale-95"
                          >
                            Rugi (SL)
                          </button>
                        </div>
                      ) : (
                        <span className="text-zinc-500 text-[11px]">Selesai</span>
                      )}
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
