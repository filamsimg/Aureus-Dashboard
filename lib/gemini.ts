/**
 * Google Gemini AI Copilot Integration
 * Dual-Key High Availability (Primary + Secondary failover)
 * Acts as Senior Quantitative Scalp Reviewer providing second-opinion commentary in Indonesian.
 * Safely handles missing API keys with instant algorithmic fallback.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { ScalpSignal } from "./scalpEngine";

export interface AiReviewResult {
  headline: string;
  verdict: "SETUJU ENTRY" | "TIDAK DISARANKAN" | "WAIT & SEE";
  analysisText: string;
  riskNotice: string;
  source: "Google Gemini AI" | "Algorithmic Quantitative Copilot";
}

const MODEL_CANDIDATES = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-3.8-flash",
  "gemini-2.5-pro",
];

export async function reviewScalpWithGemini(
  signal: ScalpSignal,
  customApiKey?: string
): Promise<AiReviewResult> {
  const primaryKey = customApiKey || process.env.GEMINI_API_KEY || "";
  const secondaryKey = process.env.GEMINI_API_KEY_SECONDARY || "";

  const keysToTry: string[] = [];
  if (primaryKey.trim()) keysToTry.push(primaryKey.trim());
  if (secondaryKey.trim() && secondaryKey.trim() !== primaryKey.trim()) {
    keysToTry.push(secondaryKey.trim());
  }

  // Fallback if no keys are configured
  if (keysToTry.length === 0) {
    return generateAlgorithmicReview(signal);
  }

  const prompt = `
Anda adalah Senior Quantitative Scalper & Risk Manager profesional.
Trader Anda menggunakan Akun Real Standard Exness dengan modal kecil $20 USD dan volume tetap 0.01 lot pada BTCUSD.

Berikut adalah data teknis yang baru saja terdeteksi oleh sistem:
- Arah Sinyal: ${signal.signal} (${signal.direction})
- Skor Konfluensi: ${signal.score} / 100 (${signal.confidencePercent}%)
- Harga Entry: $${signal.entryPrice}
- Stop Loss (SL): $${signal.stopLoss} (Jarak: -${signal.slDistance} poin)
- Resiko Kerugian: -$${signal.risk.maxLossUsd} (${signal.risk.maxLossPercent}% dari modal $20)
- Take Profit 1 (TP1): $${signal.takeProfit1} (Estimasi Untung: +$${signal.risk.profitTp1Usd})
- Take Profit 2 (TP2): $${signal.takeProfit2} (Estimasi Untung: +$${signal.risk.profitTp2Usd})
- Volatilitas M5 (ATR): ${signal.indicators.m5?.atr || "Normal"}
- Peringatan Volatilitas: ${signal.risk.volatilityWarning ? "TERLALU TINGGI" : "AMAN"}
- Faktor Teknis: ${signal.reasons.join(", ")}

Tugas Anda: Berikan review singkat, tajam, dan realistis dalam Bahasa Indonesia (maksimal 3 paragraf pendek).
Format output persis JSON berikut tanpa markdown pembungkus:
{
  "headline": "Judul review singkat maksimal 8 kata",
  "verdict": "SETUJU ENTRY" atau "TIDAK DISARANKAN" atau "WAIT & SEE",
  "analysisText": "Penjelasan mengapa setup ini logis atau berbahaya bagi modal $20, dan apa konfirmasi terakhir yang harus diperhatikan trader sebelum klik entry di MT5.",
  "riskNotice": "Pesan disiplin psikologis (misal: pentingnya geser SL ke BEP setelah TP1, atau jangan geser SL lebih jauh jika harga mendekati SL)."
}
`;

  // Try each key with candidate models
  for (const apiKey of keysToTry) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      for (const modelName of MODEL_CANDIDATES) {
        try {
          const model = genAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent(prompt);
          const text = result.response.text().trim();

          // Clean JSON markdown if any
          const jsonStr = text.replace(/```json/g, "").replace(/```/g, "").trim();
          const parsed = JSON.parse(jsonStr);

          return {
            headline: parsed.headline || `Review AI: Setup ${signal.signal}`,
            verdict: parsed.verdict || (signal.direction === "WAIT" ? "WAIT & SEE" : "SETUJU ENTRY"),
            analysisText: parsed.analysisText || "Analisa setup terkonfirmasi memenuhi aturan sniper scalping.",
            riskNotice: parsed.riskNotice || "Wajib geser SL ke Breakeven begitu TP1 tercapai!",
            source: "Google Gemini AI",
          };
        } catch (mErr: any) {
          // If model not found (404), try next candidate model
          if (mErr.message?.includes("404") || mErr.message?.includes("not found")) {
            continue;
          }
          throw mErr;
        }
      }
    } catch (keyErr) {
      console.warn(`Gemini key failover triggered:`, keyErr);
      // Continue to next key
    }
  }

  // If all Gemini keys fail, fallback safely
  return generateAlgorithmicReview(signal);
}

function generateAlgorithmicReview(signal: ScalpSignal): AiReviewResult {
  if (signal.risk.volatilityWarning) {
    return {
      headline: "Volatilitas Liar - Tahan Saldo $20 Anda",
      verdict: "TIDAK DISARANKAN",
      analysisText:
        "Volatilitas pasar M5 saat ini terlalu lebar untuk akun Standard modal $20. " +
        `Jarak SL aman saat ini butuh lebih dari 140 poin. Jika dipaksakan, satu kali loss dapat memakan lebih dari $1.50 (7.5%+ modal). ` +
        "Disarankan menunggu candle mengecil dan pasar kembali stabil.",
      riskNotice: "Prioritas nomor 1 trader bermodal kecil adalah Capital Preservation (menjaga modal).",
      source: "Algorithmic Quantitative Copilot",
    };
  }

  if (signal.direction === "BUY") {
    return {
      headline: `Setup Sniper Buy BTC di Area $${signal.entryPrice}`,
      verdict: "SETUJU ENTRY",
      analysisText:
        `Peluang BUY terkonfirmasi dengan konfluensi ${signal.confidencePercent}%. ` +
        `M5 memantul di zona support dengan pembatasan risiko ketat -$${signal.risk.maxLossUsd} pada lot 0.01. ` +
        "Pastikan candle M1 terkonfirmasi bullish close sebelum eksekusi order BUY di MT5.",
      riskNotice: "Amankan profit di TP1 ($" + signal.takeProfit1 + ") dan segera geser SL ke Breakeven (BEP).",
      source: "Algorithmic Quantitative Copilot",
    };
  }

  if (signal.direction === "SELL") {
    return {
      headline: `Setup Sniper Sell BTC di Area $${signal.entryPrice}`,
      verdict: "SETUJU ENTRY",
      analysisText:
        `Peluang SELL terkonfirmasi dengan konfluensi ${signal.confidencePercent}%. ` +
        `Harga tertahan di resistance kuat dengan risiko terukur -$${signal.risk.maxLossUsd} pada lot 0.01. ` +
        "Tunggu wick reject atas pada candle M1 sebelum klik tombol SELL di terminal MT5.",
      riskNotice: "Wajib disiplin SL di $" + signal.stopLoss + ". Jangan pernah menahan posisi minus melebihi batas!",
      source: "Algorithmic Quantitative Copilot",
    };
  }

  return {
    headline: "Kondisi Pasar Sedang Konsolidasi / Wait",
    verdict: "WAIT & SEE",
    analysisText:
      "Struktur tren belum memberikan konfluensi minimal 65% untuk akun modal $20. " +
      "Jangan memaksakan entry pada kondisi choppy agar tidak terkena potongan spread dan false breakout.",
    riskNotice: "Tidak trading saat pasar belum jelas adalah bagian dari strategi disiplin seorang scalper.",
    source: "Algorithmic Quantitative Copilot",
  };
}
