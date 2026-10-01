import { useState } from "react";

const TICKER_RE = /^\^?[A-Z0-9][A-Z0-9.\-]{0,9}$/;
const MAX = 10;

interface Props {
  tickers: string[];
  onChange: (tickers: string[]) => void;
}

export default function TickerChips({ tickers, onChange }: Props) {
  const [input, setInput] = useState("");
  const [hint, setHint] = useState("");

  const add = (raw: string) => {
    const t = raw.trim().toUpperCase();
    if (!t) return;
    if (!TICKER_RE.test(t)) {
      setHint(`"${t}" no es un ticker válido`);
      return;
    }
    if (tickers.includes(t)) {
      setHint(`${t} ya está en la lista`);
      return;
    }
    if (tickers.length >= MAX) {
      setHint(`Máximo ${MAX} tickers`);
      return;
    }
    setHint("");
    onChange([...tickers, t]);
    setInput("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(input);
    } else if (e.key === "Backspace" && input === "" && tickers.length) {
      onChange(tickers.slice(0, -1));
    }
  };

  return (
    <div className="field">
      <label>Tickers ({tickers.length}/{MAX})</label>
      <div className="chips">
        {tickers.map((t) => (
          <span key={t} className="chip">
            {t}
            <button
              type="button"
              aria-label={`Quitar ${t}`}
              onClick={() => onChange(tickers.filter((x) => x !== t))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={input}
        placeholder="Añadir ticker (Enter o coma)"
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => input && add(input)}
      />
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
