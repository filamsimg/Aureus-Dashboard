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
        <div className="bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800/60 text-xs text-zinc-500">
          {tf} Memuat...
        </div>
      );
    }

    const isBull = data.supertrend === "BULLISH";
    const trendText = isBull ? "Naik (Bull)" : "Turun (Bear)";

    return (
      <div className="bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800/60 text-xs">
        <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-zinc-800/60">
          <span className="font-bold text-zinc-100">{tf}</span>
          <span className="text-[10px] text-zinc-400 uppercase tracking-wider">{label}</span>
        </div>
        <div className="space-y-1 text-zinc-400">
          <div className="flex justify-between items-center">
            <span>Tren:</span>
            <span className={`font-semibold ${isBull ? "text-emerald-400" : "text-rose-400"}`}>
              {trendText}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span>RSI:</span>
            <span className="text-zinc-200 font-bold tabular-nums">{data.rsi7 || data.rsi14}</span>
          </div>
          <div className="flex justify-between items-center">
            <span>EMA 9:</span>
            <span className="text-zinc-300 tabular-nums">${data.ema9 || data.ema50}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-4 shadow-sm text-xs">
      <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-zinc-800/60">
        <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
          <Layers className="w-4 h-4 text-zinc-400" />
          Matrix Multi-Timeframe (Konfluensi Arah)
        </span>
        <span className="text-[11px] text-zinc-500">M1 • M5 • M15 • H1</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {renderCol("M1", "Trigger", m1)}
        {renderCol("M5", "Scalp Utama", m5)}
        {renderCol("M15", "Struktur", m15)}
        {renderCol("H1", "Arah Tren", h1)}
      </div>
    </div>
  );
}
