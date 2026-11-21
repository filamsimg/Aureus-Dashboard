"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import TradingChart from "@/components/TradingChart";
import ScalpCard from "@/components/ScalpCard";
import RiskCard from "@/components/RiskCard";
import MtfMatrix from "@/components/MtfMatrix";
import AiReviewCard from "@/components/AiReviewCard";
import JournalTable from "@/components/JournalTable";
import { Candle } from "@/lib/indicators";
import { ScalpSignal } from "@/lib/scalpEngine";
import { AiReviewResult } from "@/lib/gemini";
import { TradeEntry, JournalStats } from "@/lib/db";
import {
  Volume2,
  VolumeX,
  RefreshCw,
  Settings,
  CheckCircle2,
  X,
  Power,
  Server,
  Smartphone,
  ExternalLink,
} from "lucide-react";

export default function DashboardPage() {
  // Mode state: 'active' or 'standby'
  const [tradingMode, setTradingMode] = useState<"active" | "standby">("active");

  const [timeframe, setTimeframe] = useState<string>("M5");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [signal, setSignal] = useState<ScalpSignal | null>(null);
  const [aiReview, setAiReview] = useState<AiReviewResult | null>(null);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);

  // Exness Account Balance (VPS MT5 or Smart Ledger)
  const [accountBalance, setAccountBalance] = useState<number>(20.0);
  const [accountCurrency, setAccountCurrency] = useState<string>("USD");
  const [accountLogin, setAccountLogin] = useState<string | number>("268119731");
  const [vpsConnected, setVpsConnected] = useState<boolean>(false);
  const [vpsUrl, setVpsUrl] = useState<string>("http://109.111.52.163:8000");

  const [trades, setTrades] = useState<TradeEntry[]>([]);
  const [stats, setStats] = useState<JournalStats>({
    totalTrades: 0,
    wins: 0,
    losses: 0,
    winRatePercent: 0,
    totalPnlUsd: 0,
    profitFactor: 1.0,
  });

  const [livePrice, setLivePrice] = useState<number>(60000);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [countdown, setCountdown] = useState<number>(5);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Settings
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [geminiKey, setGeminiKey] = useState<string>("");

  const lastSignalDirRef = useRef<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  const playChime = useCallback(
    (isBuy: boolean) => {
      if (!soundEnabled) return;
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;
        if (isBuy) {
          osc.frequency.setValueAtTime(587.33, now);
          osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
        } else {
          osc.frequency.setValueAtTime(880, now);
          osc.frequency.exponentialRampToValueAtTime(587.33, now + 0.15);
        }

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } catch (err) {
        console.warn("Audio chime error:", err);
      }
    },
    [soundEnabled]
  );

  const loadCandles = useCallback(async (tf: string) => {
    try {
      const res = await fetch(`/api/candles?tf=${tf}&limit=70`);
      const data = await res.json();
      if (data.status === "success" && data.candles) {
        setCandles(data.candles);
        if (data.candles.length > 0) {
          setLivePrice(data.candles[data.candles.length - 1].close);
        }
      }
    } catch (err) {
      console.warn("Candles fetch error:", err);
    }
  }, []);

  const fetchAccount = useCallback(async () => {
    try {
      const res = await fetch(`/api/account?vps_url=${encodeURIComponent(vpsUrl)}`);
      const data = await res.json();
      if (data.status === "success" && data.account) {
        setAccountBalance(data.account.balance);
        setAccountCurrency(data.account.currency);
        setVpsConnected(data.account.connected);
        if (data.account.login) setAccountLogin(data.account.login);
      }
    } catch (err) {
      console.warn("Account fetch error:", err);
    }
  }, [vpsUrl]);

  const runAnalysis = useCallback(async () => {
    if (tradingMode === "standby") {
      setSignal(null);
      return;
    }

    try {
      const res = await fetch(`/api/analyze?capital=${accountBalance}&mode=${tradingMode}`);
      const data = await res.json();
      if (data.status === "success" && data.signal) {
        const sig: ScalpSignal = data.signal;
        setSignal(sig);

        // Sound chime on new signal change
        if (sig.direction !== "WAIT" && sig.direction !== lastSignalDirRef.current) {
          playChime(sig.direction === "BUY");
          showToast(`Sinyal Baru Terdeteksi: ${sig.signal}!`);
          lastSignalDirRef.current = sig.direction;
        }
      }
    } catch (err) {
      console.warn("Analysis error:", err);
    }
  }, [tradingMode, accountBalance, playChime]);

  const loadJournal = useCallback(async () => {
    try {
      const res = await fetch("/api/journal");
      const data = await res.json();
      if (data.status === "success") {
        setTrades(data.trades);
        setStats(data.stats);
      }
    } catch (err) {
      console.warn("Journal fetch error:", err);
    }
  }, []);

  const handleRequestAiReview = async () => {
    if (!signal || signal.direction === "WAIT") {
      showToast("Tunggu hingga setup BUY atau SELL terkonfirmasi.");
      return;
    }

    setIsAiLoading(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signal, customApiKey: geminiKey }),
      });
      const data = await res.json();
      if (data.status === "success" && data.review) {
        setAiReview(data.review);
        showToast("Review Analis AI Siap!");
      } else {
        showToast("Review AI gagal: " + (data.message || "Periksa API key"));
      }
    } catch (err) {
      showToast("Koneksi API AI terputus.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleRecordTrade = async () => {
    if (!signal || signal.direction === "WAIT") {
      showToast("Hanya setup BUY atau SELL yang dapat dicatat ke jurnal.");
      return;
    }

    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: "BTCUSD",
          direction: signal.direction,
          entryPrice: signal.entryPrice,
          stopLoss: signal.stopLoss,
          takeProfit: signal.takeProfit1,
          lotSize: signal.risk.fixedLot,
          notes: `${signal.reasons.join(", ")} ${aiReview ? `| ${aiReview.verdict}` : ""}`,
        }),
      });
      const data = await res.json();
      if (data.status === "success") {
        showToast("Order berhasil dicatat ke Jurnal!");
        loadJournal();
      }
    } catch (err) {
      showToast("Gagal mencatat trade ke jurnal.");
    }
  };

  const handleUpdateStatus = async (
    id: number,
    status: TradeEntry["status"],
    exitPrice: number,
    pnlUsd: number
  ) => {
    try {
      await fetch("/api/journal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, exitPrice, pnlUsd }),
      });
      showToast(`Status diperbarui: ${status}!`);
      loadJournal();
    } catch (err) {
      console.error("Update trade error:", err);
    }
  };

  useEffect(() => {
    loadCandles(timeframe);
    fetchAccount();
    runAnalysis();
    loadJournal();

    const savedKey = localStorage.getItem("aureus_gemini_key");
    if (savedKey) setGeminiKey(savedKey);

    const savedVps = localStorage.getItem("aureus_vps_url");
    if (savedVps) setVpsUrl(savedVps);

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          runAnalysis();
          loadCandles(timeframe);
          return 5;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeframe, loadCandles, fetchAccount, runAnalysis, loadJournal]);

  return (
    <div className="min-h-screen flex flex-col bg-[#09090b] text-zinc-100 antialiased">
      {/* Sleek Modern Top Navbar */}
      <header className="bg-[#121215]/95 backdrop-blur-md border-b border-zinc-800/80 sticky top-0 z-40 px-4 sm:px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Brand & Market Price */}
          <div className="flex items-center gap-3.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center font-black text-sm text-emerald-400">
                AU
              </div>
              <span className="font-extrabold text-base tracking-tight text-zinc-100">
                AUREUS SCALPER
              </span>
            </div>
            <span className="text-zinc-700 font-bold">/</span>
            <div className="flex items-baseline gap-2 text-sm sm:text-base">
              <span className="text-zinc-400 font-semibold">BTC/USD</span>
              <span className="font-black text-emerald-400 tabular-nums tracking-tight">
                ${livePrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Center: MT5 Balance & Token-Saving Toggle */}
          <div className="flex items-center gap-2.5">
            {/* Real Balance from VPS MT5 / Smart Ledger */}
            <div
              className="flex items-center gap-2.5 bg-zinc-900/90 border border-zinc-800/80 rounded-xl px-3.5 py-2 text-xs sm:text-sm"
              title={`Akun: #${accountLogin} (${vpsConnected ? "VPS MT5 Terhubung (Live)" : "Smart Ledger Mode"})`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  vpsConnected ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" : "bg-amber-400"
                }`}
              ></span>
              <span className="text-zinc-400 font-medium">MT5 #{accountLogin}:</span>
              <strong className="text-zinc-100 font-black tabular-nums text-sm sm:text-base">
                ${accountBalance.toFixed(2)} {accountCurrency}
              </strong>
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  vpsConnected
                    ? "text-emerald-300 bg-emerald-500/20 border border-emerald-500/30"
                    : "text-amber-300 bg-amber-500/20 border border-amber-500/30"
                }`}
              >
                {vpsConnected ? "LIVE" : "ESTIMASI"}
              </span>
            </div>

            {/* Token-Saving Mode Switch */}
            <button
              onClick={() => {
                const next = tradingMode === "active" ? "standby" : "active";
                setTradingMode(next);
                showToast(
                  next === "active"
                    ? "Mode Trading Aktif: Memindai grafik BTC"
                    : "Mode Standby Aktif: API AI tidur (Hemat Token 100%)"
                );
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold border transition active:scale-95 ${
                tradingMode === "active"
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30"
                  : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200"
              }`}
            >
              <Power className="w-4 h-4" />
              <span>{tradingMode === "active" ? "Trading Aktif" : "Standby (Hemat)"}</span>
            </button>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2">
            {/* Audio Toggle */}
            <button
              onClick={() => {
                setSoundEnabled(!soundEnabled);
                showToast(soundEnabled ? "Suara alarm dimatikan" : "Suara alarm aktif 🔔");
              }}
              className="p-2.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 border border-zinc-800/80 transition active:scale-95"
              title="Toggle Suara"
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-zinc-200" /> : <VolumeX className="w-4 h-4 text-zinc-600" />}
            </button>

            {/* Refresh Countdown */}
            <button
              onClick={() => {
                runAnalysis();
                loadCandles(timeframe);
                setCountdown(5);
                showToast("Data pasar diperbarui!");
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 border border-zinc-800/80 text-xs sm:text-sm font-semibold transition active:scale-95"
              title="Klik untuk Refresh sekarang"
            >
              <RefreshCw className="w-4 h-4 text-zinc-400" />
              <span className="text-zinc-300 tabular-nums">{countdown}s</span>
            </button>

            {/* Settings Modal Button */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 border border-zinc-800/80 transition active:scale-95"
              title="Pengaturan"
            >
              <Settings className="w-4 h-4 text-zinc-300" />
            </button>
          </div>
        </div>
      </header>

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-zinc-900/95 border border-zinc-700/80 text-zinc-100 text-sm font-semibold px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 transition animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-4 sm:space-y-5">
        {/* Simple Workflow Guide Bar */}
        <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="font-extrabold text-zinc-100 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
              Alur Scalping:
            </span>
            <span className="text-zinc-300 font-medium">
              <strong className="text-zinc-100">1. Pantau Status</strong> (Kuning = Tahan Saldo • Hijau = Beli • Merah = Jual)
            </span>
            <span className="text-zinc-600 hidden sm:inline">•</span>
            <span className="text-zinc-300 font-medium">
              <strong className="text-zinc-100">2. Salin Parameter</strong> (Lot 0.01, SL, TP1)
            </span>
            <span className="text-zinc-600 hidden sm:inline">•</span>
            <span className="text-zinc-300 font-medium">
              <strong className="text-zinc-100">3. Eksekusi di MT5</strong>
            </span>
          </div>
          <div className="text-xs text-zinc-300 bg-zinc-900 px-3 py-1 rounded-full border border-zinc-800 font-bold">
            Exness BTCUSD • Modal $20
          </div>
        </div>

        {/* Row 1: Chart & Scalp Signal Card */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Candlestick Chart (7 Cols) */}
          <div className="lg:col-span-7 bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
            <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3.5">
              <div className="flex items-center gap-2.5">
                <span className="text-sm sm:text-base font-extrabold text-zinc-100">Grafik Candlestick Real-time</span>
                <span className={`text-xs px-2.5 py-1 rounded-full border font-bold ${
                  vpsConnected 
                    ? "text-emerald-300 bg-emerald-500/15 border-emerald-500/30" 
                    : "text-zinc-400 bg-zinc-900 border-zinc-800"
                }`}>
                  {vpsConnected ? "Exness MT5 Live (100% Akurat)" : "Public Standby Feed"}
                </span>
              </div>

              {/* Timeframe Switcher */}
              <div className="flex items-center gap-1.5 bg-zinc-900/80 p-1 rounded-xl border border-zinc-800/80 text-xs sm:text-sm">
                {["M1", "M5", "M15", "H1"].map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition ${
                      timeframe === tf
                        ? "bg-zinc-800 text-emerald-400 shadow-xs"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            {/* TradingView Lightweight Chart */}
            <div className="min-h-[460px] w-full rounded-xl overflow-hidden border border-zinc-800/60 bg-[#121214]">
              <TradingChart candles={candles} signal={signal} timeframe={timeframe} />
            </div>

            <div className="flex items-center justify-between pt-3 mt-2.5 border-t border-zinc-800/70 text-xs text-zinc-400 font-medium">
              <span>Garis Putus-putus: Hijau = Target TP • Merah = Batas SL</span>
              <span className="text-zinc-300 font-semibold">Timeframe: {timeframe}</span>
            </div>
          </div>

          {/* Scalp Signal Card (5 Cols) */}
          <div className="lg:col-span-5 flex flex-col">
            <ScalpCard
              signal={signal}
              mode={tradingMode}
              onRecordTrade={handleRecordTrade}
              onRequestAiReview={handleRequestAiReview}
              isAiLoading={isAiLoading}
            />
          </div>
        </div>

        {/* Row 2: Risk Guardian ($20 Capital) & AI Review */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {signal && <RiskCard risk={signal.risk} />}
          {signal && (
            <AiReviewCard
              review={aiReview}
              actionGuide={signal.actionGuide}
              invalidation={signal.invalidation}
            />
          )}
        </div>

        {/* Row 3: Multi-Timeframe Matrix */}
        {signal && <MtfMatrix indicators={signal.indicators} />}

        {/* Row 4: Trade Journal Table */}
        <JournalTable trades={trades} stats={stats} onUpdateStatus={handleUpdateStatus} />
      </main>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#121215] border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-200 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="font-bold text-sm text-zinc-100 mb-1 flex items-center gap-2">
              <Settings className="w-4 h-4 text-zinc-400" /> Pengaturan Sistem
            </h3>
            <p className="text-xs text-zinc-400 mb-5 leading-relaxed">
              Atur koneksi VPS pembaca saldo Exness MT5 dan kunci Google Gemini AI.
            </p>

            <div className="space-y-4 text-xs">
              <div>
                <label className="text-zinc-300 block mb-1 font-semibold flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-zinc-400" /> URL Jembatan VPS MT5:
                </label>
                <input
                  type="text"
                  placeholder="http://109.111.52.163:8000"
                  value={vpsUrl}
                  onChange={(e) => setVpsUrl(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-zinc-200 focus:outline-none focus:border-zinc-500"
                />
                <span className="text-[11px] text-zinc-500 block mt-1">
                  IP VPS tempat MT5 Exness Anda terpasang (Port 8000).
                </span>
              </div>

              <div>
                <label className="text-zinc-300 block mb-1 font-semibold">Google Gemini API Key:</label>
                <input
                  type="password"
                  placeholder="AIzaSy..."
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-zinc-200 focus:outline-none focus:border-zinc-500"
                />
                <span className="text-[11px] text-zinc-500 block mt-1">
                  Sudah terisi otomatis dari sistem. Bisa diubah jika ingin memakai key lain.
                </span>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => {
                  localStorage.setItem("aureus_gemini_key", geminiKey);
                  localStorage.setItem("aureus_vps_url", vpsUrl);
                  setIsSettingsOpen(false);
                  fetchAccount();
                  showToast("Pengaturan disimpan!");
                }}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-semibold px-4 py-2 rounded-xl border border-zinc-700 transition active:scale-95"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
