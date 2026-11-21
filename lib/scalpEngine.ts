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
  signal: "BELI (BUY)" | "JUAL (SELL)" | "TUNGGU (WAIT)" | "PASAR LIAR (TUNGGU)";
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

  // 1. M15 Trend Filter (30%)
  if (m15) {
    if (m15.ribbon === "BULLISH_ALIGNMENT") {
      score += 15;
      reasons.push("Tren M15 Naik (EMA 9 > 21 > 50)");
    } else if (m15.ribbon === "BEARISH_ALIGNMENT") {
      score -= 15;
      reasons.push("Tren M15 Turun (EMA 9 < 21 < 50)");
    }

    if (m15.supertrend === "BULLISH") score += 10;
    else score -= 10;
  }

  // 2. M5 Setup (40%)
  if (m5) {
    if (m5.rsi7 <= 28) {
      score += 20;
      reasons.push(`RSI M5 Jenuh Jual (${m5.rsi7}) - Siap Memantul Naik`);
    } else if (m5.rsi7 >= 72) {
      score -= 20;
      reasons.push(`RSI M5 Jenuh Beli (${m5.rsi7}) - Siap Berbalik Turun`);
    }

    if (m5.macdHist > 0) score += 10;
    else score -= 10;

    if (m5.candlePattern === "BULLISH_PIN_BAR") {
      score += 15;
      reasons.push("Candle M5 Penolakan Bawah (Buyer Kuat)");
    } else if (m5.candlePattern === "BEARISH_PIN_BAR") {
      score -= 15;
      reasons.push("Candle M5 Penolakan Atas (Seller Kuat)");
    }

    if (m5.smc.orderBlock === "BULLISH_OB") {
      score += 10;
      reasons.push("Area Beli Kuat (Bullish Order Block)");
    } else if (m5.smc.orderBlock === "BEARISH_OB") {
      score -= 10;
      reasons.push("Area Jual Kuat (Bearish Order Block)");
    }
  }

  // 3. M1 Trigger (30%)
  if (m1) {
    if (m1.supertrend === "BULLISH") score += 10;
    else score -= 10;

    if (currentPrice > m1.ema9) score += 5;
    else score -= 5;
  }

  score = Math.max(-100, Math.min(100, score));

  // Volatility Gate: Strictly cap SL for $20 Real Standard account
  const atrM5 = m5?.atr || 90;
  let slDistance = Number(Math.max(70, Math.min(130, atrM5 * 1.1)).toFixed(2));
  const isVolatilityTooHigh = atrM5 > 140;

  let signalType: ScalpSignal["signal"] = "TUNGGU (WAIT)";
  let direction: ScalpSignal["direction"] = "WAIT";

  if (isVolatilityTooHigh) {
    signalType = "PASAR LIAR (TUNGGU)";
    direction = "WAIT";
    reasons.unshift(`⚠️ Gerakan candle terlalu panjang! Tahan saldo $${capital.toFixed(2)} Anda sampai pasar tenang.`);
  } else if (score >= 55) {
    signalType = "BELI (BUY)";
    direction = "BUY";
  } else if (score <= -55) {
    signalType = "JUAL (SELL)";
    direction = "SELL";
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
  const profitTp1 = Number((maxLossUsd * 1.5).toFixed(2));
  const profitTp2 = Number((maxLossUsd * 2.5).toFixed(2));
  const profitTp3 = Number((maxLossUsd * 3.5).toFixed(2));
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
