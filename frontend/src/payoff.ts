import type { OptionResult } from "./types";

/**
 * P/L a vencimiento por contrato (USD, ×100).
 * premium = prima por acción (positiva = crédito recibido).
 */
export function payoffAt(o: OptionResult, spotExp: number): number {
  const K = o.strike;
  const L = o.long_strike;
  const prem = o.premium;
  let perShare: number;
  switch (o.strategy) {
    case "short":
      perShare =
        o.option_type === "put"
          ? prem - Math.max(K - spotExp, 0)
          : prem - Math.max(spotExp - K, 0);
      break;
    case "credit_spread":
      if (L === null) return 0;
      perShare =
        o.option_type === "put"
          ? prem - Math.max(K - spotExp, 0) + Math.max(L - spotExp, 0)
          : prem - Math.max(spotExp - K, 0) + Math.max(spotExp - L, 0);
      break;
    case "long":
      perShare =
        o.option_type === "call"
          ? Math.max(spotExp - K, 0) - prem
          : Math.max(K - spotExp, 0) - prem;
      break;
  }
  return perShare * 100;
}

export function payoffRange(o: OptionResult): { min: number; max: number } {
  const anchors = [o.strike, o.breakeven, o.spot, o.long_strike ?? o.strike];
  return {
    min: Math.min(...anchors) * 0.85,
    max: Math.max(...anchors) * 1.15,
  };
}
