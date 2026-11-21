"use client";

import React from "react";
import { RiskProfile } from "@/lib/scalpEngine";
import { ShieldCheck, AlertTriangle } from "lucide-react";

interface RiskCardProps {
  risk: RiskProfile;
}

export default function RiskCard({ risk }: RiskCardProps) {
  const isDanger = risk.safetyRating.includes("PASAR LIAR");

  return (
    <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 shadow-sm text-sm">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-800/70">
        <span className="font-extrabold text-zinc-100 text-sm sm:text-base flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          Kalkulator Risiko ($20 Real Standard)
        </span>
        <span
          className={`px-3 py-1 rounded-full text-xs font-black tracking-wide ${
            isDanger
              ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
              : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
          }`}
        >
          {risk.safetyRating}
        </span>
      </div>

      {/* Grid Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3.5 text-sm">
        <div className="bg-zinc-900/80 p-3 rounded-xl border border-zinc-800/70">
          <span className="text-xs uppercase tracking-wider font-bold text-zinc-400 block mb-1">Lot MT5</span>
          <span className="font-black text-base sm:text-lg text-amber-300 tabular-nums">{risk.fixedLot} lot</span>
        </div>
        <div className="bg-zinc-900/80 p-3 rounded-xl border border-zinc-800/70">
          <span className="text-xs uppercase tracking-wider font-bold text-zinc-400 block mb-1">Rugi Max (SL)</span>
          <span className="font-black text-base sm:text-lg text-rose-400 tabular-nums">
            -${risk.maxLossUsd} ({risk.maxLossPercent}%)
          </span>
        </div>
        <div className="bg-zinc-900/80 p-3 rounded-xl border border-zinc-800/70">
          <span className="text-xs uppercase tracking-wider font-bold text-zinc-400 block mb-1">Target TP1</span>
          <span className="font-black text-base sm:text-lg text-emerald-400 tabular-nums">+${risk.profitTp1Usd}</span>
        </div>
        <div className="bg-zinc-900/80 p-3 rounded-xl border border-zinc-800/70">
          <span className="text-xs uppercase tracking-wider font-bold text-zinc-400 block mb-1">Margin Exness</span>
          <span className="font-black text-base sm:text-lg text-zinc-200 tabular-nums">~${risk.marginRequiredUsd}</span>
        </div>
      </div>

      {/* Advice Note */}
      <div className="text-xs sm:text-sm text-zinc-200 leading-relaxed bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-800/60 flex items-start gap-2.5 font-medium">
        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <span>{risk.advice}</span>
      </div>
    </div>
  );
}
