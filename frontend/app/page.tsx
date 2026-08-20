'use client';

import { useState, useCallback, Suspense } from 'react';
import dynamic from 'next/dynamic';
import SearchBar from '@/components/SearchBar';
import FilterPanel from '@/components/FilterPanel';
import ResultsList from '@/components/ResultsList';
import StatsBar from '@/components/StatsBar';
import Header from '@/components/Header';

// Dynamic import — prevents SSR hydration issues with Leaflet
const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => (
    <div style={{
      width: '100%',
      height: '620px',
      borderRadius: '16px',
      background: '#0d1117',
      border: '1px solid rgba(71, 85, 105, 0.3)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#64748b',
      fontSize: '14px',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🗺️</div>
        <div>Loading map...</div>
      </div>
    </div>
  ),
});

export interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
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

const DEMO_QUERIES = [
  'Deforestation near Assam 2015–2020',
  'Urban expansion in Jaipur',
  'Glacier retreat in Himalayas',
  'Ocean temperature Indian Ocean',
  'Forest fire detection',
  'Coral reef health monitoring',
  'Flood monitoring river basin',
  'Nighttime city lights',
];

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function datasetToJSON(dataset: DatasetResult): string {
  return JSON.stringify({
    id: dataset.id,
    stacId: dataset.stacId,
    title: dataset.title,
    description: dataset.description,
    provider: dataset.provider,
    collection: dataset.collection,
    platform: dataset.platform,
    instrument: dataset.instrument,
    resolution_m: dataset.gsd,
    cloud_cover_pct: dataset.cloudCover,
    geometry: dataset.geometry,
    bbox: dataset.bbox,
    centroid: { lat: dataset.centroidLat, lng: dataset.centroidLng },
    start_date: dataset.startDate,
    end_date: dataset.endDate,
    preview_url: dataset.previewUrl,
    stac_link: dataset.stacLink,
    relevance_score: dataset.score,
  }, null, 2);
}

function datasetToCSVRow(dataset: DatasetResult): string {
  const escape = (s: string | null) => s ? `"${s.replace(/"/g, '""')}"` : '';
  return [
    dataset.stacId || '',
    escape(dataset.title),
    escape(dataset.description),
    dataset.provider,
    dataset.collection || '',
    dataset.platform || '',
    dataset.instrument || '',
    dataset.gsd || '',
    dataset.cloudCover ?? '',
    dataset.centroidLat ?? '',
    dataset.centroidLng ?? '',
    dataset.startDate || '',
    dataset.endDate || '',
    dataset.previewUrl || '',
    dataset.stacLink || '',
    dataset.score?.toFixed(4) || '',
  ].join(',');
}

export default function Home() {
  const [filters, setFilters] = useState<SearchFilters>({
    query: '',
    bbox: null,
    startDate: '',
    endDate: '',
    provider: '',
    collection: '',
  });

  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<DatasetResult | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [comparingIds, setComparingIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleSearch = useCallback(async (query: string, overrideFilters?: Partial<SearchFilters>) => {
    const searchFilters = { ...filters, query, ...overrideFilters };
    setFilters(searchFilters);
    setLoading(true);

    try {
      const body: any = { query, limit: 50 };

      if (searchFilters.bbox) {
        body.bbox = [searchFilters.bbox.west, searchFilters.bbox.south, searchFilters.bbox.east, searchFilters.bbox.north];
      }
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
    } catch (error: any) {
      console.error('Search error:', error);
      setResults({ results: [], total: 0, limit: 20, offset: 0, latencyMs: 0 });
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const handleExportJSON = useCallback((dataset: DatasetResult) => {
    const json = datasetToJSON(dataset);
    navigator.clipboard.writeText(json).then(() => {
      showToast('📋 Metadata copied to clipboard as JSON');
    }).catch(() => {
      downloadFile(json, `dataset-${dataset.stacId || dataset.id}.json`, 'application/json');
      showToast('📥 JSON file downloaded');
    });
  }, [showToast]);

  const handleExportCSV = useCallback((dataset: DatasetResult) => {
    const header = 'stac_id,title,description,provider,collection,platform,instrument,resolution_m,cloud_cover_pct,centroid_lat,centroid_lng,start_date,end_date,preview_url,stac_link,relevance_score\n';
    const csv = header + datasetToCSVRow(dataset);
    downloadFile(csv, `dataset-${dataset.stacId || dataset.id}.csv`, 'text/csv');
    showToast('📥 CSV file downloaded');
  }, [showToast]);

  const handleCompareToggle = useCallback((dataset: DatasetResult) => {
    setComparingIds(prev => {
      const next = new Set(prev);
      if (next.has(dataset.id)) {
        next.delete(dataset.id);
        showToast(`Removed "${dataset.title.substring(0, 30)}..." from comparison`);
      } else {
        if (next.size >= 4) {
          showToast('⚠️ Maximum 4 datasets for comparison');
          return prev;
        }
        next.add(dataset.id);
        showToast(`Added to comparison (${next.size} selected)`);
      }
      return next;
    });
  }, [showToast]);

  const handleExportAllJSON = useCallback(() => {
    if (!results?.results.length) return;
    const json = JSON.stringify(results.results, null, 2);
    const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    downloadFile(json, `orbitalquery-${filters.query.replace(/\s+/g, '-')}-${ts}.json`, 'application/json');
    showToast(`📥 Exported ${results.results.length} datasets as JSON`);
  }, [results, filters.query, showToast]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 px-4 sm:px-6 lg:px-8 pb-8">
        {/* Hero Search Section */}
        <div className="max-w-4xl mx-auto text-center pt-6 pb-8">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-3">
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent glow-text">
              Explore Earth Observation Data
            </span>
          </h1>
          <p className="text-slate-400 text-base sm:text-lg mb-6 max-w-2xl mx-auto">
            Search Sentinel, Landsat, NASA, and ISRO datasets using natural language.
            Describe what you need — our AI finds the right imagery.
          </p>

          <SearchBar
            onSearch={handleSearch}
            loading={loading}
            onToggleFilters={() => setShowFilters(!showFilters)}
            showFilters={showFilters}
          />

          {/* Quick demo queries */}
          {!results && !loading && (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {DEMO_QUERIES.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSearch(q)}
                  className="px-3 py-1.5 text-xs rounded-full border border-slate-700/50 text-slate-400
                    hover:border-blue-500/50 hover:text-blue-300 hover:bg-blue-500/5
                    transition-all duration-200"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <FilterPanel
            filters={filters}
            onChange={setFilters}
            onApply={() => handleSearch(filters.query)}
          />
        )}

        {/* Stats Bar */}
        {results && (
          <StatsBar
            total={results.total}
            latencyMs={results.latencyMs}
            query={filters.query}
          />
        )}

        {/* Compare mode banner */}
        {comparingIds.size > 0 && (
          <div className="max-w-[1600px] mx-auto mt-2">
            <div className="flex items-center justify-between px-4 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
              <div className="flex items-center gap-2">
                <span className="text-xs text-purple-400 font-medium">
                  ⚖️ Comparing {comparingIds.size} dataset{comparingIds.size > 1 ? 's' : ''}
                </span>
                <span className="text-[10px] text-slate-500">
                  ({comparingIds.size}/4 max)
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const selected = results?.results.filter(r => comparingIds.has(r.id)) || [];
                    const json = JSON.stringify(selected, null, 2);
                    const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
                    downloadFile(json, `comparison-${ts}.json`, 'application/json');
                    showToast(`📥 Comparison exported (${selected.length} datasets)`);
                  }}
                  className="text-[10px] px-2 py-1 rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors"
                >
                  Export Comparison
                </button>
                <button
                  onClick={() => { setComparingIds(new Set()); showToast('Comparison cleared'); }}
                  className="text-[10px] px-2 py-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content: Map + Results */}
        <div className="max-w-[1600px] mx-auto mt-4">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Map View — takes up remaining space */}
            <div className="flex-1 min-w-0">
              <MapView
                results={results?.results || []}
                selectedDataset={selectedDataset}
                onSelectDataset={setSelectedDataset}
                bbox={filters.bbox}
                onBboxChange={(bbox) => {
                  setFilters((f) => ({ ...f, bbox }));
                  if (filters.query) {
                    handleSearch(filters.query, { bbox });
                  }
                }}
              />
            </div>

            {/* Results List — fixed width sidebar */}
            <div className="w-full lg:w-[420px] flex-shrink-0">
              <ResultsList
                results={results?.results || []}
                loading={loading}
                selectedDataset={selectedDataset}
                onSelectDataset={setSelectedDataset}
                onExportJSON={handleExportJSON}
                onExportCSV={handleExportCSV}
                onCompareToggle={handleCompareToggle}
                comparingIds={comparingIds}
              />
            </div>
          </div>
        </div>
      </main>

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[9999] px-4 py-2.5 rounded-xl text-sm font-medium shadow-xl animate-in slide-in-from-bottom-4"
          style={{
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(71, 85, 105, 0.3)',
            color: '#e2e8f0',
            backdropFilter: 'blur(16px)',
          }}
        >
          {toast}
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800/50 py-4 px-6 text-center text-xs text-slate-600">
        <p>
          OrbitalQuery — Powered by STAC APIs, Planetary Computer, Sentinel, Landsat & NASA data.
          Built for researchers and decision-makers.
        </p>
        <p className="mt-1 text-[10px] text-slate-700">
          ⚠️ This is a research tool, not for operational disaster response. Always verify data through official sources.
        </p>
      </footer>
    </div>
  );
}
