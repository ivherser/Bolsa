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

export interface AtmLeg {
  strike: number;
  bid: number;
  ask: number;
  mid: number;
  iv: number;
  greeks: Greeks;
}

export interface TickerOverviewItem {
  ticker: string;
  spot: number;
  previous_close: number | null;
  change: number | null;
  change_pct: number | null;
  volume: number | null;
  expiration: string | null;
  dte: number | null;
  atm_strike: number | null;
  atm_iv: number | null;
  hv30: number | null;
  range52w_pct: number | null;
  high_52w: number | null;
  low_52w: number | null;
  hv_percentile_52w: number | null;
  call: AtmLeg | null;
  put: AtmLeg | null;
  error: string | null;
}

export interface OverviewMeta {
  risk_free_rate: number;
  generated_at: string;
  truncated: boolean;
  warnings: string[];
}

export interface OverviewResponse {
  items: TickerOverviewItem[];
  meta: OverviewMeta;
}

export interface ChainLeg {
  contract_symbol: string;
  bid: number;
  ask: number;
  mid: number;
  last: number;
  volume: number;
  open_interest: number;
  iv: number | null;
  greeks: Greeks | null;
  pop_short: number | null;
  itm_prob: number | null;
}

export interface ChainRow {
  strike: number;
  call: ChainLeg | null;
  put: ChainLeg | null;
}

export interface ChainExpiration {
  date: string;
  dte: number;
}

export interface ChainMeta {
  risk_free_rate: number;
  generated_at: string;
}

export interface ChainResponse {
  ticker: string;
  spot: number;
  expirations: ChainExpiration[];
  expiration: string | null;
  dte: number | null;
  rows: ChainRow[];
  meta: ChainMeta;
}

export type HistoryInterval = "1h" | "1d" | "1wk";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface HistoryResponse {
  ticker: string;
  interval: HistoryInterval;
  candles: Candle[];
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
