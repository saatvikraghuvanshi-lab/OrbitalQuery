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

  // Compute a simple availability score from metadata
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
    <div className="h-full overflow-y-auto">
      {/* Featured dataset */}
      <div className="px-4 py-3 border-b border-oq-700/30">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-semibold text-oq-100 uppercase tracking-wider">Featured Dataset</span>
        </div>
        <h3 className="text-[13px] font-bold text-oq-50 leading-tight">
          {cleanTitle(dataset.title, dataset.collection)}
        </h3>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-oq-200">{info.description}</span>
        </div>

        {/* Resolution + type */}
        <div className="flex items-center gap-3 mt-2">
          <span className="text-[10px] text-oq-200 font-medium">{info.resolution}</span>
          <span className="text-oq-500">·</span>
          <span className="text-[10px] text-oq-300">{dataset.provider}</span>
        </div>

        {/* Availability score */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] text-oq-300 uppercase tracking-wider font-medium">Availability</span>
            <span className="text-[10px] text-lime font-mono font-bold">{score} / 100</span>
          </div>
          <div className="h-1 bg-oq-800/50 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-lime/60" style={{ width: `${score}%` }} />
          </div>
        </div>
      </div>

      {/* Available bands */}
      <div className="px-4 py-3 border-b border-oq-700/30">
        <div className="text-[9px] text-oq-300 uppercase tracking-wider font-medium mb-2">Available Bands</div>
        <div className="grid grid-cols-3 gap-1.5">
          {info.bands.map((band) => (
            <div key={band.name} className="px-2 py-1 rounded bg-oq-800/30 border border-oq-700/15 text-center">
              <div className="text-[10px] text-oq-100 font-mono font-medium">{band.name}</div>
              <div className="text-[8px] text-oq-300">{band.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Metadata */}
      <div className="px-4 py-3 border-b border-oq-700/30">
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <div><div className="text-[8px] text-oq-300 uppercase">Acquired</div><div className="text-[10px] text-oq-100">{dateStr}</div></div>
          <div><div className="text-[8px] text-oq-300 uppercase">Cloud</div><div className="text-[10px] text-oq-100 font-mono">{dataset.cloudCover != null ? `${dataset.cloudCover.toFixed(1)}%` : '—'}</div></div>
          <div className="col-span-2"><div className="text-[8px] text-oq-300 uppercase">BBox</div><div className="text-[9px] text-oq-200 font-mono break-all">{bboxStr}</div></div>
        </div>
      </div>

      {/* Quick analysis */}
      <div className="px-4 py-3">
        <div className="text-[9px] text-oq-300 uppercase tracking-wider font-medium mb-2">Quick Analysis</div>
        <div className="space-y-1">
          {['urban expansion', 'vegetation change', 'water body change'].map((s) => {
            const year = dataset.date ? new Date(dataset.date).getFullYear() : 2024;
            return (
              <button
                key={s}
                onClick={() => onAnalyze(`${s} ${year - 3} vs ${year}`)}
                className="w-full text-left px-2.5 py-1.5 rounded text-[10px] text-oq-200 bg-oq-800/20 hover:bg-oq-700/30 border border-oq-700/15 hover:border-oq-600/30 transition-all"
              >
                ▸ {s.charAt(0).toUpperCase() + s.slice(1)}
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
