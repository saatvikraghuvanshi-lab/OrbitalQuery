'use client';

import { DatasetResult } from '@/app/page';

interface ResultsListProps {
  results: DatasetResult[];
  loading: boolean;
  selectedDataset: DatasetResult | null;
  onSelectDataset: (dataset: DatasetResult) => void;
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

export default function ResultsList({ results, loading, selectedDataset, onSelectDataset }: ResultsListProps) {
  if (loading) {
    return (
      <div className="glass rounded-2xl p-4 h-[400px] sm:h-[500px] lg:h-[600px] overflow-hidden">
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
      <div className="glass rounded-2xl p-6 h-[400px] sm:h-[500px] lg:h-[600px] flex flex-col items-center justify-center text-center">
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

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700/30">
        <span className="text-sm font-medium text-slate-300">
          {results.length} datasets found
        </span>
      </div>
      <div className="h-[360px] sm:h-[470px] lg:h-[570px] overflow-y-auto">
        <div className="p-3 space-y-2">
          {results.map((dataset, idx) => (
            <div
              key={dataset.id}
              onClick={() => onSelectDataset(dataset)}
              className={`p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                selectedDataset?.id === dataset.id
                  ? 'bg-blue-500/10 border border-blue-500/30'
                  : 'hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-mono text-slate-600">#{idx + 1}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md border font-medium ${getProviderColor(dataset.provider)}`}>
                      {dataset.provider}
                    </span>
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

              {/* Expanded details when selected */}
              {selectedDataset?.id === dataset.id && (
                <div className="mt-3 pt-3 border-t border-slate-700/30 space-y-2">
                  {dataset.description && (
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {dataset.description}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-600">Platform: </span>
                      <span className="text-slate-400">{dataset.platform || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-600">Instrument: </span>
                      <span className="text-slate-400">{dataset.instrument || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-600">Start: </span>
                      <span className="text-slate-400">{formatDate(dataset.startDate)}</span>
                    </div>
                    <div>
                      <span className="text-slate-600">End: </span>
                      <span className="text-slate-400">{formatDate(dataset.endDate)}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {dataset.stacLink && (
                      <a
                        href={dataset.stacLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1 text-[11px] bg-blue-600/20 text-blue-400 rounded-lg border border-blue-500/20 hover:bg-blue-600/30 transition-colors"
                      >
                        View on STAC →
                      </a>
                    )}
                    {dataset.previewUrl && (
                      <a
                        href={dataset.previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1 text-[11px] bg-purple-600/20 text-purple-400 rounded-lg border border-purple-500/20 hover:bg-purple-600/30 transition-colors"
                      >
                        Preview Image →
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
