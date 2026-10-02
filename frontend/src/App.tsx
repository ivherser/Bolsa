import { useCallback, useEffect, useRef, useState } from "react";
import { fetchScreener } from "./api";
import DetailPanel from "./components/DetailPanel";
import FilterPanel from "./components/FilterPanel";
import Notes from "./components/Notes";
import PresetBar from "./components/PresetBar";
import ResultsTable from "./components/ResultsTable";
import SavedPresets from "./components/SavedPresets";
import SourceStatus from "./components/SourceStatus";
import TickerChips from "./components/TickerChips";
import TickerOverview from "./components/TickerOverview";
import Watchlist from "./components/Watchlist";
import { PRESETS } from "./presets";
import { clearState, defaultState, loadState, saveState } from "./storage";
import type { Filters, OptionResult } from "./types";

interface Props {
  userId: string;
  userEmail: string;
  onNavigate: (path: string) => void;
  onLogout: () => void;
}

export default function App({ userId, userEmail, onNavigate, onLogout }: Props) {
  const [persisted] = useState(loadState);
  const [tickers, setTickers] = useState<string[]>(persisted.tickers);
  const [presetId, setPresetId] = useState<string>(persisted.presetId);
  const [filters, setFilters] = useState<Filters>(persisted.filters);
  const [overviewDte, setOverviewDte] = useState<number>(persisted.overviewDte);
  const [results, setResults] = useState<OptionResult[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<OptionResult | null>(null);
  const [searchErrorKey, setSearchErrorKey] = useState(0);
  const [lastSearchOk, setLastSearchOk] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    saveState({ tickers, presetId, filters, overviewDte });
  }, [tickers, presetId, filters, overviewDte]);

  const resetAll = () => {
    clearState();
    const d = defaultState();
    setTickers(d.tickers);
    setPresetId(d.presetId);
    setFilters(d.filters);
    setOverviewDte(d.overviewDte);
  };

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
      setLastSearchOk(Date.now());
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : "Error desconocido");
        setResults(null);
        setSearchErrorKey((k) => k + 1);
      }
    } finally {
      setLoading(false);
    }
  }, [tickers, filters]);

  return (
    <div className="app">
      <header>
        <h1>Bolsa — Screener de opciones</h1>
        <div className="header-right">
          <SourceStatus refreshKey={searchErrorKey} lastSearchOk={lastSearchOk} />
          <nav className="topnav">
            <a
              href="/docs"
              onClick={(e) => {
                e.preventDefault();
                onNavigate("/docs");
              }}
            >
              Docs
            </a>
            <span className="user-email" title={userEmail}>
              {userEmail}
            </span>
            <button type="button" className="secondary" onClick={onLogout}>
              Salir
            </button>
          </nav>
        </div>
      </header>
      <div className="layout">
        <aside className="sidebar">
          <PresetBar activeId={presetId} onSelect={applyPreset} onReset={resetAll} />
          <SavedPresets userId={userId} filters={filters} onApply={changeFilters} />
          <TickerChips tickers={tickers} onChange={setTickers} />
          <Watchlist userId={userId} tickers={tickers} onLoad={setTickers} />
          <FilterPanel
            filters={filters}
            onChange={changeFilters}
            onSearch={search}
            loading={loading}
            canSearch={tickers.length > 0}
          />
        </aside>
        <main className="main">
          <TickerOverview
            tickers={tickers}
            dte={overviewDte}
            onDteChange={setOverviewDte}
            onLoadOk={() => setLastSearchOk(Date.now())}
            onLoadError={() => setSearchErrorKey((k) => k + 1)}
          />
          <ResultsTable
            results={results}
            warnings={warnings}
            truncated={truncated}
            loading={loading}
            error={error}
            selected={selected}
            onSelect={setSelected}
          />
          <Notes userId={userId} suggestedTicker={selected?.ticker ?? null} />
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
