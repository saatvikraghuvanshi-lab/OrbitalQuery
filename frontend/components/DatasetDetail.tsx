'use client';

import { useState } from 'react';
import { DatasetResult } from '@/app/page';

interface DatasetDetailProps {
  dataset: DatasetResult;
  onClose: () => void;
  onExportJSON: (dataset: DatasetResult) => void;
  onExportCSV: (dataset: DatasetResult) => void;
  onCompareToggle?: (dataset: DatasetResult) => void;
  isComparing?: boolean;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function getProviderBadge(provider: string) {
  if (provider.includes('Copernicus') || provider.includes('ESA'))
    return { color: 'bg-blue-500/15 text-blue-400 border-blue-500/30', label: 'Copernicus/ESA' };
  if (provider.includes('NASA'))
    return { color: 'bg-orange-500/15 text-orange-400 border-orange-500/30', label: 'NASA' };
  if (provider.includes('USGS'))
    return { color: 'bg-green-500/15 text-green-400 border-green-500/30', label: 'USGS/NASA' };
  if (provider.includes('USDA'))
    return { color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30', label: 'USDA' };
  return { color: 'bg-purple-500/15 text-purple-400 border-purple-500/30', label: provider };
}

export default function DatasetDetail({ dataset, onClose, onExportJSON, onExportCSV, onCompareToggle, isComparing }: DatasetDetailProps) {
  const [activeTab, setActiveTab] = useState<'metadata' | 'preview' | 'download'>('metadata');
  const [imgError, setImgError] = useState(false);
  const badge = getProviderBadge(dataset.provider);

  // Build AWS Earth Search links (free, no API key needed)
  const awsCollectionUrl = dataset.collection
    ? `https://earth-search.aws.element84.com/v1/collections/${dataset.collection}`
    : null;

  // STAC API link to the item
  const stacApiUrl = dataset.stacId && dataset.collection
    ? `https://earth-search.aws.element84.com/v1/collections/${dataset.collection}/items/${dataset.stacId}`
    : null;

  // AWS Open Data S3 bucket links
  const awsS3Links: Record<string, string> = {
    'sentinel-2-l2a': 'https://sentinel-2-l2a.s3.amazonaws.com',
    'landsat-c2-l2': 'https://landsat-c2-l2.s3.amazonaws.com',
    'sentinel-1-grd': 'https://sentinel-1-grd.s3.amazonaws.com',
    'naip': 'https://naip.s3.amazonaws.com',
  };
  const awsS3Url = dataset.collection ? awsS3Links[dataset.collection] || null : null;

  return (
    <div className="glass rounded-2xl overflow-hidden border border-blue-500/20">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700/30 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] px-2 py-0.5 rounded-md border font-medium ${badge.color}`}>
              {badge.label}
            </span>
            {dataset.score != null && (
              <span className="text-[10px] font-mono text-slate-500">
                {Math.round(dataset.score * 100)}% match
              </span>
            )}
          </div>
          <h3 className="text-sm font-bold text-slate-100 leading-tight">
            {dataset.title}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-slate-700/50 text-slate-500 hover:text-slate-300 transition-colors shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700/30">
        {(['metadata', 'preview', 'download'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-3 py-2 text-[11px] font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab === 'metadata' && '📋 '}
            {tab === 'preview' && '🖼️ '}
            {tab === 'download' && '⬇️ '}
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-4 max-h-[400px] overflow-y-auto">
        {activeTab === 'metadata' && (
          <div className="space-y-3">
            {/* Description */}
            {dataset.description && (
              <p className="text-xs text-slate-400 leading-relaxed">
                {dataset.description}
              </p>
            )}

            {/* Metadata Grid */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Provider', value: dataset.provider },
                { label: 'Collection', value: dataset.collection },
                { label: 'Platform', value: dataset.platform },
                { label: 'Instrument', value: dataset.instrument },
                { label: 'Resolution', value: dataset.gsd ? `${dataset.gsd}m` : null },
                { label: 'Cloud Cover', value: dataset.cloudCover != null ? `${dataset.cloudCover}%` : null },
                { label: 'Acquired', value: formatDate(dataset.startDate) },
                { label: 'End Date', value: formatDate(dataset.endDate) },
              ].filter(item => item.value).map(item => (
                <div key={item.label} className="bg-slate-800/30 rounded-lg p-2">
                  <div className="text-[10px] text-slate-600 mb-0.5">{item.label}</div>
                  <div className="text-[11px] text-slate-300 font-medium">{item.value}</div>
                </div>
              ))}
            </div>

            {/* Geometry info */}
            {dataset.centroidLat != null && dataset.centroidLng != null && (
              <div className="bg-slate-800/30 rounded-lg p-2">
                <div className="text-[10px] text-slate-600 mb-0.5">Centroid</div>
                <div className="text-[11px] text-slate-300 font-mono">
                  {dataset.centroidLat.toFixed(4)}°, {dataset.centroidLng.toFixed(4)}°
                </div>
              </div>
            )}

            {/* BBOX */}
            {dataset.bbox && (
              <div className="bg-slate-800/30 rounded-lg p-2">
                <div className="text-[10px] text-slate-600 mb-0.5">Bounding Box</div>
                <div className="text-[11px] text-slate-300 font-mono">
                  [{Array.isArray(dataset.bbox) ? dataset.bbox.map((v: number) => v.toFixed(2)).join(', ') : '—'}]
                </div>
              </div>
            )}

            {/* STAC ID */}
            {dataset.stacId && (
              <div className="bg-slate-800/30 rounded-lg p-2">
                <div className="text-[10px] text-slate-600 mb-0.5">STAC Item ID</div>
                <div className="text-[11px] text-slate-300 font-mono truncate">{dataset.stacId}</div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'preview' && (
          <div className="space-y-3">
            {dataset.previewUrl && !imgError ? (
              <div className="rounded-xl overflow-hidden border border-slate-700/30">
                <img
                  src={dataset.previewUrl}
                  alt={dataset.title}
                  className="w-full h-auto"
                  onError={() => setImgError(true)}
                  loading="lazy"
                />
              </div>
            ) : (
              <div className="rounded-xl border border-slate-700/30 bg-slate-800/30 p-8 text-center">
                <svg className="w-12 h-12 mx-auto text-slate-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                </svg>
                <p className="text-xs text-slate-500">Preview not available for this dataset</p>
                {awsCollectionUrl && (
                  <a
                    href={awsCollectionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-3 px-3 py-1.5 text-[11px] bg-blue-600/20 text-blue-400 rounded-lg border border-blue-500/20 hover:bg-blue-600/30 transition-colors"
                  >
                    View on AWS Earth Search →
                  </a>
                )}
              </div>
            )}

            {/* Visualization info */}
            <div className="bg-slate-800/30 rounded-lg p-3">
              <div className="text-[10px] text-slate-600 mb-1">Visualization Bands</div>
              <div className="flex flex-wrap gap-1.5">
                {dataset.collection?.includes('sentinel-2') && (
                  <>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">B4 (Red)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">B3 (Green)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">B2 (Blue)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">B8 (NIR)</span>
                  </>
                )}
                {dataset.collection?.includes('landsat') && (
                  <>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">B4 (Red)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">B3 (Green)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">B2 (Blue)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-gray-500/10 text-gray-400 border border-gray-500/20">B5 (NIR)</span>
                  </>
                )}
                {dataset.collection?.includes('sentinel-1') && (
                  <>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">VV Polarization</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20">VH Polarization</span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'download' && (
          <div className="space-y-2">
            {/* AWS Earth Search Collection Link */}
            {awsCollectionUrl && (
              <a
                href={awsCollectionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 border border-slate-700/30 transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium text-slate-300 group-hover:text-white transition-colors">
                    AWS Earth Search
                  </div>
                  <div className="text-[10px] text-slate-600 truncate">
                    Browse and download from AWS Open Data
                  </div>
                </div>
                <svg className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </a>
            )}

            {/* STAC API Raw JSON */}
            {stacApiUrl && (
              <a
                href={stacApiUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 border border-slate-700/30 transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium text-slate-300 group-hover:text-white transition-colors">
                    STAC API Raw JSON
                  </div>
                  <div className="text-[10px] text-slate-600 truncate">
                    Machine-readable metadata endpoint
                  </div>
                </div>
                <svg className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </a>
            )}

            {/* AWS S3 Direct Access */}
            {awsS3Url && (
              <a
                href={awsS3Url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 border border-slate-700/30 transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.813a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.374" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium text-slate-300 group-hover:text-white transition-colors">
                    AWS S3 Bucket
                  </div>
                  <div className="text-[10px] text-slate-600 truncate">
                    Direct access to raw data on S3
                  </div>
                </div>
                <svg className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </a>
            )}

            {/* Export buttons */}
            <div className="border-t border-slate-700/30 pt-3 mt-3">
              <div className="text-[10px] text-slate-600 mb-2">Export Metadata</div>
              <div className="flex gap-2">
                <button
                  onClick={() => onExportJSON(dataset)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 border border-slate-700/30 text-[11px] text-slate-400 hover:text-slate-300 transition-colors"
                >
                  <span>{ }</span> Export JSON
                </button>
                <button
                  onClick={() => onExportCSV(dataset)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 border border-slate-700/30 text-[11px] text-slate-400 hover:text-slate-300 transition-colors"
                >
                  <span>📄</span> Export CSV
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="px-4 py-3 border-t border-slate-700/30 flex gap-2">
        {onCompareToggle && (
          <button
            onClick={() => onCompareToggle(dataset)}
            className={`flex-1 px-3 py-2 rounded-xl text-[11px] font-medium transition-all duration-200 border ${
              isComparing
                ? 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                : 'bg-slate-800/30 text-slate-400 border-slate-700/30 hover:text-slate-300 hover:border-slate-600/50'
            }`}
          >
            {isComparing ? '✓ Comparing' : '⚖️ Compare'}
          </button>
        )}
        <button
          onClick={() => onExportJSON(dataset)}
          className="flex-1 px-3 py-2 rounded-xl text-[11px] font-medium bg-slate-800/30 text-slate-400 border border-slate-700/30 hover:text-slate-300 hover:border-slate-600/50 transition-all duration-200"
        >
          📋 Copy Metadata
        </button>
      </div>
    </div>
  );
}
