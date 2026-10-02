import { type FormEvent, useEffect, useState } from "react";
import { addNote, deleteNote, listNotes, type Note, updateNote } from "../db";
import { TICKER_RE } from "../storage";

const MAX_LEN = 5000;
const dtf = new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" });

interface Props {
  userId: string;
  suggestedTicker: string | null;
}

export default function Notes({ userId, suggestedTicker }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [ticker, setTicker] = useState("");
  const [text, setText] = useState("");
  const [filter, setFilter] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    listNotes(userId)
      .then((d) => active && setNotes(d))
      .catch((e: Error) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (suggestedTicker) setTicker(suggestedTicker);
  }, [suggestedTicker]);

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

  const create = (e: FormEvent) => {
    e.preventDefault();
    const t = ticker.trim().toUpperCase();
    const c = text.trim();
    if (!c) return;
    if (t && !TICKER_RE.test(t)) {
      setError(`"${t}" no es un ticker válido`);
      return;
    }
    run(async () => {
      const n = await addNote(userId, t || null, c);
      setNotes((prev) => [n, ...prev]);
      setText("");
    });
  };

  const saveEdit = (id: number) => {
    const c = editText.trim();
    if (!c) return;
    run(async () => {
      const n = await updateNote(userId, id, c);
      setNotes((prev) => prev.map((x) => (x.id === id ? n : x)));
      setEditingId(null);
    });
  };

  const remove = (id: number) =>
    run(async () => {
      await deleteNote(userId, id);
      setNotes((prev) => prev.filter((x) => x.id !== id));
    });

  const f = filter.trim().toUpperCase();
  const visible = f ? notes.filter((n) => n.ticker === f) : notes;

  return (
    <section className="overview notes">
      <div className="overview-header">
        <h2>Diario de notas</h2>
        <div className="overview-controls">
          <label htmlFor="notes-filter">Filtrar ticker</label>
          <input
            id="notes-filter"
            type="text"
            value={filter}
            maxLength={11}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>
      <form className="note-form" onSubmit={create}>
        <input
          type="text"
          placeholder="Ticker (opcional)"
          maxLength={11}
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
        />
        <textarea
          placeholder="Escribe una nota: tesis, entrada, ajuste, cierre…"
          maxLength={MAX_LEN}
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" disabled={busy || !text.trim()}>
          Añadir nota
        </button>
      </form>
      {error && <div className="hint">{error}</div>}
      {visible.length === 0 ? (
        <div className="muted-note">Sin notas.</div>
      ) : (
        <ul className="note-list">
          {visible.map((n) => (
            <li key={n.id}>
              <div className="note-meta">
                {n.ticker && <span className="chip">{n.ticker}</span>}
                <span>{dtf.format(new Date(n.created_at))}</span>
                <span className="note-actions">
                  {editingId === n.id ? (
                    <>
                      <button
                        type="button"
                        className="link-btn"
                        disabled={busy}
                        onClick={() => saveEdit(n.id)}
                      >
                        Guardar
                      </button>
                      <button type="button" className="link-btn" onClick={() => setEditingId(null)}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => {
                        setEditingId(n.id);
                        setEditText(n.contenido);
                      }}
                    >
                      Editar
                    </button>
                  )}
                  <button
                    type="button"
                    className="link-btn"
                    disabled={busy}
                    onClick={() => remove(n.id)}
                  >
                    Eliminar
                  </button>
                </span>
              </div>
              {editingId === n.id ? (
                <textarea
                  rows={3}
                  maxLength={MAX_LEN}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                />
              ) : (
                <p className="note-text">{n.contenido}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
