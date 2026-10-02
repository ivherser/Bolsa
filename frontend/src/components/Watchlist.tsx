import { useEffect, useState } from "react";
import { addWatchItems, listWatchlist, removeWatchItem, type WatchItem } from "../db";
import { MAX_TICKERS } from "../storage";

interface Props {
  userId: string;
  tickers: string[];
  onLoad: (tickers: string[]) => void;
}

export default function Watchlist({ userId, tickers, onLoad }: Props) {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    listWatchlist(userId)
      .then((d) => active && setItems(d))
      .catch((e: Error) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [userId]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setBusy(false);
    }
  };

  const saved = new Set(items.map((i) => i.ticker));
  const missing = tickers.filter((t) => !saved.has(t));

  const saveCurrent = () =>
    run(async () => {
      const added = await addWatchItems(userId, missing);
      setItems((prev) => [...prev, ...added.filter((a) => !prev.some((p) => p.id === a.id))]);
    });

  const remove = (item: WatchItem) =>
    run(async () => {
      await removeWatchItem(userId, item.id);
      setItems((prev) => prev.filter((p) => p.id !== item.id));
    });

  const addToScreener = (t: string) => {
    if (!tickers.includes(t) && tickers.length < MAX_TICKERS) onLoad([...tickers, t]);
  };

  return (
    <div className="field panel-block">
      <div className="label-row">
        <label>Watchlist ({items.length})</label>
        <button
          type="button"
          className="link-btn"
          disabled={busy || missing.length === 0}
          onClick={saveCurrent}
          title="Guardar en la watchlist los tickers actuales"
        >
          Guardar tickers
        </button>
      </div>
      {items.length === 0 ? (
        <div className="muted-note">Vacía. Guarda tus tickers para tenerlos en cualquier dispositivo.</div>
      ) : (
        <div className="chips">
          {items.map((i) => (
            <span key={i.id} className={`chip ${tickers.includes(i.ticker) ? "chip-active" : ""}`}>
              <button
                type="button"
                className="chip-label"
                onClick={() => addToScreener(i.ticker)}
                title="Añadir al screener"
              >
                {i.ticker}
              </button>
              <button
                type="button"
                aria-label={`Eliminar ${i.ticker} de la watchlist`}
                disabled={busy}
                onClick={() => remove(i)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {items.length > 0 && (
        <button
          type="button"
          className="link-btn"
          onClick={() => onLoad(items.slice(0, MAX_TICKERS).map((i) => i.ticker))}
        >
          Cargar watchlist en el screener
        </button>
      )}
      {error && <div className="hint">{error}</div>}
    </div>
  );
}
