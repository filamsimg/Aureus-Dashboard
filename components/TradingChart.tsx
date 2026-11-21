"use client";

import React, { useEffect, useRef } from "react";
import { createChart, IChartApi, ISeriesApi, IPriceLine } from "lightweight-charts";
import { Candle } from "@/lib/indicators";
import { ScalpSignal } from "@/lib/scalpEngine";

interface TradingChartProps {
  candles: Candle[];
  signal: ScalpSignal | null;
  timeframe: string;
}

export default function TradingChart({ candles, signal, timeframe }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const entryLineRef = useRef<IPriceLine | null>(null);
  const slLineRef = useRef<IPriceLine | null>(null);
  const tp1LineRef = useRef<IPriceLine | null>(null);
  const tp2LineRef = useRef<IPriceLine | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 420,
      layout: {
        background: { color: "#121214" },
        textColor: "#71717a",
      },
      grid: {
        vertLines: { color: "#1e1e24" },
        horzLines: { color: "#1e1e24" },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: "#27272a",
      },
      timeScale: {
        borderColor: "#27272a",
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: number) => {
          const date = new Date(time * 1000);
          return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        },
      },
      localization: {
        timeFormatter: (time: number) => {
          const date = new Date(time * 1000);
          return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        },
      },
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: "#10b981",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || !candles || candles.length === 0) return;
    try {
      seriesRef.current.setData(
        candles.map((c) => ({
          time: c.time as any,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
      );
    } catch (err) {
      console.warn("Candle update warning:", err);
    }
  }, [candles]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    if (entryLineRef.current) { series.removePriceLine(entryLineRef.current); entryLineRef.current = null; }
    if (slLineRef.current) { series.removePriceLine(slLineRef.current); slLineRef.current = null; }
    if (tp1LineRef.current) { series.removePriceLine(tp1LineRef.current); tp1LineRef.current = null; }
    if (tp2LineRef.current) { series.removePriceLine(tp2LineRef.current); tp2LineRef.current = null; }

    if (!signal || signal.direction === "WAIT") return;

    entryLineRef.current = series.createPriceLine({
      price: signal.entryPrice,
      color: "#38bdf8",
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: "ENTRY",
    });

    slLineRef.current = series.createPriceLine({
      price: signal.stopLoss,
      color: "#ef4444",
      lineWidth: 1,
      lineStyle: 0,
      axisLabelVisible: true,
      title: "SL",
    });

    tp1LineRef.current = series.createPriceLine({
      price: signal.takeProfit1,
      color: "#10b981",
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: "TP1",
    });

    tp2LineRef.current = series.createPriceLine({
      price: signal.takeProfit2,
      color: "#2dd4bf",
      lineWidth: 1,
      lineStyle: 0,
      axisLabelVisible: true,
      title: "TP2",
    });
  }, [signal]);

  return (
    <div className="flex flex-col bg-[#121214] border border-[#27272a] rounded-xl p-3.5 shadow-sm">
      <div className="flex items-center justify-between pb-2 border-b border-zinc-800 mb-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-zinc-200">
            BTC/USD Candlestick
          </span>
          <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 text-[10px] font-semibold">
            {timeframe}
          </span>
        </div>
        <div className="flex items-center gap-2 text-zinc-500 text-[11px]">
          <span>● EMA 9/21/50</span>
        </div>
      </div>

      <div ref={chartContainerRef} className="w-full h-[420px] rounded overflow-hidden relative">
        {(!candles || candles.length === 0) && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-500">
            Memuat grafik...
          </div>
        )}
      </div>
    </div>
  );
}
