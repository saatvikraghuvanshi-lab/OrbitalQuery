'use client';

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
      <div className="p-3 space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 rounded-md animate-pulse" style={{ background: '#0D1712' }} />
        ))}
      </div>
    );
  }

  if (datasets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <div className="text-[10px] uppercase tracking-wider font-medium mb-1" style={{ color: '#68756E' }}>
          No datasets found
        </div>
        <p className="text-[11px]" style={{ color: '#68756E' }}>
          Draw a bounding box on the map to search
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto pb-4">
      <div className="p-2">
        {datasets.map((ds) => {
          const isSelected = ds.id === selectedId;
          const displayTitle = cleanTitle(ds.title, ds.collection);

          return (
            <button
              key={ds.id}
              onClick={() => onSelect(ds)}
              className="w-full text-left px-3 py-2.5 rounded-md transition-all mb-[1px]"
              style={{
                background: isSelected ? 'rgba(163,230,53,0.06)' : 'transparent',
                borderLeft: isSelected ? '2px solid #A3E635' : '2px solid transparent',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) e.currentTarget.style.background = '#0D1712';
              }}
              onMouseLeave={(e) => {
                if (!isSelected) e.currentTarget.style.background = 'transparent';
              }}
            >
              {/* Dataset name */}
              <div className="flex items-center justify-between gap-2">
                <span
                  className="text-[13px] font-medium truncate leading-tight min-w-0"
                  style={{ color: isSelected ? '#F1F5F2' : '#A7B3AA' }}
                >
                  {displayTitle}
                </span>
                {ds.cloudCover != null && (
                  <span
                    className="text-[10px] font-mono flex-shrink-0 px-1.5 py-0.5 rounded"
                    style={{
                      color: ds.cloudCover < 10 ? '#4ADE80' : ds.cloudCover < 25 ? '#FBBF24' : '#F87171',
                      background: ds.cloudCover < 10 ? 'rgba(74,222,128,0.08)' : ds.cloudCover < 25 ? 'rgba(251,191,36,0.08)' : 'rgba(248,113,113,0.08)',
                    }}
                  >
                    {ds.cloudCover.toFixed(0)}%
                  </span>
                )}
              </div>

              {/* Source + date */}
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[11px] font-mono" style={{ color: '#68756E' }}>
                  {ds.collection}
                </span>
                {ds.date && (
                  <>
                    <span style={{ color: '#17251C' }}>·</span>
                    <span className="text-[11px]" style={{ color: '#68756E' }}>
                      {formatDate(ds.date)}
                    </span>
                  </>
                )}
              </div>

              {/* Coordinates */}
              {ds.bbox && ds.bbox.length === 4 && (
                <div className="text-[10px] font-mono mt-1" style={{ color: '#465249' }}>
                  [{ds.bbox[0]?.toFixed(2)}, {ds.bbox[1]?.toFixed(2)}]
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
