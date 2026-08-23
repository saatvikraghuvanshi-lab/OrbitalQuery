'use client';

import { useState, useRef, useEffect } from 'react';

interface QueryInputProps {
  onAnalyze: (query: string) => void;
  loading: boolean;
}

const SUGGESTIONS = [
  'Assess flood impact in Assam',
  'Urban expansion in Jaipur 2018-2025',
  'Vegetation change in Western Ghats',
  'Glacier retreat in Himalayas',
  'Burn severity near Uttarakhand',
  'Deforestation near Sundarbans',
  'Soil moisture in Rajasthan',
  'Coastal erosion in Kerala',
];

export default function QueryInput({ onAnalyze, loading }: QueryInputProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    if (query.trim() && !loading) {
      onAnalyze(query.trim());
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center relative" style={{ transform: 'scale(0.9)', transformOrigin: 'center center' }}>
      {/* Concentric circle decorations */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
        <div className="w-[1200px] h-[1200px] border border-white/5 rounded-full absolute" />
        <div className="w-[900px] h-[900px] border border-white/5 rounded-full absolute" />
        <div className="w-[600px] h-[600px] border border-white/5 rounded-full absolute" />
      </div>

      <div className="relative z-10 flex flex-col items-center w-full max-w-4xl px-4">
        {/* Title */}
        <div className="text-center mb-10">
          <h2 className="text-3xl font-medium text-white mb-3">
            Ask a question about Earth
          </h2>
          <p className="text-gray-500 text-base">
            Powered by Sentinel, Landsat, ISRO &amp; Copernicus satellite data
          </p>
        </div>

        {/* Search Bar — Glass Panel */}
        <div className="w-full glass-panel rounded-xl p-3 flex items-center shadow-2xl ring-1 ring-white/10 focus-within:ring-[#f03b43]/50 transition-all mb-10">
          <div className="pl-5 pr-3 text-gray-400">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder='Try "Assess flood impact in this region..."'
            className="flex-1 bg-transparent border-none text-gray-200 placeholder-gray-500 focus:ring-0 text-xl py-5 outline-none"
            disabled={loading}
          />          <button
            onClick={handleSubmit}
            disabled={loading || !query.trim()}
            className="p-3 rounded-lg text-gray-400 hover:text-white hover:bg-white/5
              disabled:text-slate-600 transition-all ml-3"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
          </button>
        </div>

        {/* Suggestion Chips */}
        <div className="flex flex-wrap justify-center gap-3 mb-16">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => { setQuery(s); onAnalyze(s); }}
              disabled={loading}
              className="px-5 py-2.5 rounded-full border border-white/10 bg-white/5 text-sm text-gray-400
                hover:bg-white/10 hover:text-gray-200 hover:border-white/20
                transition-all duration-200 disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>


      </div>
    </div>
  );
}
