'use client';

import { useState, useCallback } from 'react';
import SearchBar from '@/components/SearchBar';
import FilterPanel from '@/components/FilterPanel';
import ResultsList from '@/components/ResultsList';
import MapView from '@/components/MapView';
import StatsBar from '@/components/StatsBar';
import Header from '@/components/Header';

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
    } catch (error: any) {
      console.error('Search error:', error);
      setResults({ results: [], total: 0, limit: 20, offset: 0, latencyMs: 0 });
    } finally {
      setLoading(false);
    }
  }, [filters]);

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

        {/* Main Content: Map + Results */}
        <div className="max-w-[1600px] mx-auto mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Map View */}
            <div className="lg:col-span-7 xl:col-span-8">
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

            {/* Results List */}
            <div className="lg:col-span-5 xl:col-span-4">
              <ResultsList
                results={results?.results || []}
                loading={loading}
                selectedDataset={selectedDataset}
                onSelectDataset={setSelectedDataset}
              />
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/50 py-4 px-6 text-center text-xs text-slate-600">
        <p>
          OrbitalQuery — Powered by STAC APIs, Planetary Computer, Sentinel, Landsat & NASA data.
          Built for researchers and decision-makers.
        </p>
      </footer>
    </div>
  );
}
