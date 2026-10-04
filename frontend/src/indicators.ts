/* Indicadores técnicos puros sobre cierres. Todos devuelven
   (number|null)[] alineado al índice de entrada, null en el warm-up. */

export function sma(values: number[], n: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let acc = 0;
  for (let i = 0; i < values.length; i++) {
    acc += values[i]!;
    if (i >= n) acc -= values[i - n]!;
    if (i >= n - 1) out[i] = acc / n;
  }
  return out;
}

export function ema(values: number[], n: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < n) return out;
  let seed = 0;
  for (let i = 0; i < n; i++) seed += values[i]!;
  let prev = seed / n;
  out[n - 1] = prev;
  const k = 2 / (n + 1);
  for (let i = n; i < values.length; i++) {
    prev = values[i]! * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsi(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i]! - closes[i - 1]!;
    if (ch > 0) avgGain += ch;
    else avgLoss -= ch;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i]! - closes[i - 1]!;
    avgGain = (avgGain * (period - 1) + Math.max(ch, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-ch, 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function macd(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): { macd: (number | null)[]; signal: (number | null)[]; hist: (number | null)[] } {
  const ef = ema(closes, fast);
  const es = ema(closes, slow);
  const macdLine: (number | null)[] = closes.map((_, i) =>
    ef[i] !== null && es[i] !== null ? ef[i]! - es[i]! : null,
  );
  const present = macdLine.filter((v): v is number => v !== null);
  const sigCompact = ema(present, signalPeriod);
  const signal: (number | null)[] = new Array(closes.length).fill(null);
  let j = 0;
  for (let i = 0; i < closes.length; i++) {
    if (macdLine[i] !== null) {
      signal[i] = sigCompact[j] ?? null;
      j++;
    }
  }
  const hist = macdLine.map((v, i) =>
    v !== null && signal[i] !== null ? v - signal[i]! : null,
  );
  return { macd: macdLine, signal, hist };
}
