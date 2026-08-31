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
  return 'text-oq-200 bg-oq-700/40 border-oq-600/30';
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(Math.round(score * 100), 100);
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1.5 bg-oq-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-lime to-lime-hover rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-oq-300 font-mono">{pct}%</span>
    </div>
  );
}

export default function ResultsList({
  results, loading, selectedDataset, onSelectDataset,
  onExportJSON, onExportCSV, onCompareToggle, comparingIds
}: ResultsListProps) {
  // Fill the parent container's height
  const containerStyle = {
    height: '100%',
    minHeight: '580px',
  };

  if (loading) {
    return (
      <div className="oq-card overflow-hidden" style={containerStyle}>
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
      <div className="oq-card flex flex-col items-center justify-center text-center" style={containerStyle}>
        <div className="w-16 h-16 rounded-2xl bg-oq-800/50 flex items-center justify-center mb-4 border border-oq-700/30">
          <svg className="w-8 h-8 text-oq-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </div>
        <h3 className="text-sm font-medium text-oq-200 mb-1">No datasets found</h3>
        <p className="text-xs text-oq-400 max-w-[200px]">
          Try a different query or adjust your filters
        </p>
      </div>
    );
  }

  // If a dataset is selected, show the detail panel
  if (selectedDataset) {
    const inResults = results.find(r => r.id === selectedDataset.id);
    const dataset = inResults || selectedDataset;

    return (
      <div className="oq-card overflow-hidden flex flex-col" style={containerStyle}>
        {/* Back button — prominent */}
        <div className="px-4 py-2.5 border-b border-oq-700/30">
          <button
            onClick={() => onSelectDataset(null)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-oq-200
              hover:text-oq-50 hover:bg-lime/10 hover:border-lime/30 border border-transparent transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Back to {results.length} results
          </button>
        </div>

        {/* Detail panel — scrollable within fixed height */}
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
          <div className="px-4 py-2.5 border-t border-oq-700/30 flex gap-2">
            {(() => {
              const idx = results.findIndex(r => r.id === dataset.id);
              const prev = idx > 0 ? results[idx - 1] : null;
              const next = idx < results.length - 1 ? results[idx + 1] : null;
              return (
                <>
                  <button
                    onClick={() => prev && onSelectDataset(prev)}
                    disabled={!prev}
                    className="flex-1 px-3 py-2 rounded-xl text-[11px] bg-oq-800/50 text-oq-200 border border-oq-700/30 hover:text-oq-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    ← Previous
                  </button>
                  <button
                    onClick={() => next && onSelectDataset(next)}
                    disabled={!next}
                    className="flex-1 px-3 py-2 rounded-xl text-[11px] bg-oq-800/50 text-oq-200 border border-oq-700/30 hover:text-oq-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
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
    <div className="oq-card overflow-hidden flex flex-col" style={containerStyle}>
      <div className="px-4 py-3 border-b border-oq-700/30 flex items-center justify-between">
        <span className="text-sm font-medium text-oq-50">
          {results.length} datasets found
        </span>
        {onExportJSON && results.length > 0 && (
          <button
            onClick={() => {
              const json = JSON.stringify(results, null, 2);
              const blob = new Blob([json], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `orbitalquery-results-${Date.now()}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="text-[10px] text-oq-300 hover:text-oq-50 transition-colors flex items-center gap-1"
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
              className="oq-card p-3 cursor-pointer transition-all duration-200 hover:bg-oq-800/50"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-mono text-oq-400">#{idx + 1}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md border font-medium ${getProviderColor(dataset.provider)}`}>
                      {dataset.provider}
                    </span>
                    {comparingIds?.has(dataset.id) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-purple/10 text-purple border border-purple/20">
                        ⚖️
                      </span>
                    )}
                  </div>
                  <h4 className="text-sm font-semibold text-oq-50 leading-tight truncate">
                    {dataset.title}
                  </h4>
                </div>
                {dataset.score != null && (
                  <ScoreBar score={dataset.score} />
                )}
              </div>

              {/* Description */}
              {dataset.description && (
                <p className="text-xs text-oq-300 leading-relaxed line-clamp-2 mb-2">
                  {dataset.description}
                </p>
              )}

              {/* Metadata row */}
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-oq-300">
                {dataset.collection && (
                  <span className="bg-oq-800/50 px-1.5 py-0.5 rounded font-mono border border-oq-700/30">
                    {dataset.collection}
                  </span>
                )}
                {dataset.gsd && (
                  <span className="bg-oq-800/50 px-1.5 py-0.5 rounded border border-oq-700/30">
                    {dataset.gsd}m
                  </span>
                )}
                {dataset.cloudCover != null && (
                  <span className="bg-oq-800/50 px-1.5 py-0.5 rounded border border-oq-700/30">
                    ☁ {dataset.cloudCover}%
                  </span>
                )}
                <span className="text-oq-400">
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
