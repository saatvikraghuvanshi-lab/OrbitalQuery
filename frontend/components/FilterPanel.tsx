'use client';

import { useState, useEffect } from 'react';
import { SearchFilters } from '@/app/page';

interface FilterPanelProps {
  filters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
  onApply: () => void;
}

export default function FilterPanel({ filters, onChange, onApply }: FilterPanelProps) {
  const [providers, setProviders] = useState<string[]>([]);
  const [collections, setCollections] = useState<string[]>([]);

  useEffect(() => {
    // Fetch available providers and collections
    fetch('/api/search/providers')
      .then(res => res.json())
      .then(setProviders)
      .catch(() => {});
    fetch('/api/search/collections')
      .then(res => res.json())
      .then(setCollections)
      .catch(() => {});
  }, []);

  const update = (partial: Partial<SearchFilters>) => {
    onChange({ ...filters, ...partial });
  };

  return (
    <div className="max-w-4xl mx-auto mb-6">
      <div className="glass rounded-2xl p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Date Range */}
          <div>
            <label className="block text-xs text-slate-500 mb-1.5 font-medium uppercase tracking-wider">
              Start Date
            </label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => update({ startDate: e.target.value })}
              className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-300
                focus:border-blue-500/50 focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1.5 font-medium uppercase tracking-wider">
              End Date
            </label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => update({ endDate: e.target.value })}
              className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-300
                focus:border-blue-500/50 focus:outline-none transition-colors"
            />
          </div>

          {/* Provider */}
          <div>
            <label className="block text-xs text-slate-500 mb-1.5 font-medium uppercase tracking-wider">
              Provider
            </label>
            <select
              value={filters.provider}
              onChange={(e) => update({ provider: e.target.value })}
              className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-300
                focus:border-blue-500/50 focus:outline-none transition-colors"
            >
              <option value="">All Providers</option>
              {providers.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Collection */}
          <div>
            <label className="block text-xs text-slate-500 mb-1.5 font-medium uppercase tracking-wider">
              Collection
            </label>
            <select
              value={filters.collection}
              onChange={(e) => update({ collection: e.target.value })}
              className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-300
                focus:border-blue-500/50 focus:outline-none transition-colors"
            >
              <option value="">All Collections</option>
              {collections.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Bounding box display */}
        {filters.bbox && (
          <div className="mt-4 flex items-center gap-3">
            <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">
              Bounding Box:
            </span>
            <span className="text-xs text-slate-400 font-mono bg-slate-800/50 px-2 py-1 rounded">
              [{filters.bbox.west.toFixed(2)}, {filters.bbox.south.toFixed(2)}, {filters.bbox.east.toFixed(2)}, {filters.bbox.north.toFixed(2)}]
            </span>
            <button
              onClick={() => update({ bbox: null })}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              Clear
            </button>
          </div>
        )}

        {/* Apply button */}
        <div className="mt-4 flex justify-end">
          <button
            onClick={onApply}
            className="px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-sm font-medium
              rounded-lg border border-blue-500/30 transition-all duration-200"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
}
