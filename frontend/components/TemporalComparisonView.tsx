'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { TemporalComparisonResult, SceneInfo, IndexInfo } from '@/hooks/useAnalysis';

interface Props {
  result: TemporalComparisonResult;
}

// ── Phenomenon display config ─────────────────────────────────
const PHENOMENON_CONFIG: Record<string, { emoji: string; color: string; label: string; indexLabel: string }> = {
  urban_expansion: { emoji: '🏙️', color: '#a855f7', label: 'Urban Expansion', indexLabel: 'NDBI' },
  vegetation_change: { emoji: '🌳', color: '#22c55e', label: 'Vegetation Change', indexLabel: 'NDVI' },
  deforestation: { emoji: '🪓', color: '#ef4444', label: 'Deforestation', indexLabel: 'NDVI' },
  flood_impact: { emoji: '🌊', color: '#3b82f6', label: 'Flood Impact', indexLabel: 'NDWI' },
  water_change: { emoji: '💧', color: '#06b6d4', label: 'Water Body Change', indexLabel: 'NDWI' },
  burn_severity: { emoji: '🔥', color: '#f97316', label: 'Burn Severity', indexLabel: 'NBR' },
  snow_cover: { emoji: '❄️', color: '#e2e8f0', label: 'Snow Cover', indexLabel: 'NDSI' },
  glacier_retreat: { emoji: '🏔️', color: '#67e8f9', label: 'Glacier Retreat', indexLabel: 'NDSI' },
  coastal_erosion: { emoji: '🌊', color: '#0ea5e9', label: 'Coastal Erosion', indexLabel: 'NDWI' },
  soil_moisture: { emoji: '🌾', color: '#d97706', label: 'Soil Moisture', indexLabel: 'NDVI' },
  land_cover_change: { emoji: '🗺️', color: '#8b5cf6', label: 'Land Cover Change', indexLabel: 'NDVI' },
};

type ViewMode = 'side-by-side' | 'swipe' | 'difference';

const TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
const SATELLITE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

// ── Synchronized Dual Map ────────────────────────────────────
function SynchronizedDualMap({
  bbox, sceneT1, sceneT2, thumbnailT1, thumbnailT2,
}: {
  bbox: number[];
  sceneT1: SceneInfo | null;
  sceneT2: SceneInfo | null;
  thumbnailT1?: string;
  thumbnailT2?: string;
}) {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const leftMapRef = useRef<any>(null);
  const rightMapRef = useRef<any>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    if (!leftRef.current || !rightRef.current || leftMapRef.current) return;
    let cancelled = false;

    Promise.all([
      import('leaflet'),
      import('react-leaflet'),
    ]).then(([L, _]) => {
      if (cancelled || !leftRef.current || !rightRef.current) return;

      const [west, south, east, north] = bbox;
      const center: [number, number] = [(south + north) / 2, (west + east) / 2];

      // Create left map
      const leftMap = L.map(leftRef.current, {
        center, zoom: 10, zoomControl: false, attributionControl: false,
      });
      L.tileLayer(TILE_URL, { maxZoom: 19 }).addTo(leftMap);

      // Create right map
      const rightMap = L.map(rightRef.current, {
        center, zoom: 10, zoomControl: false, attributionControl: false,
      });
      L.tileLayer(TILE_URL, { maxZoom: 19 }).addTo(rightMap);

      // Add imagery overlays
      if (thumbnailT1) {
        L.imageOverlay(thumbnailT1, [[south, west], [north, east]], { opacity: 0.85, interactive: false }).addTo(leftMap);
      }
      if (thumbnailT2) {
        L.imageOverlay(thumbnailT2, [[south, west], [north, east]], { opacity: 0.85, interactive: false }).addTo(rightMap);
      }

      // Add AOI rectangle
      const aoiBounds: L.LatLngBoundsExpression = [[south, west], [north, east]];
      L.rectangle(aoiBounds, { color: '#22d3ee', weight: 1.5, fillColor: '#22d3ee', fillOpacity: 0.05, dashArray: '6 3' }).addTo(leftMap);
      L.rectangle(aoiBounds, { color: '#22d3ee', weight: 1.5, fillColor: '#22d3ee', fillOpacity: 0.05, dashArray: '6 3' }).addTo(rightMap);

      // Fit both maps to AOI
      leftMap.fitBounds(aoiBounds, { padding: [40, 40], maxZoom: 14 });
      rightMap.fitBounds(aoiBounds, { padding: [40, 40], maxZoom: 14 });

      // Synchronize: left → right
      leftMap.on('move', () => {
        if (syncingRef.current) return;
        syncingRef.current = true;
        rightMap.setView(leftMap.getCenter(), leftMap.getZoom(), { animate: false });
        syncingRef.current = false;
      });

      // Synchronize: right → left
      rightMap.on('move', () => {
        if (syncingRef.current) return;
        syncingRef.current = true;
        leftMap.setView(rightMap.getCenter(), rightMap.getZoom(), { animate: false });
        syncingRef.current = false;
      });

      leftMapRef.current = leftMap;
      rightMapRef.current = rightMap;
    });

    return () => {
      cancelled = true;
      leftMapRef.current?.remove();
      rightMapRef.current?.remove();
      leftMapRef.current = null;
      rightMapRef.current = null;
    };
  }, [bbox, thumbnailT1, thumbnailT2]);

  return (
    <div className="grid grid-cols-2 gap-1" style={{ height: 'calc(70vh - 100px)', minHeight: '450px' }}>
      <div className="relative rounded-l-xl overflow-hidden border border-slate-700/30">
        <div ref={leftRef} className="absolute inset-0" />
        {/* Period badge */}
        <div className="absolute top-3 left-3 z-[1000] px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-blue-500/80 text-white backdrop-blur-sm">
          Period 1 — Before
        </div>
        {/* Zoom controls */}
        <div className="absolute bottom-3 right-3 z-[1000] flex flex-col rounded-lg overflow-hidden border border-white/10 shadow-lg">
          <button onClick={() => leftMapRef.current?.zoomIn()} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm font-bold bg-black/50 backdrop-blur-sm">+</button>
          <div className="h-px bg-white/10" />
          <button onClick={() => leftMapRef.current?.zoomOut()} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm font-bold bg-black/50 backdrop-blur-sm">−</button>
        </div>
      </div>
      <div className="relative rounded-r-xl overflow-hidden border border-slate-700/30">
        <div ref={rightRef} className="absolute inset-0" />
        {/* Period badge */}
        <div className="absolute top-3 left-3 z-[1000] px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-orange-500/80 text-white backdrop-blur-sm">
          Period 2 — After
        </div>
        {/* Zoom controls */}
        <div className="absolute bottom-3 right-3 z-[1000] flex flex-col rounded-lg overflow-hidden border border-white/10 shadow-lg">
          <button onClick={() => rightMapRef.current?.zoomIn()} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm font-bold bg-black/50 backdrop-blur-sm">+</button>
          <div className="h-px bg-white/10" />
          <button onClick={() => rightMapRef.current?.zoomOut()} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm font-bold bg-black/50 backdrop-blur-sm">−</button>
        </div>
      </div>
    </div>
  );
}

// ── Swipe Map ────────────────────────────────────────────────
function SwipeMap({
  bbox, thumbnailT1, thumbnailT2,
}: {
  bbox: number[];
  thumbnailT1?: string;
  thumbnailT2?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [splitPos, setSplitPos] = useState(50);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    import('leaflet').then((L) => {
      if (cancelled || !containerRef.current) return;

      const [west, south, east, north] = bbox;
      const center: [number, number] = [(south + north) / 2, (west + east) / 2];

      const map = L.map(containerRef.current, {
        center, zoom: 10, zoomControl: false, attributionControl: false,
      });
      L.tileLayer(TILE_URL, { maxZoom: 19 }).addTo(map);

      // Period 1 imagery (left side via clip)
      if (thumbnailT1) {
        const overlay1 = L.imageOverlay(thumbnailT1, [[south, west], [north, east]], { opacity: 0.85, interactive: false }).addTo(map);
        (overlay1 as any)._clipSide = 'left';
      }
      // Period 2 imagery (right side via clip)
      if (thumbnailT2) {
        const overlay2 = L.imageOverlay(thumbnailT2, [[south, west], [north, east]], { opacity: 0.85, interactive: false }).addTo(map);
        (overlay2 as any)._clipSide = 'right';
      }

      map.fitBounds([[south, west], [north, east]], { padding: [40, 40], maxZoom: 14 });
      mapRef.current = map;
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [bbox, thumbnailT1, thumbnailT2]);

  const handleMouseDown = useCallback(() => { draggingRef.current = true; }, []);
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setSplitPos(Math.max(5, Math.min(95, pct)));
  }, []);
  const handleMouseUp = useCallback(() => { draggingRef.current = false; }, []);

  return (
    <div
      className="relative rounded-xl overflow-hidden border border-slate-700/30 select-none"
      style={{ height: 'calc(70vh - 100px)', minHeight: '450px', cursor: draggingRef.current ? 'col-resize' : 'default' }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div ref={containerRef} className="absolute inset-0" />

      {/* Period 1 overlay (clipped left) */}
      {thumbnailT1 && (
        <div
          className="absolute inset-0 z-[500] pointer-events-none overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - splitPos}% 0 0)` }}
        >
          <img src={thumbnailT1} alt="Period 1" className="w-full h-full object-cover" style={{ filter: 'brightness(0.9)' }} />
        </div>
      )}

      {/* Period 2 overlay (clipped right) */}
      {thumbnailT2 && (
        <div
          className="absolute inset-0 z-[500] pointer-events-none overflow-hidden"
          style={{ clipPath: `inset(0 0 0 ${splitPos}%)` }}
        >
          <img src={thumbnailT2} alt="Period 2" className="w-full h-full object-cover" style={{ filter: 'brightness(0.9)' }} />
        </div>
      )}

      {/* Draggable divider */}
      <div
        className="absolute top-0 bottom-0 z-[600] w-1 bg-white/80 cursor-col-resize hover:bg-white transition-colors"
        style={{ left: `${splitPos}%`, transform: 'translateX(-50%)' }}
        onMouseDown={handleMouseDown}
      >
        {/* Handle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow-lg flex items-center justify-center cursor-col-resize">
          <svg className="w-4 h-4 text-slate-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
          </svg>
        </div>
      </div>

      {/* Labels */}
      <div className="absolute top-3 left-3 z-[700] px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-blue-500/80 text-white backdrop-blur-sm">
        Before
      </div>
      <div className="absolute top-3 right-3 z-[700] px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-orange-500/80 text-white backdrop-blur-sm">
        After
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 z-[700] flex flex-col rounded-lg overflow-hidden border border-white/10 shadow-lg">
        <button onClick={() => mapRef.current?.zoomIn()} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm font-bold bg-black/50 backdrop-blur-sm">+</button>
        <div className="h-px bg-white/10" />
        <button onClick={() => mapRef.current?.zoomOut()} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm font-bold bg-black/50 backdrop-blur-sm">−</button>
      </div>
    </div>
  );
}

// ── Difference View ──────────────────────────────────────────
function DifferenceView({
  bbox, changeDetection, config, metrics,
}: {
  bbox: number[];
  changeDetection: Record<string, any> | null;
  config: typeof PHENOMENON_CONFIG[string];
  metrics: Record<string, any>;
}) {
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
        center, zoom: 10, zoomControl: false, attributionControl: false,
      });
      L.tileLayer(TILE_URL, { maxZoom: 19 }).addTo(map);

      // Draw changed regions if available
      if (changeDetection?.regions && Array.isArray(changeDetection.regions)) {
        changeDetection.regions.forEach((region: any) => {
          if (region.bbox && Array.isArray(region.bbox) && region.bbox.length === 4) {
            const [rw, rs, re, rn] = region.bbox;
            L.rectangle([[rs, rw], [rn, re]], {
              color: config.color,
              weight: 2,
              fillColor: config.color,
              fillOpacity: 0.25,
            }).addTo(map);
          }
        });
      }

      // AOI rectangle
      L.rectangle([[south, west], [north, east]], {
        color: '#22d3ee', weight: 2, fillColor: '#22d3ee', fillOpacity: 0.05, dashArray: '8 4',
      }).addTo(map);

      map.fitBounds([[south, west], [north, east]], { padding: [40, 40], maxZoom: 14 });
      mapInstanceRef.current = map;
    });

    return () => {
      cancelled = true;
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
    };
  }, [bbox, changeDetection, config.color]);

  const changedPct = changeDetection?.changedPct || changeDetection?.changed_pct || metrics.changed_pct || 0;
  const changedPixels = changeDetection?.changedPixels || changeDetection?.changed_pixels || 0;
  const totalPixels = changeDetection?.totalPixels || changeDetection?.total_pixels || 0;
  const changedArea = changeDetection?.changedAreaSqMeters
    ? (changeDetection.changedAreaSqMeters / 1_000_000).toFixed(2)
    : metrics.changed_area_km2 || '0';

  return (
    <div className="rounded-xl overflow-hidden border border-slate-700/30" style={{ height: 'calc(70vh - 100px)', minHeight: '450px' }}>
      <div ref={mapRef} className="absolute inset-0" />
      {/* Difference overlay info */}
      <div className="absolute top-3 left-3 z-[1000] px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-red-500/80 text-white backdrop-blur-sm">
        Change Detection — {config.indexLabel} Difference
      </div>
      {/* Change stats overlay */}
      <div className="absolute bottom-3 left-3 z-[1000] bg-black/70 backdrop-blur-sm rounded-xl border border-white/10 p-4">
        <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Changed Area</div>
        <div className="text-2xl font-bold" style={{ color: config.color }}>{changedArea} km²</div>
        <div className="text-sm text-slate-300 mt-1">{typeof changedPct === 'number' ? changedPct.toFixed(1) : changedPct}% change</div>
        {changedPixels > 0 && (
          <div className="text-[10px] text-slate-400 mt-2">
            {changedPixels.toLocaleString()} changed pixels / {totalPixels.toLocaleString()} total
          </div>
        )}
      </div>
      {/* Legend */}
      <div className="absolute bottom-3 right-3 z-[1000] bg-black/70 backdrop-blur-sm rounded-lg border border-white/10 px-3 py-2">
        <div className="text-[9px] text-slate-400 uppercase tracking-wider mb-1.5">Legend</div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm" style={{ background: config.color, opacity: 0.3 }} />
          <span className="text-[10px] text-slate-300">Low change</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className="w-3 h-3 rounded-sm" style={{ background: config.color, opacity: 0.8 }} />
          <span className="text-[10px] text-slate-300">High change</span>
        </div>
      </div>
      {/* Zoom controls */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-col rounded-lg overflow-hidden border border-white/10 shadow-lg">
        <button onClick={() => mapInstanceRef.current?.zoomIn()} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm font-bold bg-black/50 backdrop-blur-sm">+</button>
        <div className="h-px bg-white/10" />
        <button onClick={() => mapInstanceRef.current?.zoomOut()} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm font-bold bg-black/50 backdrop-blur-sm">−</button>
      </div>
    </div>
  );
}

// ── Metric Card ──────────────────────────────────────────────
function MetricCard({ label, value, unit, color, subtitle }: {
  label: string; value: string | number; unit?: string; color?: string; subtitle?: string;
}) {
  return (
    <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/30">
      <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-1">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-bold" style={{ color: color || '#e2e8f0' }}>
          {typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value}
        </span>
        {unit && <span className="text-xs text-slate-300">{unit}</span>}
      </div>
      {subtitle && <div className="text-[10px] text-slate-400 mt-1">{subtitle}</div>}
    </div>
  );
}

// ── Scene Metadata Strip ─────────────────────────────────────
function SceneMetadataStrip({ scene, indexStats, label, color }: {
  scene: SceneInfo | null; indexStats: IndexInfo | null; label: string; color: string;
}) {
  if (!scene) return (
    <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-3 text-center text-slate-500 text-xs">
      No scene available for {label}
    </div>
  );

  const dateStr = scene.datetime ? new Date(scene.datetime).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  }) : '—';

  return (
    <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full" style={{ background: color }} />
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">{label}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div>
          <div className="text-[9px] text-slate-500 uppercase">Sensor</div>
          <div className="text-[11px] text-slate-200 font-medium">{scene.platform || '—'}</div>
        </div>
        <div>
          <div className="text-[9px] text-slate-500 uppercase">Date</div>
          <div className="text-[11px] text-slate-200 font-medium">{dateStr}</div>
        </div>
        <div>
          <div className="text-[9px] text-slate-500 uppercase">Cloud Cover</div>
          <div className="text-[11px] text-slate-200 font-medium">
            {scene.cloud_cover !== null && scene.cloud_cover !== undefined ? `${scene.cloud_cover.toFixed(1)}%` : '—'}
          </div>
        </div>
        <div>
          <div className="text-[9px] text-slate-500 uppercase">Collection</div>
          <div className="text-[11px] text-slate-200 font-medium font-mono truncate">{scene.collection}</div>
        </div>
      </div>
      {indexStats && (
        <div className="mt-2 pt-2 border-t border-slate-700/30 grid grid-cols-3 md:grid-cols-6 gap-2">
          {Object.entries(indexStats.stats).slice(0, 6).map(([key, val]) => (
            <div key={key}>
              <div className="text-[9px] text-slate-500 uppercase">{key}</div>
              <div className="text-[11px] text-slate-200 font-mono">{typeof val === 'number' ? val.toFixed(4) : String(val)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Processing Timeline ──────────────────────────────────────
function ProcessingTimeline({ steps }: { steps: Array<{ step: string; detail: string }> }) {
  return (
    <div className="space-y-1.5">
      {steps.map((step, i) => (
        <div key={i} className="flex items-start gap-2 text-[10px]">
          <div className="w-4 h-4 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center flex-shrink-0 mt-0.5">✓</div>
          <div>
            <span className="text-slate-300 font-medium">{step.step.replace(/_/g, ' ')}</span>
            <span className="text-slate-600 ml-1.5">{step.detail}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ── MAIN COMPONENT ───────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
export default function TemporalComparisonView({ result }: Props) {
  const config = PHENOMENON_CONFIG[result.phenomenon] || PHENOMENON_CONFIG.land_cover_change;
  const metrics = result.metrics || {};
  const explanation = result.explanation || {};
  const sensorInfo = result.sensor_info || {};
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');

  // Check if this is a fallback/degraded response
  const isFallback = (metrics as any).fallbackMode;

  // Get metric cards based on phenomenon
  const getMetricCards = () => {
    const cards: Array<{ label: string; value: string | number; unit?: string; color?: string; subtitle?: string }> = [];

    // Always show changed area prominently
    const changedArea = metrics.changed_area_km2 || metrics.totalDatasets || 0;
    const changedPct = metrics.changed_pct || 0;

    if (isFallback) {
      // Fallback mode: show dataset match count
      cards.push({ label: 'Datasets Found', value: metrics.totalDatasets || 0, color: config.color });
      cards.push({ label: 'Query Matched', value: (metrics.matchedQuery as string) || '—', color: '#94a3b8' });
    } else {
      cards.push({ label: 'Total Study Area', value: metrics.total_area_km2 || 0, unit: 'km²', color: '#94a3b8' });
      cards.push({ label: 'Changed Area', value: changedArea, unit: 'km²', color: config.color, subtitle: `${typeof changedPct === 'number' ? changedPct.toFixed(1) : changedPct}% of total area` });

      // Phenomenon-specific metrics
      if (result.phenomenon === 'urban_expansion') {
        cards.push({ label: 'Urban Expansion', value: metrics.urban_expansion_km2 || 0, unit: 'km²', color: '#a855f7', subtitle: `+${metrics.urban_expansion_pct || 0}% growth` });
        cards.push({ label: 'NDBI Change', value: metrics.ndbi_change || 0, unit: 'units', color: '#c084fc' });
      } else if (result.phenomenon === 'vegetation_change' || result.phenomenon === 'deforestation') {
        cards.push({ label: 'Vegetation Loss', value: metrics.vegetation_loss_km2 || 0, unit: 'km²', color: '#ef4444' });
        cards.push({ label: 'NDVI Change', value: metrics.ndvi_change || 0, unit: 'units', color: metrics.ndvi_change > 0 ? '#22c55e' : '#ef4444' });
      } else if (result.phenomenon === 'flood_impact') {
        cards.push({ label: 'Flood Extent', value: metrics.flood_extent_km2 || 0, unit: 'km²', color: '#3b82f6', subtitle: `${metrics.flood_pct || 0}% of area` });
        cards.push({ label: 'Severity', value: metrics.severity || 'N/A', color: metrics.severity === 'HIGH' ? '#ef4444' : '#f59e0b' });
      } else if (result.phenomenon === 'water_change') {
        cards.push({ label: 'Water Change', value: metrics.water_area_change_km2 || 0, unit: 'km²', color: '#06b6d4' });
      } else if (result.phenomenon === 'coastal_erosion') {
        cards.push({ label: 'Shoreline Change', value: metrics.shoreline_change_km2 || 0, unit: 'km²', color: '#0ea5e9' });
      } else {
        cards.push({ label: 'Index Change', value: metrics.delta_index || 0, unit: 'units', color: '#8b5cf6', subtitle: `Direction: ${metrics.direction || 'N/A'}` });
      }
    }

    return cards;
  };

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-medium mb-3"
          style={{ background: `${config.color}20`, color: config.color, border: `1px solid ${config.color}30` }}>
          {config.emoji} {config.label}
        </div>
        <h2 className="text-xl font-bold text-white mb-1">
          {explanation.title || `${result.aoi_name} — ${config.label}`}
        </h2>
        <p className="text-xs text-slate-400">
          {result.period1?.start} → {result.period2?.end}
          {' · '}
          {sensorInfo.primary_sensor || 'Sentinel-2'}
          {' · '}
          {sensorInfo.resolution_m || 10}m resolution
        </p>
      </div>

      {/* ── View Mode Switcher ────────────────────────────────── */}
      {!isFallback && (
        <div className="flex justify-center">
          <div className="inline-flex bg-slate-800/50 rounded-xl border border-slate-700/30 p-1">
            {(['side-by-side', 'swipe', 'difference'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-4 py-2 rounded-lg text-[11px] font-medium transition-all ${
                  viewMode === mode
                    ? 'bg-slate-700/50 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {mode === 'side-by-side' && '⊞ Side by Side'}
                {mode === 'swipe' && '⇔ Swipe'}
                {mode === 'difference' && '◎ Difference'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Map Area (dominant) ───────────────────────────────── */}
      {!isFallback && result.aoi_bbox && result.aoi_bbox.length === 4 && (
        <div className="relative">
          {viewMode === 'side-by-side' && (
            <SynchronizedDualMap
              bbox={result.aoi_bbox}
              sceneT1={result.scene_t1}
              sceneT2={result.scene_t2}
              thumbnailT1={result.imagery?.period1?.thumbnail}
              thumbnailT2={result.imagery?.period2?.thumbnail}
            />
          )}
          {viewMode === 'swipe' && (
            <SwipeMap
              bbox={result.aoi_bbox}
              thumbnailT1={result.imagery?.period1?.thumbnail}
              thumbnailT2={result.imagery?.period2?.thumbnail}
            />
          )}
          {viewMode === 'difference' && (
            <DifferenceView
              bbox={result.aoi_bbox}
              changeDetection={result.change_detection}
              config={config}
              metrics={metrics}
            />
          )}
        </div>
      )}

      {/* ── Scene Metadata Strip ──────────────────────────────── */}
      {!isFallback && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <SceneMetadataStrip scene={result.scene_t1} indexStats={result.index_t1} label="Period 1 — Before" color="#3b82f6" />
          <SceneMetadataStrip scene={result.scene_t2} indexStats={result.index_t2} label="Period 2 — After" color="#f97316" />
        </div>
      )}

      {/* ── Key Metrics (prominent) ──────────────────────────── */}
      <div>
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: config.color }} />
          Key Metrics
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {getMetricCards().map((card, i) => (
            <MetricCard key={i} {...card} />
          ))}
        </div>
      </div>

      {/* ── Change Detection Details ──────────────────────────── */}
      {!isFallback && result.change_detection && (
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
              <div className="text-sm text-slate-200">{config.indexLabel}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase">Changed Pixels</div>
              <div className="text-sm text-slate-200">{(result.change_detection.changedPixels || result.change_detection.changed_pixels || 0).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase">Regions</div>
              <div className="text-sm text-slate-200">{result.change_detection.numRegions || result.change_detection.num_regions || 0}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Analysis Summary + Methodology ────────────────────── */}
      {explanation.summary && (
        <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-5">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            Analysis Summary
          </h3>
          <p className="text-sm text-slate-200 leading-relaxed mb-4">{explanation.summary}</p>

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

          {/* Methodology + Evidence */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-700/30">
            <div>
              <h4 className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-1.5">Methodology</h4>
              {explanation.methodology && (
                <p className="text-xs text-slate-300 leading-relaxed mb-3">{explanation.methodology}</p>
              )}
              <div className="space-y-1 text-xs text-slate-300">
                <div>Index: <span className="text-slate-200 font-mono">{sensorInfo.index_used || config.indexLabel}</span></div>
                {sensorInfo.index_formula && (
                  <div>Formula: <span className="text-slate-200 font-mono text-[10px]">{sensorInfo.index_formula}</span></div>
                )}
                <div>Resolution: <span className="text-slate-200">{sensorInfo.resolution_m || 10}m</span></div>
              </div>
            </div>
            <div>
              <h4 className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-1.5">Confidence & Limitations</h4>
              <p className="text-xs text-slate-300 mb-2">{explanation.confidence || 'Medium confidence'}</p>
              {explanation.limitations && explanation.limitations.length > 0 && (
                <div className="space-y-1">
                  {explanation.limitations.map((lim, i) => (
                    <div key={i} className="text-[10px] text-slate-400">⚠ {lim}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Processing Pipeline (collapsible) ─────────────────── */}
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
