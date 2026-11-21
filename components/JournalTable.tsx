"use client";

import React, { useState, useMemo } from "react";
import { TradeEntry, JournalStats } from "@/lib/db";
import {
  BookOpen,
  Bot,
  User,
  Calendar,
  Clock,
  TrendingUp,
  TrendingDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  DollarSign,
  Award,
} from "lucide-react";

interface JournalTableProps {
  trades: TradeEntry[];
  stats: JournalStats;
  onUpdateStatus?: (id: number, status: TradeEntry["status"], exitPrice: number, pnlUsd: number) => void;
}

export default function JournalTable({ trades, stats }: JournalTableProps) {
  // Filter states
  const [sourceFilter, setSourceFilter] = useState<"ALL" | "BOT" | "MANUAL">("ALL");
  const [timeFilter, setTimeFilter] = useState<"ALL" | "TODAY" | "WEEK">("ALL");

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 10;

  // Timestamps for filtering
  const { startOfToday, sevenDaysAgo } = useMemo(() => {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime();
    const week = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    return { startOfToday: today, sevenDaysAgo: week };
  }, []);

  // Filter trades based on active time period (independent of source filter)
  const timeFilteredTrades = useMemo(() => {
    return trades.filter((t) => {
      const tradeTime = new Date(t.openedAt).getTime();
      if (timeFilter === "TODAY" && tradeTime < startOfToday) return false;
      if (timeFilter === "WEEK" && tradeTime < sevenDaysAgo) return false;
      return true;
    });
  }, [trades, timeFilter, startOfToday, sevenDaysAgo]);

  // Compute dynamic KPI stats reflecting the selected time filter
  const activeStats = useMemo(() => {
    if (timeFilter === "ALL") {
      return stats;
    }

    const closed = timeFilteredTrades.filter((t) => t.pnlUsd !== 0);
    const wins = closed.filter((t) => t.pnlUsd > 0).length;
    const losses = closed.filter((t) => t.pnlUsd < 0).length;
    const totalPnl = closed.reduce((acc, t) => acc + t.pnlUsd, 0);

    const botTrades = closed.filter(
      (t) => t.source === "BOT" || t.notes?.includes("Aureus") || t.notes?.includes("Magic #778898")
    );
    const botWins = botTrades.filter((t) => t.pnlUsd > 0).length;
    const botLosses = botTrades.filter((t) => t.pnlUsd < 0).length;
    const botPnlUsd = Number(botTrades.reduce((acc, t) => acc + t.pnlUsd, 0).toFixed(2));
    const botWinRatePercent =
      botTrades.length > 0 ? Number(((botWins / botTrades.length) * 100).toFixed(1)) : 0;

    const manualTrades = closed.filter(
      (t) => !(t.source === "BOT" || t.notes?.includes("Aureus") || t.notes?.includes("Magic #778898"))
    );
    const manualWins = manualTrades.filter((t) => t.pnlUsd > 0).length;
    const manualLosses = manualTrades.filter((t) => t.pnlUsd < 0).length;
    const manualPnlUsd = Number(manualTrades.reduce((acc, t) => acc + t.pnlUsd, 0).toFixed(2));
    const manualWinRatePercent =
      manualTrades.length > 0 ? Number(((manualWins / manualTrades.length) * 100).toFixed(1)) : 0;

    return {
      ...stats,
      totalTrades: closed.length,
      wins,
      losses,
      winRatePercent: closed.length > 0 ? Number(((wins / closed.length) * 100).toFixed(1)) : 0,
      totalPnlUsd: Number(totalPnl.toFixed(2)),
      botPnlUsd,
      botWins,
      botLosses,
      botWinRatePercent,
      manualPnlUsd,
      manualWins,
      manualLosses,
      manualWinRatePercent,
    };
  }, [timeFilter, timeFilteredTrades, stats]);

  const periodLabel = timeFilter === "TODAY" ? "Hari Ini" : timeFilter === "WEEK" ? "7 Hari" : "Semua Waktu";

  // Filtered trades (Combines Source + Time for Table Rows)
  const filteredTrades = useMemo(() => {
    return trades.filter((t) => {
      // 1. Source Filter
      const isBot = t.source === "BOT" || t.notes?.includes("Aureus") || t.notes?.includes("Magic #778898");
      if (sourceFilter === "BOT" && !isBot) return false;
      if (sourceFilter === "MANUAL" && isBot) return false;

      // 2. Time Filter
      const tradeTime = new Date(t.openedAt).getTime();
      if (timeFilter === "TODAY" && tradeTime < startOfToday) return false;
      if (timeFilter === "WEEK" && tradeTime < sevenDaysAgo) return false;

      return true;
    });
  }, [trades, sourceFilter, timeFilter, startOfToday, sevenDaysAgo]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredTrades.length / itemsPerPage));
  const validPage = Math.min(currentPage, totalPages);
  const startIndex = (validPage - 1) * itemsPerPage;
  const paginatedTrades = filteredTrades.slice(startIndex, startIndex + itemsPerPage);

  // Counts for pills
  const botCount = useMemo(
    () => trades.filter((t) => t.source === "BOT" || t.notes?.includes("Aureus")).length,
    [trades]
  );
  const manualCount = useMemo(
    () => trades.filter((t) => t.source === "MANUAL" || (!t.source && !t.notes?.includes("Aureus"))).length,
    [trades]
  );

  return (
    <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 shadow-sm text-xs space-y-4">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-800/70">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-cyan-400" />
          <span className="font-extrabold text-sm sm:text-base text-zinc-100">
            Riwayat Transaksi Real MetaTrader 5 (Ground Truth Exness)
          </span>
        </div>
        <span className="text-[11px] text-zinc-400 bg-zinc-900 px-3 py-1 rounded-full border border-zinc-800">
          Otomatis sinkron dari server VPS • Data Live
        </span>
      </div>

      {/* 4 Analytics Breakdown Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        {/* Card 1: Total Akumulasi PnL */}
        <div className="bg-zinc-900/80 p-3.5 rounded-xl border border-zinc-800/70 flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400 mb-1">
            <span className="font-semibold flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" /> Total PnL ({periodLabel})
            </span>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
              {activeStats.totalTrades} Trade
            </span>
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <span
              className={`text-lg font-black tabular-nums ${
                activeStats.totalPnlUsd >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {activeStats.totalPnlUsd >= 0 ? "+" : ""}${activeStats.totalPnlUsd.toFixed(2)} USD
            </span>
            <span className="text-[11px] font-bold text-emerald-400">
              Win Rate: {activeStats.winRatePercent}%
            </span>
          </div>
          <div className="text-[10px] text-zinc-500 mt-1 flex justify-between">
            <span>{activeStats.wins} Menang</span>
            <span>{activeStats.losses} Rugi</span>
          </div>
        </div>

        {/* Card 2: Pendapatan Bot MT5 */}
        <div className="bg-zinc-900/80 p-3.5 rounded-xl border border-cyan-500/20 flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400 mb-1">
            <span className="font-semibold flex items-center gap-1.5 text-cyan-300">
              <Bot className="w-3.5 h-3.5 text-cyan-400" /> Bot ({periodLabel})
            </span>
            <span className="text-[10px] bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-full font-bold">
              Magic #778898
            </span>
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <span
              className={`text-lg font-black tabular-nums ${
                (activeStats.botPnlUsd || 0) >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {(activeStats.botPnlUsd || 0) >= 0 ? "+" : ""}${(activeStats.botPnlUsd || 0).toFixed(2)} USD
            </span>
            <span className="text-[11px] font-bold text-cyan-300">
              Win Rate: {activeStats.botWinRatePercent || 0}%
            </span>
          </div>
          <div className="text-[10px] text-zinc-500 mt-1 flex justify-between">
            <span>{activeStats.botWins || 0} Menang</span>
            <span>{activeStats.botLosses || 0} Rugi</span>
          </div>
        </div>

        {/* Card 3: Pendapatan Manual MT5 */}
        <div className="bg-zinc-900/80 p-3.5 rounded-xl border border-zinc-800/70 flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400 mb-1">
            <span className="font-semibold flex items-center gap-1.5 text-zinc-300">
              <User className="w-3.5 h-3.5 text-zinc-400" /> Manual ({periodLabel})
            </span>
            <span className="text-[10px] bg-zinc-800 px-2 py-0.5 rounded-full font-bold text-zinc-400">
              User Trade
            </span>
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <span
              className={`text-lg font-black tabular-nums ${
                (activeStats.manualPnlUsd || 0) >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {(activeStats.manualPnlUsd || 0) >= 0 ? "+" : ""}${(activeStats.manualPnlUsd || 0).toFixed(2)} USD
            </span>
            <span className="text-[11px] font-bold text-zinc-300">
              Win Rate: {activeStats.manualWinRatePercent || 0}%
            </span>
          </div>
          <div className="text-[10px] text-zinc-500 mt-1 flex justify-between">
            <span>{activeStats.manualWins || 0} Menang</span>
            <span>{activeStats.manualLosses || 0} Rugi</span>
          </div>
        </div>

        {/* Card 4: Pendapatan Waktu (Harian & Mingguan) */}
        <div className="bg-zinc-900/80 p-3.5 rounded-xl border border-zinc-800/70 flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400 mb-1">
            <span className="font-semibold flex items-center gap-1.5 text-zinc-300">
              <Calendar className="w-3.5 h-3.5 text-amber-400" /> Breakdown Waktu
            </span>
            <span className="text-[10px] bg-zinc-800 px-2 py-0.5 rounded-full font-bold text-amber-300">
              Aktif: {periodLabel}
            </span>
          </div>
          <div className="space-y-1 mt-1 text-[11px]">
            <button
              onClick={() => {
                setTimeFilter("TODAY");
                setCurrentPage(1);
              }}
              className={`w-full flex justify-between items-center px-2 py-1 rounded-lg transition ${
                timeFilter === "TODAY"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  : "hover:bg-zinc-800/80 text-zinc-300"
              }`}
              title="Klik untuk filter Hari Ini"
            >
              <span className="text-zinc-400">Hari Ini:</span>
              <strong
                className={`font-black tabular-nums ${
                  (stats.todayPnlUsd || 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {(stats.todayPnlUsd || 0) >= 0 ? "+" : ""}${(stats.todayPnlUsd || 0).toFixed(2)} USD
                <span className="text-zinc-500 text-[10px] font-normal ml-1">({stats.todayTradesCount || 0})</span>
              </strong>
            </button>
            <button
              onClick={() => {
                setTimeFilter("WEEK");
                setCurrentPage(1);
              }}
              className={`w-full flex justify-between items-center px-2 py-1 rounded-lg transition ${
                timeFilter === "WEEK"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  : "hover:bg-zinc-800/80 text-zinc-300"
              }`}
              title="Klik untuk filter 7 Hari Terakhir"
            >
              <span className="text-zinc-400">7 Hari:</span>
              <strong
                className={`font-black tabular-nums ${
                  (stats.weeklyPnlUsd || 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {(stats.weeklyPnlUsd || 0) >= 0 ? "+" : ""}${(stats.weeklyPnlUsd || 0).toFixed(2)} USD
                <span className="text-zinc-500 text-[10px] font-normal ml-1">({stats.weeklyTradesCount || 0})</span>
              </strong>
            </button>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        {/* Source Filter Pills */}
        <div className="flex items-center gap-1.5 bg-zinc-900/90 p-1 rounded-xl border border-zinc-800 text-xs">
          <button
            onClick={() => {
              setSourceFilter("ALL");
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg font-bold transition ${
              sourceFilter === "ALL"
                ? "bg-zinc-800 text-zinc-100 shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Semua ({trades.length})
          </button>
          <button
            onClick={() => {
              setSourceFilter("BOT");
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition ${
              sourceFilter === "BOT"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Bot className="w-3.5 h-3.5 text-cyan-400" />
            <span>Bot MT5 ({botCount})</span>
          </button>
          <button
            onClick={() => {
              setSourceFilter("MANUAL");
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition ${
              sourceFilter === "MANUAL"
                ? "bg-zinc-800 text-zinc-100 shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <User className="w-3.5 h-3.5 text-zinc-400" />
            <span>Manual MT5 ({manualCount})</span>
          </button>
        </div>

        {/* Time Filter Pills */}
        <div className="flex items-center gap-1.5 bg-zinc-900/90 p-1 rounded-xl border border-zinc-800 text-xs">
          <button
            onClick={() => {
              setTimeFilter("ALL");
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg font-bold transition ${
              timeFilter === "ALL"
                ? "bg-zinc-800 text-zinc-100 shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Semua Waktu
          </button>
          <button
            onClick={() => {
              setTimeFilter("TODAY");
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg font-bold transition ${
              timeFilter === "TODAY"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Hari Ini
          </button>
          <button
            onClick={() => {
              setTimeFilter("WEEK");
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg font-bold transition ${
              timeFilter === "WEEK"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            7 Hari Terakhir
          </button>
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto custom-scroll rounded-xl border border-zinc-800/70">
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead className="bg-zinc-900/90 text-zinc-400 border-b border-zinc-800/80">
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
            {paginatedTrades.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-zinc-500">
                  Tidak ada transaksi yang sesuai dengan filter yang dipilih.
                </td>
              </tr>
            ) : (
              paginatedTrades.map((t) => {
                const isBuy = t.direction === "BUY";
                const isProfit = t.pnlUsd > 0;
                const isLoss = t.pnlUsd < 0;
                const isBot = t.source === "BOT" || t.notes?.includes("Aureus") || t.notes?.includes("Magic #778898");

                return (
                  <tr key={t.id} className="hover:bg-zinc-900/50 transition">
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
                        <span className={isProfit ? "text-emerald-400 font-extrabold" : "text-rose-400 font-extrabold"}>
                          {isProfit ? "+" : ""}${t.pnlUsd.toFixed(2)} USD
                        </span>
                      ) : (
                        <span className="text-zinc-500">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                          isBot
                            ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/30"
                            : "bg-zinc-800 text-zinc-300 border-zinc-700"
                        }`}
                      >
                        {isBot ? <Bot className="w-3 h-3 text-cyan-400" /> : <User className="w-3 h-3 text-zinc-400" />}
                        <span>{isBot ? "Bot MT5" : "Manual MT5"}</span>
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-zinc-400 text-[11px] truncate max-w-[240px]">
                      {t.notes}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-zinc-400">
        <div>
          Menampilkan <strong className="text-zinc-200">{filteredTrades.length > 0 ? startIndex + 1 : 0}</strong> -{" "}
          <strong className="text-zinc-200">{Math.min(startIndex + itemsPerPage, filteredTrades.length)}</strong> dari{" "}
          <strong className="text-zinc-200">{filteredTrades.length}</strong> transaksi
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={validPage === 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-zinc-100 disabled:opacity-40 disabled:hover:text-zinc-300 transition"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Sebelumnya</span>
            </button>

            <div className="flex items-center gap-1 px-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((num) => (
                <button
                  key={num}
                  onClick={() => setCurrentPage(num)}
                  className={`w-7 h-7 rounded-lg text-xs font-bold transition ${
                    validPage === num
                      ? "bg-emerald-500 text-zinc-950 shadow-xs"
                      : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={validPage === totalPages}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-zinc-100 disabled:opacity-40 disabled:hover:text-zinc-300 transition"
            >
              <span>Berikutnya</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
