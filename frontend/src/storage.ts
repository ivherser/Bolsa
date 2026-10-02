import { DEFAULT_PRESET_ID, DEFAULT_TICKERS, PRESETS } from "./presets";
import type { Filters } from "./types";

const KEY = "bolsa:state:v1";
export const TICKER_RE = /^\^?[A-Z0-9][A-Z0-9.\-]{0,9}$/;
export const MAX_TICKERS = 10;

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

export function cleanFilters(raw: unknown, defaults: Filters): Filters {
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
