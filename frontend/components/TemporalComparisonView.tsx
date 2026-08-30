'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { TemporalComparisonResult, SceneInfo, IndexInfo } from '@/hooks/useAnalysis';
import SwipeMap from '@/components/SwipeMap';
import {
  loadSatelliteTiles,
  buildTileJsonUrl,
  parseBbox,
  boundsToLatLng,
  getBestBounds,
} from '@/lib/satellite-tiles';
import AnalysisSummary from '@/components/AnalysisSummary';

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

const GOOGLE_TILE = 'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}';

/** Build tilejson URL from scene data if not provided in imagery response */
// ── Synchronized Dual Map ────────────────────────────────────
function SynchronizedDualMap({
  bbox, sceneT1, sceneT2, thumbnailT1, thumbnailT2, tilejsonT1, tilejsonT2, sceneBboxT1, sceneBboxT2,
}: {
  bbox: number[];
  sceneT1: SceneInfo | null;
  sceneT2: SceneInfo | null;
  thumbnailT1?: string;
  thumbnailT2?: string;
  tilejsonT1?: string;
  tilejsonT2?: string;
  sceneBboxT1?: any;
  sceneBboxT2?: any;
}) {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const leftMapRef = useRef<any>(null);
  const rightMapRef = useRef<any>(null);
  const syncingRef = useRef(false);
  const [leftError, setLeftError] = useState<string | null>(null);
  const [rightError, setRightError] = useState<string | null>(null);
  const [leftLoading, setLeftLoading] = useState(true);
  const [rightLoading, setRightLoading] = useState(true);

  useEffect(() => {
    if (!leftRef.current || !rightRef.current || leftMapRef.current) return;
    // Wait for container to have dimensions (flex/grid layout may not be ready)
    const leftRect = leftRef.current.getBoundingClientRect();
    if (leftRect.width < 10 || leftRect.height < 10) return;
    let cancelled = false;

    import('leaflet').then(async (L) => {
      if (cancelled || !leftRef.current || !rightRef.current) return;

      console.log('[SynchronizedDualMap] Initializing maps…');
      console.log('[SynchronizedDualMap] Scene T1:', sceneT1?.item_id, 'bbox:', sceneBboxT1);
      console.log('[SynchronizedDualMap] Scene T2:', sceneT2?.item_id, 'bbox:', sceneBboxT2);

      // Use scene bbox if available, otherwise AOI bbox for initial view
      const initBounds = parseBbox(sceneBboxT1) || parseBbox(sceneBboxT2) || bbox;
      const [west, south, east, north] = initBounds;
      const center: [number, number] = [(south + north) / 2, (west + east) / 2];

      // Calculate zoom level from bbox size
      const latDiff = north - south;
      const lngDiff = east - west;
      const initZoom = Math.min(12, Math.max(6, Math.floor(Math.log2(360 / Math.max(latDiff, lngDiff)))));

      // Create both maps with the Google basemap
      const leftMap = L.map(leftRef.current, {
        center, zoom: initZoom, zoomControl: false, attributionControl: false,
      });
      L.tileLayer(GOOGLE_TILE, { maxZoom: 22, subdomains: ['0', '1', '2', '3'] }).addTo(leftMap);

      const rightMap = L.map(rightRef.current, {
        center, zoom: initZoom, zoomControl: false, attributionControl: false,
      });
      L.tileLayer(GOOGLE_TILE, { maxZoom: 22, subdomains: ['0', '1', '2', '3'] }).addTo(rightMap);

      // Load satellite tiles
      const [leftResult, rightResult] = await Promise.all([
        loadSatelliteTiles(leftMap, {
          L,
          sceneCollection: sceneT1?.collection,
          sceneItemId: sceneT1?.item_id,
          thumbnailUrl: thumbnailT1,
          sceneBbox: sceneBboxT1,
          aoiBbox: bbox,
          opacity: 0.9,
        }),
        loadSatelliteTiles(rightMap, {
          L,
          sceneCollection: sceneT2?.collection,
          sceneItemId: sceneT2?.item_id,
          thumbnailUrl: thumbnailT2,
          sceneBbox: sceneBboxT2,
          aoiBbox: bbox,
          opacity: 0.9,
        }),
      ]);

      if (cancelled) return;

      setLeftLoading(false);
      setRightLoading(false);
      if (!leftResult.hasImagery) setLeftError(leftResult.error || 'No imagery');
      if (!rightResult.hasImagery) setRightError(rightResult.error || 'No imagery');

      console.log('[SynchronizedDualMap] Left:', leftResult.usedTileJson ? 'TileJSON' : leftResult.hasImagery ? 'thumbnail' : 'no imagery');
      console.log('[SynchronizedDualMap] Right:', rightResult.usedTileJson ? 'TileJSON' : rightResult.hasImagery ? 'thumbnail' : 'no imagery');

      // AOI rectangle on both maps
      const aoiBounds = boundsToLatLng(bbox);
      L.rectangle(aoiBounds, { color: '#22d3ee', weight: 1.5, fillColor: '#22d3ee', fillOpacity: 0.05, dashArray: '6 3' }).addTo(leftMap);
      L.rectangle(aoiBounds, { color: '#22d3ee', weight: 1.5, fillColor: '#22d3ee', fillOpacity: 0.05, dashArray: '6 3' }).addTo(rightMap);

      // Fit maps to the imagery bounds
      // Use the scene bbox (wider) for initial view, not just AOI
      leftMap.fitBounds(leftResult.bounds, { padding: [30, 30] });
      rightMap.fitBounds(rightResult.bounds, { padding: [30, 30] });

      // Force maps to re-render after tile layers are added
      setTimeout(() => {
        leftMap.invalidateSize();
        rightMap.invalidateSize();
        console.log('[SynchronizedDualMap] Maps invalidated — tiles should be visible');
      }, 100);

      // Synchronize navigation: when one map moves, the other follows
      leftMap.on('move', () => {
        if (syncingRef.current) return;
        syncingRef.current = true;
        rightMap.setView(leftMap.getCenter(), leftMap.getZoom(), { animate: false });
        syncingRef.current = false;
      });
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
  }, [bbox, thumbnailT1, thumbnailT2, tilejsonT1, tilejsonT2, sceneBboxT1, sceneBboxT2]);

  return (
    <div className="w-full grid grid-cols-2 gap-2" style={{ height: '520px' }}>
      <div className="relative rounded-xl overflow-hidden border border-slate-700/30">
        <div ref={leftRef} className="absolute inset-0" />
        <div className="absolute top-3 left-3 z-[1000] px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-blue-500/80 text-white backdrop-blur-sm">Period 1 — Before</div>
        {leftLoading && (
          <div className="absolute top-3 right-3 z-[1000] px-2 py-1 rounded text-[9px] bg-slate-600/80 text-white backdrop-blur-sm flex items-center gap-1.5">
            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            Loading imagery...
          </div>
        )}
        {leftError && (
          <div className="absolute top-3 right-3 z-[1000] px-2 py-1 rounded text-[9px] bg-amber-500/80 text-white backdrop-blur-sm">
            {leftError}
          </div>
        )}
        <div className="absolute bottom-3 right-3 z-[1000] flex flex-col rounded-lg overflow-hidden border border-white/10 shadow-lg">
          <button onClick={() => leftMapRef.current?.zoomIn()} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm font-bold bg-black/50 backdrop-blur-sm">+</button>
          <div className="h-px bg-white/10" />
          <button onClick={() => leftMapRef.current?.zoomOut()} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm font-bold bg-black/50 backdrop-blur-sm">−</button>
        </div>
      </div>
      <div className="relative rounded-xl overflow-hidden border border-slate-700/30">
        <div ref={rightRef} className="absolute inset-0" />
        <div className="absolute top-3 left-3 z-[1000] px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-orange-500/80 text-white backdrop-blur-sm">Period 2 — After</div>
        {rightLoading && (
          <div className="absolute top-3 right-3 z-[1000] px-2 py-1 rounded text-[9px] bg-slate-600/80 text-white backdrop-blur-sm flex items-center gap-1.5">
            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            Loading imagery...
          </div>
        )}
        {rightError && (
          <div className="absolute top-3 right-3 z-[1000] px-2 py-1 rounded text-[9px] bg-amber-500/80 text-white backdrop-blur-sm">
            {rightError}
          </div>
        )}
        <div className="absolute bottom-3 right-3 z-[1000] flex flex-col rounded-lg overflow-hidden border border-white/10 shadow-lg">
          <button onClick={() => rightMapRef.current?.zoomIn()} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm font-bold bg-black/50 backdrop-blur-sm">+</button>
          <div className="h-px bg-white/10" />
          <button onClick={() => rightMapRef.current?.zoomOut()} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm font-bold bg-black/50 backdrop-blur-sm">−</button>
        </div>
      </div>
      {/* Legend — compact pill */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000]">
        <div className="flex items-center gap-4 px-5 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[10px]">
          <span className="flex items-center gap-1.5 text-slate-300"><span className="w-2 h-2 rounded-full bg-blue-500" /> Earlier</span>
          <span className="text-slate-600">|</span>
          <span className="flex items-center gap-1.5 text-slate-300"><span className="w-2 h-2 rounded-full bg-orange-500" /> After</span>
          <span className="text-slate-600">|</span>
          <span className="flex items-center gap-1.5 text-slate-300"><span className="w-2 h-2 rounded border border-cyan-400/50 bg-cyan-400/10" /> AOI</span>
        </div>
      </div>
    </div>
  );
}

// ── Difference View ──────────────────────────────────────────
function DifferenceView({
  bbox, changeDetection, config, metrics,
  tilejsonT1, tilejsonT2, sceneBboxT1, sceneBboxT2,
  sceneT1, sceneT2, thumbnailT1, thumbnailT2,
}: {
  bbox: number[];
  changeDetection: Record<string, any> | null;
  config: typeof PHENOMENON_CONFIG[string];
  metrics: Record<string, any>;
  tilejsonT1?: string;
  tilejsonT2?: string;
  sceneBboxT1?: any;
  sceneBboxT2?: any;
  sceneT1?: SceneInfo | null;
  sceneT2?: SceneInfo | null;
  thumbnailT1?: string;
  thumbnailT2?: string;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const overlayLayerRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    let cancelled = false;

    import('leaflet').then(async (L) => {
      if (cancelled || !mapRef.current) return;

      const [west, south, east, north] = bbox;
      const center: [number, number] = [(south + north) / 2, (west + east) / 2];

      const map = L.map(mapRef.current, {
        center, zoom: 10, zoomControl: false, attributionControl: false,
      });
      L.tileLayer(GOOGLE_TILE, { maxZoom: 22, subdomains: ['0', '1', '2', '3'] }).addTo(map);

      // Load Period 2 (After) as the base satellite layer
      const baseResult = await loadSatelliteTiles(map, {
        L,
        sceneCollection: sceneT2?.collection,
        sceneItemId: sceneT2?.item_id,
        thumbnailUrl: thumbnailT2,
        sceneBbox: sceneBboxT2,
        aoiBbox: bbox,
        opacity: 0.9,
        zIndex: 400,
      });

      // Load Period 1 (Before) as a semi-transparent overlay on top
      const overlayResult = await loadSatelliteTiles(map, {
        L,
        sceneCollection: sceneT1?.collection,
        sceneItemId: sceneT1?.item_id,
        thumbnailUrl: thumbnailT1,
        sceneBbox: sceneBboxT1,
        aoiBbox: bbox,
        opacity: overlayOpacity,
        zIndex: 500,
      });

      if (cancelled) return;
      if (!baseResult.hasImagery && !overlayResult.hasImagery) {
        setMapError('No satellite imagery available for comparison');
      } else if (!baseResult.hasImagery || !overlayResult.hasImagery) {
        setMapError('Partial imagery — one period unavailable');
      }

      if (overlayResult.layer) {
        overlayLayerRef.current = overlayResult.layer;
      }

      // Fit to the wider bounds
      const fitBounds = baseResult.hasImagery ? baseResult.bounds : overlayResult.bounds;
      map.fitBounds(fitBounds, { padding: [40, 40], maxZoom: 14 });

      // Overlay change detection regions if available
      if (changeDetection?.regions && Array.isArray(changeDetection.regions)) {
        changeDetection.regions.forEach((region: any) => {
          if (region.bbox && Array.isArray(region.bbox) && region.bbox.length === 4) {
            const [rw, rs, re, rn] = region.bbox;
            if (Math.abs(rw) <= 180 && Math.abs(re) <= 180 && Math.abs(rs) <= 90 && Math.abs(rn) <= 90) {
              L.rectangle([[rs, rw], [rn, re]], {
                color: config.color, weight: 2, fillColor: config.color, fillOpacity: 0.25,
              }).addTo(map);
            }
          }
        });
      }

      // If no specific regions, draw change magnitude zones across the AOI
      const cd = changeDetection as any;
      const changedPct = cd?.changedPct || cd?.changed_pct || metrics.changed_pct || 0;
      if (changedPct > 0) {
        // Draw change zone across AOI
        L.rectangle([[south, west], [north, east]], {
          color: config.color, weight: 2, fillColor: config.color, fillOpacity: 0.15, dashArray: '8 4',
        }).addTo(map);
      }

      // AOI boundary
      L.rectangle([[south, west], [north, east]], {
        color: '#22d3ee', weight: 1.5, fillColor: '#22d3ee', fillOpacity: 0.02, dashArray: '8 4',
      }).addTo(map);

      mapInstanceRef.current = map;
    });

    return () => {
      cancelled = true;
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
      overlayLayerRef.current = null;
    };
  }, [bbox, changeDetection, config.color, tilejsonT1, tilejsonT2, sceneBboxT1, sceneBboxT2]);

  // Update overlay opacity when slider changes
  useEffect(() => {
    if (overlayLayerRef.current?.setOpacity) {
      overlayLayerRef.current.setOpacity(overlayOpacity);
    }
  }, [overlayOpacity]);

  const cd = changeDetection as any;
  const changedPct = cd?.changedPct || cd?.changed_pct || metrics.changed_pct || 0;
  const changedPixels = cd?.changedPixels || cd?.changed_pixels || 0;
  const totalPixels = cd?.totalPixels || cd?.total_pixels || 0;
  const changedArea = cd?.changedAreaSqMeters
    ? (cd.changedAreaSqMeters / 1_000_000).toFixed(2)
    : metrics.changed_area_km2 || '0';

  return (
    <div className="rounded-xl overflow-hidden border border-slate-700/30 relative w-full" style={{ height: '520px' }}>
      <div ref={mapRef} className="absolute inset-0" />
      <div className="absolute top-3 left-3 z-[1000] px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-slate-800/90 text-white backdrop-blur-sm border border-slate-600/30">
        Difference — {config.indexLabel} Overlay
      </div>
      {mapError && (
        <div className="absolute top-3 right-12 z-[1000] px-2 py-1 rounded text-[9px] bg-amber-500/80 text-white backdrop-blur-sm">
          {mapError}
        </div>
      )}
      {/* Opacity slider — blend Between and After */}
      <div className="absolute top-12 left-3 z-[1000] bg-black/70 backdrop-blur-sm rounded-lg border border-white/10 px-3 py-2">
        <div className="text-[9px] text-slate-400 uppercase tracking-wider mb-1.5">Overlay Blend</div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-blue-400 w-10">Before</span>
          <input
            type="range"
            min={0}
            max={100}
            value={overlayOpacity * 100}
            onChange={(e) => setOverlayOpacity(parseInt(e.target.value) / 100)}
            className="w-24 h-1 accent-cyan-400 cursor-pointer"
          />
          <span className="text-[9px] text-orange-400 w-10 text-right">After</span>
        </div>
      </div>
      {/* Metrics overlay */}
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
          <div className="w-3 h-3 rounded-sm border border-blue-400/50 bg-blue-400/20" />
          <span className="text-[10px] text-slate-300">Period 1 (Before)</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className="w-3 h-3 rounded-sm border border-orange-400/50 bg-orange-400/20" />
          <span className="text-[10px] text-slate-300">Period 2 (After)</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className="w-3 h-3 rounded-sm" style={{ background: config.color, opacity: 0.5 }} />
          <span className="text-[10px] text-slate-300">Detected change</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className="w-3 h-3 rounded-sm border border-cyan-400/50 bg-cyan-400/10" />
          <span className="text-[10px] text-slate-300">AOI boundary</span>
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
  const isZero = typeof value === 'number' && value === 0;
  const isNA = value === 'N/A' || value === null || value === undefined || value === '';
  const isMuted = isZero || isNA;

  return (
    <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/30">
      <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-1">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-bold" style={{ color: isMuted ? '#475569' : (color || '#e2e8f0') }}>
          {typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value}
        </span>
        {unit && <span className={`text-xs ${isMuted ? 'text-slate-600' : 'text-slate-300'}`}>{unit}</span>}
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

  const isFallback = (metrics as any).fallbackMode;

  // ── Yearly trend removed ──
  // The previous implementation used deterministic estimates (seasonal model + hash-based offsets)
  // NOT actual raster pixel computation. Multi-year trend analysis requires pixel-level
  // raster computation which is not currently available in this architecture.

  const getMetricCards = () => {
    const cards: Array<{ label: string; value: string | number; unit?: string; color?: string; subtitle?: string }> = [];

    if (isFallback) {
      cards.push({ label: 'Datasets Found', value: metrics.totalDatasets || 0, color: config.color });
      cards.push({ label: 'Query Matched', value: (metrics.matchedQuery as string) || '—', color: '#94a3b8' });
    } else {
      cards.push({ label: 'Total Study Area', value: metrics.total_area_km2 || 0, unit: 'km²', color: '#94a3b8' });
      const changedArea = metrics.changed_area_km2 || 0;
      const changedPct = metrics.changed_pct || 0;
      cards.push({ label: 'Estimated Change', value: changedArea, unit: 'km²', color: config.color, subtitle: `~${typeof changedPct === 'number' ? changedPct.toFixed(1) : changedPct}% of area · from scene metadata` });

      cards.push({ label: `Index Change (${config.indexLabel})`, value: metrics.delta_index || 0, unit: `${config.indexLabel} units`, color: config.color, subtitle: 'Estimated from scene metadata' });
      if (metrics.direction && metrics.direction !== 'N/A') {
        cards.push({ label: 'Direction', value: metrics.direction, color: '#8b5cf6' });
      }
    }
    return cards;
  };

  return (
    <div className="space-y-5">
      {/* ── 1. INSIGHT (top of page) ────────────────────────── */}
      <AnalysisSummary result={result} />

      {/* ── 2. VISUAL EVIDENCE ─────────────────────────────── */}
      {/* Map Area with floating control bar */}
      {!isFallback && result.aoi_bbox && result.aoi_bbox.length === 4 && (
        <div className="relative w-full">
          {/* View Mode Switcher — floating over map */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1010]">
            <div className="inline-flex bg-black/40 backdrop-blur-md rounded-full border border-white/10 p-1 shadow-xl">
              {(['side-by-side', 'swipe', 'difference'] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-4 py-1.5 rounded-full text-[11px] font-medium transition-all ${
                    viewMode === mode ? 'bg-white/15 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {mode === 'side-by-side' && '⊞ Side by Side'}
                  {mode === 'swipe' && '⇔ Swipe'}
                  {mode === 'difference' && '◎ Difference'}
                </button>
              ))}
            </div>
          </div>
          {viewMode === 'side-by-side' && (
            <SynchronizedDualMap
              bbox={result.aoi_bbox}
              sceneT1={result.scene_t1}
              sceneT2={result.scene_t2}
              thumbnailT1={result.imagery?.period1?.thumbnail}
              thumbnailT2={result.imagery?.period2?.thumbnail}
              tilejsonT1={result.imagery?.period1?.tilejson || (result.scene_t1?.item_id ? buildTileJsonUrl(result.scene_t1.collection || 'sentinel-2-l2a', result.scene_t1.item_id) : undefined)}
              tilejsonT2={result.imagery?.period2?.tilejson || (result.scene_t2?.item_id ? buildTileJsonUrl(result.scene_t2.collection || 'sentinel-2-l2a', result.scene_t2.item_id) : undefined)}
              sceneBboxT1={result.imagery?.period1?.bbox || result.scene_t1?.bbox}
              sceneBboxT2={result.imagery?.period2?.bbox || result.scene_t2?.bbox}
            />
          )}
          {viewMode === 'swipe' && (
            <SwipeMap
              bbox={result.aoi_bbox}
              thumbnailT1={result.imagery?.period1?.thumbnail}
              thumbnailT2={result.imagery?.period2?.thumbnail}
              sceneT1={result.scene_t1}
              sceneT2={result.scene_t2}
              sceneBboxT1={result.imagery?.period1?.bbox || result.scene_t1?.bbox}
              sceneBboxT2={result.imagery?.period2?.bbox || result.scene_t2?.bbox}
            />
          )}
          {viewMode === 'difference' && (
            <DifferenceView
              bbox={result.aoi_bbox}
              changeDetection={result.change_detection}
              config={config}
              metrics={metrics}
              tilejsonT1={result.imagery?.period1?.tilejson || (result.scene_t1?.item_id ? buildTileJsonUrl(result.scene_t1.collection || 'sentinel-2-l2a', result.scene_t1.item_id) : undefined)}
              tilejsonT2={result.imagery?.period2?.tilejson || (result.scene_t2?.item_id ? buildTileJsonUrl(result.scene_t2.collection || 'sentinel-2-l2a', result.scene_t2.item_id) : undefined)}
              sceneBboxT1={result.imagery?.period1?.bbox || result.scene_t1?.bbox}
              sceneBboxT2={result.imagery?.period2?.bbox || result.scene_t2?.bbox}
              sceneT1={result.scene_t1}
              sceneT2={result.scene_t2}
              thumbnailT1={result.imagery?.period1?.thumbnail}
              thumbnailT2={result.imagery?.period2?.thumbnail}
            />
          )}
        </div>
      )}

      {/* ── 3. SCENE EVIDENCE (collapsible) ─────────────────── */}
      {!isFallback && (
        <details className="bg-slate-800/30 rounded-xl border border-slate-700/30 overflow-hidden group" open>
          <summary className="px-5 py-3 text-xs font-semibold text-slate-200 uppercase tracking-wider cursor-pointer hover:text-white transition-colors flex items-center justify-between">
            <span className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Scene Evidence
            </span>
            <svg className="w-4 h-4 text-slate-500 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="px-5 pb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <SceneMetadataStrip scene={result.scene_t1} indexStats={result.index_t1} label="Period 1 — Before" color="#3b82f6" />
              <SceneMetadataStrip scene={result.scene_t2} indexStats={result.index_t2} label="Period 2 — After" color="#f97316" />
            </div>
          </div>
        </details>
      )}

      {/* ── 4. SECONDARY METRICS (collapsible) ──────────────── */}
      {!isFallback && (
        <details className="bg-slate-800/30 rounded-xl border border-slate-700/30 overflow-hidden group">
          <summary className="px-5 py-3 text-xs font-semibold text-slate-200 uppercase tracking-wider cursor-pointer hover:text-white transition-colors flex items-center justify-between">
            <span className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Detailed Metrics
            </span>
            <svg className="w-4 h-4 text-slate-500 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="px-5 pb-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {getMetricCards().map((card, i) => (
                <MetricCard key={i} {...card} />
              ))}
            </div>
            {/* Change Detection Details */}
            {result.change_detection && (
              <div className="mt-4 pt-4 border-t border-slate-700/30">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-2">Change Detection</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <div className="text-[9px] text-slate-500 uppercase">Algorithm</div>
                    <div className="text-[11px] text-slate-200">{result.change_detection.algorithm || 'difference_threshold'}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-500 uppercase">Index</div>
                    <div className="text-[11px] text-slate-200">{config.indexLabel}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-500 uppercase">Changed Pixels</div>
                    <div className="text-[11px] text-slate-200">{(result.change_detection.changedPixels || result.change_detection.changed_pixels || 0).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-500 uppercase">Regions</div>
                    <div className="text-[11px] text-slate-200">{result.change_detection.numRegions || result.change_detection.num_regions || 0}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </details>
      )}

      {/* ── 5. METHODOLOGY (collapsed) ──────────────────────── */}
      {(explanation.methodology || sensorInfo.index_formula) && (
        <details className="bg-slate-800/30 rounded-xl border border-slate-700/30 overflow-hidden group">
          <summary className="px-5 py-3 text-xs font-semibold text-slate-200 uppercase tracking-wider cursor-pointer hover:text-white transition-colors flex items-center justify-between">
            <span className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Methodology
            </span>
            <svg className="w-4 h-4 text-slate-500 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="px-5 pb-4 space-y-3">
            {explanation.methodology && (
              <p className="text-xs text-slate-300 leading-relaxed">{explanation.methodology}</p>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <div className="text-[9px] text-slate-500 uppercase">Index</div>
                <div className="text-[11px] text-slate-200 font-mono">{sensorInfo.index_used || config.indexLabel}</div>
              </div>
              {sensorInfo.index_formula && (
                <div className="col-span-2">
                  <div className="text-[9px] text-slate-500 uppercase">Formula</div>
                  <div className="text-[11px] text-slate-200 font-mono">{sensorInfo.index_formula}</div>
                </div>
              )}
              <div>
                <div className="text-[9px] text-slate-500 uppercase">Resolution</div>
                <div className="text-[11px] text-slate-200">{sensorInfo.resolution_m || 10}m</div>
              </div>
            </div>
          </div>
        </details>
      )}

      {/* ── 6. PROCESSING PIPELINE (collapsed) ──────────────── */}
      {result.processing_steps && result.processing_steps.length > 0 && (
        <details className="bg-slate-800/30 rounded-xl border border-slate-700/30 overflow-hidden group">
          <summary className="px-5 py-3 text-xs font-semibold text-slate-200 uppercase tracking-wider cursor-pointer hover:text-white transition-colors flex items-center justify-between">
            <span className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Processing Pipeline ({result.processing_steps.length} steps)
            </span>
            <svg className="w-4 h-4 text-slate-500 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="px-5 pb-4">
            <ProcessingTimeline steps={result.processing_steps} />
          </div>
        </details>
      )}

      {/* ── 7. YEARLY TREND — REMOVED ────────────────────── */}
      {/* Multi-year trend analysis requires pixel-level raster computation.
          The previous implementation used deterministic estimates (seasonal model + hash offsets)
          that were NOT computed from actual satellite observations.
          This feature will be reimplemented when raster-based index computation is available. */}
    </div>
  );
}
