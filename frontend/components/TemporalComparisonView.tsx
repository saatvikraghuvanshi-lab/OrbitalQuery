'use client';

import { useEffect, useRef } from 'react';
import type { TemporalComparisonResult } from '@/hooks/useAnalysis';

interface Props {
  result: TemporalComparisonResult;
}

// ── Phenomenon display config ─────────────────────────────────

const PHENOMENON_CONFIG: Record<string, { emoji: string; color: string; label: string }> = {
  urban_expansion: { emoji: '🏙️', color: '#a855f7', label: 'Urban Expansion' },
  vegetation_change: { emoji: '🌳', color: '#22c55e', label: 'Vegetation Change' },
  deforestation: { emoji: '🪓', color: '#ef4444', label: 'Deforestation' },
  flood_impact: { emoji: '🌊', color: '#3b82f6', label: 'Flood Impact' },
  water_change: { emoji: '💧', color: '#06b6d4', label: 'Water Body Change' },
  burn_severity: { emoji: '🔥', color: '#f97316', label: 'Burn Severity' },
  snow_cover: { emoji: '❄️', color: '#e2e8f0', label: 'Snow Cover' },
  glacier_retreat: { emoji: '🏔️', color: '#67e8f9', label: 'Glacier Retreat' },
  coastal_erosion: { emoji: '🌊', color: '#0ea5e9', label: 'Coastal Erosion' },
  soil_moisture: { emoji: '🌾', color: '#d97706', label: 'Soil Moisture' },
  land_cover_change: { emoji: '🗺️', color: '#8b5cf6', label: 'Land Cover Change' },
};

// ── Sub-components ────────────────────────────────────────────

function MetricCard({ label, value, unit, color, subtitle }: {
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
  subtitle?: string;
}) {
  return (
    <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/30">
      <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-1">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-bold" style={{ color: color || '#e2e8f0' }}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {unit && <span className="text-xs text-slate-300">{unit}</span>}
      </div>        {subtitle && <div className="text-[10px] text-slate-400 mt-1">{subtitle}</div>}
    </div>
  );
}

// ── Zoomable Scene Map ─────────────────────────────────────────

function ZoomableSceneMap({ bbox, thumbnailUrl, period, platform, cloudCover }: {
  bbox?: number[];
  thumbnailUrl?: string;
  period: string;
  platform?: string;
  cloudCover?: number | null;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current || !bbox || bbox.length !== 4) return;
    let cancelled = false;

    import('leaflet').then((L) => {
      if (cancelled || !mapRef.current) return;
      const [west, south, east, north] = bbox;
      const center: [number, number] = [(south + north) / 2, (west + east) / 2];

      const map = L.map(mapRef.current, {
        center,
        zoom: 10,
        zoomControl: false,
        attributionControl: false,
      });

      // Dark basemap
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map);

      // Satellite imagery overlay
      if (thumbnailUrl) {
        L.imageOverlay(thumbnailUrl, [[south, west], [north, east]], {
          opacity: 0.85,
          interactive: false,
        }).addTo(map);
      }

      // Fit to bbox — no padding so imagery fills the entire map
      map.fitBounds([[south, west], [north, east]], { padding: [0, 0], maxZoom: 14 });
      mapInstanceRef.current = map;
    });

    return () => {
      cancelled = true;
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
    };
  }, [bbox, thumbnailUrl]);

  if (!bbox || bbox.length !== 4) {
    return (
      <div
        className="h-52 relative overflow-hidden"
        style={{
          background: period === 'period1'
            ? 'linear-gradient(135deg, #1e3a5f 0%, #2d5a3d 40%, #4a7c59 70%, #8fbc8f 100%)'
            : 'linear-gradient(135deg, #3d2b1f 0%, #6b4423 30%, #8b6914 60%, #c4a35a 100%)',
        }}
      />
    );
  }

  return (
    <div className="h-52 relative overflow-hidden">
      <div ref={mapRef} className="absolute inset-0" style={{ width: '100%', height: '100%' }} />
      {/* Period badge */}
      <div className="absolute top-3 left-3 z-[1000] px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider"
        style={{
          background: period === 'period1' ? 'rgba(59,130,246,0.8)' : 'rgba(249,115,22,0.8)',
          color: 'white',
        }}
      >
        {period === 'period1' ? 'BEFORE' : 'AFTER'}
      </div>
      {/* Zoom hint */}
      <div className="absolute top-3 right-3 z-[1000] px-2 py-0.5 rounded text-[9px] font-medium bg-black/50 text-white/70 backdrop-blur-sm">
        Scroll to zoom · Drag to pan
      </div>
      {/* Satellite info */}
      {platform && (
        <div className="absolute bottom-3 left-3 z-[1000] flex items-center gap-2">
          <div className="px-2 py-0.5 rounded text-[9px] font-medium bg-black/50 text-white/80 backdrop-blur-sm">
            🛰️ {platform}
          </div>
          {cloudCover !== null && cloudCover !== undefined && (
            <div className="px-2 py-0.5 rounded text-[9px] font-medium bg-black/50 text-white/80 backdrop-blur-sm">
              {cloudCover.toFixed(1)}% clouds
            </div>
          )}
        </div>
      )}
      {/* Custom zoom controls — bottom right */}
      <div className="absolute bottom-3 right-3 z-[1000] flex flex-col rounded-lg overflow-hidden border border-white/10 shadow-lg">
        <button
          onClick={() => mapInstanceRef.current?.zoomIn()}
          className="w-7 h-7 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm font-bold bg-black/40 backdrop-blur-sm"
        >+</button>
        <div className="h-px bg-white/10" />
        <button
          onClick={() => mapInstanceRef.current?.zoomOut()}
          className="w-7 h-7 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm font-bold bg-black/40 backdrop-blur-sm"
        >−</button>
      </div>
    </div>
  );
}

function SceneCard({ scene, period, indexStats, thumbnailUrl }: {
  scene: { item_id: string; datetime: string; cloud_cover: number | null; platform: string; collection: string; bbox?: number[] } | null;
  period: string;
  indexStats: { index_name: string; stats: Record<string, number> } | null;
  thumbnailUrl?: string;
}) {
  if (!scene) {
    return (
      <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-6 flex items-center justify-center min-h-[200px]">
        <div className="text-center text-slate-400">
          <div className="text-2xl mb-2">🛰️</div>
          <div className="text-xs">No suitable scene found</div>
        </div>
      </div>
    );
  }

  const dateStr = scene.datetime ? new Date(scene.datetime).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  }) : 'Unknown';

  return (
    <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 overflow-hidden">
      {/* Zoomable satellite imagery map */}
      <ZoomableSceneMap bbox={scene.bbox} thumbnailUrl={thumbnailUrl} period={period} platform={scene.platform} cloudCover={scene.cloud_cover} />

      {/* Scene info */}
      <div className="p-4">
        <div className="text-sm font-medium text-slate-200 mb-1">{dateStr}</div>
        <div className="text-[10px] text-slate-400 font-mono truncate">{scene.item_id}</div>
        <div className="text-[10px] text-slate-400 mt-1">{scene.collection}</div>

        {indexStats && (
          <div className="mt-3 pt-3 border-t border-slate-700/30">
            <div className="text-[10px] text-slate-300 font-medium mb-1.5">
              {indexStats.index_name} Statistics
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {Object.entries(indexStats.stats).slice(0, 6).map(([key, val]) => (
                <div key={key} className="flex justify-between text-[10px]">
                  <span className="text-slate-400">{key}</span>
                  <span className="text-slate-300 font-mono">{typeof val === 'number' ? val.toFixed(4) : val}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProcessingTimeline({ steps }: { steps: Array<{ step: string; detail: string }> }) {
  return (
    <div className="space-y-1.5">
      {steps.map((step, i) => (
        <div key={i} className="flex items-start gap-2 text-[10px]">
          <div className="w-4 h-4 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center flex-shrink-0 mt-0.5">
            ✓
          </div>
          <div>
            <span className="text-slate-300 font-medium">{step.step.replace(/_/g, ' ')}</span>
            <span className="text-slate-600 ml-1.5">{step.detail}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Study Area Map ───────────────────────────────────────────

function StudyAreaMap({ bbox, aoiName }: { bbox: number[]; aoiName: string }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    let cancelled = false;

    import('leaflet').then((L) => {
      if (cancelled || !mapRef.current) return;

      const [west, south, east, north] = bbox;
      const center: [number, number] = [(south + north) / 2, (west + east) / 2];

      const map = L.map(mapRef.current, {
        center,
        zoom: 5,
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
      }).addTo(map);

      L.rectangle([[south, west], [north, east]], {
        color: '#22d3ee',
        weight: 2,
        fillColor: '#22d3ee',
        fillOpacity: 0.08,
        dashArray: '8 4',
      }).addTo(map);

      map.fitBounds([[south, west], [north, east]], { padding: [30, 30] });
      mapInstanceRef.current = map;
    });

    return () => {
      cancelled = true;
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
    };
  }, [bbox]);

  return (
    <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 overflow-hidden">
      <div className="px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          <span className="text-[11px] font-medium text-slate-300">Study Area</span>
        </div>
        <span className="text-[10px] text-slate-400 font-mono">
          {aoiName} · [{bbox.map(b => b.toFixed(2)).join(', ')}]
        </span>
      </div>
      <div ref={mapRef} style={{ height: '180px', width: '100%' }} />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────

export default function TemporalComparisonView({ result }: Props) {
  const config = PHENOMENON_CONFIG[result.phenomenon] || PHENOMENON_CONFIG.land_cover_change;
  const metrics = result.metrics || {};
  const explanation = result.explanation || {};
  const sensorInfo = result.sensor_info || {};

  // Determine which metric cards to show based on phenomenon
  const getMetricCards = () => {
    const cards: Array<{ label: string; value: string | number; unit?: string; color?: string; subtitle?: string }> = [];

    // Always show area and change %
    cards.push({
      label: 'Total Study Area',
      value: metrics.total_area_km2 || 0,
      unit: 'km²',
      color: '#94a3b8',
    });

    cards.push({
      label: 'Changed Area',
      value: metrics.changed_area_km2 || 0,
      unit: 'km²',
      color: config.color,
      subtitle: `${metrics.changed_pct || 0}% of total area`,
    });

    // Phenomenon-specific metrics
    if (result.phenomenon === 'urban_expansion') {
      cards.push({
        label: 'Urban Expansion',
        value: metrics.urban_expansion_km2 || 0,
        unit: 'km²',
        color: '#a855f7',
        subtitle: `+${metrics.urban_expansion_pct || 0}% growth`,
      });
      cards.push({
        label: 'NDBI Change',
        value: metrics.ndbi_change || 0,
        unit: 'units',
        color: '#c084fc',
        subtitle: metrics.direction === 'expansion' ? 'Expanding' : 'Stable',
      });
    } else if (result.phenomenon === 'vegetation_change' || result.phenomenon === 'deforestation') {
      cards.push({
        label: 'Vegetation Loss',
        value: metrics.vegetation_loss_km2 || 0,
        unit: 'km²',
        color: '#ef4444',
      });
      cards.push({
        label: 'NDVI Change',
        value: metrics.ndvi_change || 0,
        unit: 'units',
        color: metrics.ndvi_change > 0 ? '#22c55e' : '#ef4444',
        subtitle: metrics.impact_statement || '',
      });
    } else if (result.phenomenon === 'flood_impact') {
      cards.push({
        label: 'Flood Extent',
        value: metrics.flood_extent_km2 || 0,
        unit: 'km²',
        color: '#3b82f6',
        subtitle: `${metrics.flood_pct || 0}% of area`,
      });
      cards.push({
        label: 'Flood Severity',
        value: metrics.severity || 'N/A',
        color: metrics.severity === 'HIGH' ? '#ef4444' : '#f59e0b',
      });
    } else if (result.phenomenon === 'water_change') {
      cards.push({
        label: 'Water Area Change',
        value: metrics.water_area_change_km2 || 0,
        unit: 'km²',
        color: '#06b6d4',
        subtitle: metrics.water_body_status || '',
      });
    } else if (result.phenomenon === 'burn_severity') {
      cards.push({
        label: 'Burned Area',
        value: metrics.burned_area_km2 || 0,
        unit: 'km²',
        color: '#f97316',
      });
      cards.push({
        label: 'Burn Severity',
        value: metrics.burn_severity || 'N/A',
        color: metrics.burn_severity === 'HIGH' ? '#ef4444' : '#f59e0b',
      });
    } else if (result.phenomenon === 'snow_cover' || result.phenomenon === 'glacier_retreat') {
      cards.push({
        label: 'Snow/Ice Loss',
        value: metrics.snow_ice_loss_km2 || 0,
        unit: 'km²',
        color: '#67e8f9',
      });
      cards.push({
        label: 'NDSI Change',
        value: metrics.ndsi_change || 0,
        unit: 'units',
        color: '#06b6d4',
        subtitle: metrics.retreat_status || '',
      });
    } else if (result.phenomenon === 'coastal_erosion') {
      cards.push({
        label: 'Shoreline Change',
        value: metrics.shoreline_change_km2 || 0,
        unit: 'km²',
        color: '#0ea5e9',
        subtitle: metrics.erosion_status || '',
      });
    } else {
      cards.push({
        label: 'Index Change',
        value: metrics.delta_index || 0,
        unit: 'units',
        color: '#8b5cf6',
        subtitle: `Direction: ${metrics.direction || 'N/A'}`,
      });
    }

    return cards;
  };

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-medium mb-3"
          style={{ background: `${config.color}20`, color: config.color, border: `1px solid ${config.color}30` }}>
          {config.emoji} {config.label}
        </div>
        <h2 className="text-xl font-bold text-white mb-1">
          {explanation.title || `${result.aoi_name} — ${config.label}`}
        </h2>
        <p className="text-xs text-slate-200">
          {result.period1?.start} → {result.period2?.end}
          {' · '}
          {sensorInfo.primary_sensor || 'Sentinel-2'}
          {' · '}
          {sensorInfo.resolution_m || 10}m resolution
        </p>
      </div>

      {/* ── Study Area Map ─────────────────────────────────────── */}
      {result.aoi_bbox && result.aoi_bbox.length === 4 && (
        <StudyAreaMap bbox={result.aoi_bbox} aoiName={result.aoi_name} />
      )}

      {/* ── Before / After Comparison ──────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SceneCard
          scene={result.scene_t1}
          period="period1"
          indexStats={result.index_t1}
          thumbnailUrl={result.imagery?.period1?.thumbnail}
        />
        <SceneCard
          scene={result.scene_t2}
          period="period2"
          indexStats={result.index_t2}
          thumbnailUrl={result.imagery?.period2?.thumbnail}
        />
      </div>

      {/* ── Change Detection Summary ───────────────────────────── */}
      {result.change_detection && (
        <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-5">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            Change Detection
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <div className="text-[10px] text-slate-400 uppercase">Algorithm</div>
              <div className="text-sm text-slate-200">{result.change_detection.algorithm || 'difference_threshold'}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase">Index Used</div>
              <div className="text-sm text-slate-200">{result.change_detection.index_name || metrics.index_name || 'N/A'}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase">Changed Pixels</div>
              <div className="text-sm text-slate-200">{(result.change_detection.changed_pixels || 0).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase">Change Regions</div>
              <div className="text-sm text-slate-200">{result.change_detection.num_regions || 0}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Key Metrics ────────────────────────────────────────── */}
      <div>          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: config.color }} />
            Key Metrics
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {getMetricCards().map((card, i) => (
            <MetricCard key={i} {...card} />
          ))}
        </div>
      </div>

      {/* ── Explanation ────────────────────────────────────────── */}
      {explanation.summary && (
        <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-5">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            Analysis Summary
          </h3>
          <p className="text-sm text-slate-200 leading-relaxed mb-4">{explanation.summary}</p>

          {explanation.methodology && (
            <div className="mb-4">
              <h4 className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-1.5">Methodology</h4>
              <p className="text-xs text-slate-300 leading-relaxed">{explanation.methodology}</p>
            </div>
          )}

          {explanation.key_findings && explanation.key_findings.length > 0 && (
            <div className="mb-4">
              <h4 className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-2">Key Findings</h4>
              <div className="space-y-1.5">
                {explanation.key_findings.map((finding, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-slate-300">
                    <span className="text-green-400 mt-0.5">▸</span>
                    <span>{finding}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Technical details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-700/30">
            <div>
              <h4 className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-1.5">Sensors & Indices</h4>
              <div className="space-y-1 text-xs text-slate-300">
                <div>Primary: <span className="text-slate-200">{sensorInfo.primary_sensor || 'Sentinel-2'}</span></div>
                <div>Index: <span className="text-slate-200">{sensorInfo.index_used || 'NDVI'}</span></div>
                <div>Formula: <span className="text-slate-200 font-mono text-[10px]">{sensorInfo.index_formula || ''}</span></div>
                <div>Resolution: <span className="text-slate-200">{sensorInfo.resolution_m || 10}m</span></div>
              </div>
            </div>
            <div>
              <h4 className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-1.5">Confidence & Limitations</h4>
              <p className="text-xs text-slate-300 mb-2">{explanation.confidence || 'Medium confidence'}</p>
              {explanation.limitations && explanation.limitations.length > 0 && (
                <div className="space-y-1">
                  {explanation.limitations.slice(0, 2).map((lim, i) => (
                    <div key={i} className="text-[10px] text-slate-400">⚠ {lim}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Processing Pipeline ────────────────────────────────── */}
      {result.processing_steps && result.processing_steps.length > 0 && (
        <details className="bg-slate-800/20 rounded-xl border border-slate-700/20 overflow-hidden">
          <summary className="px-5 py-3 text-xs font-semibold text-slate-200 uppercase tracking-wider cursor-pointer hover:text-slate-200 transition-colors">
            Processing Pipeline ({result.processing_steps.length} steps)
          </summary>
          <div className="px-5 pb-4">
            <ProcessingTimeline steps={result.processing_steps} />
          </div>
        </details>
      )}
    </div>
  );
}
