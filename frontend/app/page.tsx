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
import DatasetList, { Dataset } from '@/components/DatasetList';
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
  const [lastQuery, setLastQuery] = useState('');
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [selectedDataset, setSelectedDataset] = useState<DatasetResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'split' | 'map' | 'results'>('split');
  const [comparingIds, setComparingIds] = useState<Set<string>>(new Set());
  const [allDatasets, setAllDatasets] = useState<Dataset[]>([]);
  const [selectedDiscoverId, setSelectedDiscoverId] = useState<string | null>(null);
  const [datasetsLoading, setDatasetsLoading] = useState(false);
  const [discoverBbox, setDiscoverBbox] = useState<BoundingBox | null>(null);

  // Load all datasets from STAC providers on mount
  useEffect(() => {
    async function loadDatasets() {
      setDatasetsLoading(true);
      try {
        const collections = [
          'sentinel-2-l2a', 'sentinel-1-grd', 'landsat-c2-l2',
          'ResourceSat-2A_AWIFS_L2', 'ResourceSat-2A_LISS3_L2',
          'ccm-optical', 'ccm-sar',
        ];
        const all: Dataset[] = [];
        // Fetch datasets from all providers in parallel
        const promises = collections.map(async (col) => {
          try {
            const res = await fetch('/api/search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: col, collection: col, limit: 10 }),
            });
            if (!res.ok) return [];
            const data = await res.json();
            return (data.results || []).map((r: any) => ({
              id: r.id,
              title: r.title || r.id,
              provider: r.provider || col,
              collection: r.collection || col,
              date: r.startDate || r.endDate || null,
              bbox: r.bbox,
              cloudCover: r.cloudCover,
              score: r.score,
            }));
          } catch {
            return [];
          }
        });
        const results = await Promise.all(promises);
        results.forEach(r => all.push(...r));
        // Deduplicate by id
        const seen = new Set<string>();
        const unique = all.filter(d => { if (seen.has(d.id)) return false; seen.add(d.id); return true; });
        setAllDatasets(unique);
      } catch (err) {
        console.error('Failed to load datasets:', err);
      } finally {
        setDatasetsLoading(false);
      }
    }
    loadDatasets();
  }, []);

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
      setLastQuery(searchFilters.query);
      setResults(data);
      setSelectedDataset(null);
    } catch {
      setResults({ results: [], total: 0, limit: 20, offset: 0, latencyMs: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  // Hydration guard: all hooks must be called before this
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return (
    <div className="min-h-screen bg-[#0a0e1a]" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#64748b', fontSize: '14px' }}>Loading OrbitalQuery...</div>
    </div>
  );

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
          <div className="max-w-5xl mx-auto px-4">
            <QueryInput onAnalyze={analysis.analyze} loading={false} />
          </div>
        )}

        {step !== 'idle' && step !== 'complete' && step !== 'error' && (
          <div className="max-w-[1800px] mx-auto px-4 py-8">
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Map — 2/3 width */}
              <div className="lg:col-span-2">
                <div className="glass rounded-2xl border border-blue-500/20 overflow-hidden">
                  <MapView
                    results={[]}
                    selectedDataset={null}
                    onSelectDataset={() => {}}
                    bbox={analysis.state.plan?.bbox && Array.isArray(analysis.state.plan.bbox) && analysis.state.plan.bbox.length >= 4 ? {
                      north: analysis.state.plan.bbox[3],
                      south: analysis.state.plan.bbox[1],
                      east: analysis.state.plan.bbox[2],
                      west: analysis.state.plan.bbox[0],
                    } : null}
                    onBboxChange={(_bbox: any) => {}}
                  />
                </div>
              </div>

              {/* Side Panel — 1/3 width */}
              <div className="lg:col-span-1 space-y-4 max-h-[80vh] overflow-y-auto pr-1">
                {analysis.state.plan && <AnalysisPlanView plan={analysis.state.plan} />}
                {analysis.state.scenes.length > 0 && <EvidencePanel scenes={analysis.state.scenes} />}
                <ResultsPanel result={analysis.state.result} />
                <IntelligencePanel result={analysis.state.result} />
              </div>
            </div>
          </div>
        )}

        <div className="text-center py-6">
          <p className="text-[10px] text-slate-600">
            Sentinél • Landsat • NASA • ISRO
          </p>
          <p className="text-[10px] text-slate-700 mt-1">
            OrbitalQuery — Built for researchers and decision-makers.
          </p>
          <p className="text-[9px] text-yellow-600/50 mt-1">
            ⚠ This is a research tool, not for operational disaster response.
          </p>
        </div>
      </div>
    );
  }

  // ── Dataset Discovery View ────────────────────────────────────

  // Filter datasets by provider/collection
  const filteredDatasets = allDatasets.filter(ds => {
    if (filters.provider && !ds.provider?.toLowerCase().includes(filters.provider.toLowerCase())) return false;
    if (filters.collection && !ds.collection?.toLowerCase().includes(filters.collection.toLowerCase())) return false;
    return true;
  });

  // The selected discover dataset
  const selectedDiscoverDataset = filteredDatasets.find(d => d.id === selectedDiscoverId) || null;

  // Convert to MapView-compatible format
  const discoverMapViewResults: DatasetResult[] = selectedDiscoverDataset ? [{
    id: selectedDiscoverDataset.id,
    stacId: null,
    title: selectedDiscoverDataset.title,
    description: null,
    bbox: selectedDiscoverDataset.bbox,
    centroidLat: selectedDiscoverDataset.bbox ? (selectedDiscoverDataset.bbox[1] + selectedDiscoverDataset.bbox[3]) / 2 : 0,
    centroidLng: selectedDiscoverDataset.bbox ? (selectedDiscoverDataset.bbox[0] + selectedDiscoverDataset.bbox[2]) / 2 : 0,
    provider: selectedDiscoverDataset.provider,
    collection: selectedDiscoverDataset.collection,
    platform: null,
    instrument: null,
    gsd: null,
    cloudCover: selectedDiscoverDataset.cloudCover ?? null,
    geometry: null,
    startDate: selectedDiscoverDataset.date,
    endDate: null,
    previewUrl: selectedDiscoverDataset.previewUrl ?? null,
    stacLink: null,
    score: selectedDiscoverDataset.score,
  }] : [];

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

      {/* Compact filter bar */}
      <div className="max-w-[1800px] mx-auto px-4 mb-3">
        <div className="glass rounded-xl border border-slate-700/30 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Provider filter */}
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Provider</label>
              <select
                value={filters.provider}
                onChange={(e) => setFilters(prev => ({ ...prev, provider: e.target.value }))}
                className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:border-blue-500/50 focus:outline-none"
              >
                <option value="">All Providers</option>
                <option value="ISRO">🇮🇳 ISRO / Bhoonidhi</option>
                <option value="Copernicus">🇪🇺 Copernicus</option>
                <option value="NASA">🇺🇸 NASA</option>
                <option value="Planetary Computer">🌐 Planetary Computer</option>
              </select>
            </div>

            {/* Collection filter */}
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Collection</label>
              <select
                value={filters.collection}
                onChange={(e) => setFilters(prev => ({ ...prev, collection: e.target.value }))}
                className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:border-blue-500/50 focus:outline-none"
              >
                <option value="">All Collections</option>
                <option value="sentinel-2">Sentinel-2 L2A</option>
                <option value="sentinel-1">Sentinel-1 GRD</option>
                <option value="landsat">Landsat C2 L2</option>
                <option value="ResourceSat">ResourceSat (ISRO)</option>
                <option value="EOS">EOS (ISRO)</option>
                <option value="ccm">Contributing Missions</option>
              </select>
            </div>

            {/* Date range */}
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">From</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:border-blue-500/50 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">To</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:border-blue-500/50 focus:outline-none"
              />
            </div>

            {/* Dataset count */}
            <div className="ml-auto text-[10px] text-slate-500">
              {filteredDatasets.length} datasets
            </div>
          </div>
        </div>
      </div>

      {/* Main content: Map + Dataset List */}
      <div className="max-w-[1800px] mx-auto px-4 pb-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ height: 'calc(100vh - 200px)', minHeight: '500px' }}>
          {/* Map — 2/3 width */}
          <div className="lg:col-span-2 rounded-2xl overflow-hidden border border-slate-700/30">
            <MapView
              results={discoverMapViewResults}
              selectedDataset={selectedDiscoverDataset as any}
              onSelectDataset={(ds) => {
                if (ds) setSelectedDiscoverId(ds.id);
              }}
              bbox={discoverBbox}
              onBboxChange={(bbox) => setDiscoverBbox(bbox as BoundingBox | null)}
            />
          </div>

          {/* Dataset List — 1/3 width */}
          <div className="lg:col-span-1 rounded-2xl border border-slate-700/30 bg-slate-900/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/30">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Available Datasets
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Click a dataset to view on map
              </p>
            </div>
            <div style={{ height: 'calc(100% - 52px)' }}>
              <DatasetList
                datasets={filteredDatasets}
                selectedId={selectedDiscoverId}
                onSelect={(ds) => {
                  setSelectedDiscoverId(ds.id);
                  // Zoom map to bbox
                  if (ds.bbox && ds.bbox.length === 4) {
                    setDiscoverBbox({
                      north: ds.bbox[3],
                      south: ds.bbox[1],
                      east: ds.bbox[2],
                      west: ds.bbox[0],
                    });
                  }
                }}
                loading={datasetsLoading}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="text-center py-4">
        <p className="text-[10px] text-slate-600">
          Sentinél • Landsat • NASA • ISRO
        </p>
        <p className="text-[10px] text-slate-700 mt-1">
          OrbitalQuery — Built for researchers and decision-makers.
        </p>
      </div>
    </div>
  );
}

export default function HomePage() {
  return <HomePageContent />;
}
