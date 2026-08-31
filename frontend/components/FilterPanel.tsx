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
      <div className="oq-card p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Date Range */}
          <div>
            <label className="block text-xs text-oq-300 mb-1.5 font-medium uppercase tracking-wider">
              Start Date
            </label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => update({ startDate: e.target.value })}
              className="w-full bg-oq-800/50 border border-oq-600/50 rounded-lg px-3 py-2 text-sm text-oq-200
                focus:border-lime/50 focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs text-oq-300 mb-1.5 font-medium uppercase tracking-wider">
              End Date
            </label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => update({ endDate: e.target.value })}
              className="w-full bg-oq-800/50 border border-oq-600/50 rounded-lg px-3 py-2 text-sm text-oq-200
                focus:border-lime/50 focus:outline-none transition-colors"
            />
          </div>

          {/* Provider */}
          <div>
            <label className="block text-xs text-oq-300 mb-1.5 font-medium uppercase tracking-wider">
              Provider
            </label>
            <select
              value={filters.provider}
              onChange={(e) => update({ provider: e.target.value })}
              className="w-full bg-oq-800/50 border border-oq-600/50 rounded-lg px-3 py-2 text-sm text-oq-200
                focus:border-lime/50 focus:outline-none transition-colors"
            >
              <option value="">All Providers</option>
              {providers.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Collection */}
          <div>
            <label className="block text-xs text-oq-300 mb-1.5 font-medium uppercase tracking-wider">
              Collection
            </label>
            <select
              value={filters.collection}
              onChange={(e) => update({ collection: e.target.value })}
              className="w-full bg-oq-800/50 border border-oq-600/50 rounded-lg px-3 py-2 text-sm text-oq-200
                focus:border-lime/50 focus:outline-none transition-colors"
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
            <span className="text-xs text-oq-300 font-medium uppercase tracking-wider">
              Bounding Box:
            </span>
            <span className="text-xs text-oq-200 font-mono bg-oq-800/50 px-2 py-1 rounded">
              [{filters.bbox.west.toFixed(2)}, {filters.bbox.south.toFixed(2)}, {filters.bbox.east.toFixed(2)}, {filters.bbox.north.toFixed(2)}]
            </span>
            <button
              onClick={() => update({ bbox: null })}
              className="text-xs text-semantic-error hover:text-red-300 transition-colors"
            >
              Clear
            </button>
          </div>
        )}

        {/* Apply button */}
        <div className="mt-4 flex justify-end">
          <button
            onClick={onApply}
            className="px-4 py-2 bg-lime/15 hover:bg-lime/25 text-lime text-sm font-medium
              rounded-lg border border-lime/30 transition-all duration-200"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
}
