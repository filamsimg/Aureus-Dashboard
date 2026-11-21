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
        <div className="bg-zinc-900/80 p-3 rounded-xl border border-zinc-800/70 text-xs sm:text-sm text-zinc-500">
          {tf} Memuat...
        </div>
      );
    }

    const isBull = data.supertrend === "BULLISH";
    const trendText = isBull ? "Naik (Bull)" : "Turun (Bear)";

    return (
      <div className="bg-zinc-900/80 p-3 rounded-xl border border-zinc-800/70 text-xs sm:text-sm">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800/70">
          <span className="font-extrabold text-sm sm:text-base text-zinc-100">{tf}</span>
          <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">{label}</span>
        </div>
        <div className="space-y-1.5 text-zinc-300">
          <div className="flex justify-between items-center">
            <span className="text-zinc-400">Tren:</span>
            <span className={`font-bold ${isBull ? "text-emerald-400" : "text-rose-400"}`}>
              {trendText}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-400">RSI:</span>
            <span className="text-zinc-100 font-extrabold tabular-nums">{data.rsi7 || data.rsi14}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-400">EMA 9:</span>
            <span className="text-zinc-200 font-bold tabular-nums">${data.ema9 || data.ema50}</span>
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
