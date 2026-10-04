interface Props {
  label: string;
  min: number;
  max: number;
  step: number;
  low: number;
  high: number;
  onChange: (low: number, high: number) => void;
  format?: (v: number) => string;
}

export default function DualRange({
  label,
  min,
  max,
  step,
  low,
  high,
  onChange,
  format = (v) => String(v),
}: Props) {
  const span = max - min;
  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  const loPct = clamp(((low - min) / span) * 100);
  const hiPct = clamp(((high - min) / span) * 100);
  return (
    <div className="field">
      <label>
        {label}: {format(low)} – {format(high)}
      </label>
      <div className="dual-range">
        <div className="dual-range-track" />
        <div
          className="dual-range-fill"
          style={{ left: `${loPct}%`, width: `${hiPct - loPct}%` }}
        />
        <input
          type="range"
          className="dual-range-thumb"
          aria-label="mínimo"
          min={min}
          max={max}
          step={step}
          value={low}
          style={{ zIndex: low > min + span / 2 ? 2 : 1 }}
          onChange={(e) => onChange(Math.min(Number(e.target.value), high), high)}
        />
        <input
          type="range"
          className="dual-range-thumb"
          aria-label="máximo"
          min={min}
          max={max}
          step={step}
          value={high}
          onChange={(e) => onChange(low, Math.max(Number(e.target.value), low))}
        />
      </div>
    </div>
  );
}
