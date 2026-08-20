'use client';

import { DatasetResult } from '@/app/page';
import DatasetDetail from './DatasetDetail';

interface ResultsListProps {
  results: DatasetResult[];
  loading: boolean;
  selectedDataset: DatasetResult | null;
  onSelectDataset: (dataset: DatasetResult | null) => void;
  onExportJSON?: (dataset: DatasetResult) => void;
  onExportCSV?: (dataset: DatasetResult) => void;
  onCompareToggle?: (dataset: DatasetResult) => void;
  comparingIds?: Set<string>;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getProviderColor(provider: string): string {
  if (provider.includes('Copernicus') || provider.includes('ESA')) return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
  if (provider.includes('NASA')) return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
  if (provider.includes('USGS')) return 'text-green-400 bg-green-500/10 border-green-500/20';
  if (provider.includes('USDA')) return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
  return 'text-purple-400 bg-purple-500/10 border-purple-500/20';
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(Math.round(score * 100), 100);
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-slate-500 font-mono">{pct}%</span>
    </div>
  );
}

export default function ResultsList({
  results, loading, selectedDataset, onSelectDataset,
  onExportJSON, onExportCSV, onCompareToggle, comparingIds
}: ResultsListProps) {
  if (loading) {
    return (
      <div className="glass rounded-2xl p-4 h-full min-h-[400px] max-h-[700px] overflow-hidden">
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="shimmer rounded-xl h-28" />
          ))}
        </div>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="glass rounded-2xl p-6 h-full min-h-[400px] max-h-[700px] flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </div>
        <h3 className="text-sm font-medium text-slate-400 mb-1">No datasets found</h3>
        <p className="text-xs text-slate-600 max-w-[200px]">
          Try a different query or adjust your filters
        </p>
      </div>
    );
  }

  // If a dataset is selected, show the detail panel instead of the list
  if (selectedDataset) {
    const inResults = results.find(r => r.id === selectedDataset.id);
    const dataset = inResults || selectedDataset;

    return (
      <div className="h-full min-h-[400px] max-h-[700px] flex flex-col">
        {/* Back button */}
        <div className="mb-2">
          <button
            onClick={() => onSelectDataset(null)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] text-slate-400 hover:text-slate-300 hover:bg-slate-800/50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Back to {results.length} results
          </button>
        </div>

        {/* Detail panel */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <DatasetDetail
            dataset={dataset}
            onClose={() => onSelectDataset(null)}
            onExportJSON={onExportJSON || (() => {})}
            onExportCSV={onExportCSV || (() => {})}
            onCompareToggle={onCompareToggle}
            isComparing={comparingIds?.has(dataset.id)}
          />
        </div>

        {/* Quick nav: prev/next */}
        {results.length > 1 && (
          <div className="mt-2 flex gap-2">
            {(() => {
              const idx = results.findIndex(r => r.id === dataset.id);
              const prev = idx > 0 ? results[idx - 1] : null;
              const next = idx < results.length - 1 ? results[idx + 1] : null;
              return (
                <>
                  <button
                    onClick={() => prev && onSelectDataset(prev)}
                    disabled={!prev}
                    className="flex-1 px-3 py-2 rounded-xl text-[11px] bg-slate-800/30 text-slate-400 border border-slate-700/30 hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    ← Previous
                  </button>
                  <button
                    onClick={() => next && onSelectDataset(next)}
                    disabled={!next}
                    className="flex-1 px-3 py-2 rounded-xl text-[11px] bg-slate-800/30 text-slate-400 border border-slate-700/30 hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    Next →
                  </button>
                </>
              );
            })()}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl overflow-hidden h-full min-h-[400px] max-h-[700px] flex flex-col">
      <div className="px-4 py-3 border-b border-slate-700/30 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-300">
          {results.length} datasets found
        </span>
        {onExportJSON && results.length > 0 && (
          <button
            onClick={() => {
              // Export all results
              const json = JSON.stringify(results, null, 2);
              const blob = new Blob([json], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `orbitalquery-results-${Date.now()}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export All
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="p-3 space-y-2">
          {results.map((dataset, idx) => (
            <div
              key={dataset.id}
              onClick={() => onSelectDataset(dataset)}
              className="p-3 rounded-xl cursor-pointer transition-all duration-200 hover:bg-slate-800/50 border border-transparent hover:border-slate-700/30"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-mono text-slate-600">#{idx + 1}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md border font-medium ${getProviderColor(dataset.provider)}`}>
                      {dataset.provider}
                    </span>
                    {comparingIds?.has(dataset.id) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20">
                        ⚖️
                      </span>
                    )}
                  </div>
                  <h4 className="text-sm font-semibold text-slate-200 leading-tight truncate">
                    {dataset.title}
                  </h4>
                </div>
                {dataset.score != null && (
                  <ScoreBar score={dataset.score} />
                )}
              </div>

              {/* Description */}
              {dataset.description && (
                <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 mb-2">
                  {dataset.description}
                </p>
              )}

              {/* Metadata row */}
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                {dataset.collection && (
                  <span className="bg-slate-800/50 px-1.5 py-0.5 rounded font-mono">
                    {dataset.collection}
                  </span>
                )}
                {dataset.gsd && (
                  <span className="bg-slate-800/50 px-1.5 py-0.5 rounded">
                    {dataset.gsd}m
                  </span>
                )}
                {dataset.cloudCover != null && (
                  <span className="bg-slate-800/50 px-1.5 py-0.5 rounded">
                    ☁ {dataset.cloudCover}%
                  </span>
                )}
                <span className="text-slate-600">
                  {formatDate(dataset.startDate)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
