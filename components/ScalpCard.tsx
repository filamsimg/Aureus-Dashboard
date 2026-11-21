"use client";

import React, { useState } from "react";
import { ScalpSignal } from "@/lib/scalpEngine";
import { Copy, Check, Sparkles, Clock, ArrowUpRight, ArrowDownRight, ShieldAlert, Info } from "lucide-react";

interface ScalpCardProps {
  signal: ScalpSignal | null;
  mode: "active" | "standby";
  onRecordTrade: () => void;
  onRequestAiReview: () => void;
  isAiLoading: boolean;
}

export default function ScalpCard({
  signal,
  mode,
  onRecordTrade,
  onRequestAiReview,
  isAiLoading,
}: ScalpCardProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyText = (val: string | number, key: string) => {
    navigator.clipboard.writeText(String(val).replace(/,/g, ""));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  if (mode === "standby") {
    return (
      <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-6 shadow-sm flex flex-col items-center justify-center min-h-[380px] text-center">
        <div className="w-14 h-14 rounded-full bg-zinc-800/50 flex items-center justify-center mb-4">
          <Clock className="w-7 h-7 text-zinc-400" />
        </div>
        <h3 className="text-lg font-bold text-zinc-100">Mode Standby (Hemat Token)</h3>
        <p className="text-sm text-zinc-400 mt-2 max-w-sm leading-relaxed">
          Pemindaian pasar dan panggilan AI dinonaktifkan. Kuota API Anda 100% aman.
          Nyalakan sakelar <strong>&quot;Trading Aktif&quot;</strong> di atas untuk memindai grafik.
        </p>
      </div>
    );
  }

  if (!signal) {
    return (
      <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-6 shadow-sm flex items-center justify-center min-h-[380px]">
        <div className="flex items-center gap-3 text-sm text-zinc-300">
          <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping"></span>
          <span>Sedang menganalisa struktur grafik BTC (M1, M5, M15, H1)...</span>
        </div>
      </div>
    );
  }

  const isBuy = signal.direction === "BUY";
  const isSell = signal.direction === "SELL";
  const isWait = signal.direction === "WAIT";

  // -------------------------------------------------------------------------
  // KONDISI 1: TIDAK BOLEH ENTRY (TUNGGU / PASAR LIAR)
  // -------------------------------------------------------------------------
  if (isWait) {
    return (
      <div className="bg-[#121215] border border-amber-500/30 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col justify-between min-h-[380px]">
        <div>
          {/* Header Status */}
          <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-zinc-800/70">
            <div className="flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full bg-amber-400 animate-pulse"></span>
              <span className="text-sm sm:text-base font-extrabold text-amber-300 uppercase tracking-wide">
                STATUS: TAHAN SALDO (JANGAN ENTRY)
              </span>
            </div>
            <span className="text-xs sm:text-sm font-bold text-zinc-300 bg-zinc-800/90 px-3 py-1 rounded-full border border-zinc-700/60">
              Keyakinan: {signal.confidencePercent}%
            </span>
          </div>

          {/* Big Warning Banner */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-4 flex items-start gap-3.5">
            <ShieldAlert className="w-6 h-6 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-base font-extrabold text-amber-300">
                {signal.signal === "PASAR LIAR (TUNGGU)"
                  ? "⚠️ Volatilitas Pasar Sedang Liar — Tahan Saldo Anda!"
                  : "Belum Ada Momen Entry yang Aman"}
              </h4>
              <p className="text-sm text-zinc-200 mt-1.5 leading-relaxed font-medium">
                {signal.reasons.join(" • ")}
              </p>
            </div>
          </div>

          {/* Educational Guide for Beginner */}
          <div className="space-y-2.5 text-sm bg-zinc-900/80 p-4 rounded-xl border border-zinc-800/70 text-zinc-300">
            <div className="flex items-center gap-2 font-bold text-zinc-100 text-sm sm:text-base">
              <Info className="w-5 h-5 text-cyan-400" />
              <span>Kenapa Sistem Menyuruh Anda Menunggu?</span>
            </div>
            <ul className="list-disc list-inside space-y-2 text-zinc-300 text-xs sm:text-sm leading-relaxed">
              <li>
                <strong className="text-zinc-100">Proteksi Saldo Akun:</strong> Akun modal mikro tidak boleh entry saat jarak batas rugi (SL) lebih dari 130 poin.
              </li>
              <li>
                <strong className="text-zinc-100">Syarat Keyakinan:</strong> Sistem hanya memicu instruksi <strong>BELI</strong> atau <strong>JUAL</strong> jika tingkat keyakinan mencapai minimal <strong>55%</strong>.
              </li>
              <li>
                <strong className="text-zinc-100">Aksi Anda:</strong> JANGAN pasang order di MT5 sekarang. Sistem akan membunyikan alarm 🔔 begitu setup aman terbentuk!
              </li>
            </ul>
          </div>
        </div>

        {/* Action Button: Disabled with clear explanation */}
        <div className="pt-4 mt-3 border-t border-zinc-800/70">
          <div className="w-full py-3 px-4 rounded-xl bg-zinc-800/50 border border-zinc-800 text-center text-sm text-zinc-400 font-semibold">
            🔒 Tombol Order Dikunci (Menunggu Konfirmasi Sinyal Valid)
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // KONDISI 2: SINYAL AKTIF (BELI / JUAL)
  // -------------------------------------------------------------------------
  return (
    <div
      className={`bg-[#121215] border rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col justify-between min-h-[380px] ${
        isBuy ? "border-emerald-500/50 shadow-emerald-950/20" : "border-rose-500/50 shadow-rose-950/20"
      }`}
    >
      <div>
        <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-zinc-800/70">
          <div className="flex items-center gap-2.5">
            <span
              className={`w-3 h-3 rounded-full ${
                isBuy ? "bg-emerald-400 animate-ping" : "bg-rose-400 animate-ping"
              }`}
            ></span>
            <span className="text-xs sm:text-sm font-extrabold text-zinc-200 uppercase tracking-wider">
              Instruksi Entry Manual MT5
            </span>
          </div>
          <span
            className={`text-xs sm:text-sm font-extrabold px-3 py-1 rounded-full ${
              isBuy
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
            }`}
          >
            Keyakinan: {signal.confidencePercent}% (Sangat Kuat)
          </span>
        </div>

        {/* Clear Action Recommendation */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div
            className={`px-5 py-2.5 rounded-xl text-base sm:text-lg font-black inline-flex items-center gap-2.5 tracking-wide ${
              isBuy
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
            }`}
          >
            {isBuy ? <ArrowUpRight className="w-6 h-6" /> : <ArrowDownRight className="w-6 h-6" />}
            <span>REKOMENDASI: {signal.signal}</span>
          </div>

          <button
            onClick={onRequestAiReview}
            disabled={isAiLoading}
            className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 text-xs sm:text-sm font-semibold px-4 py-2.5 rounded-xl transition active:scale-95 disabled:opacity-40"
          >
            <Sparkles className={`w-4 h-4 text-cyan-400 ${isAiLoading ? "animate-spin" : ""}`} />
            <span>{isAiLoading ? "Mengevaluasi..." : "Minta Opini AI"}</span>
          </button>
        </div>

        <p className="text-sm text-zinc-200 mb-4 bg-zinc-900/70 p-3 rounded-xl border border-zinc-800/70 font-medium">
          <strong className="text-zinc-100">Alasan Sinyal: </strong>
          {signal.reasons.join(" • ")}
        </p>
      </div>

      {/* Target Price Levels to copy into MT5 */}
      <div className="space-y-2.5 text-sm my-2">
        <div className="text-xs sm:text-sm font-bold text-zinc-300 uppercase tracking-wider">
          Salin Parameter Ini ke Aplikasi MT5:
        </div>

        {/* Step 1: Volume */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/80 border border-zinc-800/70">
          <div>
            <span className="text-xs uppercase font-bold text-zinc-400 block mb-0.5">1. Lot / Volume Trading</span>
            <span className="font-black text-base sm:text-lg text-amber-300">0.01 lot (Aman & Terukur)</span>
          </div>
          <span className="text-xs font-bold text-zinc-400 bg-zinc-800 px-2.5 py-1 rounded-md">Fixed</span>
        </div>

        {/* Step 2: Entry Price */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/80 border border-zinc-800/70">
          <div>
            <span className="text-xs uppercase font-bold text-zinc-400 block mb-0.5">2. Harga Masuk (Entry)</span>
            <span className="font-black text-base sm:text-lg text-cyan-300 tabular-nums">
              ${signal.entryPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
          </div>
          <button
            onClick={() => copyText(signal.entryPrice, "entry")}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs sm:text-sm font-bold border border-zinc-700 transition active:scale-95"
          >
            {copiedKey === "entry" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-zinc-300" />}
            <span>{copiedKey === "entry" ? "Disalin" : "Salin"}</span>
          </button>
        </div>

        {/* Step 3: Stop Loss */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-rose-500/15 border border-rose-500/35">
          <div>
            <span className="text-xs uppercase font-bold text-rose-300 block mb-0.5">3. Batas Rugi (Stop Loss - SL)</span>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-black text-base sm:text-lg text-rose-400 tabular-nums">
                ${signal.stopLoss.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-xs sm:text-sm text-rose-200 font-semibold">
                (Max rugi: -${signal.risk.maxLossUsd} USD)
              </span>
            </div>
          </div>
          <button
            onClick={() => copyText(signal.stopLoss, "sl")}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-500/25 hover:bg-rose-500/35 text-rose-100 text-xs sm:text-sm font-bold border border-rose-500/50 transition active:scale-95"
          >
            {copiedKey === "sl" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-rose-300" />}
            <span>{copiedKey === "sl" ? "Disalin" : "Salin"}</span>
          </button>
        </div>

        {/* Step 4: Take Profit 1 */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/35">
          <div>
            <span className="text-xs uppercase font-bold text-emerald-300 block mb-0.5">4. Target Untung (Take Profit - TP1)</span>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-black text-base sm:text-lg text-emerald-400 tabular-nums">
                ${signal.takeProfit1.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-xs sm:text-sm text-emerald-200 font-semibold">
                (Target profit: +${signal.risk.profitTp1Usd} USD)
              </span>
            </div>
          </div>
          <button
            onClick={() => copyText(signal.takeProfit1, "tp1")}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-500/25 hover:bg-emerald-500/35 text-emerald-100 text-xs sm:text-sm font-bold border border-emerald-500/50 transition active:scale-95"
          >
            {copiedKey === "tp1" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-emerald-300" />}
            <span>{copiedKey === "tp1" ? "Disalin" : "Salin"}</span>
          </button>
        </div>
      </div>

      {/* Catat ke Jurnal Button */}
      <div className="pt-3 mt-2 border-t border-zinc-800/70">
        <button
          onClick={onRecordTrade}
          className="w-full py-3 px-4 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-sm font-bold transition active:scale-95 text-center flex items-center justify-center gap-2"
        >
          <span>✍️ Saya Sudah Pasang Order Ini di MT5 (Simpan ke Jurnal)</span>
        </button>
      </div>
    </div>
  );
}
