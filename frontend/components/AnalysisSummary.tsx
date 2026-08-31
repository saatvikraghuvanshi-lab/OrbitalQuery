'use client';

/**
 * AnalysisSummary — Insight-first component for OrbitalQuery results.
 *
 * Hierarchy: Finding → Evidence → Metrics → Methodology
 * Handles missing fields gracefully. Never fabricates statistics.
 */

import { useState } from 'react';
import type { TemporalComparisonResult } from '@/hooks/useAnalysis';

interface AnalysisSummaryProps {
  result: TemporalComparisonResult;
}

const PHENOMENON_CONFIG: Record<string, { color: string; label: string; indexLabel: string }> = {
  urban_expansion: { color: '#8B6CF6', label: 'Urban Expansion', indexLabel: 'NDBI' },
  vegetation_change: { color: '#22C55E', label: 'Vegetation Change', indexLabel: 'NDVI' },
  deforestation: { color: '#EF4444', label: 'Deforestation', indexLabel: 'NDVI' },
  flood_impact: { color: '#60A5FA', label: 'Flood Impact', indexLabel: 'NDWI' },
  water_change: { color: '#06B6D4', label: 'Water Body Change', indexLabel: 'NDWI' },
  burn_severity: { color: '#F97316', label: 'Burn Severity', indexLabel: 'NBR' },
  snow_cover: { color: '#CBD5E1', label: 'Snow Cover', indexLabel: 'NDSI' },
  glacier_retreat: { color: '#67E8F9', label: 'Glacier Retreat', indexLabel: 'NDSI' },
  coastal_erosion: { color: '#0EA5E9', label: 'Coastal Erosion', indexLabel: 'NDWI' },
  soil_moisture: { color: '#D97706', label: 'Soil Moisture', indexLabel: 'NDVI' },
  land_cover_change: { color: '#8B6CF6', label: 'Land Cover Change', indexLabel: 'NDVI' },
};

function isAvailable(val: any): boolean {
  if (val === null || val === undefined || val === '' || val === 'N/A') return false;
  if (typeof val === 'number' && val === 0) return false;
  return true;
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return dateStr; }
}

export default function AnalysisSummary({ result }: AnalysisSummaryProps) {
  const config = PHENOMENON_CONFIG[result.phenomenon] || PHENOMENON_CONFIG.land_cover_change;
  const metrics = result.metrics || {};
  const explanation = result.explanation || {};
  const sensorInfo = result.sensor_info || {};
  const [showDetails, setShowDetails] = useState(false);

  // Build primary metric
  const changedArea = metrics.changed_area_km2;
  const changedPct = metrics.changed_pct;
  const deltaIndex = metrics.delta_index;

  let primaryValue = 'Quantification unavailable';
  let primaryLabel = '';
  let primaryAvailable = false;

  if (isAvailable(changedArea) && changedArea > 0) {
    primaryValue = `~${typeof changedArea === 'number' ? changedArea.toLocaleString(undefined, { maximumFractionDigits: 2 }) : changedArea} km²`;
    primaryLabel = 'estimated change area';
    primaryAvailable = true;
  } else if (isAvailable(changedPct) && changedPct > 0) {
    primaryValue = `~${typeof changedPct === 'number' ? changedPct.toFixed(1) : changedPct}%`;
    primaryLabel = 'of study area';
    primaryAvailable = true;
  } else if (isAvailable(deltaIndex)) {
    primaryValue = `${deltaIndex > 0 ? '+' : ''}${typeof deltaIndex === 'number' ? deltaIndex.toFixed(4) : deltaIndex}`;
    primaryLabel = `${config.indexLabel} change`;
    primaryAvailable = true;
  }

  const location = result.aoi_name || '—';
  const timeRange = result.period1?.start && result.period2?.end
    ? `${formatDate(result.period1.start)} → ${formatDate(result.period2.end)}`
    : '—';

  const confidence = explanation.confidence || 'Preliminary analysis based on available data.';

  return (
    <div className="space-y-3">
      {/* Executive finding card */}
      <div className="oq-card p-5">
        {/* Top row: phenomenon badge + location */}
        <div className="flex items-center gap-2.5 mb-3">
          <span
            className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
            style={{ background: `${config.color}15`, color: config.color, border: `1px solid ${config.color}25` }}
          >
            {config.label}
          </span>
          <span className="text-[11px] text-oq-300 font-mono">{location}</span>
          <span className="text-oq-400">·</span>
          <span className="text-[11px] text-oq-300">{timeRange}</span>
        </div>

        {/* Headline */}
        <h2 className="text-display text-oq-50 leading-snug mb-1.5">
          {explanation.title || `${location} — ${config.label}`}
        </h2>
        <p className="text-body-sm text-oq-200 leading-relaxed" style={{ maxWidth: '75ch' }}>
          {explanation.summary || 'Analysis complete.'}
        </p>

        {/* Primary metrics row */}
        <div className="mt-4 flex items-end gap-8 flex-wrap">
          {primaryAvailable && (
            <div>
              <div className="text-[9px] text-oq-300 uppercase tracking-wider font-medium mb-0.5">Primary Finding</div>
              <div className="text-data text-oq-50" style={{ color: config.color }}>{primaryValue}</div>
              <div className="text-[10px] text-oq-300 mt-0.5">{primaryLabel}</div>
            </div>
          )}
          {isAvailable(metrics.direction) && (
            <div>
              <div className="text-[9px] text-oq-300 uppercase tracking-wider font-medium mb-0.5">Direction</div>
              <div className="text-data-sm text-oq-100 capitalize">{metrics.direction}</div>
            </div>
          )}
          {isAvailable(deltaIndex) && (
            <div>
              <div className="text-[9px] text-oq-300 uppercase tracking-wider font-medium mb-0.5">{config.indexLabel} Change</div>
              <div className="text-data-sm" style={{ color: config.color }}>
                {deltaIndex > 0 ? '+' : ''}{typeof deltaIndex === 'number' ? deltaIndex.toFixed(4) : deltaIndex}
              </div>
            </div>
          )}
          {metrics.raster_derived !== undefined && (
            <div>
              <div className="text-[9px] text-oq-300 uppercase tracking-wider font-medium mb-0.5">Data Quality</div>
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${metrics.raster_derived ? 'bg-lime' : 'bg-amber-400'}`} />
                <span className="text-[11px] text-oq-200">
                  {metrics.raster_derived ? 'Raster-derived' : 'Metadata-estimated'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Key findings */}
      {explanation.key_findings && Array.isArray(explanation.key_findings) && explanation.key_findings.length > 0 && (
        <div className="oq-card p-4">
          <div className="text-[9px] text-oq-300 uppercase tracking-wider font-medium mb-2">Key Findings</div>
          <div className="space-y-1">
            {explanation.key_findings.map((finding: string, i: number) => (
              <div key={i} className="flex items-start gap-2 text-[12px] text-oq-200">
                <span className="mt-0.5 flex-shrink-0" style={{ color: config.color }}>▸</span>
                <span>{finding}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confidence & Sources (collapsible) */}
      <details className="oq-card overflow-hidden group">
        <summary className="px-4 py-2.5 text-[10px] font-semibold text-oq-200 uppercase tracking-wider cursor-pointer hover:text-oq-50 transition-colors flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <svg className="w-3 h-3 text-oq-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Confidence & Data Sources
          </span>
          <svg className="w-3.5 h-3.5 text-oq-300 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div className="px-4 pb-3 space-y-3">
          <p className="text-[11px] text-oq-200 leading-relaxed">{confidence}</p>
          {result.scene_t1 && result.scene_t2 && (
            <div className="grid grid-cols-2 gap-3">
              <div className="p-2.5 rounded-md bg-oq-800/50 border border-oq-700/30">
                <div className="text-[9px] text-oq-300 uppercase mb-1">Baseline</div>
                <div className="text-[11px] text-oq-100 font-medium">{result.scene_t1.collection}</div>
                <div className="text-[10px] text-oq-300">{formatDate(result.scene_t1.datetime)} · {result.scene_t1.platform || 'Satellite'}</div>
              </div>
              <div className="p-2.5 rounded-md bg-oq-800/50 border border-oq-700/30">
                <div className="text-[9px] text-oq-300 uppercase mb-1">Comparison</div>
                <div className="text-[11px] text-oq-100 font-medium">{result.scene_t2.collection}</div>
                <div className="text-[10px] text-oq-300">{formatDate(result.scene_t2.datetime)} · {result.scene_t2.platform || 'Satellite'}</div>
              </div>
            </div>
          )}
          {explanation.limitations && explanation.limitations.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {explanation.limitations.map((lim: string, i: number) => (
                <span key={i} className="text-[9px] text-oq-300 bg-oq-800/50 px-2 py-0.5 rounded border border-oq-700/20">
                  {lim}
                </span>
              ))}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
