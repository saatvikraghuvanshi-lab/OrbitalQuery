'use client';

import { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Header from '@/components/Header';
import QueryInput from '@/components/QueryInput';
import AnalysisPlanView from '@/components/AnalysisPlanView';
import EvidencePanel from '@/components/EvidencePanel';
import ResultsPanel from '@/components/ResultsPanel';
import IntelligencePanel from '@/components/IntelligencePanel';
import SearchBar from '@/components/SearchBar';
import FilterPanel from '@/components/FilterPanel';
import ResultsList from '@/components/ResultsList';
import StatsBar from '@/components/StatsBar';
import { useAnalysis } from '@/hooks/useAnalysis';

const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => (
    <div style={{
      width: '100%', height: '500px', borderRadius: '16px',
      background: '#0d1117', border: '1px solid rgba(71,85,105,0.3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#64748b', fontSize: '14px',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🗺️</div>
        <div>Loading map...</div>
      </div>
    </div>
  ),
});

// ── Types ───────────────────────────────────────────────────────

export interface BoundingBox {
  north: number; south: number; east: number; west: number;
}

export interface SearchFilters {
  query: string;
  bbox: BoundingBox | null;
  startDate: string;
  endDate: string;
  provider: string;
  collection: string;
}

export interface DatasetResult {
  id: string;
  stacId: string | null;
  title: string;
  description: string | null;
  provider: string;
  collection: string | null;
  platform: string | null;
  instrument: string | null;
  gsd: number | null;
  cloudCover: number | null;
  geometry: any;
  bbox: number[] | null;
  centroidLat: number | null;
  centroidLng: number | null;
  startDate: string | null;
  endDate: string | null;
  previewUrl: string | null;
  stacLink: string | null;
  score?: number;
}

export interface SearchResponse {
  results: DatasetResult[];
  total: number;
  limit: number;
  offset: number;
  latencyMs: number;
}

type Tab = 'ask' | 'discover';

// ── Page ────────────────────────────────────────────────────────

function HomePageContent() {
  const [tab, setTab] = useState<Tab>('ask');
  const analysis = useAnalysis();

  // Dataset discovery state (preserved from original)
  const [filters, setFilters] = useState<SearchFilters>({
    query: '', bbox: null, startDate: '', endDate: '', provider: '', collection: '',
  });
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [selectedDataset, setSelectedDataset] = useState<DatasetResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'split' | 'map' | 'results'>('split');
  const [comparingIds, setComparingIds] = useState<Set<string>>(new Set());

  // Hydration guard: render nothing until client-side
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return (
    <div className="min-h-screen bg-[#0a0e1a]" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#64748b', fontSize: '14px' }}>Loading OrbitalQuery...</div>
    </div>
  );

  const handleSearch = useCallback(async (searchFilters: SearchFilters) => {
    setLoading(true);
    try {
      const body: any = { query: searchFilters.query, limit: 50 };
      if (searchFilters.bbox) body.bbox = [searchFilters.bbox.west, searchFilters.bbox.south, searchFilters.bbox.east, searchFilters.bbox.north];
      if (searchFilters.startDate) body.startDate = searchFilters.startDate;
      if (searchFilters.endDate) body.endDate = searchFilters.endDate;
      if (searchFilters.provider) body.provider = searchFilters.provider;
      if (searchFilters.collection) body.collection = searchFilters.collection;

      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Search failed: ${res.status}`);
      const data: SearchResponse = await res.json();
      setResults(data);
      setSelectedDataset(null);
    } catch {
      setResults({ results: [], total: 0, limit: 20, offset: 0, latencyMs: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Analysis Workflow View ──────────────────────────────────────

  if (tab === 'ask') {
    const step = analysis.state.step;

    return (
      <div className="min-h-screen bg-[#0a0e1a]">
        <Header />

        {/* Tab Bar */}
        <div className="flex justify-center gap-1 pt-4 pb-2">
          {(['ask', 'discover'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-6 py-2 text-sm font-medium rounded-xl transition-all ${
                tab === t
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {t === 'ask' ? '🔍 Ask OrbitalQuery' : '📦 Dataset Discovery'}
            </button>
          ))}
        </div>

        {step === 'idle' && (
          <QueryInput onAnalyze={analysis.analyze} loading={false} />
        )}

        {step !== 'idle' && step !== 'complete' && step !== 'error' && (
          <div className="max-w-5xl mx-auto px-4 py-8">
            {/* Back button */}
            <button onClick={analysis.reset} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 mb-6 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              New Analysis
            </button>

            {/* Progress Steps */}
            <div className="flex items-center gap-2 mb-6">
              {['planning', 'searching', 'ranking', 'processing', 'deciding', 'explaining'].map((s, i) => {
                const isActive = s === step;
                const isDone = ['planning', 'searching', 'ranking', 'processing', 'deciding', 'explaining'].indexOf(step) > i;
                return (
                  <div key={s} className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                      isActive ? 'bg-blue-500 text-white animate-pulse' :
                      isDone ? 'bg-green-500/20 text-green-400' :
                      'bg-slate-800 text-slate-600'
                    }`}>
                      {isDone ? '✓' : i + 1}
                    </div>
                    {i < 5 && <div className={`w-8 h-0.5 ${isDone ? 'bg-green-500/30' : 'bg-slate-800'}`} />}
                  </div>
                );
              })}
            </div>

            {/* Step Label */}
            <div className="text-xs text-slate-500 mb-6 capitalize">
              {step === 'planning' && '📋 Parsing your query...'}
              {step === 'searching' && '🛰️ Searching satellite archives...'}
              {step === 'ranking' && '📊 Ranking evidence quality...'}
              {step === 'processing' && '⚙️ Running analysis pipeline...'}
              {step === 'deciding' && '🧠 Computing impact assessment...'}
              {step === 'explaining' && '📝 Generating explanation...'}
            </div>

            {/* Partial Results */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {analysis.state.plan && <AnalysisPlanView plan={analysis.state.plan} />}
              {analysis.state.scenes.length > 0 && <EvidencePanel scenes={analysis.state.scenes} />}
            </div>
          </div>
        )}

        {step === 'error' && (
          <div className="max-w-3xl mx-auto px-4 py-12">
            <div className="glass rounded-2xl border border-red-500/20 p-6 text-center">
              <div className="text-3xl mb-3">❌</div>
              <h3 className="text-sm font-bold text-red-400 mb-2">Analysis Failed</h3>
              <p className="text-xs text-slate-500 mb-4">{analysis.state.error}</p>
              <button onClick={analysis.reset} className="px-4 py-2 rounded-xl bg-slate-800/50 text-xs text-slate-400 hover:text-slate-300 transition-colors">
                Try Again
              </button>
            </div>
          </div>
        )}

        {step === 'complete' && analysis.state.result && (
          <div className="max-w-6xl mx-auto px-4 py-6">
            {/* Back button */}
            <button onClick={analysis.reset} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 mb-4 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              New Analysis
            </button>

            {/* Query summary */}
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-200">
                &quot;{analysis.state.query}&quot;
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Analysis complete in {analysis.state.result.analysis_id}
              </p>
            </div>

            {/* Main content: Map + Side Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              {/* Map — 3/5 width */}
              <div className="lg:col-span-3">
                <div className="glass rounded-2xl border border-blue-500/20 overflow-hidden">
                  <MapView
                    results={[]}
                    selectedDataset={null}
                    onSelectDataset={() => {}}
                    bbox={analysis.state.plan?.bbox ? {
                      north: analysis.state.plan.bbox[3],
                      south: analysis.state.plan.bbox[1],
                      east: analysis.state.plan.bbox[2],
                      west: analysis.state.plan.bbox[0],
                    } : null}
                    onBboxChange={() => {}}
                  />
                </div>
              </div>

              {/* Side Panel — 2/5 width */}
              <div className="lg:col-span-2 space-y-4 max-h-[80vh] overflow-y-auto pr-1">
                {analysis.state.plan && <AnalysisPlanView plan={analysis.state.plan} />}
                {analysis.state.scenes.length > 0 && <EvidencePanel scenes={analysis.state.scenes} />}
                <ResultsPanel result={analysis.state.result} />
                <IntelligencePanel result={analysis.state.result} />
              </div>
            </div>
          </div>
        )}

        <div className="text-center py-6">
          <p className="text-[10px] text-slate-700">
            OrbitalQuery — Powered by Bhoonidhi (ISRO), Copernicus &amp; Sentinel data. Built for researchers and decision-makers.
          </p>
        </div>
      </div>
    );
  }

  // ── Dataset Discovery View (preserved original) ─────────────────

  return (
    <div className="min-h-screen bg-[#0a0e1a]">
      <Header />

      {/* Tab Bar */}
      <div className="flex justify-center gap-1 pt-4 pb-2">
        {(['ask', 'discover'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-6 py-2 text-sm font-medium rounded-xl transition-all ${
              tab === t
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {t === 'ask' ? '🔍 Ask OrbitalQuery' : '📦 Dataset Discovery'}
          </button>
        ))}
      </div>

      <SearchBar
        onSearch={(q) => handleSearch({ ...filters, query: q })}
        loading={loading}
        onToggleFilters={() => {}}
        showFilters={false}
      />
      <FilterPanel filters={filters} onChange={setFilters} onApply={() => handleSearch(filters)} />

      {results && <StatsBar total={results.total} latencyMs={results.latencyMs} query={filters.query} />}

      <div className="max-w-[1600px] mx-auto px-4 pb-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Map */}
          <div className="rounded-2xl overflow-hidden border border-slate-700/30" style={{ minHeight: '500px' }}>
            <MapView
              results={results?.results || []}
              selectedDataset={selectedDataset}
              onSelectDataset={setSelectedDataset}
              bbox={filters.bbox ? { north: filters.bbox.north, south: filters.bbox.south, east: filters.bbox.east, west: filters.bbox.west } : null}
              onBboxChange={(bbox) => setFilters(prev => ({ ...prev, bbox: bbox as BoundingBox | null }))}
            />
          </div>

          {/* Results */}
          <div className="space-y-3">
            {results && (
              <ResultsList
                results={results.results}
                loading={loading}
                selectedDataset={selectedDataset}
                onSelectDataset={setSelectedDataset}
                comparingIds={comparingIds}
                onCompareToggle={(ds) => {
                  setComparingIds(prev => {
                    const next = new Set(prev);
                    if (next.has(ds.id)) next.delete(ds.id);
                    else if (next.size < 4) next.add(ds.id);
                    return next;
                  });
                }}
              />
            )}
          </div>
        </div>
      </div>

      <div className="text-center py-6">
        <p className="text-[10px] text-slate-700">
          OrbitalQuery — Powered by Bhoonidhi (ISRO), Copernicus &amp; Sentinel data. Built for researchers and decision-makers.
        </p>
        <p className="text-[9px] text-yellow-600/50 mt-1">
          ⚠ This is a research tool, not for operational disaster response. Always verify data through official sources.
        </p>
      </div>
    </div>
  );
}

export default function HomePage() {
  return <HomePageContent />;
}
