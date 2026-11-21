"use client";

import React from "react";
import { AiReviewResult } from "@/lib/gemini";
import { Sparkles, Smartphone, ShieldCheck, AlertCircle } from "lucide-react";

interface AiReviewCardProps {
  review: AiReviewResult | null;
  actionGuide: string;
  invalidation: string;
}

export default function AiReviewCard({ review, actionGuide, invalidation }: AiReviewCardProps) {
  const isApproved = review?.verdict === "SETUJU ENTRY";
  const isRejected = review?.verdict === "TIDAK DISARANKAN";

  return (
    <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-4 shadow-sm text-xs flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-zinc-800/60">
          <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            Evaluasi Analis AI (Gemini)
          </span>
          <span className="text-[11px] text-zinc-400 bg-zinc-800/60 px-2.5 py-0.5 rounded-full">
            {review?.source || "Analisa Kuantitatif"}
          </span>
        </div>

        {/* Headline & Verdict */}
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-bold text-zinc-100 text-sm">
            {review?.headline || "Analisa AI: Disiplin Modal $20"}
          </h4>
          <span
            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full tracking-wide ${
              isApproved
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                : isRejected
                ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                : "bg-amber-500/10 text-amber-300 border border-amber-500/20"
            }`}
          >
            {review?.verdict || "WAIT & SEE"}
          </span>
        </div>

        {/* Narrative */}
        <p className="text-xs text-zinc-300 leading-relaxed mb-2.5 bg-zinc-900/60 p-3 rounded-xl border border-zinc-800/60">
          {review?.analysisText ||
            "Dengan modal $20, perlindungan modal adalah prioritas nomor satu. Sistem memfilter false breakout agar akun Anda tidak tergerus spread atau volatilitas liar. Klik 'Minta Opini AI' begitu sinyal valid muncul."}
        </p>

        {/* Invalidation */}
        <div className="mb-2.5 p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800/70 text-xs">
          <span className="text-rose-400 font-semibold block mb-0.5">Level Batas Gagal:</span>
          <p className="text-zinc-300">{invalidation || "Level batas batal akan ditentukan saat sinyal BUY/SELL terbentuk."}</p>
        </div>
      </div>

      {/* Action Guide for Manual MT5 Execution */}
      <div className="bg-emerald-500/5 border border-emerald-500/20 p-2.5 rounded-xl flex items-start gap-2 text-xs">
        <Smartphone className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
        <div className="text-zinc-300">
          <strong className="text-emerald-400 font-semibold block">Panduan Eksekusi di MT5:</strong>
          <span>{actionGuide || "Tahan saldo Anda. Jangan klik BUY atau SELL di MT5 sebelum ada sinyal valid."}</span>
        </div>
      </div>
    </div>
  );
}
