"use client";

import React, { useState } from "react";
import { ScalpSignal } from "@/lib/scalpEngine";
import { Copy, Check, Sparkles, BookOpen, Clock, AlertTriangle, ArrowUpRight, ArrowDownRight, ShieldAlert, CheckCircle, Info } from "lucide-react";

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
      <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-6 shadow-sm flex flex-col items-center justify-center min-h-[340px] text-center">
        <div className="w-12 h-12 rounded-full bg-zinc-800/50 flex items-center justify-center mb-3">
          <Clock className="w-6 h-6 text-zinc-400" />
        </div>
        <h3 className="text-base font-bold text-zinc-200">Mode Standby (Hemat Token)</h3>
        <p className="text-xs text-zinc-400 mt-2 max-w-xs leading-relaxed">
          Pemindaian pasar dan panggilan AI dinonaktifkan. Kuota API Anda 100% aman.
          Nyalakan sakelar <strong>&quot;Trading Aktif&quot;</strong> di atas jika Anda ingin mulai mencari momen entry.
        </p>
      </div>
    );
  }

  if (!signal) {
    return (
      <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-6 shadow-sm flex items-center justify-center min-h-[340px]">
        <div className="flex items-center gap-2.5 text-xs text-zinc-400">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
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
  // Menampilkan radar siaga tanpa tombol copy, agar trader TIDAK BINGUNG.
  // -------------------------------------------------------------------------
  if (isWait) {
    return (
      <div className="bg-[#121215] border border-amber-500/30 rounded-2xl p-5 shadow-sm flex flex-col justify-between min-h-[340px]">
        <div>
          {/* Header Status */}
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-800/60">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
              <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                Status Saat Ini: JANGAN MASUK PASAR
              </span>
            </div>
            <span className="text-xs font-semibold text-zinc-400 bg-zinc-800/80 px-2.5 py-0.5 rounded-full">
              Keyakinan: {signal.confidencePercent}%
            </span>
          </div>

          {/* Big Warning Banner */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3.5 mb-3 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-amber-300">
                {signal.signal === "PASAR LIAR (TUNGGU)"
                  ? "Pasar Sedang Liar — Tahan Saldo Anda!"
                  : "Belum Ada Momen Entry yang Aman"}
              </h4>
              <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
                {signal.reasons.join(" • ")}
              </p>
            </div>
          </div>

          {/* Educational Guide for Beginner */}
          <div className="space-y-2 text-xs bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-800/60 text-zinc-300">
            <div className="flex items-center gap-1.5 font-semibold text-zinc-200">
              <Info className="w-4 h-4 text-cyan-400" />
              <span>Kenapa Sistem Menyuruh Anda Menunggu?</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-zinc-400 text-[11px] leading-relaxed">
              <li>
                <strong className="text-zinc-300">Aturan Modal $20:</strong> Akun modal kecil tidak boleh sembarangan entry jika jarak batas rugi (SL) lebih dari 130 poin.
              </li>
              <li>
                <strong className="text-zinc-300">Syarat Keyakinan:</strong> Sistem hanya memberi instruksi <strong>BELI</strong> atau <strong>JUAL</strong> jika tingkat keyakinan mencapai minimal <strong>65%</strong>.
              </li>
              <li>
                <strong className="text-zinc-300">Aksi Anda:</strong> JANGAN klik apa pun di MT5 saat ini. Sistem akan berbunyi alarm 🔔 begitu setup BUY atau SELL yang aman muncul.
              </li>
            </ul>
          </div>
        </div>

        {/* Action Button: Disabled with clear explanation */}
        <div className="pt-3 border-t border-zinc-800/60">
          <div className="w-full py-2.5 px-3 rounded-xl bg-zinc-800/40 border border-zinc-800 text-center text-xs text-zinc-500 font-medium">
            🔒 Tombol Order Dikunci (Menunggu Konfirmasi Sinyal Valid)
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // KONDISI 2: SINYAL AKTIF (BELI / JUAL)
  // Menampilkan panduan urut dan tombol copy untuk dipasang di MT5.
  // -------------------------------------------------------------------------
  return (
    <div
      className={`bg-[#121215] border rounded-2xl p-5 shadow-sm flex flex-col justify-between ${
        isBuy ? "border-emerald-500/40" : "border-rose-500/40"
      }`}
    >
      {/* Top Header */}
      <div>
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-800/60">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isBuy ? "bg-emerald-400 animate-ping" : "bg-rose-400 animate-ping"
              }`}
            ></span>
            <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
              Instruksi Entry Manual
            </span>
          </div>
          <span
            className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
              isBuy
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
            }`}
          >
            Keyakinan: {signal.confidencePercent}% (Sangat Kuat)
          </span>
        </div>

        {/* Clear Action Recommendation */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div
            className={`px-4 py-2 rounded-xl text-sm font-extrabold inline-flex items-center gap-2 tracking-wide ${
              isBuy
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                : "bg-rose-500/20 text-rose-400 border border-rose-500/40"
            }`}
          >
            {isBuy ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
            <span>REKOMENDASI: {signal.signal}</span>
          </div>

          <button
            onClick={onRequestAiReview}
            disabled={isAiLoading}
            className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/80 text-xs font-medium px-3.5 py-2 rounded-xl transition active:scale-95 disabled:opacity-40"
          >
            <Sparkles className={`w-3.5 h-3.5 text-cyan-400 ${isAiLoading ? "animate-spin" : ""}`} />
            <span>{isAiLoading ? "Mengevaluasi..." : "Minta Opini AI"}</span>
          </button>
        </div>

        <p className="text-xs text-zinc-300 mb-3 bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800/60">
          <strong>Alasan Sinyal: </strong>
          {signal.reasons.join(" • ")}
        </p>
      </div>

      {/* Target Price Levels to copy into MT5 */}
      <div className="space-y-2 text-xs my-2">
        <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
          Salin Parameter Ini ke Aplikasi MT5:
        </div>

        {/* Step 1: Volume */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/70 border border-zinc-800/60">
          <div>
            <span className="text-[10px] uppercase font-semibold text-zinc-400 block">1. Lot / Volume Trading</span>
            <span className="font-bold text-sm text-zinc-100">0.01 lot (Wajib modal $20)</span>
          </div>
          <span className="text-xs text-zinc-500 font-semibold px-2">Tetap</span>
        </div>

        {/* Step 2: Entry Price */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/70 border border-zinc-800/60">
          <div>
            <span className="text-[10px] uppercase font-semibold text-zinc-400 block">2. Harga Masuk (Entry)</span>
            <span className="font-bold text-sm text-zinc-100 tabular-nums">
              ${signal.entryPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
          </div>
          <button
            onClick={() => copyText(signal.entryPrice, "entry")}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition active:scale-95"
          >
            {copiedKey === "entry" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
            <span>{copiedKey === "entry" ? "Disalin" : "Salin"}</span>
          </button>
        </div>

        {/* Step 3: Stop Loss */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25">
          <div>
            <span className="text-[10px] uppercase font-semibold text-rose-300 block">3. Batas Rugi (Stop Loss - SL)</span>
            <div className="flex items-baseline gap-1.5">
              <span className="font-bold text-sm text-rose-400 tabular-nums">
                ${signal.stopLoss.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[11px] text-rose-300 font-medium">
                (Max rugi: -${signal.risk.maxLossUsd} USD)
              </span>
            </div>
          </div>
          <button
            onClick={() => copyText(signal.stopLoss, "sl")}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-semibold border border-rose-500/40 transition active:scale-95"
          >
            {copiedKey === "sl" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-rose-400" />}
            <span>{copiedKey === "sl" ? "Disalin" : "Salin"}</span>
          </button>
        </div>

        {/* Step 4: Take Profit 1 */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
          <div>
            <span className="text-[10px] uppercase font-semibold text-emerald-300 block">4. Target Untung (Take Profit - TP1)</span>
            <div className="flex items-baseline gap-1.5">
              <span className="font-bold text-sm text-emerald-400 tabular-nums">
                ${signal.takeProfit1.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[11px] text-emerald-300 font-medium">
                (Target: +${signal.risk.profitTp1Usd} USD)
              </span>
            </div>
          </div>
          <button
            onClick={() => copyText(signal.takeProfit1, "tp1")}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-xs font-semibold border border-emerald-500/40 transition active:scale-95"
          >
            {copiedKey === "tp1" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-emerald-400" />}
            <span>{copiedKey === "tp1" ? "Disalin" : "Salin"}</span>
          </button>
        </div>
      </div>

      {/* Record Order Button */}
      <div className="pt-3 border-t border-zinc-800/60">
        <button
          onClick={onRecordTrade}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs transition active:scale-98 shadow-md"
        >
          <BookOpen className="w-4 h-4" />
          <span>Saya Sudah Pasang di MT5 (Catat ke Jurnal)</span>
        </button>
      </div>
    </div>
  );
}
