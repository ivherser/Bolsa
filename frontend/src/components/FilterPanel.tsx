import type { Filters, SortField } from "../types";

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
  onSearch: () => void;
  loading: boolean;
  canSearch: boolean;
}

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "ror_day", label: "RoR/día" },
  { value: "ror", label: "RoR" },
  { value: "pop", label: "POP" },
  { value: "iv", label: "IV" },
  { value: "delta", label: "|Delta|" },
  { value: "oi", label: "OI" },
  { value: "volume", label: "Volumen" },
  { value: "dte", label: "DTE" },
  { value: "strike", label: "Strike" },
  { value: "spread_pct", label: "Spread %" },
  { value: "mid", label: "Mid" },
  { value: "expiration", label: "Expiración" },
  { value: "ticker", label: "Ticker" },
];

function Num({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export default function FilterPanel({ filters, onChange, onSearch, loading, canSearch }: Props) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    onChange({ ...filters, [k]: v });

  return (
    <div>
      <div className="field">
        <label>Tipo de opción</label>
        <select
          value={filters.option_type}
          onChange={(e) => set("option_type", e.target.value as Filters["option_type"])}
        >
          <option value="put">Puts</option>
          <option value="call">Calls</option>
          <option value="both">Ambos</option>
        </select>
      </div>
      <div className="field">
        <label>Estrategia</label>
        <select
          value={filters.strategy}
          onChange={(e) => set("strategy", e.target.value as Filters["strategy"])}
        >
          <option value="short">Venta (short)</option>
          <option value="credit_spread">Credit spread</option>
          <option value="long">Compra (long)</option>
        </select>
      </div>
      {filters.strategy === "credit_spread" && (
        <Num
          label="Ancho del spread ($)"
          value={filters.spread_width}
          step={0.5}
          min={0.5}
          max={100}
          onChange={(v) => set("spread_width", v)}
        />
      )}
      <div className="field-row">
        <div className="field">
          <label>DTE mín: {filters.dte_min}</label>
          <input
            type="range"
            min={0}
            max={365}
            value={filters.dte_min}
            onChange={(e) => set("dte_min", Number(e.target.value))}
          />
          <input
            type="number"
            min={0}
            max={730}
            value={filters.dte_min}
            onChange={(e) => set("dte_min", Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label>DTE máx: {filters.dte_max}</label>
          <input
            type="range"
            min={0}
            max={365}
            value={filters.dte_max}
            onChange={(e) => set("dte_max", Number(e.target.value))}
          />
          <input
            type="number"
            min={0}
            max={730}
            value={filters.dte_max}
            onChange={(e) => set("dte_max", Number(e.target.value))}
          />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>|Delta| mín: {filters.delta_min.toFixed(2)}</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={filters.delta_min}
            onChange={(e) => set("delta_min", Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label>|Delta| máx: {filters.delta_max.toFixed(2)}</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={filters.delta_max}
            onChange={(e) => set("delta_max", Number(e.target.value))}
          />
        </div>
      </div>
      <div className="field-row">
        <Num label="OI mín" value={filters.oi_min} min={0} onChange={(v) => set("oi_min", v)} />
        <Num
          label="Volumen mín"
          value={filters.volume_min}
          min={0}
          onChange={(v) => set("volume_min", v)}
        />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Spread máx % (vacío = sin límite)</label>
          <input
            type="number"
            min={0}
            value={filters.spread_max_pct ?? ""}
            placeholder="sin límite"
            onChange={(e) =>
              set("spread_max_pct", e.target.value === "" ? null : Number(e.target.value))
            }
          />
        </div>
        <Num
          label="IV mín %"
          value={filters.iv_min}
          min={0}
          onChange={(v) => set("iv_min", v)}
        />
      </div>
      <div className="field-row">
        <Num
          label="POP mín %"
          value={filters.pop_min}
          min={0}
          max={100}
          onChange={(v) => set("pop_min", v)}
        />
        <Num
          label="Expiraciones/ticker"
          value={filters.max_expirations}
          min={1}
          max={12}
          onChange={(v) => set("max_expirations", v)}
        />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Ordenar por</label>
          <select
            value={filters.sort_by}
            onChange={(e) => set("sort_by", e.target.value as SortField)}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Orden</label>
          <select
            value={filters.sort_order}
            onChange={(e) => set("sort_order", e.target.value as Filters["sort_order"])}
          >
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
        </div>
      </div>
      <button className="search-btn" onClick={onSearch} disabled={loading || !canSearch}>
        {loading ? "Buscando…" : "Buscar"}
      </button>
    </div>
  );
}
