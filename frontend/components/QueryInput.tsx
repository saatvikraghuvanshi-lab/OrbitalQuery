'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface QueryInputProps {
  onAnalyze: (query: string) => void;
  loading: boolean;
}

const ALL_SUGGESTIONS = [
  'Hyderabad urban expansion 2021 vs 2025',
  'Kerala flood impact August 2024',
  'Assam vegetation change 2019 vs 2025',
  'Chennai coastal erosion 2018 vs 2025',
  'Himalayan glacier retreat 2018 vs 2025',
  'Delhi urban sprawl 2019 vs 2025',
  'Amazon forest change 2020 vs 2025',
  'California wildfire burn severity 2023',
  'Sundarbans deforestation 2019 vs 2024',
  'Mumbai coastal change 2020 vs 2025',
];

function shuffleArray(arr: string[]): string[] {
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
  const [visibleSuggestions, setVisibleSuggestions] = useState<string[]>(() =>
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
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-15">
        <div className="w-[1100px] h-[1100px] border border-white/5 rounded-full absolute" />
        <div className="w-[800px] h-[800px] border border-white/5 rounded-full absolute" />
        <div className="w-[500px] h-[500px] border border-white/5 rounded-full absolute" />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center w-full h-full px-4">
        <div className="text-center mb-10">
          <h2 className="text-4xl font-medium text-white mb-3">Ask a question about Earth</h2>
          <p className="text-gray-500 text-base">
            Query satellite imagery across Sentinel, Landsat &amp; MODIS archives
          </p>
        </div>

        {/* Search bar — improved contrast with glow */}
        <div
          className="w-full max-w-3xl rounded-2xl p-1 flex items-center transition-all mb-6"
          style={{
            background: 'rgba(20, 24, 35, 0.9)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 0 0 1px rgba(79, 110, 245, 0.08), 0 8px 32px rgba(0,0,0,0.4)',
          }}
        >
          <div className="pl-5 pr-3 text-blue-400/60">
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
            className="w-full bg-transparent border-none text-gray-200 placeholder-gray-500 focus:ring-0 outline-none text-base py-3.5"
            disabled={loading}
          />
          <button
            onClick={handleSubmit}
            disabled={!query.trim() || loading}
            className="mr-1.5 p-2.5 rounded-xl transition-all duration-200 disabled:opacity-20 disabled:cursor-not-allowed"
            style={{
              background: query.trim() && !loading ? 'rgba(79, 110, 245, 0.25)' : 'transparent',
              color: query.trim() && !loading ? '#818cf8' : '#475569',
              border: query.trim() && !loading ? '1px solid rgba(79, 110, 245, 0.3)' : '1px solid transparent',
            }}
            title="Submit query"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>

        {/* Suggestion chips — 6 max with shuffle, constrained width */}
        <div className="w-full max-w-3xl flex flex-wrap justify-center items-center gap-2 mb-8">
          {visibleSuggestions.map((s) => (
            <button
              key={`${shuffleKey}-${s}`}
              onClick={() => { setQuery(s); onAnalyze(s); }}
              disabled={loading}
              className="px-3 py-1.5 rounded-full text-[12px] text-gray-400
                border border-white/6 bg-white/[0.02]
                hover:bg-white/8 hover:text-gray-200 hover:border-white/12
                transition-all duration-200 disabled:opacity-40"
            >
              {s}
            </button>
          ))}
          <button
            onClick={handleShuffle}
            disabled={loading}
            className="p-1.5 rounded-full border border-white/6 bg-white/[0.02]
              hover:bg-white/8 hover:border-white/12
              transition-all duration-200 text-gray-500 hover:text-gray-300"
            title="Shuffle suggestions"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Footer — single line, larger font, positioned lower */}
        <div className="text-center mt-8">
          <p className="text-sm leading-relaxed" style={{ color: '#8a7c7a', opacity: 0.7 }}>
            OrbitalQuery — Powered by Bhoonidhi (ISRO), Copernicus &amp; Sentinel data.
          </p>
        </div>
      </div>
    </div>
  );
}
