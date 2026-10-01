export type OptionType = "put" | "call";
export type OptionTypeFilter = "put" | "call" | "both";
export type Strategy = "short" | "credit_spread" | "long";
export type SortOrder = "asc" | "desc";

export type SortField =
  | "ror_day"
  | "ror"
  | "pop"
  | "iv"
  | "delta"
  | "oi"
  | "volume"
  | "dte"
  | "strike"
  | "spread_pct"
  | "mid"
  | "expiration"
  | "ticker";

export interface Greeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

export interface OptionResult {
  ticker: string;
  contract_symbol: string;
  option_type: OptionType;
  strategy: Strategy;
  expiration: string;
  dte: number;
  spot: number;
  strike: number;
  long_strike: number | null;
  width: number | null;
  bid: number;
  ask: number;
  mid: number;
  last: number;
  spread_pct: number;
  volume: number;
  open_interest: number;
  iv: number;
  greeks: Greeks;
  premium: number;
  breakeven: number;
  max_profit: number | null;
  max_loss: number | null;
  pop: number;
  ror: number | null;
  ror_day: number | null;
}

export interface ScreenerMeta {
  tickers: string[];
  spots: Record<string, number>;
  risk_free_rate: number;
  generated_at: string;
  expirations_scanned: number;
  cache_hits: number;
  truncated: boolean;
  warnings: string[];
  count: number;
}

export interface ScreenerResponse {
  results: OptionResult[];
  meta: ScreenerMeta;
}

export interface SourceStatus {
  source: string;
  connected: boolean;
  latency_ms: number | null;
  checked_at: string;
}

export interface Filters {
  option_type: OptionTypeFilter;
  strategy: Strategy;
  spread_width: number;
  dte_min: number;
  dte_max: number;
  delta_min: number;
  delta_max: number;
  oi_min: number;
  volume_min: number;
  spread_max_pct: number | null;
  iv_min: number;
  pop_min: number;
  max_expirations: number;
  sort_by: SortField;
  sort_order: SortOrder;
}
