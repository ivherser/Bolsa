import { CandlestickSeries, createChart, HistogramSeries } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { fetchHistory } from "../api";
import type { HistoryInterval } from "../types";

const INTERVALS: { id: HistoryInterval; label: string }[] = [
  { id: "1h", label: "1H" },
  { id: "1d", label: "1D" },
  { id: "1wk", label: "1S" },
];

export default function CandleChart({
  ticker,
  onError,
}: {
  ticker: string;
  onError: () => void;
}) {
  const [interval, setInterval] = useState<HistoryInterval>("1d");
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const errRef = useRef(onError);
  errRef.current = onError;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { color: "#171e2e" },
        textColor: "#c8d0e0",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "#2a3550" },
        horzLines: { color: "#2a3550" },
      },
      timeScale: {
        timeVisible: interval === "1h",
        secondsVisible: false,
        borderColor: "#2a3550",
      },
      rightPriceScale: { borderColor: "#2a3550" },
    });
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#2fbf71",
      downColor: "#e5534b",
      borderUpColor: "#2fbf71",
      borderDownColor: "#e5534b",
      wickUpColor: "#2fbf71",
      wickDownColor: "#e5534b",
    });
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: "vol",
      priceFormat: { type: "volume" },
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    candleSeries.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.2 } });

    const ctrl = new AbortController();
    setError(null);
    fetchHistory(ticker, interval, ctrl.signal)
      .then((resp) => {
        candleSeries.setData(
          resp.candles.map((c) => ({
            time: c.time as import("lightweight-charts").UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          })),
        );
        volumeSeries.setData(
          resp.candles.map((c) => ({
            time: c.time as import("lightweight-charts").UTCTimestamp,
            value: c.volume,
            color: c.close >= c.open ? "rgba(47,191,113,0.4)" : "rgba(229,83,75,0.4)",
          })),
        );
        chart.timeScale().fitContent();
      })
      .catch((e) => {
        if ((e as Error).name !== "AbortError") {
          setError(e instanceof Error ? e.message : "Error desconocido");
          errRef.current();
        }
      });
    return () => {
      ctrl.abort();
      chart.remove();
    };
  }, [ticker, interval]);

  return (
    <div className="candle-chart">
      <div className="interval-tabs">
        {INTERVALS.map((o) => (
          <button
            key={o.id}
            type="button"
            className={interval === o.id ? "tab active" : "tab"}
            onClick={() => setInterval(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {error && <div className="state-msg neg">{error}</div>}
      <div ref={containerRef} className="chart-container" />
    </div>
  );
}
