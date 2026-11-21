/**
 * Technical Indicators & Smart Money Concepts (SMC) Engine
 * Pure deterministic mathematics in TypeScript for 0ms execution latency.
 */

export interface Candle {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SupportResistance {
  immediateSupport: number;
  immediateResistance: number;
  majorSupport: number;
  majorResistance: number;
}

export interface SmcStructures {
  fvg: "BULLISH_FVG" | "BEARISH_FVG" | "NONE";
  orderBlock: "BULLISH_OB" | "BEARISH_OB" | "NONE";
  liquiditySweep: "BULLISH_SWEEP" | "BEARISH_SWEEP" | "NONE";
}

export interface TechnicalSnapshot {
  close: number;
  ema9: number;
  ema21: number;
  ema50: number;
  ema200: number;
  rsi7: number;
  rsi14: number;
  macd: number;
  macdSignal: number;
  macdHist: number;
  atr: number;
  supertrend: "BULLISH" | "BEARISH";
  supertrendValue: number;
  ribbon: "BULLISH_ALIGNMENT" | "BEARISH_ALIGNMENT" | "MIXED";
  candlePattern: "BULLISH_PIN_BAR" | "BEARISH_PIN_BAR" | "NORMAL";
  sr: SupportResistance;
  smc: SmcStructures;
}

export function calculateEMA(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [values[0]];

  for (let i = 1; i < values.length; i++) {
    const val = values[i] * k + ema[i - 1] * (1 - k);
    ema.push(val);
  }
  return ema;
}

export function calculateRSI(closes: number[], period: number = 14): number[] {
  if (closes.length <= period) return new Array(closes.length).fill(50);

  const rsi: number[] = new Array(closes.length).fill(50);
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsi[period] = 100 - 100 / (1 + rs);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi[i] = 100 - 100 / (1 + rs);
  }

  return rsi;
}

export function calculateATR(candles: Candle[], period: number = 14): number[] {
  if (candles.length === 0) return [];
  const trs: number[] = [candles[0].high - candles[0].low];

  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    const prevC = candles[i - 1].close;
    const tr = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
    trs.push(tr);
  }

  // Smooth ATR with Wilder's MA
  const atr: number[] = new Array(candles.length).fill(0);
  let sum = 0;
  for (let i = 0; i < Math.min(period, trs.length); i++) sum += trs[i];
  atr[Math.min(period - 1, trs.length - 1)] = sum / Math.min(period, trs.length);

  for (let i = period; i < trs.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + trs[i]) / period;
  }

  return atr;
}

export function calculateMACD(closes: number[], fast: number = 12, slow: number = 26, signal: number = 9) {
  const emaFast = calculateEMA(closes, fast);
  const emaSlow = calculateEMA(closes, slow);
  const macdLine: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    macdLine.push(emaFast[i] - emaSlow[i]);
  }

  const signalLine = calculateEMA(macdLine, signal);
  const hist: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    hist.push(macdLine[i] - signalLine[i]);
  }

  return { macdLine, signalLine, hist };
}

export function calculateSupertrend(candles: Candle[], period: number = 10, multiplier: number = 2.5) {
  const atr = calculateATR(candles, period);
  const n = candles.length;
  const st: number[] = new Array(n).fill(0);
  const direction: ("BULLISH" | "BEARISH")[] = new Array(n).fill("BULLISH");

  for (let i = 1; i < n; i++) {
    const hl2 = (candles[i].high + candles[i].low) / 2;
    const upper = hl2 + multiplier * (atr[i] || 50);
    const lower = hl2 - multiplier * (atr[i] || 50);

    const prevClose = candles[i - 1].close;
    const prevDir = direction[i - 1];

    if (prevDir === "BULLISH") {
      if (candles[i].close < lower) {
        direction[i] = "BEARISH";
        st[i] = upper;
      } else {
        direction[i] = "BULLISH";
        st[i] = lower;
      }
    } else {
      if (candles[i].close > upper) {
        direction[i] = "BULLISH";
        st[i] = lower;
      } else {
        direction[i] = "BEARISH";
        st[i] = upper;
      }
    }
  }

  return { st, direction };
}

export function findSupportResistance(candles: Candle[], lookback: number = 30): SupportResistance {
  const sub = candles.slice(-lookback);
  const current = sub[sub.length - 1]?.close || 70000;

  const highs = sub.map((c) => c.high);
  const lows = sub.map((c) => c.low);

  const swingHighs: number[] = [];
  const swingLows: number[] = [];

  for (let i = 2; i < sub.length - 2; i++) {
    if (highs[i] > highs[i - 1] && highs[i] > highs[i - 2] && highs[i] > highs[i + 1] && highs[i] > highs[i + 2]) {
      swingHighs.push(highs[i]);
    }
    if (lows[i] < lows[i - 1] && lows[i] < lows[i - 2] && lows[i] < lows[i + 1] && lows[i] < lows[i + 2]) {
      swingLows.push(lows[i]);
    }
  }

  const immediateResistance = swingHighs.filter((h) => h > current).sort((a, b) => a - b)[0] || Math.max(...highs);
  const immediateSupport = swingLows.filter((l) => l < current).sort((a, b) => b - a)[0] || Math.min(...lows);

  return {
    immediateSupport: Number(immediateSupport.toFixed(2)),
    immediateResistance: Number(immediateResistance.toFixed(2)),
    majorSupport: Number(Math.min(...lows).toFixed(2)),
    majorResistance: Number(Math.max(...highs).toFixed(2)),
  };
}

export function detectSMC(candles: Candle[]): SmcStructures {
  if (candles.length < 5) return { fvg: "NONE", orderBlock: "NONE", liquiditySweep: "NONE" };
  const last = candles.length - 1;

  // FVG
  const bullFvg = candles[last].low > candles[last - 2].high;
  const bearFvg = candles[last].high < candles[last - 2].low;
  const fvg = bullFvg ? "BULLISH_FVG" : bearFvg ? "BEARISH_FVG" : "NONE";

  // Order block
  const c1Red = candles[last - 2].close < candles[last - 2].open;
  const c2Green = candles[last - 1].close > candles[last - 1].open;
  const c3Green = candles[last].close > candles[last].open;

  let ob: "BULLISH_OB" | "BEARISH_OB" | "NONE" = "NONE";
  if (c1Red && c2Green && c3Green) ob = "BULLISH_OB";
  else if (!c1Red && !c2Green && !c3Green) ob = "BEARISH_OB";

  // Liquidity sweep
  const recentMax = Math.max(...candles.slice(-15, -1).map((c) => c.high));
  const recentMin = Math.min(...candles.slice(-15, -1).map((c) => c.low));

  const sweepHigh = candles[last].high > recentMax && candles[last].close < recentMax;
  const sweepLow = candles[last].low < recentMin && candles[last].close > recentMin;

  const sweep = sweepHigh ? "BEARISH_SWEEP" : sweepLow ? "BULLISH_SWEEP" : "NONE";

  return { fvg, orderBlock: ob, liquiditySweep: sweep };
}

export function analyzeCandles(candles: Candle[]): TechnicalSnapshot | null {
  if (!candles || candles.length < 25) return null;

  const closes = candles.map((c) => c.close);
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const ema50 = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, Math.min(200, closes.length));

  const rsi7 = calculateRSI(closes, 7);
  const rsi14 = calculateRSI(closes, 14);

  const { macdLine, signalLine, hist } = calculateMACD(closes);
  const atr = calculateATR(candles, 14);
  const { st, direction } = calculateSupertrend(candles, 10, 2.5);

  const last = candles.length - 1;
  const lastClose = closes[last];
  const lastEma9 = ema9[last];
  const lastEma21 = ema21[last];
  const lastEma50 = ema50[last];

  const ribbon =
    lastClose > lastEma9 && lastEma9 > lastEma21 && lastEma21 > lastEma50
      ? "BULLISH_ALIGNMENT"
      : lastClose < lastEma9 && lastEma9 < lastEma21 && lastEma21 < lastEma50
      ? "BEARISH_ALIGNMENT"
      : "MIXED";

  // Pin bar detection
  const cur = candles[last];
  const body = Math.abs(cur.close - cur.open);
  const lowerWick = Math.min(cur.close, cur.open) - cur.low;
  const upperWick = cur.high - Math.max(cur.close, cur.open);

  const pinBull = lowerWick >= 2 * body && cur.close > cur.open;
  const pinBear = upperWick >= 2 * body && cur.close < cur.open;
  const pattern = pinBull ? "BULLISH_PIN_BAR" : pinBear ? "BEARISH_PIN_BAR" : "NORMAL";

  return {
    close: Number(lastClose.toFixed(2)),
    ema9: Number(lastEma9.toFixed(2)),
    ema21: Number(lastEma21.toFixed(2)),
    ema50: Number(lastEma50.toFixed(2)),
    ema200: Number(ema200[last].toFixed(2)),
    rsi7: Number(rsi7[last].toFixed(2)),
    rsi14: Number(rsi14[last].toFixed(2)),
    macd: Number(macdLine[last].toFixed(2)),
    macdSignal: Number(signalLine[last].toFixed(2)),
    macdHist: Number(hist[last].toFixed(2)),
    atr: Number(atr[last].toFixed(2)),
    supertrend: direction[last],
    supertrendValue: Number(st[last].toFixed(2)),
    ribbon,
    candlePattern: pattern,
    sr: findSupportResistance(candles, 30),
    smc: detectSMC(candles),
  };
}
