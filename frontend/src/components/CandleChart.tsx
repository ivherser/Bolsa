import {
  CandlestickSeries,
  createChart,
  HistogramSeries,
  LineSeries,
} from "lightweight-charts";
import type {
  IChartApi,
  ISeriesApi,
  MouseEventParams,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { fetchHistory } from "../api";
import { macd, rsi, sma } from "../indicators";
import {
  loadChartPrefs,
  loadDrawings,
  saveChartPrefs,
  saveDrawings,
} from "../storage";
import type { ChartPrefs, DrawnLine } from "../storage";
import type { Candle, HistoryInterval } from "../types";

const INTERVALS: { id: HistoryInterval; label: string }[] = [
  { id: "1h", label: "1H" },
  { id: "1d", label: "1D" },
  { id: "1wk", label: "1S" },
];

const SMA_DEFS = [
  { key: "sma50", n: 50, color: "#22c55e", label: "SMA 50" },
  { key: "sma70", n: 70, color: "#3b82f6", label: "SMA 70" },
  { key: "sma200", n: 200, color: "#a855f7", label: "SMA 200" },
] as const;

const LINE_COLOR = "#f5c542";
const SUBPANE_H = 110;

type UT = UTCTimestamp;

function isWeekday(d: Date): boolean {
  const wd = d.getUTCDay();
  return wd >= 1 && wd <= 5;
}

function whitespaceTimes(
  candles: Candle[],
  interval: HistoryInterval,
  expiration: string,
): UT[] {
  if (!candles.length) return [];
  const expUtc = Date.parse(`${expiration}T00:00:00Z`);
  if (!Number.isFinite(expUtc)) return [];
  const last = candles[candles.length - 1]!.time;
  const out: UT[] = [];
  if (interval === "1wk") {
    for (let t = last + 7 * 86400; ; t += 7 * 86400) {
      const d = new Date(t * 1000);
      if (d.getTime() > expUtc) break;
      out.push(t as UT);
    }
    return out;
  }
  const lastDate = new Date(last * 1000);
  if (interval === "1d") {
    const tod =
      lastDate.getUTCHours() * 3600 + lastDate.getUTCMinutes() * 60 + lastDate.getUTCSeconds();
    for (let day = new Date(lastDate.getTime() + 86400e3); ; day = new Date(day.getTime() + 86400e3)) {
      if (day.getTime() > expUtc) break;
      if (isWeekday(day)) {
        const utcMidnight = Math.floor(day.getTime() / 86400e3) * 86400;
        out.push((utcMidnight + tod) as UT);
      }
    }
    return out;
  }
  // 1h: reutiliza las horas UTC vistas en los últimos 5 días de trading
  const days = new Set<string>();
  for (let i = candles.length - 1; i >= 0 && days.size < 5; i--) {
    days.add(new Date(candles[i]!.time * 1000).toISOString().slice(0, 10));
  }
  const tods = new Set<number>();
  for (const c of candles) {
    const d = new Date(c.time * 1000);
    if (days.has(d.toISOString().slice(0, 10))) {
      tods.add(d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds());
    }
  }
  for (let day = new Date(lastDate.getTime() + 86400e3); ; day = new Date(day.getTime() + 86400e3)) {
    if (day.getTime() > expUtc) break;
    if (isWeekday(day)) {
      const utcMidnight = Math.floor(day.getTime() / 86400e3) * 86400;
      for (const tod of [...tods].sort((a, b) => a - b)) {
        out.push((utcMidnight + tod) as UT);
      }
    }
  }
  return out;
}

export default function CandleChart({
  ticker,
  expiration,
  expirationDte,
  onError,
}: {
  ticker: string;
  expiration: string | null;
  expirationDte: number | null;
  onError: () => void;
}) {
  const [interval, setInterval] = useState<HistoryInterval>("1d");
  const [prefs, setPrefs] = useState<ChartPrefs>(loadChartPrefs);
  const [drawMode, setDrawMode] = useState(false);
  const [awaitingSecond, setAwaitingSecond] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marker, setMarker] = useState<{
    x: number;
    label: string;
    flip: boolean;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const candlesRef = useRef<Candle[]>([]);
  const smaRefs = useRef<Record<string, ISeriesApi<"Line"> | null>>({});
  const rsiRefs = useRef<ISeriesApi<"Line">[]>([]);
  const macdRefs = useRef<ISeriesApi<"Line">[]>([]);
  const lineSeriesRefs = useRef<ISeriesApi<"Line">[]>([]);
  const drawingsRef = useRef<DrawnLine[]>([]);
  const pendingRef = useRef<{ t: number; p: number } | null>(null);
  const expTargetRef = useRef<number | null>(null);
  const [ready, setReady] = useState(0);
  const errRef = useRef(onError);
  errRef.current = onError;

  const subPanes = (prefs.rsi ? 1 : 0) + (prefs.macd ? 1 : 0);
  const baseH = typeof window !== "undefined" && window.innerWidth < 700 ? 240 : 320;

  const togglePref = (k: keyof ChartPrefs) => {
    setPrefs((p) => {
      const next = { ...p, [k]: !p[k] };
      saveChartPrefs(next);
      return next;
    });
  };

  const removeSeries = (s: ISeriesApi<"Line"> | null) => {
    if (s && chartRef.current) chartRef.current.removeSeries(s);
  };

  // Gráfico + datos
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
    chartRef.current = chart;
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#2fbf71",
      downColor: "#e5534b",
      borderUpColor: "#2fbf71",
      borderDownColor: "#e5534b",
      wickUpColor: "#2fbf71",
      wickDownColor: "#e5534b",
    });
    candleSeriesRef.current = candleSeries;
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: "vol",
      priceFormat: { type: "volume" },
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    candleSeries.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.2 } });

    const ctrl = new AbortController();
    setError(null);
    setReady(0);
    candlesRef.current = [];
    drawingsRef.current = [];
    lineSeriesRefs.current = [];
    pendingRef.current = null;
    setAwaitingSecond(false);
    setMarker(null);
    expTargetRef.current = null;

    fetchHistory(ticker, interval, ctrl.signal)
      .then((resp) => {
        candlesRef.current = resp.candles;
        candleSeries.setData(
          resp.candles.map((c) => ({
            time: c.time as UT,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          })),
        );
        volumeSeries.setData(
          resp.candles.map((c) => ({
            time: c.time as UT,
            value: c.volume,
            color: c.close >= c.open ? "rgba(47,191,113,0.4)" : "rgba(229,83,75,0.4)",
          })),
        );
        // líneas guardadas para este ticker:interval
        const key = `${ticker}:${interval}`;
        drawingsRef.current = loadDrawings(key);
        for (const l of drawingsRef.current) {
          const s = chart.addSeries(LineSeries, {
            color: LINE_COLOR,
            lineWidth: 1,
            lastValueVisible: false,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
          });
          const pts = [
            { time: l.t1 as UT, value: l.p1 },
            { time: l.t2 as UT, value: l.p2 },
          ].sort((a, b) => a.time - b.time);
          s.setData(pts);
          lineSeriesRefs.current.push(s);
        }
        chart.timeScale().fitContent();
        setReady((r) => r + 1);
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
      chartRef.current = null;
      candleSeriesRef.current = null;
      smaRefs.current = {};
      rsiRefs.current = [];
      macdRefs.current = [];
      lineSeriesRefs.current = [];
    };
  }, [ticker, interval]);

  // SMAs en el panel principal
  useEffect(() => {
    const chart = chartRef.current;
    const candles = candlesRef.current;
    if (!chart || !ready || !candles.length) return;
    const closes = candles.map((c) => c.close);
    for (const def of SMA_DEFS) {
      const existing = smaRefs.current[def.key] ?? null;
      if (prefs[def.key] && !existing) {
        const s = chart.addSeries(LineSeries, {
          color: def.color,
          lineWidth: 2,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
        });
        const vals = sma(closes, def.n);
        s.setData(
          candles
            .map((c, i) => ({ time: c.time as UT, value: vals[i] ?? NaN }))
            .filter((p) => Number.isFinite(p.value)),
        );
        smaRefs.current[def.key] = s;
      } else if (!prefs[def.key] && existing) {
        chart.removeSeries(existing);
        smaRefs.current[def.key] = null;
      }
    }
  }, [prefs.sma50, prefs.sma70, prefs.sma200, ready]);

  // Sub-paneles RSI/MACD: se reconstruyen en orden canónico (RSI, luego MACD)
  // para evitar índices de panel inconsistentes al alternar.
  useEffect(() => {
    const chart = chartRef.current;
    const candles = candlesRef.current;
    if (!chart || !ready) return;
    rsiRefs.current.forEach(removeSeries);
    rsiRefs.current = [];
    macdRefs.current.forEach(removeSeries);
    macdRefs.current = [];
    while (chart.panes().length > 1) {
      chart.removePane(chart.panes().length - 1);
    }
    if (!candles.length || (!prefs.rsi && !prefs.macd)) return;
    const closes = candles.map((c) => c.close);
    const toPts = (vals: (number | null)[]) =>
      candles
        .map((c, i) => ({ time: c.time as UT, value: vals[i] ?? NaN }))
        .filter((p) => Number.isFinite(p.value));
    let paneIdx = 1;
    if (prefs.rsi) {
      const s = chart.addSeries(
        LineSeries,
        {
          color: "#38bdf8",
          lineWidth: 2,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
        },
        paneIdx,
      );
      s.setData(toPts(rsi(closes, 14)));
      s.createPriceLine({
        price: 70,
        color: "#8fa0bd",
        lineStyle: 2,
        lineWidth: 1,
        axisLabelVisible: true,
      });
      s.createPriceLine({
        price: 30,
        color: "#8fa0bd",
        lineStyle: 2,
        lineWidth: 1,
        axisLabelVisible: true,
      });
      rsiRefs.current = [s];
      paneIdx += 1;
    }
    if (prefs.macd) {
      const { macd: m, signal, hist } = macd(closes);
      const mline = chart.addSeries(
        LineSeries,
        {
          color: "#4f8cff",
          lineWidth: 2,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
        },
        paneIdx,
      );
      mline.setData(toPts(m));
      const sline = chart.addSeries(
        LineSeries,
        {
          color: "#fb923c",
          lineWidth: 1,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
        },
        paneIdx,
      );
      sline.setData(toPts(signal));
      const h = chart.addSeries(
        HistogramSeries,
        {
          lastValueVisible: false,
          priceLineVisible: false,
          priceFormat: { type: "price", precision: 4 },
        },
        paneIdx,
      );
      h.setData(
        toPts(hist).map((p) => ({
          ...p,
          color: p.value >= 0 ? "rgba(47,191,113,0.6)" : "rgba(229,83,75,0.6)",
        })),
      );
      macdRefs.current = [mline, sline, h as unknown as ISeriesApi<"Line">];
    }
    const panes = chart.panes();
    panes[0]?.setStretchFactor(baseH);
    for (const pane of panes.slice(1)) {
      pane.setStretchFactor(SUBPANE_H);
    }
  }, [prefs.rsi, prefs.macd, ready]);

  // Modo dibujo: líneas punto a punto
  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    if (!chart || !candleSeries || !ready || !drawMode) return;
    const handler = (param: MouseEventParams<Time>) => {
      const paneIndex = (param as MouseEventParams<Time> & { paneIndex?: number }).paneIndex;
      if (paneIndex !== undefined && paneIndex !== 0) return;
      const t = param.time;
      if (t === undefined || !param.point) return;
      const price = candleSeries.coordinateToPrice(param.point.y);
      if (price === null) return;
      const pend = pendingRef.current;
      if (!pend) {
        pendingRef.current = { t: t as number, p: price };
        setAwaitingSecond(true);
        return;
      }
      if (pend.t === (t as number)) return;
      const line = { t1: pend.t, p1: pend.p, t2: t as number, p2: price };
      pendingRef.current = null;
      setAwaitingSecond(false);
      drawingsRef.current = [...drawingsRef.current, line].slice(-50);
      saveDrawings(`${ticker}:${interval}`, drawingsRef.current);
      const s = chart.addSeries(LineSeries, {
        color: LINE_COLOR,
        lineWidth: 1,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      });
      const pts = [
        { time: line.t1 as UT, value: line.p1 },
        { time: line.t2 as UT, value: line.p2 },
      ].sort((a, b) => a.time - b.time);
      s.setData(pts);
      lineSeriesRefs.current.push(s);
    };
    chart.subscribeClick(handler);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawMode(false);
        pendingRef.current = null;
        setAwaitingSecond(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      chart.unsubscribeClick(handler);
      window.removeEventListener("keydown", onKey);
    };
  }, [drawMode, ready, ticker, interval]);

  // Whitespace hasta la expiración + marcador vertical
  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const candles = candlesRef.current;
    if (!chart || !candleSeries || !ready || !candles.length) return;
    const base = candles.map((c) => ({
      time: c.time as UT,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    if (!expiration) {
      candleSeries.setData(base);
      expTargetRef.current = null;
      setMarker(null);
      return;
    }
    const ws = whitespaceTimes(candles, interval, expiration);
    candleSeries.setData([...base, ...ws.map((t) => ({ time: t }))]);
    const expUtc = expiration;
    const all = [...candles.map((c) => c.time), ...ws.map((t) => t as number)];
    const target = Math.max(
      ...all.filter((t) => new Date(t * 1000).toISOString().slice(0, 10) <= expUtc),
    );
    expTargetRef.current = Number.isFinite(target) ? target : null;
    chart.timeScale().setVisibleLogicalRange({
      from: -2,
      to: candles.length + ws.length + 2,
    });
    const updateMarker = () => {
      const tgt = expTargetRef.current;
      if (tgt === null) {
        setMarker(null);
        return;
      }
      const x = chart.timeScale().timeToCoordinate(tgt as UT);
      const plotW = chart.timeScale().width();
      if (x === null || x > plotW) {
        setMarker(null);
        return;
      }
      const label =
        expirationDte !== null ? `${expiration} (${expirationDte}d)` : expiration;
      setMarker({ x, label, flip: x > plotW - 120 });
    };
    updateMarker();
    const ts = chart.timeScale();
    ts.subscribeVisibleLogicalRangeChange(updateMarker);
    const ro = new ResizeObserver(updateMarker);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => {
      ts.unsubscribeVisibleLogicalRangeChange(updateMarker);
      ro.disconnect();
    };
  }, [expiration, expirationDte, ready, interval]);

  const clearLines = () => {
    lineSeriesRefs.current.forEach(removeSeries);
    lineSeriesRefs.current = [];
    drawingsRef.current = [];
    pendingRef.current = null;
    setAwaitingSecond(false);
    saveDrawings(`${ticker}:${interval}`, []);
  };

  const chartH = baseH + subPanes * SUBPANE_H;

  return (
    <div className="candle-chart">
      <div className="chart-toolbar">
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
        <div className="ind-tabs">
          {SMA_DEFS.map((d) => (
            <button
              key={d.key}
              type="button"
              className={prefs[d.key] ? "tab active" : "tab"}
              onClick={() => togglePref(d.key)}
            >
              <span className="swatch" style={{ background: d.color }} />
              {d.label}
            </button>
          ))}
          <button
            type="button"
            className={prefs.rsi ? "tab active" : "tab"}
            onClick={() => togglePref("rsi")}
          >
            RSI
          </button>
          <button
            type="button"
            className={prefs.macd ? "tab active" : "tab"}
            onClick={() => togglePref("macd")}
          >
            MACD
          </button>
          <button
            type="button"
            className={drawMode ? "tab active" : "tab"}
            onClick={() => {
              setDrawMode((v) => !v);
              pendingRef.current = null;
              setAwaitingSecond(false);
            }}
          >
            Línea
          </button>
          <button type="button" className="tab" onClick={clearLines}>
            Borrar líneas
          </button>
        </div>
      </div>
      {error && <div className="state-msg neg">{error}</div>}
      <div
        ref={containerRef}
        className="chart-container"
        style={{ height: chartH, cursor: drawMode ? "crosshair" : undefined, position: "relative" }}
      >
        {awaitingSecond && <div className="hint-draw">Elige el segundo punto</div>}
        {marker && (
          <div className="exp-marker" style={{ left: marker.x }}>
            <span
              className="exp-marker-label"
              style={marker.flip ? { right: 4, left: "auto" } : undefined}
            >
              {marker.label}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
