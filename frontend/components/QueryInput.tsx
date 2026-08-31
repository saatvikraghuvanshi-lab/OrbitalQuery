'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface QueryInputProps {
  onAnalyze: (query: string) => void;
  loading: boolean;
}

const ALL_SUGGESTIONS = [
  { text: 'Chennai coastal erosion 2018 vs 2025', icon: '🌊', category: 'Coastal' },
  { text: 'Kerala flood impact August 2024', icon: '🌧', category: 'Flood' },
  { text: 'Sundarbans deforestation 2019 vs 2024', icon: '🌲', category: 'Forest' },
  { text: 'Himalayan glacier retreat 2018 vs 2025', icon: '🏔', category: 'Glacier' },
  { text: 'Mumbai coastal change 2020 vs 2025', icon: '🌊', category: 'Coastal' },
  { text: 'Delhi urban sprawl 2019 vs 2025', icon: '🏙', category: 'Urban' },
  { text: 'Hyderabad urban expansion 2021 vs 2025', icon: '🏙', category: 'Urban' },
  { text: 'Amazon forest change 2020 vs 2025', icon: '🌲', category: 'Forest' },
  { text: 'California wildfire burn severity 2023', icon: '🔥', category: 'Fire' },
  { text: 'Assam vegetation change 2019 vs 2025', icon: '🌾', category: 'Vegetation' },
];

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function QueryInput({ onAnalyze, loading }: QueryInputProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [visibleSuggestions, setVisibleSuggestions] = useState(() => shuffleArray(ALL_SUGGESTIONS).slice(0, 6));
  const [shuffleKey, setShuffleKey] = useState(0);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = () => {
    if (query.trim() && !loading) onAnalyze(query.trim());
  };

  const handleShuffle = useCallback(() => {
    setVisibleSuggestions(shuffleArray(ALL_SUGGESTIONS).slice(0, 6));
    setShuffleKey(k => k + 1);
  }, []);

  return (
    <div className="flex-1 flex flex-col items-center justify-center relative">
      <div className="relative z-10 flex flex-col items-center justify-center w-full h-full px-4">
        {/* Title */}
        <div className="text-center mb-8">
          <h2 className="text-headline text-oq-50 mb-2 tracking-tight">
            Ask a question about Earth
          </h2>
          <p className="text-body text-oq-200">
            Query satellite imagery across Sentinel, Landsat &amp; MODIS archives
          </p>
        </div>

        {/* Search bar */}
        <div className="w-full max-w-2xl rounded-lg p-[1px] flex items-center transition-all mb-6 bg-oq-900 border border-oq-700 focus-within:border-oq-500">
          <div className="pl-4 pr-2 text-lime">
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
            className="w-full bg-transparent border-none text-oq-50 placeholder:text-oq-300 focus:ring-0 outline-none text-sm py-3"
            disabled={loading}
          />
          <button
            onClick={handleSubmit}
            disabled={!query.trim() || loading}
            className="mr-1.5 p-2 rounded-md transition-all disabled:opacity-20 disabled:cursor-not-allowed"
            style={{
              background: query.trim() && !loading ? 'var(--color-accent)' : 'transparent',
              color: query.trim() && !loading ? 'var(--color-bg-deep)' : 'var(--color-text-muted)',
            }}
            title="Submit query"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>

        {/* Suggestion chips */}
        <div className="w-full max-w-2xl flex flex-wrap justify-center gap-1.5 mb-6">
          {visibleSuggestions.map((s) => (
            <button
              key={`${shuffleKey}-${s.text}`}
              onClick={() => { setQuery(s.text); onAnalyze(s.text); }}
              disabled={loading}
              className="px-3 py-1.5 rounded-md text-[11px] font-medium text-oq-200 hover:text-oq-50 hover:bg-oq-700/50 transition-all disabled:opacity-40 flex items-center gap-1.5 border border-oq-600/40 bg-oq-800/40"
            >
              <span className="text-[11px] opacity-50">{s.icon}</span>
              <span>{s.text}</span>
            </button>
          ))}
          <button
            onClick={handleShuffle}
            disabled={loading}
            className="p-1.5 rounded-md hover:bg-oq-700/50 transition-all text-oq-300 hover:text-oq-100 border border-oq-600/40 bg-oq-800/40"
            title="Refresh suggestions"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Footer */}
        <p className="text-[11px] text-oq-300 font-medium">
          Powered by <span className="text-oq-100">Bhoonidhi (ISRO)</span>, Copernicus &amp; Sentinel data
        </p>
      </div>
    </div>
  );
}
