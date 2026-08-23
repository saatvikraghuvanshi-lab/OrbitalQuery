'use client';

import { useState } from 'react';

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

interface QueryInputProps {
  onAnalyze: (query: string) => void;
  loading: boolean;
}

export default function QueryInput({ onAnalyze, loading }: QueryInputProps) {
  const [query, setQuery] = useState('');

  const handleSubmit = () => {
    if (query.trim() && !loading) {
      onAnalyze(query.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      {/* Hero */}
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent mb-4">
          OrbitalQuery
        </h1>
        <p className="text-lg text-slate-400 mb-2">
          Ask a question about Earth
        </p>
        <p className="text-sm text-slate-600">
          Powered by Sentinel, Landsat, ISRO & Copernicus satellite data
        </p>
      </div>

      {/* Input */}
      <div className="relative mb-8">
        <div className="glass rounded-2xl border border-blue-500/20 p-1">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder='Try "Assess flood impact in this region..."'
              disabled={loading}
              className="flex-1 bg-transparent px-5 py-4 text-sm text-slate-200 placeholder-slate-600 outline-none disabled:opacity-50"
            />
            <button
              onClick={handleSubmit}
              disabled={!query.trim() || loading}
              className="px-6 py-3 mr-1 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-medium hover:from-blue-500 hover:to-purple-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Analyzing
                </span>
              ) : 'Analyze'}
            </button>
          </div>
        </div>
      </div>

      {/* Suggestion Chips */}
      <div className="flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => { setQuery(s); onAnalyze(s); }}
            disabled={loading}
            className="px-4 py-2 text-xs rounded-full border border-slate-700/50 text-slate-500 hover:text-slate-300 hover:border-slate-600/50 hover:bg-slate-800/30 transition-all disabled:opacity-40"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
