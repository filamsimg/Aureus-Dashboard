"use client";

import React from "react";
import { TechnicalSnapshot } from "@/lib/indicators";
import { Layers } from "lucide-react";

interface MtfMatrixProps {
  indicators: {
    m1: TechnicalSnapshot | null;
    m5: TechnicalSnapshot | null;
    m15: TechnicalSnapshot | null;
    h1: TechnicalSnapshot | null;
  };
}

export default function MtfMatrix({ indicators }: MtfMatrixProps) {
  const { m1, m5, m15, h1 } = indicators;

  const renderCol = (tf: string, label: string, data: TechnicalSnapshot | null) => {
    if (!data) {
      return (
        <div className="bg-zinc-900/80 p-3.5 rounded-xl border border-zinc-800/70 text-xs sm:text-sm text-zinc-500">
          {tf} Memuat...
        </div>
      );
    }

    const isBullSupertrend = data.supertrend === "BULLISH";
    const isAboveEma = data.close >= (data.ema9 || data.ema21);

    // 4 Kondisi Dinamis & Realistis (Peka terhadap koreksi lilin mikro)
    let trendLabel = "Naik Kuat (Bull)";
    let badgeClass = "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";

    if (isBullSupertrend) {
      if (isAboveEma) {
        trendLabel = "Naik Kuat (Bull)";
        badgeClass = "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
      } else {
        trendLabel = "Koreksi Turun";
        badgeClass = "text-amber-400 bg-amber-500/10 border-amber-500/30";
      }
    } else {
      if (!isAboveEma) {
        trendLabel = "Turun Kuat (Bear)";
        badgeClass = "text-rose-400 bg-rose-500/10 border-rose-500/30";
      } else {
        trendLabel = "Pantulan Naik";
        badgeClass = "text-cyan-400 bg-cyan-500/10 border-cyan-500/30";
      }
    }

    return (
      <div className="bg-zinc-900/80 p-3.5 rounded-xl border border-zinc-800/70 text-xs sm:text-sm">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800/70">
          <span className="font-extrabold text-sm sm:text-base text-zinc-100">{tf}</span>
          <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">{label}</span>
        </div>
        <div className="space-y-1.5 text-zinc-300">
          <div className="flex justify-between items-center">
            <span className="text-zinc-400">Arah:</span>
            <span className={`font-black px-2 py-0.5 rounded-md text-[11px] border ${badgeClass}`}>
              {trendLabel}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-400">Harga:</span>
            <span className="text-zinc-100 font-extrabold tabular-nums">
              ${data.close.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-400">EMA 21:</span>
            <span className="text-zinc-300 font-bold tabular-nums">
              ${(data.ema21 || data.ema50).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-zinc-500">RSI 7:</span>
            <span className="text-zinc-400 font-medium tabular-nums">{data.rsi7 || data.rsi14}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 shadow-sm text-sm">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-800/70">
        <span className="font-extrabold text-zinc-100 text-sm sm:text-base flex items-center gap-2">
          <Layers className="w-5 h-5 text-zinc-400" />
          Matrix Multi-Timeframe (Konfluensi Arah Sinyal)
        </span>
        <span className="text-xs font-semibold text-zinc-400">M1 • M5 • M15 • H1</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {renderCol("M1", "Trigger", m1)}
        {renderCol("M5", "Scalp Utama", m5)}
        {renderCol("M15", "Struktur", m15)}
        {renderCol("H1", "Arah Tren", h1)}
      </div>
    </div>
  );
}
