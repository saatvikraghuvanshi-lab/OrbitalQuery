'use client';

import { ScrollArea } from '@/components/ui/scroll-area';

export interface Dataset {
  id: string;
  title: string;
  provider: string;
  collection: string;
  date: string | null;
  bbox: number[] | null;
  cloudCover?: number | null;
  previewUrl?: string | null;
  score?: number;
  platform?: string | null;
  instrument?: string | null;
  stacLink?: string | null;
  description?: string | null;
  geometry?: any;
  endDate?: string | null;
  centroidLat?: number | null;
  centroidLng?: number | null;
}

interface DatasetListProps {
  datasets: Dataset[];
  selectedId: string | null;
  onSelect: (dataset: Dataset) => void;
  loading?: boolean;
}

const PROVIDER_STYLES: Record<string, { bg: string; text: string; border: string; icon: string }> = {
  'Copernicus': { bg: 'rgba(59,130,246,0.15)', text: '#60a5fa', border: 'rgba(59,130,246,0.3)', icon: '🇪🇺' },
  'ESA': { bg: 'rgba(59,130,246,0.15)', text: '#60a5fa', border: 'rgba(59,130,246,0.3)', icon: '🇪🇺' },
  'NASA': { bg: 'rgba(34,197,94,0.15)', text: '#4ade80', border: 'rgba(34,197,94,0.3)', icon: '🇺🇸' },
  'USGS': { bg: 'rgba(34,197,94,0.15)', text: '#4ade80', border: 'rgba(34,197,94,0.3)', icon: '🇺🇸' },
  'ISRO': { bg: 'rgba(249,115,22,0.15)', text: '#fb923c', border: 'rgba(249,115,22,0.3)', icon: '🇮🇳' },
  'Sentinel': { bg: 'rgba(6,182,212,0.15)', text: '#22d3ee', border: 'rgba(6,182,212,0.3)', icon: '🛰️' },
  'Landsat': { bg: 'rgba(20,184,166,0.15)', text: '#2dd4bf', border: 'rgba(20,184,166,0.3)', icon: '🛰️' },
};

function getProviderStyle(provider: string) {
  const key = Object.keys(PROVIDER_STYLES).find(k =>
    provider?.toLowerCase().includes(k.toLowerCase())
  );
  return key ? PROVIDER_STYLES[key] : { bg: 'rgba(148,163,184,0.12)', text: '#94a3b8', border: 'rgba(148,163,184,0.2)', icon: '📡' };
}

/** Extract a clean human-readable name from the STAC title/id */
function cleanTitle(raw: string, collection?: string | null): string {
  if (!raw) return 'Unknown Dataset';

  // If it looks like a STAC ID (starts with S2, LC, etc.), build a clean name
  if (/^(S2[AB]_|LC0[89]|SENTINEL1|MODIS_|VIIRS_)/.test(raw)) {
    const coll = (collection || '').toLowerCase();
    if (coll.includes('sentinel-2')) return 'Sentinel-2 L2A';
    if (coll.includes('sentinel-1')) return 'Sentinel-1 GRD';
    if (coll.includes('landsat')) return 'Landsat Collection 2';
    if (coll.includes('modis')) return 'MODIS Terra';
    if (coll.includes('viirs')) return 'VIIRS DNB';
    return raw.substring(0, 30);
  }

  // Already human-readable — truncate if too long
  return raw.length > 50 ? raw.substring(0, 47) + '...' : raw;
}

/** Get the short STAC ID for the secondary line */
function shortStacId(raw: string): string | null {
  if (/^(S2[AB]_|LC0[89]|SENTINEL1|MODIS_|VIIRS_)/.test(raw)) {
    return raw.length > 40 ? raw.substring(0, 37) + '...' : raw;
  }
  return null;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function CloudBadge({ value }: { value: number }) {
  const color = value < 10 ? '#4ade80' : value < 25 ? '#fbbf24' : '#f87171';
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium px-1.5 py-0.5 rounded"
      style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}>
      ☁ {value.toFixed(0)}%
    </span>
  );
}

export default function DatasetList({ datasets, selectedId, onSelect, loading }: DatasetListProps) {
  if (loading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl bg-slate-800/30 animate-pulse" />
        ))}
      </div>
    );
  }

  if (datasets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <div className="text-3xl mb-3">📦</div>
        <h3 className="text-sm font-semibold text-slate-400 mb-1">No Datasets</h3>
        <p className="text-xs text-slate-500">
          Run a search in Ask to discover datasets, or adjust your filters.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-2 p-3">
        {datasets.map((ds) => {
          const style = getProviderStyle(ds.provider);
          const isSelected = ds.id === selectedId;
          const displayTitle = cleanTitle(ds.title, ds.collection);
          const stacId = shortStacId(ds.title);

          return (
            <button
              key={ds.id}
              onClick={() => onSelect(ds)}
              className={`w-full text-left rounded-xl p-3.5 transition-all duration-200 border ${
                isSelected
                  ? 'border-blue-500/50 bg-blue-500/8 shadow-lg shadow-blue-500/5'
                  : 'border-slate-700/30 bg-slate-800/20 hover:bg-slate-800/40 hover:border-slate-600/50'
              }`}
            >
              {/* Top row: provider badge + cloud */}
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md"
                  style={{ background: style.bg, color: style.text, border: `1px solid ${style.border}` }}>
                  {style.icon} {ds.provider?.split('/')[0] || 'Unknown'}
                </span>
                {ds.cloudCover != null && <CloudBadge value={ds.cloudCover} />}
              </div>

              {/* Clean title */}
              <h4 className="text-[13px] font-semibold text-slate-100 leading-tight mb-0.5">
                {displayTitle}
              </h4>

              {/* STAC ID (secondary, smaller) */}
              {stacId && (
                <div className="text-[10px] text-slate-500 font-mono truncate mb-1.5">{stacId}</div>
              )}

              {/* Meta row */}
              <div className="flex items-center gap-3 text-[10px] text-slate-400">
                <span className="flex items-center gap-1">📅 {formatDate(ds.date)}</span>
                {ds.bbox && (
                  <span className="font-mono text-slate-500">
                    📍 [{ds.bbox[0]?.toFixed(1)}, {ds.bbox[1]?.toFixed(1)}]
                  </span>
                )}
              </div>

              {/* Score bar */}
              {ds.score != null && ds.score > 0 && (
                <div className="mt-2">
                  <div className="h-1 bg-slate-700/50 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(ds.score, 100)}%`, background: 'linear-gradient(90deg, #3b82f6, #06b6d4)' }}
                    />
                  </div>
                  <span className="text-[9px] text-slate-500 mt-0.5 block">
                    Relevance: {ds.score.toFixed(0)}%
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}
