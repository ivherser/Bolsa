import { useMemo, useState } from "react";
import { sortResults } from "../api";
import type { OptionResult, SortField, SortOrder } from "../types";

const nf = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });
const nf4 = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

interface Col {
  field: SortField;
  label: string;
}

const COLS: Col[] = [
  { field: "ticker", label: "Ticker" },
  { field: "expiration", label: "Exp (DTE)" },
  { field: "strike", label: "Strike" },
  { field: "mid", label: "Bid/Ask" },
  { field: "oi", label: "OI" },
  { field: "volume", label: "Vol" },
  { field: "delta", label: "Δ" },
  { field: "iv", label: "IV %" },
  { field: "pop", label: "POP %" },
  { field: "ror_day", label: "RoR/día %" },
];

interface Props {
  results: OptionResult[] | null;
  warnings: string[];
  truncated: boolean;
  loading: boolean;
  error: string | null;
  selected: OptionResult | null;
  onSelect: (r: OptionResult) => void;
}

export default function ResultsTable({
  results,
  warnings,
  truncated,
  loading,
  error,
  selected,
  onSelect,
}: Props) {
  const [sortBy, setSortBy] = useState<SortField | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const sorted = useMemo(() => {
    if (!results) return null;
    if (!sortBy) return results;
    return sortResults(results, sortBy, sortOrder);
  }, [results, sortBy, sortOrder]);

  const toggleSort = (f: SortField) => {
    if (sortBy === f) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(f);
      setSortOrder("desc");
    }
  };

  const fmt = (v: number | null, digits4 = false) =>
    v === null ? "—" : digits4 ? nf4.format(v) : nf.format(v);

  return (
    <div>
      {warnings.length > 0 && (
        <div className="warnings">
          {warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      )}
      {truncated && (
        <div className="truncated">
          Resultados parciales: se alcanzó el tiempo límite y algunas cadenas no se procesaron.
        </div>
      )}
      {results && (
        <div className="meta-line">
          {results.length} resultados{truncated ? " (parciales)" : ""}
        </div>
      )}
      {error && <div className="state-msg neg">{error}</div>}
      {!error && loading && <div className="state-msg">Cargando cadenas de opciones…</div>}
      {!error && !loading && sorted === null && (
        <div className="state-msg">Configura los filtros y pulsa «Buscar».</div>
      )}
      {!error && !loading && sorted !== null && sorted.length === 0 && (
        <div className="state-msg">Sin resultados para estos filtros.</div>
      )}
      {!error && !loading && sorted !== null && sorted.length > 0 && (
        <table>
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.field} onClick={() => toggleSort(c.field)}>
                  {c.label}
                  {sortBy === c.field ? (sortOrder === "asc" ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr
                key={r.contract_symbol + (r.long_strike ?? "")}
                className={selected === r ? "selected" : ""}
                onClick={() => onSelect(r)}
              >
                <td>
                  {r.ticker} {r.option_type === "put" ? "P" : "C"}
                </td>
                <td>
                  {r.expiration} <span style={{ color: "var(--muted)" }}>({r.dte})</span>
                </td>
                <td>{r.long_strike !== null ? `${nf.format(r.strike)}/${nf.format(r.long_strike)}` : nf.format(r.strike)}</td>
                <td>
                  {nf.format(r.bid)}/{nf.format(r.ask)}
                </td>
                <td>{nf.format(r.open_interest)}</td>
                <td>{nf.format(r.volume)}</td>
                <td>{nf4.format(r.greeks.delta)}</td>
                <td>{nf.format(r.iv)}</td>
                <td>{nf.format(r.pop)}</td>
                <td>{fmt(r.ror_day)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
