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

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return dateStr; }
}

function cleanTitle(raw: string, collection?: string | null): string {
  if (!raw) return 'Unknown Dataset';
  if (/^(S2[AB]_|LC0[89]|SENTINEL1|MODIS_|VIIRS_)/.test(raw)) {
    const c = (collection || '').toLowerCase();
    if (c.includes('sentinel-2')) return 'Sentinel-2 L2A';
    if (c.includes('sentinel-1')) return 'Sentinel-1 GRD';
    if (c.includes('landsat')) return 'Landsat Collection 2';
    return raw.substring(0, 30);
  }
  return raw.length > 45 ? raw.substring(0, 42) + '…' : raw;
}

export default function DatasetList({ datasets, selectedId, onSelect, loading }: DatasetListProps) {
  if (loading) {
    return (
      <div className="space-y-1 p-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 rounded bg-oq-800/30 animate-pulse" />
        ))}
      </div>
    );
  }

  if (datasets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <div className="text-[10px] text-oq-300 uppercase tracking-wider font-medium mb-1">No Datasets</div>
        <p className="text-[10px] text-oq-300">Draw a bounding box on the map to search</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-2 space-y-[2px]">
        {datasets.map((ds) => {
          const isSelected = ds.id === selectedId;
          const displayTitle = cleanTitle(ds.title, ds.collection);

          return (
            <button
              key={ds.id}
              onClick={() => onSelect(ds)}
              className={`w-full text-left px-3 py-2 rounded transition-all ${
                isSelected
                  ? 'bg-lime/8 border border-lime/15'
                  : 'hover:bg-oq-800/40 border border-transparent'
              }`}
            >
              {/* Title + collection */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-oq-100 font-medium truncate leading-tight">{displayTitle}</span>
                {ds.cloudCover != null && (
                  <span className={`text-[9px] font-mono flex-shrink-0 ${ds.cloudCover < 10 ? 'text-green-400' : ds.cloudCover < 25 ? 'text-amber-400' : 'text-red-400'}`}>
                    {ds.cloudCover.toFixed(0)}%
                  </span>
                )}
              </div>

              {/* Meta row */}
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[9px] text-oq-300 font-mono">{ds.collection}</span>
                {ds.date && (
                  <>
                    <span className="text-oq-500">·</span>
                    <span className="text-[9px] text-oq-300">{formatDate(ds.date)}</span>
                  </>
                )}
              </div>

              {/* Coordinates */}
              {ds.bbox && ds.bbox.length === 4 && (
                <div className="text-[8px] text-oq-400 font-mono mt-0.5">
                  [{ds.bbox[0]?.toFixed(2)}, {ds.bbox[1]?.toFixed(2)}]
                </div>
              )}
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}
