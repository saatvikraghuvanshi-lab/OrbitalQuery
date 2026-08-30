'use client';

/**
 * AnalysisSummary — Insight-first component for OrbitalQuery results.
 *
 * Hierarchy: Finding → Evidence → Metrics → Methodology
 *
 * Handles missing fields gracefully. Never fabricates statistics.
 * If a value is unavailable or zero, displays "Quantification unavailable"
 * rather than inventing a number.
 */

import { useState } from 'react';
import type { TemporalComparisonResult, SceneInfo } from '@/hooks/useAnalysis';

// ── Types ────────────────────────────────────────────────────────

interface AnalysisSummaryProps {
  result: TemporalComparisonResult;
}

interface StructuredFinding {
  headline: string;
  summary: string;
  primaryMetric: { value: string; label: string; available: boolean };
  location: string;
  timeRange: string;
  confidence: string;
  changeRegions: string[];
  dataSources: Array<{ name: string; role: string }>;
  limitations: string[];
}

// ── Phenomenon display config ─────────────────────────────────

const PHENOMENON_CONFIG: Record<string, { color: string; label: string; indexLabel: string }> = {
  urban_expansion: { color: '#a855f7', label: 'Urban Expansion', indexLabel: 'NDBI' },
  vegetation_change: { color: '#22c55e', label: 'Vegetation Change', indexLabel: 'NDVI' },
  deforestation: { color: '#ef4444', label: 'Deforestation', indexLabel: 'NDVI' },
  flood_impact: { color: '#3b82f6', label: 'Flood Impact', indexLabel: 'NDWI' },
  water_change: { color: '#06b6d4', label: 'Water Body Change', indexLabel: 'NDWI' },
  burn_severity: { color: '#f97316', label: 'Burn Severity', indexLabel: 'NBR' },
  snow_cover: { color: '#e2e8f0', label: 'Snow Cover', indexLabel: 'NDSI' },
  glacier_retreat: { color: '#67e8f9', label: 'Glacier Retreat', indexLabel: 'NDSI' },
  coastal_erosion: { color: '#0ea5e9', label: 'Coastal Erosion', indexLabel: 'NDWI' },
  soil_moisture: { color: '#d97706', label: 'Soil Moisture', indexLabel: 'NDVI' },
  land_cover_change: { color: '#8b5cf6', label: 'Land Cover Change', indexLabel: 'NDVI' },
};

// ── Helpers ──────────────────────────────────────────────────────

function isAvailable(val: any): boolean {
  if (val === null || val === undefined || val === '' || val === 'N/A') return false;
  if (typeof val === 'number' && val === 0) return false;
  return true;
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatDateRange(start: string | undefined, end: string | undefined): string {
  if (!start && !end) return '—';
  if (start && end) return `${formatDate(start)} — ${formatDate(end)}`;
  return formatDate(start || end);
}

// ── Build structured findings from result ────────────────────────

function buildFindings(result: TemporalComparisonResult): StructuredFinding {
  const config = PHENOMENON_CONFIG[result.phenomenon] || PHENOMENON_CONFIG.land_cover_change;
  const metrics = result.metrics || {};
  const explanation = result.explanation || {};
  const sensorInfo = result.sensor_info || {};

  // ── Executive headline ─────────────────────────────────────
  const headline = explanation.title || `${result.aoi_name} — ${config.label}`;

  // ── Summary ────────────────────────────────────────────────
  const summary = explanation.summary || 'Analysis complete.';

  // ── Primary metric ─────────────────────────────────────────
  let primaryMetric = { value: 'Quantification unavailable', label: '', available: false };

  const changedArea = metrics.changed_area_km2;
  const changedPct = metrics.changed_pct;

  if (isAvailable(changedArea) && changedArea > 0) {
    primaryMetric = {
      value: `${typeof changedArea === 'number' ? changedArea.toLocaleString(undefined, { maximumFractionDigits: 2 }) : changedArea}`,
      label: 'km² affected area',
      available: true,
    };
  } else if (isAvailable(changedPct) && changedPct > 0) {
    primaryMetric = {
      value: `${typeof changedPct === 'number' ? changedPct.toFixed(1) : changedPct}%`,
      label: 'of study area shows change',
      available: true,
    };
  } else if (isAvailable(metrics.delta_index)) {
    const delta = metrics.delta_index;
    primaryMetric = {
      value: `${delta > 0 ? '+' : ''}${typeof delta === 'number' ? delta.toFixed(4) : delta}`,
      label: `${config.indexLabel} index change`,
      available: true,
    };
  }

  // ── Location ───────────────────────────────────────────────
  const location = result.aoi_name || '—';

  // ── Time range ─────────────────────────────────────────────
  const timeRange = formatDateRange(
    result.period1?.start || result.scene_t1?.datetime,
    result.period2?.end || result.scene_t2?.datetime,
  );

  // ── Confidence ─────────────────────────────────────────────
  const confidence = explanation.confidence || 'Medium — based on spectral index change detection. Ground truth validation recommended.';

  // ── Change regions ─────────────────────────────────────────
  const changeRegions: string[] = [];
  if (explanation.key_findings && Array.isArray(explanation.key_findings)) {
    changeRegions.push(...explanation.key_findings);
  }
  if (metrics.direction && isAvailable(metrics.direction)) {
    changeRegions.push(`Change direction: ${metrics.direction}`);
  }

  // ── Data sources ───────────────────────────────────────────
  const dataSources: Array<{ name: string; role: string }> = [];
  if (result.scene_t1) {
    dataSources.push({
      name: `${result.scene_t1.collection || 'EO Dataset'}`,
      role: `Baseline — ${formatDate(result.scene_t1.datetime)} (${result.scene_t1.platform || 'Satellite'})`,
    });
  }
  if (result.scene_t2) {
    dataSources.push({
      name: `${result.scene_t2.collection || 'EO Dataset'}`,
      role: `Comparison — ${formatDate(result.scene_t2.datetime)} (${result.scene_t2.platform || 'Satellite'})`,
    });
  }
  if (sensorInfo.primary_sensor) {
    dataSources.push({
      name: sensorInfo.primary_sensor,
      role: `Sensor — ${sensorInfo.resolution_m || 10}m resolution`,
    });
  }

  // ── Limitations ────────────────────────────────────────────
  const limitations = explanation.limitations || [
    'Cloud cover may affect optical imagery quality',
    'Single pair comparison — seasonal effects possible',
    'Resolution limits detection of small-scale changes',
  ];

  return {
    headline,
    summary,
    primaryMetric,
    location,
    timeRange,
    confidence,
    changeRegions,
    dataSources,
    limitations,
  };
}

// ══════════════════════════════════════════════════════════════
// ── COMPONENT ───────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

export default function AnalysisSummary({ result }: AnalysisSummaryProps) {
  const findings = buildFindings(result);
  const config = PHENOMENON_CONFIG[result.phenomenon] || PHENOMENON_CONFIG.land_cover_change;
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="space-y-4">
      {/* ── 1. EXECUTIVE FINDING ─────────────────────────────── */}
      <div className="bg-slate-800/40 rounded-2xl border border-slate-700/30 p-6">
        {/* Phenomenon badge + location */}
        <div className="flex items-center gap-3 mb-3">
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold"
            style={{ background: `${config.color}18`, color: config.color, border: `1px solid ${config.color}30` }}
          >
            {config.label}
          </div>
          <span className="text-[11px] text-slate-400">
            {findings.location} · {findings.timeRange}
          </span>
        </div>

        {/* Headline — the most important thing on the page */}
        <h2 className="text-lg font-bold text-white leading-snug mb-2">
          {findings.headline}
        </h2>

        {/* Summary — one sentence */}
        <p className="text-sm text-slate-300 leading-relaxed" style={{ maxWidth: '80ch' }}>
          {findings.summary}
        </p>

        {/* Primary metric — the most important number */}
        <div className="mt-5 flex items-end gap-6">
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 font-medium">Primary Finding</div>
            {findings.primaryMetric.available ? (
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold" style={{ color: config.color }}>
                  {findings.primaryMetric.value}
                </span>
                <span className="text-sm text-slate-400">{findings.primaryMetric.label}</span>
              </div>
            ) : (
              <div className="text-sm text-slate-500 italic">Quantification unavailable</div>
            )}
          </div>

          {/* Direction indicator */}
          {isAvailable(result.metrics?.direction) && (
            <div className="pb-1">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 font-medium">Direction</div>
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block w-0 h-0 border-l-[5px] border-r-[5px] border-b-[8px] border-l-transparent border-r-transparent"
                  style={{
                    borderBottomColor: config.color,
                    transform: ['loss', 'degradation', 'retreat', 'erosion', 'shrinking', 'burned', 'drier'].includes(result.metrics.direction) ? 'rotate(180deg)' : 'none',
                  }}
                />
                <span className="text-sm text-slate-200 font-medium capitalize">{result.metrics.direction}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 2. CONFIDENCE & DATA SOURCES (collapsible) ──────── */}
      <details className="bg-slate-800/30 rounded-xl border border-slate-700/30 overflow-hidden group">
        <summary className="px-5 py-3.5 text-xs font-semibold text-slate-200 uppercase tracking-wider cursor-pointer hover:text-white transition-colors flex items-center justify-between">
          <span className="flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Confidence & Data Sources
          </span>
          <svg className="w-4 h-4 text-slate-500 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div className="px-5 pb-4 space-y-4">
          {/* Confidence */}
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-1.5">Confidence Assessment</div>
            <p className="text-xs text-slate-300 leading-relaxed">{findings.confidence}</p>
          </div>

          {/* Data Sources */}
          {findings.dataSources.length > 0 && (
            <div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-2">Data Sources</div>
              <div className="space-y-1.5">
                {findings.dataSources.map((src, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-600 mt-1.5 flex-shrink-0" />
                    <div>
                      <span className="text-slate-200 font-medium">{src.name}</span>
                      <span className="text-slate-500 ml-1.5">{src.role}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Limitations */}
          {findings.limitations.length > 0 && (
            <div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-2">Limitations</div>
              <div className="flex flex-wrap gap-1.5">
                {findings.limitations.map((lim, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-[10px] text-slate-400 bg-slate-700/30 px-2 py-1 rounded-md border border-slate-600/20">
                    <span className="text-amber-400/70">⚠</span> {lim}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </details>

      {/* ── 3. CHANGE REGIONS (if available) ────────────────── */}
      {findings.changeRegions.length > 0 && (
        <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-4">
          <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-2">Key Findings</div>
          <div className="space-y-1.5">
            {findings.changeRegions.map((finding, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-slate-300">
                <span className="mt-0.5 flex-shrink-0" style={{ color: config.color }}>▸</span>
                <span>{finding}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
