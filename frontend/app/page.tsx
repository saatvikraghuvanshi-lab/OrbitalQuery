'use client';

import { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Header from '@/components/Header';
import QueryInput from '@/components/QueryInput';
import AnalysisPlanView from '@/components/AnalysisPlanView';
import EvidencePanel from '@/components/EvidencePanel';
import TemporalComparisonView from '@/components/TemporalComparisonView';
import ShowcaseQueries from '@/components/ShowcaseQueries';
import DatasetList, { Dataset } from '@/components/DatasetList';
import DatasetDetailPanel from '@/components/DatasetDetailPanel';
import DiscoverySummary from '@/components/DiscoverySummary';
import { useAnalysis } from '@/hooks/useAnalysis';
import ShaderBackground from '@/components/ShaderBackground';

const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full rounded-2xl bg-slate-900 border border-slate-700/30 flex items-center justify-center text-slate-500 text-sm">
      Loading map...
    </div>
  ),
});

// ── Types ───────────────────────────────────────────────────────

export interface BoundingBox {
  north: number; south: number; east: number; west: number;
}

type Tab = 'ask' | 'showcase' | 'discover';

// Types for Dataset Discovery (preserved for backward compat)
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

export interface SearchFilters {
  query: string;
  bbox: BoundingBox | null;
  startDate: string;
  endDate: string;
  provider: string;
  collection: string;
}

export interface SearchResponse {
  results: DatasetResult[];
  total: number;
  limit: number;
  offset: number;
  latencyMs: number;
}

// ── Page ────────────────────────────────────────────────────────

function HomePageContent() {
  const [tab, setTab] = useState<Tab>('ask');
  const analysis = useAnalysis();

  // Hydration guard
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // ── All hooks declared unconditionally at the top ──
  const step = analysis.state.step;

  // Discover state (must be before any conditional returns)
  const [allDatasets, setAllDatasets] = useState<Dataset[]>([]);
  const [selectedDiscoverId, setSelectedDiscoverId] = useState<string | null>(null);
  const [datasetsLoading, setDatasetsLoading] = useState(false);
  const [discoverBbox, setDiscoverBbox] = useState<BoundingBox | null>(null);
  const [discoverProvider, setDiscoverProvider] = useState('');
  const [discoverCollection, setDiscoverCollection] = useState('');
  const [selectedDiscoverCollection, setSelectedDiscoverCollection] = useState<string | null>(null);
  const [bboxResults, setBboxResults] = useState<Dataset[]>([]);
  const [bboxLoading, setBboxLoading] = useState(false);
  const [bboxDetail, setBboxDetail] = useState<any>(null);

  // Search STAC when bbox is drawn
  useEffect(() => {
    if (!discoverBbox) { setBboxResults([]); setBboxDetail(null); return; }
    let cancelled = false;
    async function searchBbox() {
      setBboxLoading(true);
      setBboxDetail(null);
      try {
        const bbox = [discoverBbox!.west, discoverBbox!.south, discoverBbox!.east, discoverBbox!.north];
        const collections = ['sentinel-2-l2a', 'sentinel-1-grd', 'landsat-c2-l2'];
        const all: Dataset[] = [];
        await Promise.all(collections.map(async (col) => {
          try {
            const res = await fetch('/api/search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: col, collection: col, bbox, limit: 15 }),
            });
            if (!res.ok) return;
            const data = await res.json();
            (data.results || []).forEach((r: any) => {
              all.push({
                id: r.id,
                title: r.title || r.id,
                provider: r.provider || col,
                collection: r.collection || col,
                date: r.startDate || r.endDate || null,
                bbox: r.bbox,
                cloudCover: r.cloudCover,
                score: r.score,
                previewUrl: r.previewUrl || null,
              });
            });
          } catch {}
        }));
        if (!cancelled) {
          const seen = new Set<string>();
          setBboxResults(all.filter(d => { if (seen.has(d.id)) return false; seen.add(d.id); return true; }));
        }
      } catch (err) {
        console.error('Bbox search failed:', err);
      } finally {
        if (!cancelled) setBboxLoading(false);
      }
    }
    searchBbox();
    return () => { cancelled = true; };
  }, [discoverBbox]);

  // Load datasets from STAC when discover tab is active
  useEffect(() => {
    if (tab !== 'discover') return;
    if (allDatasets.length > 0) return;

    async function loadDatasets() {
      setDatasetsLoading(true);
      try {
        const collections = [
          'sentinel-2-l2a', 'sentinel-1-grd', 'landsat-c2-l2',
        ];
        const all: Dataset[] = [];
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
              date: r.startDate || r.start_date || r.endDate || r.end_date || null,
              bbox: r.bbox,
              cloudCover: r.cloudCover ?? r.cloud_cover_pct ?? null,
              score: r.score ?? r.relevance_score ?? null,
              platform: r.platform || null,
              instrument: r.instrument || null,
              stacLink: r.stacLink || null,
              previewUrl: r.previewUrl || null,
              description: r.description || null,
              geometry: r.geometry || null,
              endDate: r.endDate || r.end_date || null,
              centroidLat: r.centroidLat ?? r.centroid_lat ?? null,
              centroidLng: r.centroidLng ?? r.centroid_lng ?? null,
            }));
          } catch {
            return [];
          }
        });
        const results = await Promise.all(promises);
        results.forEach(r => all.push(...r));
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
  }, [tab, allDatasets.length]);

  if (!mounted) return (
    <div className="h-screen flex items-center justify-center" style={{ background: '#0a0e1a' }}>
      <div style={{ color: '#64748b', fontSize: '14px' }}>Loading OrbitalQuery...</div>
    </div>
  );

  // ── Analysis Workflow View ──────────────────────────────────────

  if (tab === 'ask') {  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: '#0a0e1a' }}>
        <ShaderBackground />
        <Header activeTab={tab} onNavigate={setTab} />

        {step === 'idle' && (
          <QueryInput onAnalyze={analysis.analyze} loading={false} />
        )}

        {step !== 'idle' && step !== 'complete' && step !== 'error' && (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto px-4 py-8 flex flex-col items-center w-full">
              {/* Back button — centered */}
              <button onClick={analysis.reset} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-8">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                New Analysis
              </button>

              {/* Progress Steps — centered with SVG icons */}
              <div className="flex items-center justify-center gap-1 mb-3">
                {[{ key: 'planning', label: 'Plan' }, { key: 'searching', label: 'Search' }, { key: 'ranking', label: 'Rank' }, { key: 'processing', label: 'Process' }, { key: 'deciding', label: 'Detect' }, { key: 'explaining', label: 'Report' }].map(({ key, label }, i) => {
                  const isActive = key === step;
                  const stepIdx = ['planning', 'searching', 'ranking', 'processing', 'deciding', 'explaining'].indexOf(step);
                  const isDone = stepIdx > i;
                  return (
                    <div key={key} className="flex items-center gap-1">
                      <div className="flex flex-col items-center">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                          isActive ? 'bg-blue-500 text-white animate-pulse shadow-lg shadow-blue-500/30' :
                          isDone ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                          'bg-slate-800 text-slate-600 border border-slate-700/30'
                        }`}>
                          {isDone ? (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                              <path strokeLinecap="round" strokeLinejoin="round" d={
                                key === 'planning' ? 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' :
                                key === 'searching' ? 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' :
                                key === 'ranking' ? 'M3 4h18M3 8h18M3 12h12M3 16h8' :
                                key === 'processing' ? 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' :
                                key === 'deciding' ? 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' :
                                'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
                              } />
                            </svg>
                          )}
                        </div>
                        <span className={`text-[9px] mt-1 font-medium ${isActive ? 'text-blue-400' : isDone ? 'text-green-400/60' : 'text-slate-600'}`}>{label}</span>
                      </div>
                      {i < 5 && <div className={`w-6 h-0.5 mt-[-12px] ${isDone ? 'bg-green-500/30' : 'bg-slate-700/50'}`} />}
                    </div>
                  );
                })}
              </div>

              {/* Active step label — shows real backend data */}
              <div className="text-center mb-8">
                <div className="text-sm text-slate-300 font-medium">
                  {step === 'planning' && 'Understanding your query'}
                  {step === 'searching' && 'Discovering satellite data'}
                  {step === 'ranking' && 'Ranking candidate datasets'}
                  {step === 'processing' && 'Analyzing observations'}
                  {step === 'deciding' && 'Detecting changes'}
                  {step === 'explaining' && 'Generating insights'}
                </div>
                {/* Real detail from backend */}
                {analysis.state.detail && (
                  <div className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                    {analysis.state.detail}
                  </div>
                )}
              </div>

              {/* Real backend processing steps — shown when available */}
              {analysis.state.processingSteps.length > 0 && (
                <div className="w-full max-w-2xl mb-6">
                  <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 px-4 py-3">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 font-medium">Processing log</div>
                    <div className="space-y-1">
                      {analysis.state.processingSteps.map((ps, i) => (
                        <div key={i} className="flex items-start gap-2 text-[10px]">
                          <span className="text-green-400/60 mt-0.5 flex-shrink-0">✓</span>
                          <span className="text-slate-400 min-w-0">
                            <span className="text-slate-300 font-medium">{ps.step.replace(/_/g, ' ')}</span>
                            {ps.detail && <span className="text-slate-600 ml-1.5 block sm:inline">{ps.detail.length > 80 ? ps.detail.slice(0, 80) + '...' : ps.detail}</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Partial Results — centered, balanced layout */}
              <div className="w-full grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  {analysis.state.plan && <AnalysisPlanView plan={analysis.state.plan} />}
                </div>
                <div className="lg:col-span-1">
                  {analysis.state.scenes.length > 0 && <EvidencePanel scenes={analysis.state.scenes} />}
                </div>
              </div>
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
          <div className="flex-1 overflow-y-auto">
            <div className="w-full max-w-[95vw] mx-auto px-4 py-6">
              {/* Back button — centered */}
              <div className="flex justify-center mb-4">
                <button onClick={analysis.reset} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  New Analysis
                </button>
              </div>

              {/* Query summary */}
              <div className="mb-4 text-center">
                <h2 className="text-lg font-bold text-slate-200">
                  &quot;{analysis.state.query}&quot;
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  {(analysis.state.result as any)?.metrics?.fallbackMode ? 'Dataset search complete — full analysis engine is waking up' : 'Temporal comparison complete'}
                </p>
              </div>

              {/* Fallback notice */}
              {(analysis.state.result as any)?.metrics?.fallbackMode && (
                <div className="mb-4 mx-auto max-w-2xl">
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-center">
                    <p className="text-xs text-amber-300">
                      ⚡ Running in quick-search mode — the full analysis engine is starting up. You can try the full analysis again in 30-60 seconds.
                    </p>
                  </div>
                </div>
              )}

              {/* The temporal comparison result */}
              <TemporalComparisonView result={analysis.state.result} />
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Showcase View ─────────────────────────────────────────────

  if (tab === 'showcase') {
    return (
      <div className="h-screen flex flex-col overflow-hidden" style={{ background: '#0a0e1a' }}>
        <Header activeTab={tab} onNavigate={setTab} />
        <div className="flex-1 overflow-y-auto">
          <ShowcaseQueries onSelect={(query) => {
            setTab('ask');
            analysis.analyze(query);
          }} />
        </div>
      </div>
    );
  }

  // ── Dataset Discovery View ────────────────────────────────────

  // Filter datasets
  // Use bbox results when a bbox is drawn, otherwise use default dataset list
  const displayDatasets = discoverBbox ? bboxResults : allDatasets;
  const filteredDatasets = displayDatasets.filter(ds => {
    if (discoverProvider && !ds.provider?.toLowerCase().includes(discoverProvider.toLowerCase())) return false;
    if (discoverCollection && !ds.collection?.toLowerCase().includes(discoverCollection.toLowerCase())) return false;
    return true;
  });

  const selectedDiscoverDataset = filteredDatasets.find(d => d.id === selectedDiscoverId) || null;

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
    previewUrl: null,
    stacLink: null,
    score: selectedDiscoverDataset.score,
  }] : [];

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: '#0a0e1a' }}>
      <Header activeTab={tab} onNavigate={setTab} />

      {/* Compact filter bar */}
      <div className="px-6 mb-3 w-full">
        <div className="glass rounded-xl border border-slate-700/30 px-5 py-3">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Provider</label>
              <select
                value={discoverProvider}
                onChange={(e) => setDiscoverProvider(e.target.value)}
                className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:border-blue-500/50 focus:outline-none"
              >
                <option value="">All Providers</option>
                <option value="Copernicus">Copernicus/ESA</option>
                <option value="NASA">NASA</option>
                <option value="Planetary Computer">Planetary Computer</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Collection</label>
              <select
                value={discoverCollection}
                onChange={(e) => setDiscoverCollection(e.target.value)}
                className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:border-blue-500/50 focus:outline-none"
              >
                <option value="">All Collections</option>
                <option value="sentinel-2">Sentinel-2 L2A</option>
                <option value="sentinel-1">Sentinel-1 GRD</option>
                <option value="landsat">Landsat C2 L2</option>
              </select>
            </div>
            <div className="ml-auto text-[11px] text-slate-400 font-medium">
              {filteredDatasets.length} datasets
            </div>
          </div>
        </div>
      </div>

      {/* Main content: Map + Dataset List */}
      <div className="px-6 pb-8 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ height: 'calc(100vh - 160px)', minHeight: '500px' }}>
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

          {/* Right panel — Dataset List or Detail */}
          <div className="lg:col-span-1 rounded-2xl border border-slate-700/30 bg-slate-900/50 overflow-hidden flex flex-col">
            {bboxDetail ? (
              /* Detail view */
              <>
                {/* Back button */}
                <div className="px-4 py-2 border-b border-slate-700/30 flex-shrink-0">
                  <button
                    onClick={() => { setBboxDetail(null); setSelectedDiscoverId(null); }}
                    className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to list
                  </button>
                </div>
                <div className="flex-1 overflow-hidden">
                  <DatasetDetailPanel
                    dataset={bboxDetail}
                    onClose={() => { setBboxDetail(null); setSelectedDiscoverId(null); }}
                    onAnalyze={(query) => {
                      setTab('ask');
                      analysis.analyze(query);
                    }}
                  />
                </div>
              </>
            ) : (
              /* List view */
              <>
                {/* Discovery Summary — grouped availability + best match */}
                {discoverBbox && filteredDatasets.length > 0 && (
                  <div className="px-4 py-3 border-b border-slate-700/30 flex-shrink-0">
                    <DiscoverySummary
                      datasets={filteredDatasets}
                      bbox={discoverBbox}
                      onSelectCollection={(col) => {
                        setSelectedDiscoverCollection(col);
                        setDiscoverCollection(col ?? '');
                      }}
                      selectedCollection={selectedDiscoverCollection}
                    />
                  </div>
                )}

                {/* Dataset list header */}
                <div className="px-4 py-3 border-b border-slate-700/30 flex-shrink-0">
                  <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    {discoverBbox ? `${filteredDatasets.length} Observations${selectedDiscoverCollection ? ` in ${selectedDiscoverCollection}` : ''}` : 'Available Datasets'}
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {discoverBbox ? 'Click an observation for details and analysis options' : 'Click a dataset to view details + analyze'}
                  </p>
                </div>
                <div className="flex-1 overflow-hidden">
                  <DatasetList
                    datasets={filteredDatasets}
                    selectedId={selectedDiscoverId}
                    onSelect={(ds) => {
                      setSelectedDiscoverId(ds.id);
                      setBboxDetail(ds);
                      if (ds.bbox && ds.bbox.length === 4) {
                        setDiscoverBbox({
                          north: ds.bbox[3],
                          south: ds.bbox[1],
                          east: ds.bbox[2],
                          west: ds.bbox[0],
                        });
                      }
                    }}
                    loading={discoverBbox ? bboxLoading : datasetsLoading}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return <HomePageContent />;
}
