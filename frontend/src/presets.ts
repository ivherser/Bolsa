import type { Filters } from "./types";

export interface Preset {
  id: string;
  label: string;
  filters: Filters;
}

export const PRESETS: Preset[] = [
  {
    id: "csp",
    label: "Cash-Secured Put",
    filters: {
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
    },
  },
  {
    id: "credit_spread",
    label: "Put Credit Spread",
    filters: {
      option_type: "put",
      strategy: "credit_spread",
      spread_width: 5,
      dte_min: 21,
      dte_max: 45,
      delta_min: 0.2,
      delta_max: 0.35,
      oi_min: 100,
      volume_min: 10,
      spread_max_pct: 15,
      iv_min: 20,
      pop_min: 65,
      max_expirations: 4,
      sort_by: "ror_day",
      sort_order: "desc",
    },
  },
  {
    id: "long_calls",
    label: "Long Calls",
    filters: {
      option_type: "call",
      strategy: "long",
      spread_width: 5,
      dte_min: 45,
      dte_max: 120,
      delta_min: 0.5,
      delta_max: 0.8,
      oi_min: 100,
      volume_min: 10,
      spread_max_pct: 10,
      iv_min: 0,
      pop_min: 0,
      max_expirations: 4,
      sort_by: "pop",
      sort_order: "desc",
    },
  },
];

export const DEFAULT_PRESET_ID = "csp";
export const DEFAULT_TICKERS = ["SPY", "AAPL"];
