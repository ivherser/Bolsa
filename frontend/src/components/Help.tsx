import { createContext, useContext, useEffect, useRef, useState } from "react";
import { HELP } from "../help";
import type { HelpKey } from "../help";

export const HelpContext = createContext<boolean>(false);

const closers = new Set<(id: object) => void>();

export function HelpToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={on ? "help-toggle active" : "help-toggle"}
      aria-pressed={on}
      title="Mostrar/ocultar ayuda"
      onClick={onToggle}
    >
      ⓘ
    </button>
  );
}

export function Info({ k }: { k: HelpKey }) {
  const enabled = useContext(HelpContext);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const idRef = useRef<object>({});

  useEffect(() => {
    if (!enabled) setOpen(false);
  }, [enabled]);

  useEffect(() => {
    const closer = (id: object) => {
      if (id !== idRef.current) setOpen(false);
    };
    closers.add(closer);
    return () => {
      closers.delete(closer);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const r = wrapRef.current?.getBoundingClientRect();
    if (r) {
      setPos(
        r.left > window.innerWidth / 2
          ? { top: r.bottom + 4, right: window.innerWidth - r.right }
          : { top: r.bottom + 4, left: r.left },
      );
    }
    const onDoc = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("pointerdown", onDoc);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  if (!enabled) return null;
  return (
    <span className="info-wrap" ref={wrapRef}>
      <button
        type="button"
        className="info-dot"
        aria-label="Ayuda"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((v) => {
            if (!v) closers.forEach((c) => c(idRef.current));
            return !v;
          });
        }}
      >
        i
      </button>
      {open && pos && (
        <span role="tooltip" className="info-tip" style={pos}>
          {HELP[k]}
        </span>
      )}
    </span>
  );
}
