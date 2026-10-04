import { DEFAULT_PRESET_ID, DEFAULT_TICKERS, PRESETS } from "./presets";
import type { Filters } from "./types";

const KEY = "bolsa:state:v1";
const TICKER_RE = /^\^?[A-Z0-9][A-Z0-9.\-]{0,9}$/;
const MAX_TICKERS = 10;

export interface PersistedState {
  tickers: string[];
  presetId: string;
  filters: Filters;
  overviewDte: number;
}

export function defaultState(): PersistedState {
  return {
    tickers: [...DEFAULT_TICKERS],
    presetId: DEFAULT_PRESET_ID,
    filters: PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!.filters,
    overviewDte: 30,
  };
}

const ENUM_RULES: Partial<Record<keyof Filters, readonly unknown[]>> = {
  option_type: ["put", "call", "both"],
  strategy: ["short", "credit_spread", "long"],
  sort_by: [
    "ror_day",
    "ror",
    "pop",
    "iv",
    "delta",
    "oi",
    "volume",
    "dte",
    "strike",
    "spread_pct",
    "mid",
    "expiration",
    "ticker",
  ],
  sort_order: ["asc", "desc"],
};

function cleanFilters(raw: unknown, defaults: Filters): Filters {
  const out = { ...defaults };
  if (typeof raw !== "object" || raw === null) return out;
  for (const key of Object.keys(defaults) as (keyof Filters)[]) {
    const v = (raw as Record<string, unknown>)[key];
    const allowed = ENUM_RULES[key];
    if (allowed) {
      if (allowed.includes(v)) (out as Record<string, unknown>)[key] = v;
      continue;
    }
    const dv = defaults[key];
    if (dv === null) {
      if (typeof v === "number" || v === null) (out as Record<string, unknown>)[key] = v;
    } else if (typeof v === typeof dv) {
      (out as Record<string, unknown>)[key] = v;
    }
  }
  return out;
}

export function loadState(): PersistedState {
  const defaults = defaultState();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults;
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (typeof data !== "object" || data === null) return defaults;

    let tickers = defaults.tickers;
    if (Array.isArray(data.tickers)) {
      const parsed = data.tickers
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim().toUpperCase())
        .filter((t) => t && TICKER_RE.test(t));
      const deduped = [...new Set(parsed)].slice(0, MAX_TICKERS);
      if (deduped.length) tickers = deduped;
    }

    let presetId = defaults.presetId;
    if (
      data.presetId === "custom" ||
      PRESETS.some((p) => p.id === data.presetId)
    ) {
      presetId = data.presetId as string;
    }

    const filters = cleanFilters(data.filters, defaults.filters);

    let overviewDte = defaults.overviewDte;
    if (
      typeof data.overviewDte === "number" &&
      Number.isInteger(data.overviewDte) &&
      data.overviewDte >= 1 &&
      data.overviewDte <= 365
    ) {
      overviewDte = data.overviewDte;
    }

    return { tickers, presetId, filters, overviewDte };
  } catch {
    return defaults;
  }
}

export function saveState(state: PersistedState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // modo privado u otro error de almacenamiento: se ignora
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignorado
  }
}

const CHART_KEY = "bolsa:chart:v1";

export interface ChartPrefs {
  sma50: boolean;
  sma70: boolean;
  sma200: boolean;
  rsi: boolean;
  macd: boolean;
}

const CHART_DEFAULTS: ChartPrefs = {
  sma50: true,
  sma70: true,
  sma200: true,
  rsi: true,
  macd: true,
};

export function loadChartPrefs(): ChartPrefs {
  try {
    const raw = localStorage.getItem(CHART_KEY);
    if (!raw) return { ...CHART_DEFAULTS };
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (typeof data !== "object" || data === null) return { ...CHART_DEFAULTS };
    const out = { ...CHART_DEFAULTS };
    for (const k of Object.keys(CHART_DEFAULTS) as (keyof ChartPrefs)[]) {
      if (typeof data[k] === "boolean") out[k] = data[k] as boolean;
    }
    return out;
  } catch {
    return { ...CHART_DEFAULTS };
  }
}

export function saveChartPrefs(p: ChartPrefs): void {
  try {
    localStorage.setItem(CHART_KEY, JSON.stringify(p));
  } catch {
    // ignorado
  }
}

const DRAW_KEY = "bolsa:drawings:v1";
const MAX_DRAWINGS = 50;

export interface DrawnLine {
  t1: number;
  p1: number;
  t2: number;
  p2: number;
}

type DrawingMap = Record<string, DrawnLine[]>;

function loadDrawingMap(): DrawingMap {
  try {
    const raw = localStorage.getItem(DRAW_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (typeof data !== "object" || data === null) return {};
    const out: DrawingMap = {};
    for (const [k, v] of Object.entries(data)) {
      if (!Array.isArray(v)) continue;
      out[k] = v
        .filter(
          (l): l is DrawnLine =>
            typeof l === "object" &&
            l !== null &&
            ["t1", "p1", "t2", "p2"].every((f) =>
              Number.isFinite((l as Record<string, unknown>)[f]),
            ),
        )
        .slice(0, MAX_DRAWINGS);
    }
    return out;
  } catch {
    return {};
  }
}

export function loadDrawings(key: string): DrawnLine[] {
  return loadDrawingMap()[key] ?? [];
}

export function saveDrawings(key: string, lines: DrawnLine[]): void {
  try {
    const map = loadDrawingMap();
    if (lines.length) map[key] = lines.slice(0, MAX_DRAWINGS);
    else delete map[key];
    localStorage.setItem(DRAW_KEY, JSON.stringify(map));
  } catch {
    // ignorado
  }
}
