import { useCallback, useEffect, useRef, useState } from "react";
import { fetchStatus } from "../api";

type State = "checking" | "ok" | "down";

interface Props {
  refreshKey: number;
  lastSearchOk: number;
}

const INTERVAL_MS = 5 * 60 * 1000;

export default function SourceStatus({ refreshKey, lastSearchOk }: Props) {
  const [state, setState] = useState<State>("checking");
  const [latency, setLatency] = useState<number | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const check = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState("checking");
    try {
      const s = await fetchStatus(ctrl.signal);
      setState(s.connected ? "ok" : "down");
      setLatency(s.latency_ms);
      setCheckedAt(s.checked_at);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setState("down");
    }
  }, []);

  useEffect(() => {
    check();
    const id = setInterval(check, INTERVAL_MS);
    return () => {
      clearInterval(id);
      abortRef.current?.abort();
    };
  }, [check]);

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    check();
  }, [refreshKey, check]);

  const lastOk = useRef(0);
  useEffect(() => {
    if (lastSearchOk > lastOk.current) {
      lastOk.current = lastSearchOk;
      setState("ok");
    }
  }, [lastSearchOk]);

  const label =
    state === "ok" ? "Conectado" : state === "down" ? "Sin conexión" : "Comprobando…";
  const detail = [
    latency !== null && state === "ok" ? `latencia ${latency} ms` : null,
    checkedAt ? `última comprobación ${new Date(checkedAt).toLocaleTimeString("es-ES")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const title =
    "Fuente de datos: Yahoo Finance (datos con ~15 min de retraso). " +
    "Pulsa para comprobar la conexión." +
    (detail ? ` — ${detail}` : "");

  return (
    <button
      type="button"
      className="source-status"
      onClick={check}
      disabled={state === "checking"}
      title={title}
      aria-label={`Fuente de datos Yahoo Finance: ${label}`}
    >
      <span className={`dot ${state}`} aria-hidden="true" />
      <span className="source-name">Yahoo Finance</span>
      <span className="source-label">{label}</span>
    </button>
  );
}
