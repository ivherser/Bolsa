import { useCallback, useEffect, useRef, useState } from "react";
import { fetchChain } from "../api";
import type { ChainLeg, ChainResponse } from "../types";
import CandleChart from "./CandleChart";

const nf = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });
const nf4 = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});
const AROUND = 12;

function popClass(pop: number | null): string {
  if (pop === null) return "";
  if (pop >= 70) return "pop pop-high";
  if (pop >= 50) return "pop pop-mid";
  return "pop pop-low";
}

function CallCells({ leg, itm }: { leg: ChainLeg | null; itm: boolean }) {
  const cls = itm ? "itm" : "";
  if (!leg)
    return (
      <>
        <td className={cls}>—</td>
        <td className={cls}>—</td>
        <td className={cls}>—</td>
        <td className={cls}>—</td>
        <td className={cls}>—</td>
        <td className={cls}>—</td>
      </>
    );
  return (
    <>
      <td className={cls}>{nf.format(leg.bid)}</td>
      <td className={cls}>{nf.format(leg.ask)}</td>
      <td className={cls}>{nf.format(leg.mid)}</td>
      <td className={cls}>{leg.iv !== null ? `${nf.format(leg.iv)}%` : "—"}</td>
      <td className={cls}>{leg.greeks ? nf4.format(leg.greeks.delta) : "—"}</td>
      <td className={`${cls} ${popClass(leg.pop_short)}`}>
        {leg.pop_short !== null ? `${nf.format(leg.pop_short)}%` : "—"}
      </td>
    </>
  );
}

function PutCells({ leg, itm }: { leg: ChainLeg | null; itm: boolean }) {
  const cls = itm ? "itm" : "";
  if (!leg)
    return (
      <>
        <td className={cls}>—</td>
        <td className={cls}>—</td>
        <td className={cls}>—</td>
        <td className={cls}>—</td>
        <td className={cls}>—</td>
        <td className={cls}>—</td>
      </>
    );
  return (
    <>
      <td className={`${cls} ${popClass(leg.pop_short)}`}>
        {leg.pop_short !== null ? `${nf.format(leg.pop_short)}%` : "—"}
      </td>
      <td className={cls}>{leg.greeks ? nf4.format(leg.greeks.delta) : "—"}</td>
      <td className={cls}>{leg.iv !== null ? `${nf.format(leg.iv)}%` : "—"}</td>
      <td className={cls}>{nf.format(leg.mid)}</td>
      <td className={cls}>{nf.format(leg.ask)}</td>
      <td className={cls}>{nf.format(leg.bid)}</td>
    </>
  );
}

interface Props {
  ticker: string;
  onClose: () => void;
  onError: () => void;
}

export default function TickerDetail({ ticker, onClose, onError }: Props) {
  const [chain, setChain] = useState<ChainResponse | null>(null);
  const [expiration, setExpiration] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const errRef = useRef(onError);
  errRef.current = onError;

  const load = useCallback(
    async (exp?: string) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      setError(null);
      try {
        const resp = await fetchChain(ticker, exp, ctrl.signal);
        setChain(resp);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setError(e instanceof Error ? e.message : "Error desconocido");
          errRef.current();
        }
      } finally {
        setLoading(false);
      }
    },
    [ticker],
  );

  useEffect(() => {
    setChain(null);
    setExpiration(null);
    setShowAll(false);
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  const pick = (exp: string) => {
    setExpiration(exp);
    setShowAll(false);
    void load(exp);
  };

  const spot = chain?.spot ?? 0;
  const rows = chain?.rows ?? [];
  const spotIdx = rows.findIndex((r) => r.strike >= spot);
  const center = spotIdx === -1 ? rows.length : spotIdx;
  const around =
    showAll || rows.length <= 2 * AROUND
      ? rows
      : rows.slice(Math.max(0, center - AROUND), center + AROUND);

  return (
    <section className="ticker-detail">
      <div className="ticker-detail-header">
        <h2>
          {ticker} · {nf.format(spot)}
        </h2>
        <button type="button" className="link-btn" aria-label="Cerrar" onClick={onClose}>
          ✕
        </button>
      </div>
      <CandleChart ticker={ticker} expiration={expiration} onError={onError} />
      {error && <div className="state-msg neg">{error}</div>}
      {!error && chain === null && loading && <div className="state-msg">Cargando cadena…</div>}
      {chain !== null && (
        <>
          <div className="exp-chips">
            {chain.expirations.map((e) => (
              <button
                key={e.date}
                type="button"
                className={expiration === e.date ? "chip active" : "chip"}
                onClick={() => pick(e.date)}
              >
                {e.date} ({e.dte}d)
              </button>
            ))}
          </div>
          {expiration === null ? (
            <div className="state-msg">Elige una expiración</div>
          ) : loading && rows.length === 0 ? (
            <div className="state-msg">Cargando…</div>
          ) : (
            <>
              <div className="chain-scroll">
                <table className="chain-table">
                  <thead>
                    <tr>
                      <th colSpan={6}>CALLS</th>
                      <th rowSpan={2} className="strike-col">
                        Strike
                      </th>
                      <th colSpan={6}>PUTS</th>
                    </tr>
                    <tr>
                      <th>Bid</th>
                      <th>Ask</th>
                      <th>Mid</th>
                      <th>VI</th>
                      <th>Δ</th>
                      <th title="Probabilidad de éxito vendiendo la opción (expira OTM, lognormal con la VI)">
                        POP
                      </th>
                      <th title="Probabilidad de éxito vendiendo la opción (expira OTM, lognormal con la VI)">
                        POP
                      </th>
                      <th>Δ</th>
                      <th>VI</th>
                      <th>Mid</th>
                      <th>Ask</th>
                      <th>Bid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {around.map((r, i) => {
                      const prev = i > 0 ? (around[i - 1]?.strike ?? null) : null;
                      const crossed =
                        prev !== null && prev < spot && r.strike >= spot;
                      return (
                        <FragmentRow
                          key={r.strike}
                          row={r}
                          spot={spot}
                          crossed={crossed}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {rows.length > 2 * AROUND && (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => setShowAll((v) => !v)}
                >
                  {showAll ? "Ver solo strikes cercanos" : "Ver todos los strikes"}
                </button>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

function FragmentRow({
  row,
  spot,
  crossed,
}: {
  row: { strike: number; call: ChainLeg | null; put: ChainLeg | null };
  spot: number;
  crossed: boolean;
}) {
  return (
    <>
      {crossed && (
        <tr className="spot-row">
          <td colSpan={13}>Precio actual {nf.format(spot)}</td>
        </tr>
      )}
      <tr>
        <CallCells leg={row.call} itm={row.strike < spot} />
        <td className="strike-col">{nf.format(row.strike)}</td>
        <PutCells leg={row.put} itm={row.strike > spot} />
      </tr>
    </>
  );
}
