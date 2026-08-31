'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface QueryInputProps {
  onAnalyze: (query: string) => void;
  loading: boolean;
}

const ALL_SUGGESTIONS = [
  { text: 'Chennai coastal erosion 2018 vs 2025', icon: '🌊', category: 'Coastal' },
  { text: 'Kerala flood impact August 2024', icon: '🌧️', category: 'Flood' },
  { text: 'Sundarbans deforestation 2019 vs 2024', icon: '🌳', category: 'Forest' },
  { text: 'Himalayan glacier retreat 2018 vs 2025', icon: '🏔️', category: 'Glacier' },
  { text: 'Mumbai coastal change 2020 vs 2025', icon: '🌊', category: 'Coastal' },
  { text: 'Delhi urban sprawl 2019 vs 2025', icon: '🏙️', category: 'Urban' },
  { text: 'Hyderabad urban expansion 2021 vs 2025', icon: '🏙️', category: 'Urban' },
  { text: 'Amazon forest change 2020 vs 2025', icon: '🌳', category: 'Forest' },
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
  const [visibleSuggestions, setVisibleSuggestions] = useState(() =>
    shuffleArray(ALL_SUGGESTIONS).slice(0, 6)
  );
  const [shuffleKey, setShuffleKey] = useState(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    if (query.trim() && !loading) {
      onAnalyze(query.trim());
    }
  };

  const handleShuffle = useCallback(() => {
    setVisibleSuggestions(shuffleArray(ALL_SUGGESTIONS).slice(0, 6));
    setShuffleKey(k => k + 1);
  }, []);

  return (
    <div className="flex-1 flex flex-col items-center justify-center relative">
      {/* Concentric rings decoration */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-10">
        <div className="w-[1100px] h-[1100px] border border-white/5 rounded-full absolute" />
        <div className="w-[800px] h-[800px] border border-white/5 rounded-full absolute" />
        <div className="w-[500px] h-[500px] border border-white/5 rounded-full absolute" />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center w-full h-full px-4">
        {/* Title block */}
        <div className="text-center mb-10">
          <h2 className="text-4xl font-semibold text-[var(--color-text-primary)] mb-3 tracking-tight">
            Ask a question about Earth
          </h2>
          <p className="text-base font-medium text-[var(--color-text-secondary)]">
            Query satellite imagery across Sentinel, Landsat &amp; MODIS archives
          </p>
        </div>

        {/* Search bar — glow border */}
        <div
          className="w-full max-w-3xl rounded-2xl p-1 flex items-center transition-all mb-8 bg-[var(--color-bg-elevated)] border border-[var(--color-accent-border)] focus-within:border-[var(--color-accent)]"
        >
          <div className="pl-5 pr-3 text-[var(--color-accent)]">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
            className="w-full bg-transparent border-none text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:ring-0 outline-none text-base py-3.5"
            disabled={loading}
          />
          <button
            onClick={handleSubmit}
            disabled={!query.trim() || loading}
            className="mr-2 p-2.5 rounded-xl transition-all duration-200 disabled:opacity-20 disabled:cursor-not-allowed hover:scale-105"
            style={{
              background: query.trim() && !loading ? 'var(--color-accent)' : 'transparent',
              color: query.trim() && !loading ? 'var(--color-bg-deep)' : 'var(--color-text-muted)',
              border: query.trim() && !loading ? '1px solid var(--color-accent-border)' : '1px solid transparent',
            }}
            title="Submit query"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>

        {/* Suggestion chips — clean, sharp borders */}
        <div className="w-full max-w-3xl flex flex-wrap justify-center items-center gap-2 mb-8">
          {visibleSuggestions.map((s) => (
            <button
              key={`${shuffleKey}-${s.text}`}
              onClick={() => { setQuery(s.text); onAnalyze(s.text); }}
              disabled={loading}
              className="group px-4 py-2 rounded-full text-[12px] font-medium text-[var(--color-text-secondary)]
                hover:text-[var(--color-text-primary)] hover:bg-[var(--color-accent-dim)]
                transition-all duration-150 disabled:opacity-40 flex items-center gap-2 border border-[var(--color-accent-border)] bg-[var(--color-bg-elevated)]"
            >
              <span className="text-xs opacity-60">{s.icon}</span>
              <span>{s.text}</span>
            </button>
          ))}
          <button
            onClick={handleShuffle}
            disabled={loading}
            className="p-2 rounded-full
              hover:bg-[var(--color-accent-dim)]
              transition-all duration-150 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] border border-[var(--color-accent-border)] bg-[var(--color-bg-elevated)]"
            title="Refresh suggestions"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Footer — grounded, higher contrast */}
        <div className="text-center mt-4">
          <p className="text-sm font-medium text-[var(--color-text-muted)]">
            OrbitalQuery — Powered by <span className="text-[var(--color-text-primary)]">Bhoonidhi (ISRO)</span>, Copernicus &amp; Sentinel data.
          </p>
        </div>
      </div>
    </div>
  );
}
