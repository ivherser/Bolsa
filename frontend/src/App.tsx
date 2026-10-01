import { useCallback, useRef, useState } from "react";
import { fetchScreener } from "./api";
import DetailPanel from "./components/DetailPanel";
import FilterPanel from "./components/FilterPanel";
import PresetBar from "./components/PresetBar";
import ResultsTable from "./components/ResultsTable";
import TickerChips from "./components/TickerChips";
import { DEFAULT_PRESET_ID, DEFAULT_TICKERS, PRESETS } from "./presets";
import type { Filters, OptionResult } from "./types";

export default function App() {
  const [tickers, setTickers] = useState<string[]>(DEFAULT_TICKERS);
  const [presetId, setPresetId] = useState<string>(DEFAULT_PRESET_ID);
  const [filters, setFilters] = useState<Filters>(
    PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!.filters,
  );
  const [results, setResults] = useState<OptionResult[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<OptionResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const applyPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setPresetId(id);
    setFilters(p.filters);
  };

  const changeFilters = (f: Filters) => {
    setFilters(f);
    setPresetId("custom");
  };

  const search = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    setSelected(null);
    try {
      const resp = await fetchScreener(tickers, filters, ctrl.signal);
      setResults(resp.results);
      setWarnings(resp.meta.warnings);
      setTruncated(resp.meta.truncated);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : "Error desconocido");
        setResults(null);
      }
    } finally {
      setLoading(false);
    }
  }, [tickers, filters]);

  return (
    <div className="app">
      <header>
        <h1>Bolsa — Screener de opciones</h1>
      </header>
      <div className="layout">
        <aside className="sidebar">
          <PresetBar activeId={presetId} onSelect={applyPreset} />
          <TickerChips tickers={tickers} onChange={setTickers} />
          <FilterPanel
            filters={filters}
            onChange={changeFilters}
            onSearch={search}
            loading={loading}
            canSearch={tickers.length > 0}
          />
        </aside>
        <main className="main">
          <ResultsTable
            results={results}
            warnings={warnings}
            truncated={truncated}
            loading={loading}
            error={error}
            selected={selected}
            onSelect={setSelected}
          />
        </main>
        {selected && <DetailPanel result={selected} onClose={() => setSelected(null)} />}
      </div>
      <footer className="disclaimer">
        Datos de Yahoo Finance con retraso aproximado de 15 minutos. Las griegas son calculadas
        (Black-Scholes, sin dividendos), no de mercado. Esta herramienta no es asesoramiento
        financiero.
      </footer>
    </div>
  );
}
