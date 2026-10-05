import { useState } from "react";
import { Info } from "./Help";

const TICKER_RE = /^\^?[A-Z0-9][A-Z0-9.\-]{0,9}$/;
const MAX = 10;

interface Props {
  tickers: string[];
  onChange: (tickers: string[]) => void;
}

export default function TickerInput({ tickers, onChange }: Props) {
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
    }
  };

  return (
    <div className="ticker-input">
      <input
        type="text"
        value={input}
        placeholder="Añadir ticker…"
        aria-label="Añadir ticker"
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => input && add(input)}
      />
      <span className="ticker-count">
        {tickers.length}/{MAX}
      </span>
      <Info k="tickers" />
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
