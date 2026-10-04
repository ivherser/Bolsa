import type { Filters } from "./types";

export interface Preset {
  id: string;
  label: string;
  filters: Filters;
}

const SHORT_BASE: Filters = {
  option_type: "put",
  strategy: "short",
  spread_width: 5,
  dte_min: 21,
  dte_max: 45,
  delta_min: 0.15,
  delta_max: 0.3,
  oi_min: 100,
  volume_min: 10,
  spread_max_pct: 10,
  iv_min: 20,
  pop_min: 70,
  max_expirations: 4,
  sort_by: "ror_day",
  sort_order: "desc",
};

export const PRESETS: Preset[] = [
  { id: "short_put", label: "Short Put", filters: SHORT_BASE },
  { id: "short_call", label: "Short Call", filters: { ...SHORT_BASE, option_type: "call" } },
];

export const DEFAULT_PRESET_ID = "short_put";
export const DEFAULT_TICKERS = ["SPY", "AAPL"];
