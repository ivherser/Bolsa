import { PRESETS } from "../presets";

interface Props {
  activeId: string;
  onSelect: (id: string) => void;
  onReset: () => void;
}

export default function PresetBar({ activeId, onSelect, onReset }: Props) {
  return (
    <div className="field">
      <div className="label-row">
        <label>Estrategia predefinida</label>
        <button
          type="button"
          className="link-btn"
          onClick={onReset}
          title="Restablecer tickers y filtros por defecto"
        >
          Restablecer
        </button>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`secondary ${activeId === p.id ? "active" : ""}`}
            onClick={() => onSelect(p.id)}
          >
            {p.label}
          </button>
        ))}
        {activeId === "custom" && (
          <button type="button" className="secondary active">
            Personalizado
          </button>
        )}
      </div>
    </div>
  );
}
