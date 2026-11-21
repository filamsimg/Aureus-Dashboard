"use client";

import React from "react";
import { AiReviewResult } from "@/lib/gemini";
import { Sparkles, Smartphone } from "lucide-react";

interface AiReviewCardProps {
  review: AiReviewResult | null;
  actionGuide: string;
  invalidation: string;
}

export default function AiReviewCard({ review, actionGuide, invalidation }: AiReviewCardProps) {
  const isApproved = review?.verdict === "SETUJU ENTRY";
  const isRejected = review?.verdict === "TIDAK DISARANKAN";

  return (
    <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 shadow-sm text-sm flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-800/70">
          <span className="font-extrabold text-zinc-100 text-sm sm:text-base flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            Evaluasi Analis AI (Gemini)
          </span>
          <span className="text-xs text-zinc-300 bg-zinc-800/80 px-3 py-1 rounded-full border border-zinc-700/60 font-semibold">
            {review?.source || "Analisa Kuantitatif"}
          </span>
        </div>

        {/* Headline & Verdict */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
          <h4 className="font-extrabold text-zinc-100 text-base sm:text-lg">
            {review?.headline || "Analisa AI: Disiplin Modal $20"}
          </h4>
          <span
            className={`text-xs sm:text-sm font-black px-3.5 py-1 rounded-full tracking-wide ${
              isApproved
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                : isRejected
                ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
            }`}
          >
            {review?.verdict || "WAIT & SEE"}
          </span>
        </div>

        {/* Narrative */}
        <p className="text-xs sm:text-sm text-zinc-200 leading-relaxed mb-3 bg-zinc-900/70 p-3.5 rounded-xl border border-zinc-800/70 font-medium">
          {review?.analysisText ||
            "Dengan modal $20, perlindungan modal adalah prioritas nomor satu. Sistem memfilter false breakout agar akun Anda tidak tergerus spread atau volatilitas liar. Klik 'Minta Opini AI' begitu sinyal valid muncul."}
        </p>

        {/* Invalidation */}
        <div className="mb-3 p-3 rounded-xl bg-zinc-900/90 border border-zinc-800/80 text-xs sm:text-sm">
          <span className="text-rose-400 font-bold block mb-1 text-xs uppercase tracking-wider">Level Batas Gagal:</span>
          <p className="text-zinc-200 font-medium">{invalidation || "Level batas batal akan ditentukan saat sinyal BUY/SELL terbentuk."}</p>
        </div>
      </div>

      {/* Action Guide for Manual MT5 Execution */}
      <div className="bg-emerald-500/10 border border-emerald-500/25 p-3 rounded-xl flex items-start gap-2.5 text-xs sm:text-sm">
        <Smartphone className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
        <div className="text-zinc-200">
          <strong className="text-emerald-400 font-bold block mb-0.5">Panduan Eksekusi di MT5:</strong>
          <span className="font-medium">{actionGuide || "Tahan saldo Anda. Jangan klik BUY atau SELL di MT5 sebelum ada sinyal valid."}</span>
        </div>
      </div>
    </div>
  );
}
