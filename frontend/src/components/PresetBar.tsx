import { PRESETS } from "../presets";

interface Props {
  activeId: string;
  onSelect: (id: string) => void;
}

export default function PresetBar({ activeId, onSelect }: Props) {
  return (
    <div className="field">
      <label>Estrategia predefinida</label>
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
