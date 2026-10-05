import { useEffect } from "react";
import type { OptionResult } from "../types";
import { Info } from "./Help";
import PayoffChart from "./PayoffChart";

const nf = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });
const nf4 = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

const STRATEGY_LABELS: Record<OptionResult["strategy"], string> = {
  short: "Venta (short)",
  credit_spread: "Credit spread",
  long: "Compra (long)",
};

interface Props {
  result: OptionResult;
  onClose: () => void;
}

export default function DetailPanel({ result: r, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const money = (v: number | null) => (v === null ? "Ilimitado" : `$${nf.format(v)}`);

  return (
    <aside className="detail">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>{r.contract_symbol || `${r.ticker} ${r.strike}`}</h2>
        <button className="secondary" onClick={onClose} aria-label="Cerrar">
          ×
        </button>
      </div>
      <dl>
        <dt>Estrategia</dt>
        <dd>
          {STRATEGY_LABELS[r.strategy]} {r.option_type === "put" ? "put" : "call"}
        </dd>
        <dt>Spot</dt>
        <dd>${nf.format(r.spot)}</dd>
        <dt>
          Expiración
          <Info k="expiration" />
        </dt>
        <dd>
          {r.expiration} ({r.dte} días)
        </dd>
        <dt>
          Strike
          <Info k="strike" />
        </dt>
        <dd>
          {r.long_strike !== null ? `${nf.format(r.strike)} / ${nf.format(r.long_strike)}` : nf.format(r.strike)}
        </dd>
        <dt>
          Prima (por acción)
          <Info k="mid" />
        </dt>
        <dd>${nf.format(r.premium)}</dd>
        <dt>Bid / Ask</dt>
        <dd>
          {nf.format(r.bid)} / {nf.format(r.ask)}
        </dd>
        <dt>
          Spread
          <Info k="spread" />
        </dt>
        <dd>{nf.format(r.spread_pct)}%</dd>
        <dt>
          Breakeven
          <Info k="breakeven" />
        </dt>
        <dd>${nf.format(r.breakeven)}</dd>
        <dt>
          Beneficio máx (contrato)
          <Info k="max_profit" />
        </dt>
        <dd className="pos">{money(r.max_profit)}</dd>
        <dt>
          Pérdida máx (contrato)
          <Info k="max_loss" />
        </dt>
        <dd className="neg">{money(r.max_loss)}</dd>
        <dt>
          POP
          <Info k="pop" />
        </dt>
        <dd>{nf.format(r.pop)}%</dd>
        <dt>
          RoR
          <Info k="ror" />
        </dt>
        <dd>{r.ror === null ? "—" : `${nf.format(r.ror)}%`}</dd>
        <dt>
          RoR/día
          <Info k="ror_day" />
        </dt>
        <dd>{r.ror_day === null ? "—" : `${nf.format(r.ror_day)}%`}</dd>
        <dt>
          Delta
          <Info k="delta" />
        </dt>
        <dd>{nf4.format(r.greeks.delta)}</dd>
        <dt>
          Gamma
          <Info k="gamma" />
        </dt>
        <dd>{nf4.format(r.greeks.gamma)}</dd>
        <dt>
          Theta
          <Info k="theta" />
        </dt>
        <dd>{nf4.format(r.greeks.theta)}</dd>
        <dt>
          Vega
          <Info k="vega" />
        </dt>
        <dd>{nf4.format(r.greeks.vega)}</dd>
      </dl>
      <p className="greeks-note">Griegas calculadas con Black-Scholes.</p>
      <PayoffChart result={r} />
    </aside>
  );
}
