import { useCallback, useEffect, useRef, useState } from "react";
import { fetchOverview } from "../api";
import type { Greeks, TickerOverviewItem } from "../types";

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

function GreeksCell({ g }: { g: Greeks | null }) {
  if (!g) return <td>—</td>;
  return (
    <td>
      {nf4.format(g.delta)} {nf4.format(g.gamma)} {nf4.format(g.theta)} {nf4.format(g.vega)}
    </td>
  );
}

interface Props {
  tickers: string[];
  dte: number;
  onDteChange: (dte: number) => void;
  onLoadOk: () => void;
  onLoadError: () => void;
}

export default function TickerOverview({
  tickers,
  dte,
  onDteChange,
  onLoadOk,
  onLoadError,
}: Props) {
  const [items, setItems] = useState<TickerOverviewItem[] | null>(null);
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

  return (
    <section className="overview">
      <div className="overview-header">
        <h2>Resumen de tickers</h2>
        <div className="overview-controls">
          <label htmlFor="overview-dte">DTE objetivo</label>
          <input
            id="overview-dte"
            type="number"
            min={1}
            max={365}
            value={dte}
            onChange={(e) => onDteChange(Number(e.target.value))}
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
      {!error && items !== null && items.length > 0 && (
        <div className="overview-scroll">
          <table className="overview-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Precio</th>
                <th>Var.</th>
                <th>Volumen</th>
                <th>Exp. (DTE)</th>
                <th>Strike ATM</th>
                <th>IV ATM</th>
                <th>Call Δ Γ Θ ν</th>
                <th>Put Δ Γ Θ ν</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.ticker}>
                  <td>{it.ticker}</td>
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
                  <td>
                    {it.expiration ?? "—"}
                    {it.dte !== null ? ` (${it.dte})` : ""}
                  </td>
                  <td>{it.atm_strike !== null ? nf.format(it.atm_strike) : "—"}</td>
                  <td>{it.atm_iv !== null ? `${nf.format(it.atm_iv)}%` : "—"}</td>
                  {it.error ? (
                    <td colSpan={2} className="neg" style={{ fontSize: 12 }}>
                      {it.error}
                    </td>
                  ) : (
                    <>
                      <GreeksCell g={it.call?.greeks ?? null} />
                      <GreeksCell g={it.put?.greeks ?? null} />
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
