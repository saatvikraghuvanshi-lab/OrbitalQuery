'use client';

import type { Dataset } from '@/components/DatasetList';

const COLLECTION_INFO: Record<string, { bands: { name: string; label: string }[]; resolution: string; description: string }> = {
  'sentinel-2-l2a': {
    bands: [
      { name: 'B02', label: 'Blue' }, { name: 'B03', label: 'Green' }, { name: 'B04', label: 'Red' },
      { name: 'B08', label: 'NIR' }, { name: 'B11', label: 'SWIR1' }, { name: 'B12', label: 'SWIR2' },
    ],
    resolution: '10m',
    description: 'Level-2A surface reflectance — atmospherically corrected',
  },
  'sentinel-2-l1c': {
    bands: [
      { name: 'B02', label: 'Blue' }, { name: 'B03', label: 'Green' }, { name: 'B04', label: 'Red' },
      { name: 'B08', label: 'NIR' }, { name: 'B11', label: 'SWIR1' }, { name: 'B12', label: 'SWIR2' },
    ],
    resolution: '10m',
    description: 'Level-1C top-of-atmosphere reflectance',
  },
  'sentinel-1-grd': {
    bands: [{ name: 'VV', label: 'VV' }, { name: 'VH', label: 'VH' }],
    resolution: '10m',
    description: 'Ground Range Detected SAR — all-weather imaging',
  },
  'landsat-c2-l2': {
    bands: [
      { name: 'B2', label: 'Blue' }, { name: 'B3', label: 'Green' }, { name: 'B4', label: 'Red' },
      { name: 'B5', label: 'NIR' }, { name: 'B6', label: 'SWIR1' }, { name: 'B7', label: 'SWIR2' },
    ],
    resolution: '30m',
    description: 'Landsat Collection 2 Level-2 surface reflectance',
  },
  'naip': {
    bands: [{ name: 'R', label: 'Red' }, { name: 'G', label: 'Green' }, { name: 'B', label: 'Blue' }, { name: 'N', label: 'NIR' }],
    resolution: '0.6–1m',
    description: 'National Agriculture Imagery Program — high-res aerial',
  },
};

interface Props {
  dataset: Dataset;
  onClose: () => void;
  onAnalyze: (query: string) => void;
}

export default function DatasetDetailPanel({ dataset, onClose, onAnalyze }: Props) {
  const info = COLLECTION_INFO[dataset.collection] || COLLECTION_INFO['sentinel-2-l2a'];
  const dateStr = dataset.date ? new Date(dataset.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
  const bboxStr = dataset.bbox ? `[${dataset.bbox.map(b => b.toFixed(3)).join(', ')}]` : '—';

  const score = (() => {
    let s = 50;
    if (dataset.cloudCover != null && dataset.cloudCover < 20) s += 20;
    else if (dataset.cloudCover != null && dataset.cloudCover < 40) s += 10;
    if (dataset.date) s += 10;
    if (dataset.bbox) s += 10;
    if (dataset.score && dataset.score > 50) s += 10;
    return Math.min(s, 100);
  })();

  return (
    <div className="h-full overflow-y-auto" style={{ background: '#09110D' }}>
      {/* Featured dataset */}
      <div className="px-4 py-3" style={{ borderBottom: '1px solid #17251C' }}>
        <div className="text-[9px] uppercase tracking-wider font-medium mb-1.5" style={{ color: '#68756E' }}>
          Featured Dataset
        </div>
        <h3 className="text-[14px] font-semibold leading-tight mb-1" style={{ color: '#F1F5F2' }}>
          {cleanTitle(dataset.title, dataset.collection)}
        </h3>
        <p className="text-[11px] leading-relaxed" style={{ color: '#68756E' }}>
          {info.description}
        </p>

        {/* Resolution + provider */}
        <div className="flex items-center gap-3 mt-2">
          <span className="text-[11px] font-medium" style={{ color: '#A7B3AA' }}>{info.resolution}</span>
          <span style={{ color: '#17251C' }}>·</span>
          <span className="text-[11px]" style={{ color: '#68756E' }}>{dataset.provider}</span>
        </div>

        {/* Availability score */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] uppercase tracking-wider font-medium" style={{ color: '#68756E' }}>Availability</span>
            <span className="text-[11px] font-mono font-bold" style={{ color: '#A3E635' }}>{score} / 100</span>
          </div>
          <div className="h-1 rounded-full overflow-hidden" style={{ background: '#0D1712' }}>
            <div className="h-full rounded-full" style={{ width: `${score}%`, background: 'rgba(163,230,53,0.5)' }} />
          </div>
        </div>
      </div>

      {/* Available bands */}
      <div className="px-4 py-3" style={{ borderBottom: '1px solid #17251C' }}>
        <div className="text-[9px] uppercase tracking-wider font-medium mb-2" style={{ color: '#68756E' }}>
          Available Bands
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {info.bands.map((band) => (
            <div
              key={band.name}
              className="px-2 py-1.5 rounded text-center"
              style={{ background: '#0D1712', border: '1px solid #17251C' }}
            >
              <div className="text-[10px] font-mono font-medium" style={{ color: '#A7B3AA' }}>{band.name}</div>
              <div className="text-[8px]" style={{ color: '#68756E' }}>{band.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Metadata */}
      <div className="px-4 py-3" style={{ borderBottom: '1px solid #17251C' }}>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <div>
            <div className="text-[8px] uppercase" style={{ color: '#68756E' }}>Acquired</div>
            <div className="text-[11px]" style={{ color: '#A7B3AA' }}>{dateStr}</div>
          </div>
          <div>
            <div className="text-[8px] uppercase" style={{ color: '#68756E' }}>Cloud</div>
            <div className="text-[11px] font-mono" style={{ color: '#A7B3AA' }}>
              {dataset.cloudCover != null ? `${dataset.cloudCover.toFixed(1)}%` : '—'}
            </div>
          </div>
          <div className="col-span-2">
            <div className="text-[8px] uppercase" style={{ color: '#68756E' }}>BBox</div>
            <div className="text-[10px] font-mono break-all" style={{ color: '#68756E' }}>{bboxStr}</div>
          </div>
        </div>
      </div>

      {/* Quick analysis */}
      <div className="px-4 py-3">
        <div className="text-[9px] uppercase tracking-wider font-medium mb-2" style={{ color: '#68756E' }}>
          Quick Analysis
        </div>
        <div className="space-y-1">
          {['urban expansion', 'vegetation change', 'water body change'].map((s) => {
            const year = dataset.date ? new Date(dataset.date).getFullYear() : 2024;
            return (
              <button
                key={s}
                onClick={() => onAnalyze(`${s} ${year - 3} vs ${year}`)}
                className="w-full text-left px-2.5 py-2 rounded-md text-[11px] transition-all"
                style={{
                  color: '#A7B3AA',
                  background: '#0D1712',
                  border: '1px solid #17251C',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#111E15';
                  e.currentTarget.style.borderColor = '#29402F';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#0D1712';
                  e.currentTarget.style.borderColor = '#17251C';
                }}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
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
  return raw.length > 50 ? raw.substring(0, 47) + '…' : raw;
}
