'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface QueryInputProps {
  onAnalyze: (query: string) => void;
  loading: boolean;
  /** When true, search bar renders compact (top of page during results) */
  compact?: boolean;
  /** Show refine controls only when search is active */
  showRefine?: boolean;
}

// ── Example queries (NO emojis) ────────────────────────────────

const EXAMPLE_QUERIES = [
  { text: 'Hyderabad urban expansion 2021 vs 2025', category: 'Urban' },
  { text: 'Himalayan glacier retreat 2018 vs 2025', category: 'Glacier' },
  { text: 'Delhi urban sprawl 2019 vs 2025', category: 'Urban' },
  { text: 'Assam vegetation change 2019 vs 2025', category: 'Vegetation' },
  { text: 'Sundarbans deforestation 2019 vs 2024', category: 'Forest' },
  { text: 'Kerala flood impact August 2024', category: 'Flood' },
  { text: 'Mumbai coastal erosion 2020 vs 2025', category: 'Coastal' },
  { text: 'California wildfire burn severity 2023', category: 'Fire' },
];

// ── Category colors ────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  Urban: '#A78BFA',
  Glacier: '#BAE6FD',
  Vegetation: '#4ADE80',
  Forest: '#4ADE80',
  Flood: '#22D3EE',
  Coastal: '#2DD4BF',
  Fire: '#FB923C',
};

export default function QueryInput({ onAnalyze, loading, compact, showRefine }: QueryInputProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [shuffleKey] = useState(0);
  const [showFilters, setShowFilters] = useState(false);

  // Filter state
  const [location, setLocation] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [source, setSource] = useState('');

  useEffect(() => {
    if (!compact) inputRef.current?.focus();
  }, [compact]);

  const handleSubmit = () => {
    if (query.trim() && !loading) onAnalyze(query.trim());
  };

  const handleExampleClick = (text: string) => {
    setQuery(text);
    onAnalyze(text);
  };

  // Build refined query from filters
  const applyFilters = () => {
    let refined = query;
    if (location && !query.toLowerCase().includes(location.toLowerCase())) {
      refined = `${location} ${refined}`;
    }
    if (dateStart && dateEnd) {
      refined += ` ${dateStart} vs ${dateEnd}`;
    } else if (dateStart) {
      refined += ` since ${dateStart}`;
    }
    if (refined.trim()) onAnalyze(refined.trim());
  };

  // ── Compact mode (top bar during analysis/results) ──────────

  if (compact) {
    return (
      <div className="w-full border-b border-oq-700/30 bg-oq-950/80 backdrop-blur-sm">
        <div className="max-w-[1200px] mx-auto px-5 h-12 flex items-center gap-3">
          <div className="flex-1 flex items-center gap-2.5 bg-oq-800/40 border border-oq-700/30 rounded-md px-3 h-8">
            <svg className="w-3.5 h-3.5 text-oq-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="text-[12px] text-oq-100 truncate font-mono">{query}</span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={!query.trim() || loading}
            className="h-8 px-3 rounded-md text-[10px] font-semibold uppercase tracking-wider transition-all disabled:opacity-30"
            style={{
              background: query.trim() && !loading ? '#A3E635' : 'transparent',
              color: query.trim() && !loading ? '#050907' : '#68756E',
            }}
          >
            Search
          </button>
        </div>
      </div>
    );
  }

  // ── Full mode (initial ask page) ────────────────────────────

  return (
    <div className="flex-1 flex flex-col items-center" style={{ background: '#050907' }}>
      <div className="w-full max-w-[900px] mx-auto px-6 pt-[12vh] pb-12">

        {/* Heading */}
        <div className="text-center mb-8">
          <h2 className="text-[36px] md:text-[42px] font-bold text-oq-50 tracking-tight leading-tight mb-2.5">
            Ask a question about Earth
          </h2>
          <p className="text-[15px] text-oq-300 max-w-lg mx-auto leading-relaxed mb-1">
            Search Earth observation data using natural language, location and time.
          </p>
        </div>

        {/* Search bar */}
        <div className="w-full max-w-[820px] mx-auto mb-5">
          <div className="relative flex items-center bg-oq-800/60 border border-oq-700/40 rounded-lg transition-all focus-within:border-oq-500/60 focus-within:bg-oq-800/80"
            style={{ height: 56 }}>
            <div className="pl-4 text-oq-300 flex items-center justify-center" style={{ height: 56 }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder='Try "Hyderabad urban expansion 2021 vs 2025"'
              className="flex-1 bg-transparent border-none text-oq-50 placeholder:text-oq-400 text-[15px] px-3 py-3.5 outline-none"
              disabled={loading}
            />
            <button
              onClick={handleSubmit}
              disabled={!query.trim() || loading}
              className="mr-2 p-2 rounded-md transition-all disabled:opacity-35 disabled:cursor-not-allowed"
              style={{
                background: query.trim() && !loading ? '#A3E635' : 'transparent',
                color: query.trim() && !loading ? '#050907' : '#68756E',
              }}
              title="Search"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>
        </div>

        {/* Refine toggle */}
        <div className="w-full max-w-[820px] mx-auto mb-6 flex items-center gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-medium text-oq-300 hover:text-oq-100 transition-colors"
          >
            <svg className={`w-3 h-3 transition-transform ${showFilters ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            Refine
          </button>
          <div className="flex-1 h-px bg-oq-700/20" />
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="w-full max-w-[820px] mx-auto mb-6 p-4 bg-oq-800/30 border border-oq-700/20 rounded-lg">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[9px] uppercase tracking-wider text-oq-300 font-medium mb-1.5">Location</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Hyderabad"
                  className="w-full bg-oq-900/60 border border-oq-700/30 rounded px-2.5 py-1.5 text-[12px] text-oq-100 placeholder:text-oq-400 focus:border-oq-500/40 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[9px] uppercase tracking-wider text-oq-300 font-medium mb-1.5">From</label>
                <input
                  type="text"
                  value={dateStart}
                  onChange={(e) => setDateStart(e.target.value)}
                  placeholder="2020"
                  className="w-full bg-oq-900/60 border border-oq-700/30 rounded px-2.5 py-1.5 text-[12px] text-oq-100 placeholder:text-oq-400 focus:border-oq-500/40 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[9px] uppercase tracking-wider text-oq-300 font-medium mb-1.5">To</label>
                <input
                  type="text"
                  value={dateEnd}
                  onChange={(e) => setDateEnd(e.target.value)}
                  placeholder="2025"
                  className="w-full bg-oq-900/60 border border-oq-700/30 rounded px-2.5 py-1.5 text-[12px] text-oq-100 placeholder:text-oq-400 focus:border-oq-500/40 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[9px] uppercase tracking-wider text-oq-300 font-medium mb-1.5">Source</label>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="w-full bg-oq-900/60 border border-oq-700/30 rounded px-2.5 py-1.5 text-[12px] text-oq-100 focus:border-oq-500/40 focus:outline-none"
                >
                  <option value="">All sources</option>
                  <option value="sentinel-2">Sentinel-2</option>
                  <option value="landsat">Landsat</option>
                  <option value="sentinel-1">Sentinel-1</option>
                </select>
              </div>
            </div>
            {query.trim() && (
              <div className="mt-3 flex justify-end">
                <button
                  onClick={applyFilters}
                  className="px-4 py-1.5 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-oq-700/40 hover:bg-oq-700/60 text-oq-100 transition-colors border border-oq-700/30"
                >
                  Apply Filters
                </button>
              </div>
            )}
          </div>
        )}

        {/* Example queries */}
        <div className="w-full max-w-[820px] mx-auto">
          <div className="text-[9px] uppercase tracking-[0.15em] text-oq-400 font-medium mb-3 text-center">
            Example Queries
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5" key={shuffleKey}>
            {EXAMPLE_QUERIES.map((s) => (
              <button
                key={s.text}
                onClick={() => handleExampleClick(s.text)}
                disabled={loading}
                className="group text-left px-3 py-2.5 rounded-md text-[12px] text-oq-200 hover:text-oq-50 hover:bg-oq-700/30 transition-all disabled:opacity-40 border border-transparent hover:border-oq-700/30 flex items-center gap-2.5"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0 opacity-60"
                  style={{ background: CATEGORY_COLORS[s.category] || '#68756E' }}
                />
                <span className="flex-1">{s.text}</span>
                <span className="text-[9px] text-oq-400 font-medium uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
                  {s.category}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
