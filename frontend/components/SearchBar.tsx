'use client';

import { useState, FormEvent, KeyboardEvent } from 'react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  loading: boolean;
  onToggleFilters: () => void;
  showFilters: boolean;
}

export default function SearchBar({ onSearch, loading, onToggleFilters, showFilters }: SearchBarProps) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (query.trim() && !loading) {
      onSearch(query.trim());
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && query.trim() && !loading) {
      onSearch(query.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
      <div className="relative group">
        {/* Glow ring on focus */}
        <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-cyan-500/20 rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 blur-sm" />

        <div className="relative flex items-center glass rounded-2xl overflow-hidden glow-blue">
          {/* Search icon */}
          <div className="pl-5 pr-2">
            {loading ? (
              <div className="w-5 h-5 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
          </div>

          {/* Input */}
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='Try "deforestation near Assam" or "glacier retreat Himalayas"...'
            className="flex-1 bg-transparent py-4 px-2 text-white placeholder-slate-500 outline-none text-sm sm:text-base"
            disabled={loading}
          />

          {/* Filter toggle button */}
          <button
            type="button"
            onClick={onToggleFilters}
            className={`p-2.5 mr-1 rounded-xl transition-all duration-200 ${
              showFilters
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/50'
            }`}
            title="Toggle filters"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </button>

          {/* Search button */}
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="mr-3 px-5 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500
              disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500
              text-white text-sm font-medium rounded-xl transition-all duration-200
              shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>
    </form>
  );
}
