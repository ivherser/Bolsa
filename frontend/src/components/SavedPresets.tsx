import { type FormEvent, useEffect, useState } from "react";
import { deletePreset, listPresets, type SavedPreset, savePreset } from "../db";
import type { Filters } from "../types";

interface Props {
  userId: string;
  filters: Filters;
  onApply: (filters: Filters) => void;
}

export default function SavedPresets({ userId, filters, onApply }: Props) {
  const [presets, setPresets] = useState<SavedPreset[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    listPresets(userId)
      .then((d) => active && setPresets(d))
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

  const save = (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    run(async () => {
      const p = await savePreset(userId, n, filters);
      setPresets((prev) =>
        [...prev.filter((x) => x.id !== p.id), p].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setName("");
    });
  };

  const remove = (p: SavedPreset) =>
    run(async () => {
      await deletePreset(userId, p.id);
      setPresets((prev) => prev.filter((x) => x.id !== p.id));
    });

  return (
    <div className="field panel-block">
      <label>Mis presets</label>
      {presets.length > 0 && (
        <div className="chips">
          {presets.map((p) => (
            <span key={p.id} className="chip">
              <button
                type="button"
                className="chip-label"
                onClick={() => onApply(p.filtros)}
                title="Aplicar filtros"
              >
                {p.name}
              </button>
              <button
                type="button"
                aria-label={`Eliminar preset ${p.name}`}
                disabled={busy}
                onClick={() => remove(p)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <form className="inline-form" onSubmit={save}>
        <input
          type="text"
          placeholder="Nombre del preset"
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="secondary" disabled={busy || !name.trim()}>
          Guardar
        </button>
      </form>
      {error && <div className="hint">{error}</div>}
    </div>
  );
}
