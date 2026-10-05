import { useCallback, useEffect, useRef, useState } from "react";
import { fetchOverview } from "../api";
import type { Greeks, OverviewSortKey, TickerOverviewItem } from "../types";
import { Info } from "./Help";
import TickerInput from "./TickerInput";

export interface OverviewSort {
  key: OverviewSortKey;
  dir: "asc" | "desc";
}

const nf = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });
const nf4 = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

function compactVolume(v: number | null): string {
  if (v === null) return "—";
  if (v >= 1e9) return `${nf.format(v / 1e9)}B`;
  if (v >= 1e6) return `${nf.format(v / 1e6)}M`;
  if (v >= 1e3) return `${nf.format(v / 1e3)}K`;
  return nf.format(v);
}

function GreeksCells({ g }: { g: Greeks | null }) {
  if (!g)
    return (
      <>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
      </>
    );
  return (
    <>
      <td>{nf4.format(g.delta)}</td>
      <td>{nf4.format(g.gamma)}</td>
      <td>{nf4.format(g.theta)}</td>
      <td>{nf4.format(g.vega)}</td>
    </>
  );
}

interface Props {
  tickers: string[];
  dte: number;
  onDteChange: (dte: number) => void;
  onLoadOk: () => void;
  onLoadError: () => void;
  selected: string | null;
  onSelect: (ticker: string | null) => void;
  onTickersChange: (tickers: string[]) => void;
  sort: OverviewSort | null;
  onSortChange: (sort: OverviewSort | null) => void;
}

export default function TickerOverview({
  tickers,
  dte,
  onDteChange,
  onLoadOk,
  onLoadError,
  selected,
  onSelect,
  onTickersChange,
  sort,
  onSortChange,
}: Props) {
  const [items, setItems] = useState<TickerOverviewItem[] | null>(null);
  const [dteDraft, setDteDraft] = useState(String(dte));
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const okRef = useRef(onLoadOk);
  const errRef = useRef(onLoadError);
  okRef.current = onLoadOk;
  errRef.current = onLoadError;

  const load = useCallback(async () => {
    if (!tickers.length) {
      setItems([]);
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetchOverview(tickers, dte, ctrl.signal);
      setItems(resp.items);
      setWarnings(resp.meta.warnings);
      okRef.current();
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : "Error desconocido");
        setItems(null);
        errRef.current();
      }
    } finally {
      setLoading(false);
    }
  }, [tickers, dte]);

  useEffect(() => {
    const id = setTimeout(load, 400);
    return () => {
      clearTimeout(id);
      abortRef.current?.abort();
    };
  }, [load]);

  useEffect(() => {
    setDteDraft(String(dte));
  }, [dte]);

  const dteValid = /^\d+$/.test(dteDraft) && Number(dteDraft) >= 1 && Number(dteDraft) <= 365;

  const onDteInput = (raw: string) => {
    setDteDraft(raw);
    const v = Number(raw);
    if (/^\d+$/.test(raw) && Number.isInteger(v) && v >= 1 && v <= 365) {
      onDteChange(v);
    }
  };

  const onDteBlur = () => {
    if (!dteValid) setDteDraft(String(dte));
  };

  const toggleSort = (key: OverviewSortKey) => {
    if (sort?.key === key) {
      onSortChange({ key, dir: sort.dir === "asc" ? "desc" : "asc" });
    } else {
      onSortChange({ key, dir: key === "ticker" ? "asc" : "desc" });
    }
  };

  const arrow = (k: OverviewSortKey) =>
    sort?.key === k ? (sort.dir === "asc" ? " ▲" : " ▼") : null;

  const visible = (items ?? []).filter((it) => tickers.includes(it.ticker));
  const sorted = [...visible].sort((a, b) => {
    if (!sort) return tickers.indexOf(a.ticker) - tickers.indexOf(b.ticker);
    const av = a[sort.key];
    const bv = b[sort.key];
    if (av === null && bv === null) return tickers.indexOf(a.ticker) - tickers.indexOf(b.ticker);
    if (av === null) return 1;
    if (bv === null) return -1;
    const cmp =
      typeof av === "string"
        ? av.localeCompare(bv as string)
        : (av as number) - (bv as number);
    return sort.dir === "asc" ? cmp : -cmp;
  });

  return (
    <section className="overview">
      <div className="overview-header">
        <h2>Lista de tickers</h2>
        <div className="overview-controls">
          <TickerInput tickers={tickers} onChange={onTickersChange} />
          <label htmlFor="overview-dte">
            DTE objetivo
            <Info k="dte_target" />
          </label>
          <input
            id="overview-dte"
            type="number"
            min={1}
            max={365}
            value={dteDraft}
            onChange={(e) => onDteInput(e.target.value)}
            onBlur={onDteBlur}
            aria-invalid={!dteValid}
            className={dteValid ? "" : "invalid"}
          />
          <button type="button" className="secondary" onClick={load} disabled={loading || !tickers.length}>
            Actualizar
          </button>
        </div>
      </div>
      {warnings.length > 0 && (
        <div className="warnings">
          {warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      )}
      {error && <div className="state-msg neg">{error}</div>}
      {!error && loading && items === null && (
        <div className="state-msg">Cargando resumen…</div>
      )}
      {!error && tickers.length === 0 && (
        <div className="state-msg">Añade un ticker con el buscador</div>
      )}
      {!error && items !== null && visible.length > 0 && (
        <div className="overview-scroll">
          <table className="overview-table">
            <thead>
              <tr>
                <th rowSpan={2} className="sortable" onClick={() => toggleSort("ticker")}>
                  Ticker
                  {arrow("ticker")}
                </th>
                <th rowSpan={2} className="sortable" onClick={() => toggleSort("spot")}>
                  Precio
                  <Info k="price" />
                  {arrow("spot")}
                </th>
                <th rowSpan={2} className="sortable" onClick={() => toggleSort("change_pct")}>
                  Var.
                  <Info k="change" />
                  {arrow("change_pct")}
                </th>
                <th rowSpan={2} className="sortable" onClick={() => toggleSort("volume")}>
                  Volumen
                  <Info k="volume_stock" />
                  {arrow("volume")}
                </th>
                <th
                  rowSpan={2}
                  className="sortable"
                  title="Volatilidad histórica 30d anualizada"
                  onClick={() => toggleSort("hv30")}
                >
                  VH 30d
                  <Info k="hv30" />
                  {arrow("hv30")}
                </th>
                <th
                  rowSpan={2}
                  className="sortable"
                  title="Posición del precio dentro del rango de 52 semanas"
                  onClick={() => toggleSort("range52w_pct")}
                >
                  Pos. 52s
                  <Info k="pos52" />
                  {arrow("range52w_pct")}
                </th>
                <th
                  rowSpan={2}
                  className="sortable"
                  title="Percentil de la volatilidad histórica 30d frente al último año"
                  onClick={() => toggleSort("hv_percentile_52w")}
                >
                  Pct. VH 52s
                  <Info k="pct_hv52" />
                  {arrow("hv_percentile_52w")}
                </th>
                <th rowSpan={2} className="sortable" onClick={() => toggleSort("dte")}>
                  Exp. (DTE)
                  <Info k="expiration" />
                  {arrow("dte")}
                </th>
                <th rowSpan={2} className="sortable" onClick={() => toggleSort("atm_strike")}>
                  Strike ATM
                  <Info k="strike_atm" />
                  {arrow("atm_strike")}
                </th>
                <th rowSpan={2} className="sortable" onClick={() => toggleSort("atm_iv")}>
                  VI ATM
                  <Info k="iv_atm" />
                  {arrow("atm_iv")}
                </th>
                <th colSpan={4} className="greek-group">
                  Call
                </th>
                <th colSpan={4} className="greek-group">
                  Put
                </th>
              </tr>
              <tr>
                <th className="greek-group">
                  Δ
                  <Info k="delta" />
                </th>
                <th>
                  Γ
                  <Info k="gamma" />
                </th>
                <th>
                  Θ
                  <Info k="theta" />
                </th>
                <th>
                  ν
                  <Info k="vega" />
                </th>
                <th className="greek-group">
                  Δ
                  <Info k="delta" />
                </th>
                <th>
                  Γ
                  <Info k="gamma" />
                </th>
                <th>
                  Θ
                  <Info k="theta" />
                </th>
                <th>
                  ν
                  <Info k="vega" />
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((it) => (
                <tr
                  key={it.ticker}
                  className={selected === it.ticker ? "selected overview-row" : "overview-row"}
                  tabIndex={0}
                  onClick={() => onSelect(selected === it.ticker ? null : it.ticker)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSelect(selected === it.ticker ? null : it.ticker);
                  }}
                >
                  <td>
                    <button
                      type="button"
                      className="row-remove"
                      aria-label={`Quitar ${it.ticker}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onTickersChange(tickers.filter((x) => x !== it.ticker));
                      }}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      ×
                    </button>
                    {it.ticker}
                  </td>
                  <td>{it.spot > 0 ? nf.format(it.spot) : "—"}</td>
                  <td className={it.change === null ? "" : it.change >= 0 ? "pos" : "neg"}>
                    {it.change === null
                      ? "—"
                      : `${it.change >= 0 ? "+" : ""}${nf.format(it.change)}` +
                        (it.change_pct !== null
                          ? ` (${it.change_pct >= 0 ? "+" : ""}${nf.format(it.change_pct)}%)`
                          : "")}
                  </td>
                  <td>{compactVolume(it.volume)}</td>
                  <td>{it.hv30 !== null ? `${nf.format(it.hv30)}%` : "—"}</td>
                  <td
                    title={
                      it.high_52w !== null && it.low_52w !== null
                        ? `Mín 52s ${nf.format(it.low_52w)} – Máx 52s ${nf.format(it.high_52w)}`
                        : undefined
                    }
                  >
                    {it.range52w_pct !== null ? `${nf.format(it.range52w_pct)}%` : "—"}
                  </td>
                  <td title="Percentil de la volatilidad histórica 30d frente al último año">
                    {it.hv_percentile_52w !== null ? nf.format(it.hv_percentile_52w) : "—"}
                  </td>
                  <td>
                    {it.expiration ?? "—"}
                    {it.dte !== null ? ` (${it.dte})` : ""}
                  </td>
                  <td>{it.atm_strike !== null ? nf.format(it.atm_strike) : "—"}</td>
                  <td
                    className={
                      it.atm_iv !== null && it.hv30 !== null
                        ? it.atm_iv > it.hv30
                          ? "pos"
                          : "neg"
                        : ""
                    }
                  >
                    {it.atm_iv !== null ? `${nf.format(it.atm_iv)}%` : "—"}
                  </td>
                  {it.error ? (
                    <td colSpan={8} className="overview-error">
                      {it.error}
                    </td>
                  ) : (
                    <>
                      <GreeksCells g={it.call?.greeks ?? null} />
                      <GreeksCells g={it.put?.greeks ?? null} />
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
