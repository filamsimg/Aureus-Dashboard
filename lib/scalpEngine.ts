/**
 * BTC Scalping Decision Matrix & Risk Guardian Engine
 * Standardized beginner-friendly language: "BELI (BUY)", "JUAL (SELL)", "TUNGGU (WAIT)".
 * Calibrated specifically for Exness Real Standard Account with $20 USD Capital (Fixed 0.01 lot).
 */

import { Candle, TechnicalSnapshot, analyzeCandles } from "./indicators";

export interface RiskProfile {
  accountType: "Exness Real Standard (BTCUSD)";
  capital: number;
  fixedLot: number;
  slDistancePoints: number;
  maxLossUsd: number;
  maxLossPercent: number;
  profitTp1Usd: number;
  profitTp2Usd: number;
  profitTp3Usd: number;
  marginRequiredUsd: number;
  safetyRating: "AMAN" | "PERHATIAN" | "PASAR LIAR (DITOLAK)";
  volatilityWarning: boolean;
  advice: string;
}

export interface ScalpSignal {
  signal:
    | "BELI (BUY)"
    | "JUAL (SELL)"
    | "TUNGGU (WAIT)"
    | "PASAR LIAR (TUNGGU)"
    | "TUNGGU (PASAR SIDEWAYS)"
    | "TUNGGU (DEKAT RESISTENSI)"
    | "TUNGGU (DEKAT SUPPORT)";
  direction: "BUY" | "SELL" | "WAIT";
  score: number;
  confidencePercent: number;
  entryPrice: number;
  stopLoss: number;
  slDistance: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  rrTp1: string;
  rrTp2: string;
  risk: RiskProfile;
  indicators: {
    m1: TechnicalSnapshot | null;
    m5: TechnicalSnapshot | null;
    m15: TechnicalSnapshot | null;
    h1: TechnicalSnapshot | null;
  };
  reasons: string[];
  invalidation: string;
  actionGuide: string;
}

export function evaluateScalp(
  ratesM1: Candle[],
  ratesM5: Candle[],
  ratesM15: Candle[],
  ratesH1: Candle[],
  capital: number = 31.85
): ScalpSignal {
  const m1 = analyzeCandles(ratesM1);
  const m5 = analyzeCandles(ratesM5);
  const m15 = analyzeCandles(ratesM15);
  const h1 = analyzeCandles(ratesH1);

  const currentPrice = m1?.close || m5?.close || 60000;
  const reasons: string[] = [];
  let score = 0;

  // 1. Rezim Tren Makro M15 & M5 (Bobot 35%)
  const isM15Bull = m15?.supertrend === "BULLISH";
  const isM15Bear = m15?.supertrend === "BEARISH";
  const isM5Bull = m5?.supertrend === "BULLISH" || (m5 ? m5.ema21 > m5.ema50 : false);
  const isM5Bear = m5?.supertrend === "BEARISH" || (m5 ? m5.ema21 < m5.ema50 : false);

  const isBullRegime = isM15Bull && isM5Bull;
  const isBearRegime = isM15Bear && isM5Bear;

  if (isBullRegime) {
    score += 35;
    reasons.push("Rezim Tren Bullish (M15 & M5 Selaras)");
  } else if (isBearRegime) {
    score -= 35;
    reasons.push("Rezim Tren Bearish (M15 & M5 Selaras)");
  }

  // 2. Pullback Zone & Trigger Rebound EMA 21 (Bobot 40%)
  const atrM5 = m5?.atr || 90;
  const ema21M5 = m5?.ema21 || currentPrice;
  const rsi7M5 = m5?.rsi7 || 50;

  if (ratesM5.length >= 3) {
    const cPrev = ratesM5[ratesM5.length - 2];
    const cPrev2 = ratesM5[ratesM5.length - 3];
    const bodyPrev = Math.abs(cPrev.close - cPrev.open);
    const lowerWick = Math.min(cPrev.open, cPrev.close) - cPrev.low;
    const upperWick = cPrev.high - Math.max(cPrev.open, cPrev.close);
    const hasMinBody = bodyPrev >= 4.0 || (cPrev.high - cPrev.low) >= 12.0;

    const touchedEmaBuy = cPrev.low <= ema21M5 + 0.25 * atrM5;
    const reboundBuy =
      cPrev.close > cPrev.open &&
      cPrev.close >= ema21M5 &&
      hasMinBody &&
      (lowerWick >= 0.8 * bodyPrev || cPrev.close > cPrev2.high) &&
      rsi7M5 >= 38.0 &&
      rsi7M5 <= 60.0;

    const touchedEmaSell = cPrev.high >= ema21M5 - 0.25 * atrM5;
    const reboundSell =
      cPrev.close < cPrev.open &&
      cPrev.close <= ema21M5 &&
      hasMinBody &&
      (upperWick >= 0.8 * bodyPrev || cPrev.close < cPrev2.low) &&
      rsi7M5 >= 40.0 &&
      rsi7M5 <= 62.0;

    if (isBullRegime && touchedEmaBuy && reboundBuy) {
      score += 40;
      reasons.push("Trigger: Rebound Terkonfirmasi di EMA 21 M5 (Closed Candle)");
    } else if (isBearRegime && touchedEmaSell && reboundSell) {
      score -= 40;
      reasons.push("Trigger: Rejection Terkonfirmasi di EMA 21 M5 (Closed Candle)");
    }
  }

  // 3. Trigger Cepat M1 Momentum (Bobot 25%) - Memperkuat sinyal searah
  if (m1) {
    if (m1.close > m1.ema9 && score >= 0) {
      score += 25;
      reasons.push("Momentum M1: Konfirmasi Bullish di atas EMA 9");
    } else if (m1.close < m1.ema9 && score <= 0) {
      score -= 25;
      reasons.push("Momentum M1: Konfirmasi Bearish di bawah EMA 9");
    }
  }

  score = Math.max(-100, Math.min(100, score));

  // Volatility Gate: Strictly cap SL at 85 pts ($0.85 USD) for precision EMA 21 Limit Orders
  let slDistance = 85.0;
  const isVolatilityTooHigh = atrM5 > 220;

  // Room-to-Run & Sideways Gating
  const sub20 = ratesM5.slice(-21, -1);
  const recentHigh20 = sub20.length > 0 ? Math.max(...sub20.map((c) => c.high)) : currentPrice;
  const recentLow20 = sub20.length > 0 ? Math.min(...sub20.map((c) => c.low)) : currentPrice;
  
  // Jika harga sudah breakout, ruang gerak bebas terbuka
  const roomToHigh = currentPrice < recentHigh20 ? Math.max(0, recentHigh20 - currentPrice) : 999.0;
  const roomToLow = currentPrice > recentLow20 ? Math.max(0, currentPrice - recentLow20) : 999.0;
  const minRoom = 50.0;

  const adxM5 = m5?.adx ?? 25.0;
  const isSideways = adxM5 < 15.0;
  const CONFIDENCE_THRESHOLD = 65;

  let signalType: ScalpSignal["signal"] = "TUNGGU (WAIT)";
  let direction: ScalpSignal["direction"] = "WAIT";

  if (isVolatilityTooHigh) {
    signalType = "PASAR LIAR (TUNGGU)";
    direction = "WAIT";
    reasons.unshift(`⚠️ Volatilitas ATR (${atrM5.toFixed(1)}) melebihi batas 220! Tahan saldo $${capital.toFixed(2)} Anda.`);
  } else if (isSideways) {
    signalType = "TUNGGU (PASAR SIDEWAYS)";
    direction = "WAIT";
    reasons.unshift(`⚠️ Pasar Sideways / Choppy (ADX M5 ${adxM5} < 15). Menahan peluru.`);
  } else if (score >= CONFIDENCE_THRESHOLD) {
    if (!isBullRegime) {
      signalType = "TUNGGU (WAIT)";
      direction = "WAIT";
      reasons.unshift("⛔ Beli Ditolak Keras: Tren M5 sedang Turun (Menolak Membeli Pisau Jatuh).");
    } else if (currentPrice < recentHigh20 && roomToHigh < minRoom) {
      signalType = "TUNGGU (DEKAT RESISTENSI)";
      direction = "WAIT";
      reasons.unshift(`⚠️ Beli Ditolak: Plafon Resisten M5 hanya +${roomToHigh.toFixed(1)} pts (< ${minRoom} pts).`);
    } else {
      signalType = "BELI (BUY)";
      direction = "BUY";
    }
  } else if (score <= -CONFIDENCE_THRESHOLD) {
    if (!isBearRegime) {
      signalType = "TUNGGU (WAIT)";
      direction = "WAIT";
      reasons.unshift("⛔ Jual Ditolak Keras: Tren M5 sedang Naik (Menolak Menjual di Tren Kuat).");
    } else if (currentPrice > recentLow20 && roomToLow < minRoom) {
      signalType = "TUNGGU (DEKAT SUPPORT)";
      direction = "WAIT";
      reasons.unshift(`⚠️ Jual Ditolak: Lantai Support M5 hanya -${roomToLow.toFixed(1)} pts (< ${minRoom} pts).`);
    } else {
      signalType = "JUAL (SELL)";
      direction = "SELL";
    }
  }

  const entryPrice = Number(currentPrice.toFixed(2));
  let slPrice = 0;
  let tp1Price = 0;
  let tp2Price = 0;
  let tp3Price = 0;

  if (direction === "BUY") {
    slPrice = Number((entryPrice - slDistance).toFixed(2));
    tp1Price = Number((entryPrice + slDistance * 1.5).toFixed(2));
    tp2Price = Number((entryPrice + slDistance * 2.5).toFixed(2));
    tp3Price = Number((entryPrice + slDistance * 3.5).toFixed(2));
  } else if (direction === "SELL") {
    slPrice = Number((entryPrice + slDistance).toFixed(2));
    tp1Price = Number((entryPrice - slDistance * 1.5).toFixed(2));
    tp2Price = Number((entryPrice - slDistance * 2.5).toFixed(2));
    tp3Price = Number((entryPrice - slDistance * 3.5).toFixed(2));
  } else {
    slPrice = Number((entryPrice - slDistance).toFixed(2));
    tp1Price = Number((entryPrice + slDistance * 1.5).toFixed(2));
    tp2Price = Number((entryPrice + slDistance * 2.5).toFixed(2));
    tp3Price = Number((entryPrice + slDistance * 3.5).toFixed(2));
  }

  // 0.01 lot Standard Risk Profile
  const fixedLot = 0.01;
  const maxLossUsd = Number((slDistance * fixedLot).toFixed(2));
  const maxLossPct = Number(((maxLossUsd / capital) * 100).toFixed(1));
  const profitTp1 = 1.40;
  const profitTp2 = 2.00;
  const profitTp3 = 2.50;
  const marginEst = Number(((currentPrice * fixedLot) / 2000).toFixed(2));

  let safety: RiskProfile["safetyRating"] = "AMAN";
  let advice = `Rugi maksimal terukur -$${maxLossUsd} (${maxLossPct}% modal). Volume 0.01 lot aman.`;

  if (isVolatilityTooHigh) {
    safety = "PASAR LIAR (DITOLAK)";
    advice = `Volatilitas BTC saat ini melebihi batas aman modal $${capital.toFixed(2)}. Jangan buka order sekarang.`;
  } else if (maxLossPct > 7.0) {
    safety = "PERHATIAN";
    advice = `Batas rugi -$${maxLossUsd} (${maxLossPct}% saldo). Wajib cut loss jika menyentuh SL!`;
  }

  const risk: RiskProfile = {
    accountType: "Exness Real Standard (BTCUSD)",
    capital,
    fixedLot,
    slDistancePoints: slDistance,
    maxLossUsd,
    maxLossPercent: maxLossPct,
    profitTp1Usd: profitTp1,
    profitTp2Usd: profitTp2,
    profitTp3Usd: profitTp3,
    marginRequiredUsd: marginEst,
    safetyRating: safety,
    volatilityWarning: isVolatilityTooHigh,
    advice,
  };

  const invalidation =
    direction === "BUY"
      ? `Tutup posisi / Cut Loss jika candle menembus ke bawah $${slPrice}. Setup dinyatakan GAGAL.`
      : direction === "SELL"
      ? `Tutup posisi / Cut Loss jika candle menembus ke atas $${slPrice}. Setup dinyatakan GAGAL.`
      : "Pasar sedang menunggu arah yang jelas. Belum ada level cut loss.";

  const actionGuide =
    direction !== "WAIT"
      ? `1. Buka aplikasi MT5 Exness -> pilih BTCUSD.\n` +
        `2. Pasang Volume: 0.01 lot (Wajib 0.01 lot!).\n` +
        `3. Masukkan Batas Rugi (SL): $${slPrice} (Maksimal rugi -$${maxLossUsd}).\n` +
        `4. Masukkan Target Untung (TP1): $${tp1Price} (Untung +$${profitTp1}).\n` +
        `5. PENTING: Saat TP1 tersentuh, segera ubah SL ke harga beli ($${entryPrice}) agar bebas risiko!`
      : `Tahan dulu modal $${capital.toFixed(2)} Anda. Jangan buru-buru masuk saat pasar belum memberi konfirmasi.`;

  return {
    signal: signalType,
    direction,
    score,
    confidencePercent: Math.abs(score),
    entryPrice,
    stopLoss: slPrice,
    slDistance,
    takeProfit1: tp1Price,
    takeProfit2: tp2Price,
    takeProfit3: tp3Price,
    rrTp1: "1:1.5",
    rrTp2: "1:2.5",
    risk,
    indicators: { m1, m5, m15, h1 },
    reasons,
    invalidation,
    actionGuide,
  };
}
