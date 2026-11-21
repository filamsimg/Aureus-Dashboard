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
    <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-4 shadow-sm text-xs">
      <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-zinc-800/60">
        <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Kalkulator Risiko ($20 Real Standard)
        </span>
        <span
          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${
            isDanger
              ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
              : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
          }`}
        >
          {risk.safetyRating}
        </span>
      </div>

      {/* Grid Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2.5 text-xs">
        <div className="bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800/60">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400 block mb-0.5">Lot MT5</span>
          <span className="font-bold text-zinc-100 tabular-nums">{risk.fixedLot} lot</span>
        </div>
        <div className="bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800/60">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400 block mb-0.5">Rugi Max (SL)</span>
          <span className="font-bold text-rose-400 tabular-nums">
            -${risk.maxLossUsd} ({risk.maxLossPercent}%)
          </span>
        </div>
        <div className="bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800/60">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400 block mb-0.5">Target TP1</span>
          <span className="font-bold text-emerald-400 tabular-nums">+${risk.profitTp1Usd}</span>
        </div>
        <div className="bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800/60">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400 block mb-0.5">Margin Exness</span>
          <span className="font-semibold text-zinc-300 tabular-nums">~${risk.marginRequiredUsd}</span>
        </div>
      </div>

      {/* Advice Note */}
      <div className="text-xs text-zinc-400 leading-relaxed bg-zinc-900/40 p-2.5 rounded-xl border border-zinc-800/50 flex items-start gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
        <span>{risk.advice}</span>
      </div>
    </div>
  );
}
