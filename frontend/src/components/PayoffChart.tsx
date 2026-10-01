import { payoffAt, payoffRange } from "../payoff";
import type { OptionResult } from "../types";

const W = 360;
const H = 220;
const PAD_L = 46;
const PAD_R = 10;
const PAD_T = 10;
const PAD_B = 26;
const N = 120;

const nf = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });

export default function PayoffChart({ result: r }: { result: OptionResult }) {
  const { min, max } = payoffRange(r);
  const xs: number[] = [];
  for (let i = 0; i <= N; i++) xs.push(min + ((max - min) * i) / N);
  const ys = xs.map((s) => payoffAt(r, s));
  const yMin = Math.min(...ys, 0);
  const yMax = Math.max(...ys, 0);
  const yPad = (yMax - yMin || 1) * 0.08;
  const lo = yMin - yPad;
  const hi = yMax + yPad;

  const x = (s: number) => PAD_L + ((s - min) / (max - min)) * (W - PAD_L - PAD_R);
  const y = (v: number) => PAD_T + ((hi - v) / (hi - lo)) * (H - PAD_T - PAD_B);

  const pts = xs.map((s, i) => `${x(s).toFixed(1)},${y(ys[i] ?? 0).toFixed(1)}`).join(" ");
  const zeroY = y(0);

  const area = (sign: 1 | -1) => {
    const clipY = sign === 1 ? PAD_T : zeroY;
    const clipH = sign === 1 ? zeroY - PAD_T : PAD_T + (H - PAD_T - PAD_B) - zeroY;
    return (
      <polygon
        points={`${x(min)},${zeroY} ${pts} ${x(max)},${zeroY}`}
        fill={sign === 1 ? "rgba(47,191,113,0.25)" : "rgba(229,83,75,0.25)"}
        clipPath={`inset(${clipY}px 0 ${H - clipY - clipH}px 0)`}
      />
    );
  };

  // Marcadores verticales ordenados por x; las etiquetas se escalonan en
  // hasta 3 filas cuando sus posiciones están a menos de ~28px.
  const markers = [
    { v: r.strike, label: "K", color: "#8fa0bd" },
    ...(r.long_strike !== null ? [{ v: r.long_strike, label: "L", color: "#8fa0bd" }] : []),
    { v: r.breakeven, label: "BE", color: "#ffb020" },
    { v: r.spot, label: "Spot", color: "#2fbf71" },
  ]
    .sort((a, b) => a.v - b.v)
    .map((m) => ({ ...m, mx: x(m.v) }));

  let prevX = -Infinity;
  let row = 0;
  const placed = markers.map((m) => {
    if (m.mx - prevX < 28) row = (row + 1) % 3;
    else row = 0;
    prevX = m.mx;
    return { ...m, ly: PAD_T + 10 + row * 11 };
  });

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Payoff a vencimiento">
      <line x1={PAD_L} y1={zeroY} x2={W - PAD_R} y2={zeroY} stroke="#555" />
      {area(1)}
      {area(-1)}
      <polyline points={pts} fill="none" stroke="#4f8cff" strokeWidth={1.6} />
      {placed.map((m) => (
        <g key={m.label}>
          <line x1={m.mx} y1={PAD_T} x2={m.mx} y2={H - PAD_B} stroke={m.color} strokeDasharray="4 3" />
          <text x={m.mx} y={m.ly} fill={m.color} fontSize={9} textAnchor="middle">
            {m.label}
          </text>
        </g>
      ))}
      <text x={4} y={y(hi - yPad * 0.6)} fill="#8fa0bd" fontSize={10}>
        {nf2.format(yMax)}
      </text>
      <text x={4} y={y(lo + yPad * 0.6)} fill="#8fa0bd" fontSize={10}>
        {nf2.format(yMin)}
      </text>
      <text x={PAD_L} y={H - 8} fill="#8fa0bd" fontSize={10}>
        {nf.format(min)}
      </text>
      <text x={W - PAD_R} y={H - 8} fill="#8fa0bd" fontSize={10} textAnchor="end">
        {nf.format(max)}
      </text>
    </svg>
  );
}
