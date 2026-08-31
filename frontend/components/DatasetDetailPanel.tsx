'use client';

import type { Dataset } from '@/components/DatasetList';

// Collection → supported bands & analysis capabilities
const COLLECTION_INFO: Record<string, { bands: string[]; resolution: string; indices: string[]; description: string }> = {
  'sentinel-2-l2a': {
    bands: ['B01 (Coastal)', 'B02 (Blue)', 'B03 (Green)', 'B04 (Red)', 'B05 (Red Edge 1)', 'B06 (Red Edge 2)', 'B07 (Red Edge 3)', 'B08 (NIR)', 'B8A (NIR Narrow)', 'B09 (Water Vapour)', 'B11 (SWIR 1)', 'B12 (SWIR 2)'],
    resolution: '10m / 20m / 60m',
    indices: ['NDVI', 'NDWI', 'MNDWI', 'NDBI', 'NBR', 'NDSI', 'EVI', 'SAVI'],
    description: 'Level-2A surface reflectance — atmospherically corrected',
  },
  'sentinel-2-l1c': {
    bands: ['B01 (Coastal)', 'B02 (Blue)', 'B03 (Green)', 'B04 (Red)', 'B08 (NIR)', 'B11 (SWIR 1)', 'B12 (SWIR 2)'],
    resolution: '10m / 20m / 60m',
    indices: ['NDVI', 'NDWI', 'NDBI'],
    description: 'Level-1C top-of-atmosphere reflectance',
  },
  'sentinel-1-grd': {
    bands: ['VV', 'VH'],
    resolution: '10m',
    indices: ['SAR Backscatter', 'VV/VH Ratio'],
    description: 'Ground Range Detected SAR — all-weather imaging',
  },
  'landsat-c2-l2': {
    bands: ['Coastal (B1)', 'Blue (B2)', 'Green (B3)', 'Red (B4)', 'NIR (B5)', 'SWIR1 (B6)', 'SWIR2 (B7)', 'Thermal (B10)'],
    resolution: '30m',
    indices: ['NDVI', 'NDWI', 'NDBI', 'NBR', 'NDSI'],
    description: 'Landsat Collection 2 Level-2 surface reflectance',
  },
  'naip': {
    bands: ['Red', 'Green', 'Blue', 'NIR'],
    resolution: '0.6m - 1m',
    indices: ['NDVI'],
    description: 'National Agriculture Imagery Program — high-res aerial',
  },
};

const PHENOMENON_SUGGESTIONS: Record<string, string[]> = {
  'sentinel-2-l2a': ['urban expansion', 'vegetation change', 'flood impact', 'water body change', 'burn severity', 'coastal erosion', 'snow cover', 'glacier retreat'],
  'sentinel-1-grd': ['flood detection', 'urban change', 'soil moisture', 'shipping activity'],
  'landsat-c2-l2': ['long-term land change', 'vegetation trend', 'urban growth', 'deforestation'],
};

interface Props {
  dataset: Dataset;
  onClose: () => void;
  onAnalyze: (query: string) => void;
}

export default function DatasetDetailPanel({ dataset, onClose, onAnalyze }: Props) {
  const info = COLLECTION_INFO[dataset.collection] || COLLECTION_INFO['sentinel-2-l2a'];
  const suggestions = PHENOMENON_SUGGESTIONS[dataset.collection] || PHENOMENON_SUGGESTIONS['sentinel-2-l2a'];
  const dateStr = dataset.date ? new Date(dataset.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
  const bboxStr = dataset.bbox ? `[${dataset.bbox.map(b => b.toFixed(3)).join(', ')}]` : '—';

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="px-4 py-3 border-b border-oq-600/30 flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-xs font-bold text-lime uppercase tracking-wider mb-1">Dataset Detail</h3>
          <p className="text-[11px] text-oq-200 leading-tight truncate">{dataset.title}</p>
        </div>
        <button onClick={onClose} className="ml-2 p-1 rounded-lg hover:bg-oq-700/40 text-oq-300 hover:text-oq-200 transition-colors flex-shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Preview thumbnail */}
      {dataset.previewUrl && (
        <div className="px-4 pt-3">
          <img
            src={dataset.previewUrl}
            alt={dataset.title}
            className="w-full h-32 object-cover rounded-lg border border-oq-600/30"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      )}

      {/* Core metadata */}
      <div className="px-4 py-3 space-y-2.5">
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
          <MetaField label="Platform" value={dataset.platform || '—'} />
          <MetaField label="Collection" value={dataset.collection} />
          <MetaField label="Provider" value={dataset.provider} />
          <MetaField label="Resolution" value={info.resolution} />
          <MetaField label="Acquired" value={dateStr} />
          <MetaField label="Cloud Cover" value={dataset.cloudCover != null ? `${dataset.cloudCover.toFixed(1)}%` : '—'} />
        </div>

        <div className="text-[10px]">
          <span className="text-oq-300 uppercase tracking-wider">BBox</span>
          <div className="text-oq-200 font-mono mt-0.5 text-[9px] break-all">{bboxStr}</div>
        </div>

        <div className="text-[10px]">
          <span className="text-oq-300 uppercase tracking-wider">Description</span>
          <p className="text-oq-200 mt-0.5 leading-relaxed">{info.description}</p>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-oq-600/30" />

      {/* Available bands */}
      <div className="px-4 py-3">
        <h4 className="text-[10px] text-oq-200 uppercase tracking-wider font-medium mb-2">Available Bands</h4>
        <div className="flex flex-wrap gap-1">
          {info.bands.map((band) => (
            <span key={band} className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-oq-800/50 text-oq-200 border border-oq-600/30">
              {band}
            </span>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-oq-600/30" />

      {/* Analysis capabilities */}
      <div className="px-4 py-3">
        <h4 className="text-[10px] text-oq-200 uppercase tracking-wider font-medium mb-2">Can Compute</h4>
        <div className="flex flex-wrap gap-1">
          {info.indices.map((idx) => (
            <span key={idx} className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-purple/10 text-purple border border-purple/20">
              {idx}
            </span>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-oq-600/30" />

      {/* Quick analysis suggestions */}
      <div className="px-4 py-3">
        <h4 className="text-[10px] text-oq-200 uppercase tracking-wider font-medium mb-2">Quick Analysis</h4>
        <div className="space-y-1.5">
          {suggestions.map((s) => {
            const locName = dataset.title.split('_')[2]?.substring(0, 6) || 'this area';
            const year = dataset.date ? new Date(dataset.date).getFullYear() : 2024;
            const query = `${s} in ${dataset.collection} area ${year - 3} vs ${year}`;
            return (
              <button
                key={s}
                onClick={() => onAnalyze(query)}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] text-oq-200 bg-oq-800/30 hover:bg-oq-700/40 border border-oq-600/20 hover:border-[var(--color-accent-border)] transition-all"
              >
                ▸ {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            );
          })}
        </div>
      </div>

      {/* STAC link */}
      {dataset.stacLink && (
        <div className="px-4 pb-4">
          <a
            href={dataset.stacLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg text-[11px] font-medium text-oq-300 hover:text-oq-200 bg-oq-800/20 hover:bg-oq-700/40 border border-oq-600/20 transition-all"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            View STAC Item
          </a>
        </div>
      )}
    </div>
  );
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] text-oq-300 uppercase tracking-wider">{label}</div>
      <div className="text-[11px] text-oq-200 font-medium mt-0.5">{value}</div>
    </div>
  );
}
