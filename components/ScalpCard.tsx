"use client";

import React from "react";
import { ScalpSignal } from "@/lib/scalpEngine";
import { Clock, ArrowUpRight, ArrowDownRight, ShieldAlert, Cpu, Bot, Send } from "lucide-react";

interface ScalpCardProps {
  signal: (ScalpSignal & { isPaused?: boolean; vpsLive?: boolean }) | null;
}

export default function ScalpCard({ signal }: ScalpCardProps) {
  if (!signal) {
    return (
      <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-6 shadow-sm flex items-center justify-center min-h-[380px]">
        <div className="flex items-center gap-3 text-sm text-zinc-300">
          <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping"></span>
          <span>Menghubungkan ke Mesin Otonom VPS (M1, M5, M15)...</span>
        </div>
      </div>
    );
  }

  const isBuy = signal.direction === "BUY";
  const isWait = signal.direction === "WAIT";
  const isPaused = Boolean(signal.isPaused);

  // -------------------------------------------------------------------------
  // KONDISI 1: TIDAK BOLEH ENTRY (TUNGGU / PASAR LIAR / DIJEDA TELEGRAM)
  // -------------------------------------------------------------------------
  if (isWait || isPaused) {
    return (
      <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col justify-between min-h-[380px]">
        <div>
          {/* Header Status */}
          <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-zinc-800/70">
            <div className="flex items-center gap-2.5">
              <span
                className={`w-3 h-3 rounded-full ${
                  isPaused ? "bg-amber-400 animate-pulse" : "bg-emerald-400 animate-pulse"
                }`}
              ></span>
              <span className="text-xs sm:text-sm font-extrabold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
                <Bot className="w-4 h-4 text-cyan-400" />
                <span>{isPaused ? "STATUS BOT: DIJEDA (TELEGRAM)" : "STATUS BOT: MEMINDAI 24/7 (AUTO)"}</span>
              </span>
            </div>
            <span className="text-xs sm:text-sm font-bold text-zinc-300 bg-zinc-800/90 px-3 py-1 rounded-full border border-zinc-700/60">
              Keyakinan: {signal.confidencePercent}%
            </span>
          </div>

          {/* Banner Status */}
          <div
            className={`border rounded-xl p-4 mb-4 flex items-start gap-3.5 ${
              isPaused
                ? "bg-amber-500/10 border-amber-500/30"
                : "bg-cyan-500/10 border-cyan-500/25"
            }`}
          >
            <ShieldAlert
              className={`w-6 h-6 flex-shrink-0 mt-0.5 ${
                isPaused ? "text-amber-400" : "text-cyan-400"
              }`}
            />
            <div>
              <h4
                className={`text-base font-extrabold ${
                  isPaused ? "text-amber-300" : "text-cyan-300"
                }`}
              >
                {isPaused
                  ? "⏸️ Bot Sedang Dijeda dari Telegram (Order Dikunci)"
                  : signal.signal === "PASAR LIAR (TUNGGU)"
                  ? "⚠️ Volatilitas Pasar Sedang Liar — Tahan Saldo Anda"
                  : signal.signal === "TUNGGU (PASAR SIDEWAYS)"
                  ? "⏸️ Pasar Sideways / Choppy — Tahan Peluru"
                  : signal.signal === "TUNGGU (DEKAT RESISTENSI)"
                  ? "🛡️ Beli Ditolak — Mencegah Beli di Pucuk Resistensi"
                  : signal.signal === "TUNGGU (DEKAT SUPPORT)"
                  ? "🛡️ Jual Ditolak — Mencegah Jual di Lembah Support"
                  : "Menunggu Konfluensi Sinyal Terverifikasi (>= 65%)"}
              </h4>
              <p className="text-sm text-zinc-300 mt-1.5 leading-relaxed font-medium">
                {signal.reasons.join(" • ")}
              </p>
            </div>
          </div>

          {/* Info Card */}
          <div className="space-y-2.5 text-xs sm:text-sm bg-zinc-900/80 p-4 rounded-xl border border-zinc-800/70 text-zinc-300">
            <div className="flex items-center gap-2 font-bold text-zinc-100">
              <Cpu className="w-4 h-4 text-cyan-400" />
              <span>Cara Kerja Mesin Otonom 24/7 (SSOT):</span>
            </div>
            <ul className="list-disc list-inside space-y-1.5 text-zinc-300 leading-relaxed text-xs">
              <li>
                <strong className="text-zinc-100">Eksekusi Otomatis:</strong> Saat keyakinan mencapai <strong>&ge; 65%</strong> dan ruang gerak aman (&ge; 50 poin), bot membuka order 0.01 lot di Exness Real.
              </li>
              <li>
                <strong className="text-zinc-100">Proteksi Anti-Pucuk & Anti-Lembah:</strong> Dilarang BUY dekat plafon resistensi dan dilarang SELL dekat lantai support.
              </li>
              <li>
                <strong className="text-zinc-100">Proteksi Tangga Profit:</strong> Order dikawal bertingkat (+60 poin lock +$0.30, +100 poin lock +$0.60, +140 poin lock +$1.00 & lepas TP2).
              </li>
              <li>
                <strong className="text-zinc-100">Kendali Terpusat:</strong> Sistem beroperasi mandiri di VPS Exness dengan proteksi akun terukur.
              </li>
            </ul>
          </div>
        </div>

        {/* Status Footer */}
        <div className="pt-4 mt-3 border-t border-zinc-800/70 flex items-center justify-between text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <Bot className="w-3.5 h-3.5 text-cyan-400" />
            <span>Sistem Otonom 24/7: <strong>Eksekusi Mandiri Terproteksi</strong></span>
          </div>
          <span className="font-semibold text-zinc-300">
            {isPaused ? "Status: Dijeda" : "Siaga 24/7 di VPS"}
          </span>
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
            <span className="text-xs sm:text-sm font-extrabold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
              <Bot className="w-4 h-4 text-emerald-400" />
              <span>EKSEKUSI OTONOM AKTIF (MT5 REAL)</span>
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

        {/* Action Recommendation */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div
            className={`px-5 py-2.5 rounded-xl text-base sm:text-lg font-black inline-flex items-center gap-2.5 tracking-wide ${
              isBuy
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
            }`}
          >
            {isBuy ? <ArrowUpRight className="w-6 h-6" /> : <ArrowDownRight className="w-6 h-6" />}
            <span>SINYAL AKTIF: {signal.signal}</span>
          </div>

          <div className="flex items-center gap-2 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs sm:text-sm font-bold px-3.5 py-2 rounded-xl">
            <Bot className="w-4 h-4 text-emerald-400" />
            <span>Auto-Trade Aktif (VPS)</span>
          </div>
        </div>

        <p className="text-sm text-zinc-200 mb-4 bg-zinc-900/70 p-3 rounded-xl border border-zinc-800/70 font-medium">
          <strong className="text-zinc-100">Alasan Setup: </strong>
          {signal.reasons.join(" • ")}
        </p>
      </div>

      {/* Target Price Levels */}
      <div className="space-y-2 text-sm my-1">
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800/70 text-xs sm:text-sm">
          <span className="font-semibold text-zinc-400">Volume Trading</span>
          <span className="font-extrabold text-amber-300">0.01 lot (Fixed Terukur)</span>
        </div>

        <div className="flex items-center justify-between p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs sm:text-sm">
          <span className="font-semibold text-rose-300">Batas Rugi (SL)</span>
          <span className="font-extrabold text-rose-400 tabular-nums">
            ${signal.stopLoss.toLocaleString("en-US", { minimumFractionDigits: 2 })} (-$0.80 USD)
          </span>
        </div>

        <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs sm:text-sm">
          <span className="font-semibold text-emerald-300">Target Untung (TP1)</span>
          <span className="font-extrabold text-emerald-400 tabular-nums">
            ${signal.takeProfit1.toLocaleString("en-US", { minimumFractionDigits: 2 })} (+${signal.risk.profitTp1Usd} USD)
          </span>
        </div>
      </div>

      {/* Footer Info */}
      <div className="pt-3 mt-2 border-t border-zinc-800/70 text-center text-xs text-zinc-400">
        🛡️ Posisi dikawal otomatis oleh Bot VPS dengan tangga profit bertingkat (+60, +100, +140 pts). Notifikasi real-time terkirim ke Telegram.
      </div>
    </div>
  );
}
