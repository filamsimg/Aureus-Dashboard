"use client";

import React, { useState } from "react";
import { Lock, Shield, Eye, EyeOff, ArrowRight, KeyRound } from "lucide-react";

interface LoginGateProps {
  onSuccess: () => void;
}

export default function LoginGate({ onSuccess }: LoginGateProps) {
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin) {
      setErrorMsg("Masukkan PIN akses terlebih dahulu.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      const data = await res.json();

      if (res.ok && data.status === "success") {
        onSuccess();
      } else {
        setErrorMsg(data.message || "PIN keamanan salah!");
      }
    } catch (err: any) {
      setErrorMsg("Gagal menghubungi server otorisasi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#121215] border border-zinc-800/90 rounded-3xl p-7 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Top ambient glow */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Brand Icon & Heading */}
        <div className="flex flex-col items-center text-center space-y-3 mb-6 relative">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
            <Lock className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-zinc-100 tracking-tight flex items-center justify-center gap-2">
              AUREUS SCALPER
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              Private Terminal • Exness Real MT5 Radar
            </p>
          </div>
        </div>

        {/* Security Notice */}
        <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-3.5 mb-6 text-xs text-zinc-300 flex items-start gap-2.5">
          <Shield className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
          <span>
            Dashboard ini terhubung langsung ke akun trading nyata. Masukkan <strong>PIN Keamanan</strong> Anda untuk membuka akses.
          </span>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-zinc-400" />
                PIN Keamanan
              </span>
              <span className="text-[11px] text-zinc-500">Default: 8898</span>
            </label>
            <div className="relative">
              <input
                type={showPin ? "text" : "password"}
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                autoFocus
                placeholder="Ketik PIN akses..."
                className="w-full bg-zinc-900/90 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 placeholder:text-zinc-600 text-sm font-mono tracking-wider focus:outline-hidden focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 transition pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition"
                tabIndex={-1}
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium text-center animate-shake">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black rounded-xl text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/30 disabled:opacity-50 active:scale-[0.99]"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                <span>Memverifikasi Otorisasi...</span>
              </span>
            ) : (
              <>
                <span>Buka Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-zinc-800/60 text-center text-[11px] text-zinc-500">
          Dilindungi oleh Sesi Terenkripsi HTTP-Only • SSOT Protocol
        </div>
      </div>
    </div>
  );
}
