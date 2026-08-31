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
import AnalysisStepper from '@/components/AnalysisStepper';
import TerminalLog from '@/components/TerminalLog';
import AnalysisErrorScreen from '@/components/AnalysisErrorScreen';
import MarketingHomepage from '@/components/MarketingHomepage';

const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-accent-border)] flex items-center justify-center text-[var(--color-text-muted)] text-sm">
      Loading map...
    </div>
  ),
});

// ── Types ───────────────────────────────────────────────────────

export interface BoundingBox {
  north: number; south: number; east: number; west: number;
}

type Tab = 'ask' | 'showcase' | 'discover';

const PHASE_LABELS: Record<string, string> = {
  planning: 'Understanding your query',
  searching: 'Discovering satellite data',
  ranking: 'Ranking candidate datasets',
  processing: 'Analyzing observations',
  deciding: 'Detecting changes',
  explaining: 'Generating insights',
};

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
  const [view, setView] = useState<'home' | 'app'>('home');
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
    <div className="h-screen flex items-center justify-center oq-bg">
      <div className="text-[var(--color-text-muted)] text-sm">Loading OrbitalQuery...</div>
    </div>
  );

  if (view === 'home') {
    return (
      <MarketingHomepage
        onLaunchAsk={() => { setView('app'); setTab('ask'); }}
        onNavigate={(t) => { setView('app'); setTab(t); }}
      />
    );
  }

  // ── Analysis Workflow View ──────────────────────────────────────

  if (tab === 'ask') {
    // ── Query interpretation (derived from plan) ─────────
    const plan = analysis.state.plan;
    const interpretedLocation = plan?.aoi || '';
    const interpretedTopic = plan?.phenomenon?.replace(/_/g, ' ') || '';
    const interpretedTime = plan?.start_date && plan?.end_date
      ? `${plan.start_date} — ${plan.end_date}`
      : '';

    return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: '#050907' }}>
      <Header activeTab={tab} onNavigate={setTab} onHome={() => setView('home')} />

        {/* ── IDLE: full search experience ──────────────────── */}
        {step === 'idle' && (
          <QueryInput onAnalyze={analysis.analyze} loading={false} />
        )}

        {/* ── ANALYSIS IN PROGRESS ─────────────────────────── */}
        {step !== 'idle' && step !== 'complete' && step !== 'error' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Compact search bar */}
            <QueryInput
              onAnalyze={analysis.analyze}
              loading={true}
              compact
            />

            <div className="flex-1 overflow-hidden">
              <div className="max-w-[1400px] mx-auto px-6 py-4 h-full flex flex-col">
                {/* Back + query */}
                <div className="flex items-center justify-between mb-3">
                  <button onClick={analysis.reset} className="flex items-center gap-1.5 text-[11px] text-oq-300 hover:text-lime transition-colors font-medium">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    New Analysis
                  </button>
                  <span className="text-[11px] text-oq-300 font-mono truncate max-w-[60%]">{analysis.state.query}</span>
                </div>

                {/* Stepper */}
                <AnalysisStepper current={step} />

                {/* Query interpretation + active phase */}
                <div className="mt-3 mb-4">
                  <div className="text-[13px] font-semibold text-oq-100 text-center">{PHASE_LABELS[step] || ''}</div>
                  {analysis.state.detail && (
                    <div className="text-[11px] text-oq-300 mt-0.5 font-mono text-center">{analysis.state.detail}</div>
                  )}

                  {/* Interpreted query */}
                  {plan && (
                    <div className="mt-3 flex items-center justify-center gap-4 text-[10px]">
                      <span className="text-oq-400 uppercase tracking-wider font-medium">Understood as</span>
                      {interpretedLocation && (
                        <span className="text-oq-200"><span className="text-oq-400">Location:</span> {interpretedLocation}</span>
                      )}
                      {interpretedTime && (
                        <span className="text-oq-200"><span className="text-oq-400">Time:</span> {interpretedTime}</span>
                      )}
                      {interpretedTopic && (
                        <span className="text-oq-200"><span className="text-oq-400">Topic:</span> {interpretedTopic}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Dashboard grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">
                  <div className="col-span-12 lg:col-span-7 flex flex-col min-h-0">
                    <TerminalLog steps={analysis.state.processingSteps} currentDetail={analysis.state.detail} />
                  </div>
                  <div className="col-span-12 lg:col-span-5 flex flex-col gap-4 overflow-y-auto min-h-0">
                    {analysis.state.plan && <AnalysisPlanView plan={analysis.state.plan} />}
                    {analysis.state.scenes.length > 0 && <EvidencePanel scenes={analysis.state.scenes} />}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── ERROR ────────────────────────────────────────── */}
        {step === 'error' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <QueryInput onAnalyze={analysis.analyze} loading={false} compact />
            <div className="flex-1 overflow-y-auto">
              <AnalysisErrorScreen
                error={analysis.state.error || 'Analysis failed'}
                code={analysis.state.errorCode}
                query={analysis.state.query}
                onRetry={() => analysis.analyze(analysis.state.query)}
                onModify={analysis.reset}
              />
            </div>
          </div>
        )}

        {/* ── COMPLETE: results ─────────────────────────────── */}
        {step === 'complete' && analysis.state.result && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <QueryInput onAnalyze={analysis.analyze} loading={false} compact />
            <div className="flex-1 overflow-y-auto">
              <div className="w-full max-w-[1400px] mx-auto px-6 py-5">
                {/* Back + query + interpretation */}
                <div className="flex items-center justify-between mb-3">
                  <button onClick={analysis.reset} className="flex items-center gap-1.5 text-[11px] text-oq-300 hover:text-lime transition-colors font-medium">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    New Analysis
                  </button>
                  <span className="text-[11px] text-oq-300 font-mono truncate max-w-[60%]">{analysis.state.query}</span>
                </div>

                {/* Query interpretation bar */}
                {plan && (
                  <div className="mb-4 px-4 py-2.5 bg-oq-800/30 border border-oq-700/20 rounded-lg flex items-center gap-4">
                    <span className="text-[9px] text-oq-400 uppercase tracking-wider font-medium flex-shrink-0">Understood as</span>
                    <div className="flex-1 flex items-center gap-4 text-[11px] flex-wrap">
                      {interpretedLocation && (
                        <span className="text-oq-200"><span className="text-oq-400">Location:</span> <span className="text-oq-100 font-medium">{interpretedLocation}</span></span>
                      )}
                      {interpretedTime && (
                        <span className="text-oq-200"><span className="text-oq-400">Time:</span> <span className="text-oq-100 font-medium">{interpretedTime}</span></span>
                      )}
                      {interpretedTopic && (
                        <span className="text-oq-200"><span className="text-oq-400">Topic:</span> <span className="text-oq-100 font-medium">{interpretedTopic}</span></span>
                      )}
                    </div>
                  </div>
                )}

                {/* Fallback notice */}
                {(analysis.state.result as any)?.metrics?.fallbackMode && (
                  <div className="mb-4 mx-auto max-w-2xl">
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-2.5 text-center">
                      <p className="text-[11px] text-amber-300">
                        Running in quick-search mode — the full analysis engine is starting up. Try again in 30-60 seconds.
                      </p>
                    </div>
                  </div>
                )}

                {/* Temporal comparison result */}
                <TemporalComparisonView result={analysis.state.result} />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Showcase View ─────────────────────────────────────────────

  if (tab === 'showcase') {
    return (
      <div className="h-screen flex flex-col overflow-hidden oq-bg">
        <Header activeTab={tab} onNavigate={setTab} onHome={() => setView('home')} />
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

  const selectedDiscoverDataset = filteredDatasets.find(ds => ds.id === selectedDiscoverId) || null;

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
    <div className="h-screen flex flex-col overflow-hidden oq-bg">
      <Header activeTab={tab} onNavigate={setTab} />

      {/* Filter bar */}
      <div style={{ borderBottom: '1px solid #17251C', background: '#09110D' }}>
        <div className="max-w-[1600px] mx-auto px-5 h-12 flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: '#68756E' }}>Provider</span>
            <select
              value={discoverProvider}
              onChange={(e) => setDiscoverProvider(e.target.value)}
              className="rounded-md px-2.5 py-1.5 text-[12px] focus:outline-none"
              style={{
                background: '#0D1712',
                border: '1px solid #17251C',
                color: '#F1F5F2',
              }}
            >
              <option value="">All</option>
              <option value="Copernicus">Copernicus</option>
              <option value="NASA">NASA</option>
              <option value="Planetary Computer">Planetary Computer</option>
            </select>
          </div>
          <div className="w-px h-4" style={{ background: '#17251C' }} />
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: '#68756E' }}>Collection</span>
            <select
              value={discoverCollection}
              onChange={(e) => setDiscoverCollection(e.target.value)}
              className="rounded-md px-2.5 py-1.5 text-[12px] focus:outline-none"
              style={{
                background: '#0D1712',
                border: '1px solid #17251C',
                color: '#F1F5F2',
              }}
            >
              <option value="">All</option>
              <option value="sentinel-2">Sentinel-2 L2A</option>
              <option value="sentinel-1">Sentinel-1 GRD</option>
              <option value="landsat">Landsat C2 L2</option>
            </select>
          </div>
          <div className="w-px h-4" style={{ background: '#17251C' }} />
          <span className="text-[11px] font-mono ml-1" style={{ color: '#68756E' }}>{filteredDatasets.length} datasets</span>
        </div>
      </div>

      {/* Main: Map + Right panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Map — primary workspace */}
        <div className="flex-1 relative">
          <MapView
            results={discoverMapViewResults}
            selectedDataset={selectedDiscoverDataset as any}
            onSelectDataset={(ds) => { if (ds) setSelectedDiscoverId(ds.id); }}
            bbox={discoverBbox}
            onBboxChange={(bbox: BoundingBox | null) => setDiscoverBbox(bbox)}
          />
        </div>

        {/* Right panel */}
        <div className="w-[340px] flex flex-col overflow-hidden flex-shrink-0" style={{ borderLeft: '1px solid #17251C', background: '#09110D' }}>
          {bboxDetail ? (
            <>
              <div className="px-4 py-2.5 flex items-center gap-2 flex-shrink-0" style={{ borderBottom: '1px solid #17251C' }}>
                <button
                  onClick={() => { setBboxDetail(null); setSelectedDiscoverId(null); }}
                  className="flex items-center gap-1 text-[10px] font-medium transition-colors"
                  style={{ color: '#68756E' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#A3E635'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#68756E'; }}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                  Back
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <DatasetDetailPanel
                  dataset={bboxDetail}
                  onClose={() => { setBboxDetail(null); setSelectedDiscoverId(null); }}
                  onAnalyze={(query) => { setTab('ask'); analysis.analyze(query); }}
                />
              </div>
            </>
          ) : (
            <>
              {/* Panel header */}
              <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #17251C' }}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#A7B3AA' }}>Datasets</span>
                  <span className="text-[10px] font-mono" style={{ color: '#68756E' }}>{filteredDatasets.length} observations</span>
                </div>
              </div>
              {/* Discovery summary when bbox drawn */}
              {discoverBbox && filteredDatasets.length > 0 && (
                <div className="px-4 py-2.5 border-b border-oq-700/30 flex-shrink-0">
                  <DiscoverySummary
                    datasets={filteredDatasets}
                    bbox={discoverBbox}
                    onSelectCollection={(col) => { setSelectedDiscoverCollection(col); setDiscoverCollection(col ?? ''); }}
                    selectedCollection={selectedDiscoverCollection}
                  />
                </div>
              )}
              {/* Observation list */}
              <div className="flex-1 overflow-hidden">
                <DatasetList
                  datasets={filteredDatasets}
                  selectedId={selectedDiscoverId}
                  onSelect={(ds: Dataset) => {
                    setSelectedDiscoverId(ds.id);
                    setBboxDetail(ds);
                    if (ds.bbox && ds.bbox.length === 4) {
                      setDiscoverBbox({ north: ds.bbox[3], south: ds.bbox[1], east: ds.bbox[2], west: ds.bbox[0] });
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
  );
}

export default function HomePage() {
  return <HomePageContent />;
}
