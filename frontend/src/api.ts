import type {
  Filters,
  OptionResult,
  ScreenerMeta,
  ScreenerResponse,
  SortField,
  SortOrder,
  SourceStatus,
} from "./types";

const CHUNK = 5; // máximo de tickers por llamada a la API

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function buildParams(tickers: string[], f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  p.set("tickers", tickers.join(","));
  p.set("option_type", f.option_type);
  p.set("strategy", f.strategy);
  if (f.strategy === "credit_spread") p.set("spread_width", String(f.spread_width));
  p.set("dte_min", String(f.dte_min));
  p.set("dte_max", String(f.dte_max));
  p.set("delta_min", String(f.delta_min));
  p.set("delta_max", String(f.delta_max));
  if (f.oi_min > 0) p.set("oi_min", String(f.oi_min));
  if (f.volume_min > 0) p.set("volume_min", String(f.volume_min));
  if (f.spread_max_pct !== null) p.set("spread_max_pct", String(f.spread_max_pct));
  if (f.iv_min > 0) p.set("iv_min", String(f.iv_min));
  if (f.pop_min > 0) p.set("pop_min", String(f.pop_min));
  p.set("max_expirations", String(f.max_expirations));
  p.set("sort_by", f.sort_by);
  p.set("sort_order", f.sort_order);
  return p;
}

export function sortResults(
  results: OptionResult[],
  sortBy: SortField,
  sortOrder: SortOrder,
): OptionResult[] {
  const val = (o: OptionResult): number | string | null => {
    if (sortBy === "delta") return Math.abs(o.greeks.delta);
    if (sortBy === "oi") return o.open_interest;
    const v = o[sortBy as keyof OptionResult];
    return v === undefined ? null : (v as number | string | null);
  };
  const cmp = (a: OptionResult, b: OptionResult): number => {
    const va = val(a);
    const vb = val(b);
    if (va === null && vb === null) return 0;
    if (va === null) return 1; // null siempre al final
    if (vb === null) return -1;
    if (va < vb) return sortOrder === "asc" ? -1 : 1;
    if (va > vb) return sortOrder === "asc" ? 1 : -1;
    return 0;
  };
  return [...results].sort(cmp);
}

export interface MergedResponse {
  results: OptionResult[];
  meta: ScreenerMeta;
}

export async function fetchStatus(signal?: AbortSignal): Promise<SourceStatus> {
  const res = await fetch("/api/status", { signal: signal ?? null });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return (await res.json()) as SourceStatus;
}

export async function fetchScreener(
  tickers: string[],
  filters: Filters,
  signal?: AbortSignal,
): Promise<MergedResponse> {
  const groups = chunk(tickers, CHUNK);
  const responses = await Promise.all(
    groups.map(async (g) => {
      const res = await fetch(`/api/screener?${buildParams(g, filters).toString()}`, {
        signal: signal ?? null,
      });
      if (!res.ok) {
        let msg = `Error ${res.status}`;
        try {
          const body = (await res.json()) as {
            error?: string;
            details?: { field: string; message: string }[];
          };
          if (body.details?.length) {
            msg = `${body.error ?? msg}: ${body.details
              .map((d) => `${d.field}: ${d.message}`)
              .join("; ")}`;
          } else if (body.error) {
            msg = body.error;
          }
        } catch {
          // respuesta no-JSON: mensaje genérico
        }
        throw new Error(msg);
      }
      return (await res.json()) as ScreenerResponse;
    }),
  );

  const merged: MergedResponse = {
    results: [],
    meta: {
      tickers: [],
      spots: {},
      risk_free_rate: responses[0]?.meta.risk_free_rate ?? 0.045,
      generated_at: responses[0]?.meta.generated_at ?? "",
      expirations_scanned: 0,
      cache_hits: 0,
      truncated: false,
      warnings: [],
      count: 0,
    },
  };
  for (const r of responses) {
    merged.results.push(...r.results);
    merged.meta.tickers.push(...r.meta.tickers);
    Object.assign(merged.meta.spots, r.meta.spots);
    merged.meta.expirations_scanned += r.meta.expirations_scanned;
    merged.meta.cache_hits += r.meta.cache_hits;
    merged.meta.warnings.push(...r.meta.warnings);
    if (r.meta.truncated) merged.meta.truncated = true;
  }
  merged.results = sortResults(merged.results, filters.sort_by, filters.sort_order);
  merged.meta.count = merged.results.length;
  return merged;
}
