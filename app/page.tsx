"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import TradingChart from "@/components/TradingChart";
import ScalpCard from "@/components/ScalpCard";
import RiskCard from "@/components/RiskCard";
import MtfMatrix from "@/components/MtfMatrix";
import JournalTable from "@/components/JournalTable";
import { Candle } from "@/lib/indicators";
import { ScalpSignal } from "@/lib/scalpEngine";
import { TradeEntry, JournalStats } from "@/lib/db";
import {
  Volume2,
  VolumeX,
  RefreshCw,
  Bot,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

export default function DashboardPage() {
  const [timeframe, setTimeframe] = useState<string>("M5");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [signal, setSignal] = useState<(ScalpSignal & { isPaused?: boolean; vpsLive?: boolean }) | null>(null);

  // Exness Account Balance (SSOT from VPS MT5 / Bridge)
  const [accountBalance, setAccountBalance] = useState<number>(0);
  const [accountCurrency, setAccountCurrency] = useState<string>("USD");
  const [accountLogin, setAccountLogin] = useState<string | number>("Memuat...");
  const [vpsConnected, setVpsConnected] = useState<boolean>(false);

  const [trades, setTrades] = useState<TradeEntry[]>([]);
  const [stats, setStats] = useState<JournalStats>({
    totalTrades: 0,
    wins: 0,
    losses: 0,
    winRatePercent: 0,
    totalPnlUsd: 0,
    profitFactor: 1.0,
    botPnlUsd: 0,
    botWins: 0,
    botLosses: 0,
    botWinRatePercent: 0,
    manualPnlUsd: 0,
    manualWins: 0,
    manualLosses: 0,
    manualWinRatePercent: 0,
    todayPnlUsd: 0,
    todayTradesCount: 0,
    weeklyPnlUsd: 0,
    weeklyTradesCount: 0,
  });

  const [livePrice, setLivePrice] = useState<number>(60000);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [countdown, setCountdown] = useState<number>(3);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const lastSignalDirRef = useRef<string | null>(null);
  const cycleCountRef = useRef<number>(0);

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
      const res = await fetch(`/api/account?_t=${Date.now()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (data.status === "success" && data.account) {
        setAccountBalance(data.account.balance);
        setAccountCurrency(data.account.currency || "USD");
        if (data.account.login) setAccountLogin(data.account.login);
        setVpsConnected(Boolean(data.account.connected));
      }
    } catch (err) {
      console.warn("Account fetch error:", err);
    }
  }, []);

  const runAnalysis = useCallback(async () => {
    try {
      const res = await fetch(`/api/analyze?capital=${accountBalance}&_t=${Date.now()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (data.status === "success" && data.signal) {
        const sig: ScalpSignal & { isPaused?: boolean; vpsLive?: boolean } = data.signal;
        setSignal(sig);

        // Sound chime on new confirmed signal change
        if (sig.direction !== "WAIT" && sig.direction !== lastSignalDirRef.current) {
          playChime(sig.direction === "BUY");
          showToast(`Sinyal Baru Terdeteksi: ${sig.signal}!`);
          lastSignalDirRef.current = sig.direction;
        }
      }
    } catch (err) {
      console.warn("Analysis error:", err);
    }
  }, [accountBalance, playChime]);

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
    // Clean up any legacy exposed settings from previous versions
    localStorage.removeItem("aureus_vps_url");
    localStorage.removeItem("aureus_gemini_key");

    loadCandles(timeframe);
    fetchAccount();
    runAnalysis();
    loadJournal();

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          // Fast Loop (3 Detik): Grafik Candlestick & Radar Analisa Sinyal
          runAnalysis();
          loadCandles(timeframe);

          // Passive Loop (30 Detik): Saldo Akun & Riwayat Jurnal Deals (Hemat Kuota Vercel 80%)
          cycleCountRef.current += 1;
          if (cycleCountRef.current % 10 === 0) {
            fetchAccount();
            loadJournal();
          }
          return 3;
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

          {/* Center: MT5 Real Balance & Bot Telegram State Badge */}
          <div className="flex items-center gap-2.5">
            {/* Real Balance from VPS MT5 */}
            <div
              className="flex items-center gap-2.5 bg-zinc-900/90 border border-zinc-800/80 rounded-xl px-3.5 py-2 text-xs sm:text-sm"
              title={`Akun: #${accountLogin} (${vpsConnected ? "VPS MT5 Terhubung Live" : "Estimasi Akun"})`}
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

            {/* Bot Autonomous Status Badge (Controlled via Telegram) */}
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs sm:text-sm font-bold border transition ${
                signal?.isPaused
                  ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                  : "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
              }`}
            >
              <Bot className="w-4 h-4 text-emerald-400" />
              <span>{signal?.isPaused ? "Bot Dijeda (Telegram)" : "Auto-Trade Aktif (VPS)"}</span>
            </div>
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
                fetchAccount();
                loadJournal();
                setCountdown(3);
                showToast("Data pasar & saldo diperbarui!");
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 border border-zinc-800/80 text-xs sm:text-sm font-semibold transition active:scale-95"
              title="Klik untuk Refresh sekarang"
            >
              <RefreshCw className="w-4 h-4 text-zinc-400" />
              <span className="text-zinc-300 tabular-nums">{countdown}s</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6 flex-1">
        {/* Toast Notification */}
        {toastMsg && (
          <div className="fixed bottom-6 right-6 z-50 bg-emerald-500 text-zinc-950 font-bold px-4 py-2.5 rounded-xl shadow-lg border border-emerald-400 text-sm animate-bounce">
            {toastMsg}
          </div>
        )}

        {/* Autonomous Mode Banner */}
        <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></div>
            <span className="font-semibold text-zinc-200">
              <strong className="text-emerald-400">Mode Otonom 24/7 Aktif:</strong> Bot memindai BTCUSDm di VPS Exness Real • Eksekusi Mandiri Terukur (0ms Latency)
            </span>
          </div>
          <div className="text-xs text-zinc-300 bg-zinc-900 px-3 py-1 rounded-full border border-zinc-800 font-bold">
            Exness BTCUSDm • Saldo ${accountBalance.toFixed(2)} {accountCurrency}
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

            <div className="flex-1 min-h-[350px]">
              <TradingChart candles={candles} signal={signal} timeframe={timeframe} />
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-400 mt-3 pt-2.5 border-t border-zinc-800/70">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>Feed Harga Live Exness VPS</span>
              </span>
              <span>Timeframe: {timeframe}</span>
            </div>
          </div>

          {/* Scalp Signal Card (5 Cols) */}
          <div className="lg:col-span-5 flex flex-col">
            <ScalpCard signal={signal} />
          </div>
        </div>

        {/* Row 2: Risk Guardian & VPS Profit Ladder Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {signal && <RiskCard risk={signal.risk} />}
          <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 shadow-sm text-sm flex flex-col justify-between">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-800/70">
              <span className="font-extrabold text-zinc-100 text-sm sm:text-base flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-cyan-400" />
                Sistem Otonom & Tangga Profit (VPS MT5)
              </span>
              <span
                className={`px-3 py-1 rounded-full text-xs font-black tracking-wide ${
                  signal?.isPaused
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                }`}
              >
                {signal?.isPaused ? "DIJEDA (TELEGRAM)" : "SIAGA 24/7"}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800/70">
                <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Tangga 1 (+60 poin)
                </span>
                <span className="font-extrabold text-emerald-400">Kunci Untung Bersih (+30 pts / +$0.30)</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800/70">
                <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Tangga 2 (+100 poin)
                </span>
                <span className="font-extrabold text-emerald-400">Kunci 60% Profit (+60 pts / +$0.60)</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800/70">
                <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Tangga 3 (+140 poin)
                </span>
                <span className="font-extrabold text-emerald-300">Kunci +100 pts (+$1.00) & Lepas TP2</span>
              </div>
            </div>

            <div className="text-xs text-zinc-400 mt-3 pt-3 border-t border-zinc-800/70 flex items-center justify-between">
              <span>Proteksi Tangga: <strong>Otomatis Mengawal Saldo</strong></span>
              <span className="text-emerald-400 font-bold">{signal?.isPaused ? "Status: Dijeda" : "Aktif Memindai 24/7"}</span>
            </div>
          </div>
        </div>

        {/* Row 3: Multi-Timeframe Matrix */}
        {signal && <MtfMatrix indicators={signal.indicators} />}

        {/* Row 4: Trade Journal Table */}
        <JournalTable trades={trades} stats={stats} onUpdateStatus={handleUpdateStatus} />
      </main>
    </div>
  );
}
