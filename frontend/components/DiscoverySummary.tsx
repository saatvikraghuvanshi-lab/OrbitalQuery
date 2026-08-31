'use client';

/**
 * DiscoverySummary — grouped dataset availability for the Discover tab.
 *
 * Groups search results by collection/provider, shows availability summary,
 * and identifies the best match based on transparent scoring criteria.
 */

import type { Dataset } from '@/components/DatasetList';

// ── Collection metadata ────────────────────────────────────────

const COLLECTION_META: Record<string, {
  label: string;
  sensor: string;
  resolution: string;
  bands: string[];
  color: string;
  icon: string;
}> = {
  'sentinel-2-l2a': {
    label: 'Sentinel-2 L2A',
    sensor: 'MSI',
    resolution: '10m',
    bands: ['B02 Blue', 'B03 Green', 'B04 Red', 'B08 NIR', 'B11 SWIR1', 'B12 SWIR2'],
    color: '#3b82f6',
    icon: '🛰️',
  },
  'sentinel-2-l1c': {
    label: 'Sentinel-2 L1C',
    sensor: 'MSI',
    resolution: '10m',
    bands: ['B02 Blue', 'B03 Green', 'B04 Red', 'B08 NIR'],
    color: '#60a5fa',
    icon: '🛰️',
  },
  'sentinel-1-grd': {
    label: 'Sentinel-1 GRD',
    sensor: 'C-SAR',
    resolution: '10m',
    bands: ['VV', 'VH'],
    color: '#06b6d4',
    icon: '📡',
  },
  'landsat-c2-l2': {
    label: 'Landsat C2 L2',
    sensor: 'OLI/TIRS',
    resolution: '30m',
    bands: ['Blue', 'Green', 'Red', 'NIR', 'SWIR1', 'SWIR2', 'Thermal'],
    color: '#14b8a6',
    icon: '🛰️',
  },
  'naip': {
    label: 'NAIP',
    sensor: 'DOQQ Aerial',
    resolution: '0.6-1m',
    bands: ['Red', 'Green', 'Blue', 'NIR'],
    color: '#f59e0b',
    icon: '🛩️',
  },
};

function getCollectionMeta(collection: string) {
  const key = Object.keys(COLLECTION_META).find(k => collection?.toLowerCase().includes(k));
  return key ? COLLECTION_META[key] : {
    label: collection || 'Unknown',
    sensor: '—',
    resolution: '—',
    bands: [] as string[],
    color: '#94a3b8',
    icon: '📦',
  };
}

// ── Scoring ────────────────────────────────────────────────────

interface GroupedCollection {
  collection: string;
  meta: ReturnType<typeof getCollectionMeta>;
  datasets: Dataset[];
  observationCount: number;
  dateRange: { earliest: string | null; latest: string | null };
  avgCloudCover: number | null;
  platforms: string[];
  score: number;
  isBestMatch: boolean;
}

function computeGroupScore(group: GroupedCollection, bbox: { north: number; south: number; east: number; west: number } | null): number {
  let score = 0;

  // 1. Observation count (more = better, up to a point)
  score += Math.min(group.observationCount / 5, 1) * 30;

  // 2. Spatial coverage — do datasets cover the bbox?
  if (bbox && group.datasets.length > 0) {
    const overlapping = group.datasets.filter(ds => {
      if (!ds.bbox || ds.bbox.length !== 4) return false;
      const [w, s, e, n] = ds.bbox;
      return w <= bbox.east && e >= bbox.west && s <= bbox.north && n >= bbox.south;
    });
    score += (overlapping.length / group.datasets.length) * 25;
  } else {
    score += 15; // No bbox = neutral
  }

  // 3. Temporal coverage — recent data is better
  if (group.dateRange.latest) {
    const latestYear = new Date(group.dateRange.latest).getFullYear();
    if (latestYear >= 2024) score += 20;
    else if (latestYear >= 2022) score += 15;
    else if (latestYear >= 2020) score += 10;
    else score += 5;
  }

  // 4. Cloud cover — lower is better
  if (group.avgCloudCover !== null) {
    if (group.avgCloudCover < 10) score += 15;
    else if (group.avgCloudCover < 20) score += 10;
    else if (group.avgCloudCover < 30) score += 5;
  } else {
    score += 7; // Unknown = neutral
  }

  // 5. Resolution bonus — 10m Sentinel-2 is the standard
  if (group.meta.resolution === '10m') score += 10;
  else if (group.meta.resolution === '30m') score += 5;

  return Math.round(score);
}

// ── Helpers ────────────────────────────────────────────────────

function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
  } catch {
    return dateStr;
  }
}

function formatDateRange(earliest: string | null, latest: string | null): string {
  if (!earliest && !latest) return '—';
  if (earliest && latest) return `${formatDateShort(earliest)} — ${formatDateShort(latest)}`;
  return formatDateShort(earliest || latest);
}

// ── Component ──────────────────────────────────────────────────

interface DiscoverySummaryProps {
  datasets: Dataset[];
  bbox: { north: number; south: number; east: number; west: number } | null;
  onSelectCollection: (collection: string | null) => void;
  selectedCollection: string | null;
}

export default function DiscoverySummary({
  datasets,
  bbox,
  onSelectCollection,
  selectedCollection,
}: DiscoverySummaryProps) {
  // Group by collection
  const grouped = new Map<string, Dataset[]>();
  datasets.forEach(ds => {
    const key = ds.collection || 'unknown';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(ds);
  });

  // Build summary for each collection
  const summaries: GroupedCollection[] = Array.from(grouped.entries()).map(([collection, items]) => {
    const meta = getCollectionMeta(collection);

    // Date range
    const dates = items
      .map(d => d.date)
      .filter(Boolean)
      .sort();
    const earliest = dates[0] || null;
    const latest = dates[dates.length - 1] || null;

    // Average cloud cover
    const clouds = items.map(d => d.cloudCover).filter((c): c is number => c != null);
    const avgCloud = clouds.length > 0 ? clouds.reduce((a, b) => a + b, 0) / clouds.length : null;

    // Unique platforms
    const platforms = Array.from(new Set(items.map(d => d.platform).filter(Boolean) as string[]));

    const group: GroupedCollection = {
      collection,
      meta,
      datasets: items,
      observationCount: items.length,
      dateRange: { earliest, latest },
      avgCloudCover: avgCloud,
      platforms,
      score: 0,
      isBestMatch: false,
    };

    group.score = computeGroupScore(group, bbox);
    return group;
  });

  // Sort by score descending
  summaries.sort((a, b) => b.score - a.score);

  // Mark best match
  if (summaries.length > 0) {
    summaries[0].isBestMatch = true;
  }

  if (summaries.length === 0) {
    return (
      <div className="oq-card p-6 text-center">
        <div className="text-2xl mb-2">📦</div>
        <p className="text-xs text-oq-300">
          {datasets.length === 0
            ? 'Draw a bounding box on the map to discover available datasets'
            : 'No datasets found for this area'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold text-oq-200 uppercase tracking-wider">
            Available Data
          </h3>
          <p className="text-[10px] text-oq-300 mt-0.5">
            {datasets.length} observations across {summaries.length} collection{summaries.length > 1 ? 's' : ''}
          </p>
        </div>
        {bbox && (
          <div className="text-[10px] text-oq-300 font-mono">
            [{bbox.west.toFixed(1)}, {bbox.south.toFixed(1)}, {bbox.east.toFixed(1)}, {bbox.north.toFixed(1)}]
          </div>
        )}
      </div>

      {/* Collection cards */}
      <div className="space-y-2">
        {summaries.map((group) => {
          const isSelected = selectedCollection === group.collection;
          return (
            <button
              key={group.collection}
              onClick={() => onSelectCollection(isSelected ? null : group.collection)}
              className={`w-full text-left rounded-xl border transition-all duration-200 ${
                isSelected
                  ? 'border-[var(--color-accent-border)] bg-[var(--color-accent-dim)] shadow-lg shadow-lime/5'
                  : 'border-oq-600/30 bg-oq-800/20 hover:bg-oq-700/40 hover:border-[var(--color-accent-border)]'
              }`}
            >
              <div className="p-3.5">
                {/* Top row: badge + best match */}
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md"
                    style={{ background: `${group.meta.color}18`, color: group.meta.color, border: `1px solid ${group.meta.color}30` }}
                  >
                    {group.meta.icon} {group.meta.label}
                  </span>
                  {group.isBestMatch && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-md bg-lime/15 text-lime border border-lime/30">
                      ★ Best match
                    </span>
                  )}
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 mb-2">
                  <div>
                    <div className="text-[9px] text-oq-300 uppercase">Observations</div>
                    <div className="text-[12px] text-oq-50 font-semibold">{group.observationCount}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-oq-300 uppercase">Resolution</div>
                    <div className="text-[12px] text-oq-50 font-semibold">{group.meta.resolution}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-oq-300 uppercase">Sensor</div>
                    <div className="text-[12px] text-oq-50 font-semibold">{group.meta.sensor}</div>
                  </div>
                </div>

                {/* Date coverage */}
                <div className="flex items-center gap-3 text-[10px] text-oq-300 mb-1.5">
                  <span>📅 {formatDateRange(group.dateRange.earliest, group.dateRange.latest)}</span>
                  {group.avgCloudCover !== null && (
                    <span className={group.avgCloudCover < 15 ? 'text-semantic-success' : group.avgCloudCover < 25 ? 'text-semantic-warning' : 'text-semantic-error'}>
                      ☁ {group.avgCloudCover.toFixed(0)}% avg
                    </span>
                  )}
                </div>

                {/* Platforms */}
                {group.platforms.length > 0 && (
                  <div className="flex items-center gap-1.5 text-[10px] text-oq-300">
                    {group.platforms.map(p => (
                      <span key={p} className="px-1.5 py-0.5 rounded bg-oq-700/30 text-oq-300">{p}</span>
                    ))}
                  </div>
                )}

                {/* Bands (collapsed) */}
                {isSelected && group.meta.bands.length > 0 && (
                  <div className="mt-2.5 pt-2.5 border-t border-oq-600/30">
                    <div className="text-[9px] text-oq-300 uppercase tracking-wider mb-1.5">Available bands</div>
                    <div className="flex flex-wrap gap-1">
                      {group.meta.bands.map(band => (
                        <span key={band} className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-oq-800/50 text-oq-200 border border-oq-600/30">
                          {band}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Score bar */}
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[9px] text-oq-300">Availability score</span>
                    <span className="text-[9px] text-oq-200 font-mono">{group.score}/100</span>
                  </div>
                  <div className="h-1 bg-oq-700/50 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${group.score}%`,
                        background: group.isBestMatch
                          ? 'linear-gradient(90deg, #8B6CF6, #6F58C7)'
                          : 'linear-gradient(90deg, #A3F63F, #7EBF32)',
                      }}
                    />
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
