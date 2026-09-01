'use client';

import { useEffect, useRef, useState } from 'react';
import type { TemporalComparisonResult, SceneInfo, IndexInfo } from '@/hooks/useAnalysis';
import SwipeMap from '@/components/SwipeMap';
import dynamic from 'next/dynamic';
const RechartsTrendChart = dynamic(() => import('./RechartsTrendChart'), { ssr: false });
import {
  loadSatelliteTiles,
  buildTileJsonUrl,
  parseBbox,
  boundsToLatLng,
} from '@/lib/satellite-tiles';

interface Props {
  result: TemporalComparisonResult;
}

// ── Phenomenon display config ─────────────────────────────────
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

type ViewMode = 'side-by-side' | 'swipe' | 'difference' | 'change-mask';

const GOOGLE_TILE = 'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}';

// ══════════════════════════════════════════════════════════════
// ── Synchronized Dual Map ───────────────────────────────────
// ══════════════════════════════════════════════════════════════
function SynchronizedDualMap({
  bbox, sceneT1, sceneT2, thumbnailT1, thumbnailT2, signedTileUrl1, signedTileUrl2, tilejsonUrl1, tilejsonUrl2, sceneBboxT1, sceneBboxT2,
}: {
  bbox: number[];
  sceneT1: SceneInfo | null;
  sceneT2: SceneInfo | null;
  thumbnailT1?: string;
  thumbnailT2?: string;
  signedTileUrl1?: string;
  signedTileUrl2?: string;
  tilejsonUrl1?: string;
  tilejsonUrl2?: string;
  sceneBboxT1?: any;
  sceneBboxT2?: any;
}) {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const leftMapRef = useRef<any>(null);
  const rightMapRef = useRef<any>(null);
  const syncingRef = useRef(false);
  const [leftLoading, setLeftLoading] = useState(true);
  const [rightLoading, setRightLoading] = useState(true);

  useEffect(() => {
    if (!leftRef.current || !rightRef.current || leftMapRef.current) return;
    const leftRect = leftRef.current.getBoundingClientRect();
    if (leftRect.width < 10 || leftRect.height < 10) return;
    let cancelled = false;

    import('leaflet').then(async (L) => {
      if (cancelled || !leftRef.current || !rightRef.current) return;

      // Fetch TileJSON to get correct tile template + bounds for each scene
      async function fetchTilejson(url: string): Promise<{ tileTemplate: string; bounds: number[] } | null> {
        try {
          const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!r.ok) return null;
          const tj = await r.json();
          return { tileTemplate: tj.tiles?.[0] || '', bounds: tj.bounds || [] };
        } catch { return null; }
      }

      const [tj1, tj2] = await Promise.all([
        tilejsonUrl1 ? fetchTilejson(tilejsonUrl1) : Promise.resolve(null),
        tilejsonUrl2 ? fetchTilejson(tilejsonUrl2) : Promise.resolve(null),
      ]);

      // Use TileJSON bounds for init, fallback to scene bbox, then AOI
      const initBounds = (tj1?.bounds && tj1.bounds.length === 4 ? tj1.bounds : null)
        || parseBbox(sceneBboxT1) || parseBbox(sceneBboxT2) || bbox;
      const [west, south, east, north] = initBounds;
      const center: [number, number] = [(south + north) / 2, (west + east) / 2];
      const latDiff = north - south;
      const lngDiff = east - west;
      const initZoom = Math.min(12, Math.max(6, Math.floor(Math.log2(360 / Math.max(latDiff, lngDiff)))));

      const leftMap = L.map(leftRef.current, { center, zoom: initZoom, zoomControl: false, attributionControl: false });
      L.tileLayer(GOOGLE_TILE, { maxZoom: 22, subdomains: ['0', '1', '2', '3'] }).addTo(leftMap);

      const rightMap = L.map(rightRef.current, { center, zoom: initZoom, zoomControl: false, attributionControl: false });
      L.tileLayer(GOOGLE_TILE, { maxZoom: 22, subdomains: ['0', '1', '2', '3'] }).addTo(rightMap);

      // Use TileJSON tile templates if available (they work without signing)
      const tileUrl1 = tj1?.tileTemplate || signedTileUrl1;
      const tileUrl2 = tj2?.tileTemplate || signedTileUrl2;

      const [leftResult, rightResult] = await Promise.all([
        loadSatelliteTiles(leftMap, { L, signedTileUrl: tileUrl1, tilejsonUrl: tilejsonUrl1, sceneCollection: sceneT1?.collection, sceneItemId: sceneT1?.item_id, thumbnailUrl: thumbnailT1, sceneBbox: tj1?.bounds?.length === 4 ? tj1.bounds : sceneBboxT1, aoiBbox: bbox, opacity: 0.9 }),
        loadSatelliteTiles(rightMap, { L, signedTileUrl: tileUrl2, tilejsonUrl: tilejsonUrl2, sceneCollection: sceneT2?.collection, sceneItemId: sceneT2?.item_id, thumbnailUrl: thumbnailT2, sceneBbox: tj2?.bounds?.length === 4 ? tj2.bounds : sceneBboxT2, aoiBbox: bbox, opacity: 0.9 }),
      ]);

      if (cancelled) return;
      setLeftLoading(false);
      setRightLoading(false);

      // AOI rectangle on both maps
      const aoiBounds = boundsToLatLng(bbox);
      L.rectangle(aoiBounds, { color: '#22d3ee', weight: 1, fillColor: '#22d3ee', fillOpacity: 0.03, dashArray: '6 3' }).addTo(leftMap);
      L.rectangle(aoiBounds, { color: '#22d3ee', weight: 1, fillColor: '#22d3ee', fillOpacity: 0.03, dashArray: '6 3' }).addTo(rightMap);

      const fitBounds = leftResult.hasImagery ? leftResult.bounds : rightResult.bounds;
      leftMap.fitBounds(fitBounds, { padding: [20, 20] });
      rightMap.fitBounds(fitBounds, { padding: [20, 20] });

      setTimeout(() => { leftMap.invalidateSize(); rightMap.invalidateSize(); }, 100);

      // Synchronize navigation
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
  }, [bbox, thumbnailT1, thumbnailT2, tilejsonUrl1, tilejsonUrl2, signedTileUrl1, signedTileUrl2, sceneBboxT1, sceneBboxT2]);

  return (
    <div className="w-full grid grid-cols-2 gap-[2px]" style={{ height: 'clamp(400px, 65vh, 700px)' }}>
      <div className="relative rounded-l-lg overflow-hidden bg-oq-950">
        <div ref={leftRef} className="absolute inset-0" />
        <div className="absolute top-2 left-2 z-[1000] px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest bg-oq-950/80" style={{ color: '#60A5FA', border: '1px solid rgba(96,165,250,0.2)' }}>Before</div>
        {leftLoading && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-oq-950/60">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-oq-900/90 border border-oq-700/30">
              <svg className="animate-spin h-3 w-3 text-lime" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              <span className="text-[9px] text-oq-200">Loading imagery...</span>
            </div>
          </div>
        )}
        <div className="absolute bottom-2 right-2 z-[1000] flex flex-col rounded overflow-hidden border border-oq-700/30" style={{ padding: 12 }}>
          <button onClick={() => leftMapRef.current?.zoomIn()} className="w-7 h-7 flex items-center justify-center text-oq-200 hover:text-lime hover:bg-oq-800/80 transition-colors text-xs font-bold bg-oq-950/70 backdrop-blur-sm rounded">+</button>
          <div className="h-px bg-oq-700/30 my-0.5" />
          <button onClick={() => leftMapRef.current?.zoomOut()} className="w-7 h-7 flex items-center justify-center text-oq-200 hover:text-lime hover:bg-oq-800/80 transition-colors text-xs font-bold bg-oq-950/70 backdrop-blur-sm rounded">−</button>
        </div>
      </div>
      <div className="relative rounded-r-lg overflow-hidden bg-oq-950">
        <div ref={rightRef} className="absolute inset-0" />
        <div className="absolute top-2 left-2 z-[1000] px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest bg-oq-950/80" style={{ color: '#FB923C', border: '1px solid rgba(251,146,60,0.2)' }}>After</div>
        {rightLoading && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-oq-950/60">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-oq-900/90 border border-oq-700/30">
              <svg className="animate-spin h-3 w-3 text-lime" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              <span className="text-[9px] text-oq-200">Loading imagery...</span>
            </div>
          </div>
        )}
        <div className="absolute bottom-2 right-2 z-[1000] flex flex-col rounded overflow-hidden border border-oq-700/30" style={{ padding: 12 }}>
          <button onClick={() => rightMapRef.current?.zoomIn()} className="w-7 h-7 flex items-center justify-center text-oq-200 hover:text-lime hover:bg-oq-800/80 transition-colors text-xs font-bold bg-oq-950/70 backdrop-blur-sm rounded">+</button>
          <div className="h-px bg-oq-700/30 my-0.5" />
          <button onClick={() => rightMapRef.current?.zoomOut()} className="w-7 h-7 flex items-center justify-center text-oq-200 hover:text-lime hover:bg-oq-800/80 transition-colors text-xs font-bold bg-oq-950/70 backdrop-blur-sm rounded">−</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ── Difference View ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
function DifferenceView({
  bbox, changeDetection, config, metrics,
  sceneT1, sceneT2, thumbnailT1, thumbnailT2, signedTileUrl1, signedTileUrl2, sceneBboxT1, sceneBboxT2,
}: {
  bbox: number[];
  changeDetection: Record<string, any> | null;
  config: typeof PHENOMENON_CONFIG[string];
  metrics: Record<string, any>;
  sceneT1?: SceneInfo | null;
  sceneT2?: SceneInfo | null;
  thumbnailT1?: string;
  thumbnailT2?: string;
  signedTileUrl1?: string;
  signedTileUrl2?: string;
  sceneBboxT1?: any;
  sceneBboxT2?: any;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const overlayLayerRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    let cancelled = false;

    import('leaflet').then(async (L) => {
      if (cancelled || !mapRef.current) return;

      const [west, south, east, north] = bbox;
      const center: [number, number] = [(south + north) / 2, (west + east) / 2];

      const map = L.map(mapRef.current, { center, zoom: 10, zoomControl: false, attributionControl: false });
      L.tileLayer(GOOGLE_TILE, { maxZoom: 22, subdomains: ['0', '1', '2', '3'] }).addTo(map);

      const baseResult = await loadSatelliteTiles(map, { L, signedTileUrl: signedTileUrl1, sceneCollection: sceneT1?.collection, sceneItemId: sceneT1?.item_id, thumbnailUrl: thumbnailT1, sceneBbox: sceneBboxT1, aoiBbox: bbox, opacity: 0.9, zIndex: 400 });
      const overlayResult = await loadSatelliteTiles(map, { L, signedTileUrl: signedTileUrl2, sceneCollection: sceneT2?.collection, sceneItemId: sceneT2?.item_id, thumbnailUrl: thumbnailT2, sceneBbox: sceneBboxT2, aoiBbox: bbox, opacity: overlayOpacity, zIndex: 500 });

      if (cancelled) return;

      if (overlayResult.layer) overlayLayerRef.current = overlayResult.layer;

      const fitBounds = baseResult.hasImagery ? baseResult.bounds : overlayResult.bounds;
      map.fitBounds(fitBounds, { padding: [30, 30], maxZoom: 14 });

      // AOI boundary
      L.rectangle([[south, west], [north, east]], { color: '#22d3ee', weight: 1, fillColor: '#22d3ee', fillOpacity: 0.02, dashArray: '6 4' }).addTo(map);

      mapInstanceRef.current = map;
    });

    return () => { cancelled = true; mapInstanceRef.current?.remove(); mapInstanceRef.current = null; overlayLayerRef.current = null; };
  }, [bbox, signedTileUrl1, signedTileUrl2, sceneT1?.item_id, sceneT2?.item_id]);

  useEffect(() => {
    if (overlayLayerRef.current?.setOpacity) overlayLayerRef.current.setOpacity(overlayOpacity);
  }, [overlayOpacity]);

  return (
    <div className="relative w-full rounded-lg overflow-hidden bg-oq-950" style={{ height: 'clamp(400px, 65vh, 700px)' }}>
      <div ref={mapRef} className="absolute inset-0" />
      <div className="absolute top-2 left-2 z-[1000] px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest bg-oq-950/80 text-oq-200 border border-oq-700/30 backdrop-blur-sm">
        Difference — {config.indexLabel} Overlay
      </div>
      {/* Opacity slider */}
      <div className="absolute top-10 left-2 z-[1000] bg-oq-950/85 backdrop-blur-sm rounded border border-oq-700/30 px-2 py-1.5">
        <div className="text-[8px] text-oq-300 uppercase tracking-wider mb-1">Blend</div>
        <div className="flex items-center gap-1.5">
          <span className="text-[8px] text-semantic-before w-7">Before</span>
          <input type="range" min={0} max={100} value={overlayOpacity * 100} onChange={(e) => setOverlayOpacity(parseInt(e.target.value) / 100)} className="w-16 h-0.5 accent-lime cursor-pointer" />
          <span className="text-[8px] text-semantic-after w-7 text-right">After</span>
        </div>
      </div>
      {/* Zoom */}
      <div className="absolute top-2 right-2 z-[1000] flex flex-col rounded overflow-hidden border border-oq-700/30" style={{ padding: 12 }}>
        <button onClick={() => mapInstanceRef.current?.zoomIn()} className="w-7 h-7 flex items-center justify-center text-oq-200 hover:text-lime hover:bg-oq-800/80 transition-colors text-xs font-bold bg-oq-950/70 backdrop-blur-sm rounded">+</button>
        <div className="h-px bg-oq-700/30 my-0.5" />
        <button onClick={() => mapInstanceRef.current?.zoomOut()} className="w-7 h-7 flex items-center justify-center text-oq-200 hover:text-lime hover:bg-oq-800/80 transition-colors text-xs font-bold bg-oq-950/70 backdrop-blur-sm rounded">−</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ── Scene Evidence Strip ────────────────────────────────────
// ══════════════════════════════════════════════════════════════
function SceneStrip({ scene, indexStats, label, color }: {
  scene: SceneInfo | null; indexStats: IndexInfo | null; label: string; color: string;
}) {
  if (!scene) return <div className="p-4 rounded-lg text-[10px] text-oq-300 text-center" style={{ background: 'rgba(13,23,17,0.6)', border: '1px solid rgba(42,58,47,0.5)' }}>No scene available</div>;

  const dateStr = scene.datetime ? new Date(scene.datetime).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

  return (
    <div className="p-4 rounded-lg" style={{ background: 'rgba(13,23,17,0.6)', border: '1px solid rgba(42,58,47,0.5)' }}>
      <div className="flex items-center gap-1.5 mb-3">
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
        <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: '#E5E7EB' }}>{label}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 mb-3">
        <div><div className="text-[8px] uppercase tracking-wider" style={{ color: '#9CA3AF' }}>Sensor</div><div className="text-[11px] font-medium" style={{ color: '#FFFFFF' }}>{scene.platform || '—'}</div></div>
        <div><div className="text-[8px] uppercase tracking-wider" style={{ color: '#9CA3AF' }}>Date</div><div className="text-[11px] font-medium" style={{ color: '#FFFFFF' }}>{dateStr}</div></div>
        <div><div className="text-[8px] uppercase tracking-wider" style={{ color: '#9CA3AF' }}>Cloud</div><div className="text-[11px] font-mono" style={{ color: '#FFFFFF' }}>{scene.cloud_cover != null ? `${scene.cloud_cover.toFixed(1)}%` : '—'}</div></div>
        <div><div className="text-[8px] uppercase tracking-wider" style={{ color: '#9CA3AF' }}>Collection</div><div className="text-[11px] font-mono truncate" style={{ color: '#FFFFFF' }}>{scene.collection}</div></div>
      </div>
      {indexStats && (
        <div className="pt-3" style={{ borderTop: '1px solid rgba(42,58,47,0.4)' }}>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {Object.entries(indexStats.stats).slice(0, 6).map(([key, val]) => (
              <div key={key} className="text-center">
                <div className="text-[7px] uppercase tracking-wider mb-0.5" style={{ color: '#9CA3AF' }}>{key}</div>
                <div className="text-[11px] font-mono font-medium" style={{ color: '#FFFFFF' }}>{typeof val === 'number' ? val.toFixed(4) : String(val)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ── Processing Pipeline ─────────────────────────────────────
// ══════════════════════════════════════════════════════════════
const PIPELINE_STAGES = [
  { num: '01', label: 'Query interpretation' },
  { num: '02', label: 'Area of interest extraction' },
  { num: '03', label: 'Satellite imagery discovery' },
  { num: '04', label: 'Cloud filtering' },
  { num: '05', label: 'Band selection' },
  { num: '06', label: 'Spectral index computation' },
  { num: '07', label: 'Temporal comparison' },
  { num: '08', label: 'Change detection' },
];

function ProcessingPipeline({ steps }: { steps: Array<{ step: string; detail: string }> }) {
  return (
    <div className="grid grid-cols-3 md:grid-cols-9 gap-[2px]">
      {PIPELINE_STAGES.map((stage, i) => {
        const completed = i < steps.length;
        return (
          <div key={stage.num} className={`p-2 rounded text-center ${completed ? 'bg-lime/8 border border-lime/15' : 'bg-oq-800/20 border border-oq-700/10'}`}>
            <div className={`text-[9px] font-mono font-bold mb-0.5 ${completed ? 'text-lime' : 'text-oq-400'}`}>{stage.num}</div>
            <div className={`text-[8px] leading-tight ${completed ? 'text-oq-100' : 'text-oq-400'}`}>{stage.label}</div>
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ── Three-Panel View (Before → After → Change) ──────────────
// ══════════════════════════════════════════════════════════════
function ThreePanelView({
  bbox, sceneT1, sceneT2, thumbnailT1, thumbnailT2, sceneBboxT1, sceneBboxT2,
  changeMaskB64, diffVisB64, changeVisBbox, config,
}: {
  bbox: number[];
  sceneT1: SceneInfo | null; sceneT2: SceneInfo | null;
  thumbnailT1?: string; thumbnailT2?: string;
  sceneBboxT1?: any; sceneBboxT2?: any;
  changeMaskB64: string | null;
  diffVisB64: string | null;
  changeVisBbox: number[] | null;
  config: { color: string; label: string; indexLabel: string };
}) {
  const leftRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const leftMapRef = useRef<any>(null);
  const centerMapRef = useRef<any>(null);
  const [vizMode, setVizMode] = useState<'change-mask' | 'difference'>('change-mask');
  const [loading, setLoading] = useState({ left: true, center: true });

  useEffect(() => {
    if (!leftRef.current || !centerRef.current || leftMapRef.current) return;
    let cancelled = false;

    import('leaflet').then(async (L) => {
      if (cancelled || !leftRef.current || !centerRef.current) return;

      const initBounds = parseBbox(sceneBboxT1) || parseBbox(sceneBboxT2) || bbox;
      const [west, south, east, north] = initBounds;
      const center: [number, number] = [(south + north) / 2, (west + east) / 2];
      const latDiff = north - south;
      const lngDiff = east - west;
      const initZoom = Math.min(12, Math.max(6, Math.floor(Math.log2(360 / Math.max(latDiff, lngDiff)))));

      const leftMap = L.map(leftRef.current, { center, zoom: initZoom, zoomControl: false, attributionControl: false });
      L.tileLayer(GOOGLE_TILE, { maxZoom: 22, subdomains: ['0', '1', '2', '3'] }).addTo(leftMap);

      const centerMap = L.map(centerRef.current, { center, zoom: initZoom, zoomControl: false, attributionControl: false });
      L.tileLayer(GOOGLE_TILE, { maxZoom: 22, subdomains: ['0', '1', '2', '3'] }).addTo(centerMap);

      const [leftResult, centerResult] = await Promise.all([
        loadSatelliteTiles(leftMap, { L, sceneCollection: sceneT1?.collection, sceneItemId: sceneT1?.item_id, thumbnailUrl: thumbnailT1, sceneBbox: sceneBboxT1, aoiBbox: bbox, opacity: 0.9 }),
        loadSatelliteTiles(centerMap, { L, sceneCollection: sceneT2?.collection, sceneItemId: sceneT2?.item_id, thumbnailUrl: thumbnailT2, sceneBbox: sceneBboxT2, aoiBbox: bbox, opacity: 0.9 }),
      ]);

      if (cancelled) return;
      setLoading({ left: false, center: false });

      const aoiBounds = boundsToLatLng(bbox);
      L.rectangle(aoiBounds, { color: '#22d3ee', weight: 1, fillColor: '#22d3ee', fillOpacity: 0.03, dashArray: '6 3' }).addTo(leftMap);
      L.rectangle(aoiBounds, { color: '#22d3ee', weight: 1, fillColor: '#22d3ee', fillOpacity: 0.03, dashArray: '6 3' }).addTo(centerMap);

      leftMap.fitBounds(leftResult.bounds, { padding: [15, 15] });
      centerMap.fitBounds(centerResult.bounds, { padding: [15, 15] });

      setTimeout(() => { leftMap.invalidateSize(); centerMap.invalidateSize(); }, 100);

      leftMap.on('move', () => {
        centerMap.setView(leftMap.getCenter(), leftMap.getZoom(), { animate: false });
      });
      centerMap.on('move', () => {
        leftMap.setView(centerMap.getCenter(), centerMap.getZoom(), { animate: false });
      });

      leftMapRef.current = leftMap;
      centerMapRef.current = centerMap;
    });

    return () => {
      cancelled = true;
      leftMapRef.current?.remove();
      centerMapRef.current?.remove();
      leftMapRef.current = null;
      centerMapRef.current = null;
    };
  }, [bbox, thumbnailT1, thumbnailT2, sceneBboxT1, sceneBboxT2]);

  // Decode the visualization hex string to a data URL
  const decodeVis = (hex: string | null): string | null => {
    if (!hex) return null;
    try {
      const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
      const blob = new Blob([bytes], { type: 'image/png' });
      return URL.createObjectURL(blob);
    } catch { return null; }
  };

  const changeMaskUrl = decodeVis(changeMaskB64);
  const diffVisUrl = decodeVis(diffVisB64);
  const activeVisUrl = vizMode === 'change-mask' ? changeMaskUrl : diffVisUrl;
  const visBbox = changeVisBbox || bbox;
  const visBoundsStr = `${visBbox[1]},${visBbox[0]},${visBbox[3]},${visBbox[2]}`;

  // Add/remove image overlay when viz changes
  const overlayRef = useRef<any>(null);
  useEffect(() => {
    if (!centerMapRef.current || !activeVisUrl) return;
    const map = centerMapRef.current;
    if (overlayRef.current) {
      map.removeLayer(overlayRef.current);
      overlayRef.current = null;
    }
    const bounds: [[number, number], [number, number]] = [[visBbox[1], visBbox[0]], [visBbox[3], visBbox[2]]];
    import('leaflet').then(({ default: L }) => {
      const img = L.imageOverlay(activeVisUrl, bounds as any, { opacity: 0.75, zIndex: 450 }).addTo(map);
      overlayRef.current = img;
    });
    return () => { if (overlayRef.current) { map.removeLayer(overlayRef.current); overlayRef.current = null; } };
  }, [activeVisUrl, visBoundsStr]);

  return (
    <div className="relative">
      {/* Three panels */}
      <div className="grid grid-cols-3 gap-[2px]" style={{ height: 'clamp(400px, 65vh, 700px)' }}>
        {/* Before */}
        <div className="relative rounded-l-lg overflow-hidden bg-oq-950">
          <div ref={leftRef} className="absolute inset-0" />
          <div className="absolute top-2 left-2 z-[1000] px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest bg-oq-950/80" style={{ color: '#60A5FA', border: '1px solid rgba(96,165,250,0.2)' }}>Before</div>
          {loading.left && (
            <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-oq-950/60">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-oq-900/90 border border-oq-700/30">
                <svg className="animate-spin h-3 w-3 text-lime" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                <span className="text-[9px] text-oq-200">Loading...</span>
              </div>
            </div>
          )}
        </div>

        {/* After */}
        <div className="relative overflow-hidden bg-oq-950">
          <div ref={centerRef} className="absolute inset-0" />
          <div className="absolute top-2 left-2 z-[1000] px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest bg-oq-950/80" style={{ color: '#FB923C', border: '1px solid rgba(251,146,60,0.2)' }}>After</div>
          {loading.center && (
            <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-oq-950/60">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-oq-900/90 border border-oq-700/30">
                <svg className="animate-spin h-3 w-3 text-lime" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                <span className="text-[9px] text-oq-200">Loading...</span>
              </div>
            </div>
          )}
        </div>

        {/* Change Detected */}
        <div className="relative rounded-r-lg overflow-hidden bg-oq-950">
          <div ref={rightRef} className="absolute inset-0 bg-oq-950" />
          <div className="absolute top-2 left-2 z-[1000] px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest bg-oq-950/80" style={{ color: '#10B981', border: '1px solid rgba(16,185,129,0.2)' }}>Change Detected</div>
          {activeVisUrl ? (
            <img src={activeVisUrl} className="absolute inset-0 w-full h-full object-cover z-[500]" style={{ mixBlendMode: 'screen' }} alt="Change detection visualization" />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-[500]">
              <svg className="w-6 h-6 mb-1" style={{ color: '#68756E' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>
              <span className="text-[9px]" style={{ color: '#9CA3AF' }}>No visualization available</span>
            </div>
          )}
          {/* Zoom controls */}
          <div className="absolute bottom-2 right-2 z-[1000] flex flex-col rounded overflow-hidden border border-oq-700/30" style={{ padding: 10 }}>
            <button onClick={() => { leftMapRef.current?.zoomIn(); centerMapRef.current?.zoomIn(); }} className="w-6 h-6 flex items-center justify-center text-oq-200 hover:text-lime bg-oq-950/70 backdrop-blur-sm rounded text-xs font-bold">+</button>
            <div className="h-px bg-oq-700/30 my-0.5" />
            <button onClick={() => { leftMapRef.current?.zoomOut(); centerMapRef.current?.zoomOut(); }} className="w-6 h-6 flex items-center justify-center text-oq-200 hover:text-lime bg-oq-950/70 backdrop-blur-sm rounded text-xs font-bold">−</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ── Annual Trend Chart ──────────────────────────────────────
// ══════════════════════════════════════════════════════════════
function AnnualTrendChart({ result, config }: { result: TemporalComparisonResult; config: { color: string; indexLabel: string } }) {
  const t1 = result.index_t1;
  const t2 = result.index_t2;
  if (!t1 || !t2) return null;

  const meanT1 = t1.stats?.mean ?? 0;
  const meanT2 = t2.stats?.mean ?? 0;
  const changedArea = (result.metrics?.changed_area_km2 as number) || 0;

  const dateT1 = result.scene_t1?.datetime ? new Date(result.scene_t1.datetime).getFullYear() : 2021;
  const dateT2 = result.scene_t2?.datetime ? new Date(result.scene_t2.datetime).getFullYear() : 2025;

  const years: number[] = [];
  for (let y = dateT1; y <= dateT2; y++) years.push(y);
  if (years.length < 2) return null;

  const trendData = years.map((year, i) => {
    const t = years.length > 1 ? i / (years.length - 1) : 0;
    const indexVal = meanT1 + (meanT2 - meanT1) * t;
    const areaKm2 = Math.abs(changedArea) * t;
    return { year: String(year), index: parseFloat(indexVal.toFixed(4)), area: parseFloat(areaKm2.toFixed(1)) };
  });

  return (
    <details className="rounded-lg border border-oq-700/15 bg-oq-800/15 overflow-hidden group" open>
      <summary className="px-4 py-2.5 text-[10px] font-semibold text-oq-200 uppercase tracking-wider cursor-pointer hover:text-oq-50 transition-colors flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <svg className="w-3 h-3 text-oq-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>
          Annual Trend ({dateT1} - {dateT2})
        </span>
        <svg className="w-3.5 h-3.5 text-oq-300 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </summary>
      <div className="px-4 pb-4">
        <div className="mb-2">
          <span className="text-[9px] text-oq-300">Interpolated trend between {dateT1} and {dateT2} observations</span>
        </div>
        <RechartsTrendChart data={trendData} indexLabel={config.indexLabel} />
      </div>
    </details>
  );
}

// ══════════════════════════════════════════════════════════════
// ── MAIN COMPONENT ──────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
export default function TemporalComparisonView({ result }: Props) {
  const config = PHENOMENON_CONFIG[result.phenomenon] || PHENOMENON_CONFIG.land_cover_change;
  const metrics = result.metrics || {};
  const explanation = result.explanation || {};
  const sensorInfo = result.sensor_info || {};
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');

  const isFallback = (metrics as any).fallbackMode;

  // ── Extract values from result (never fabricate) ──────────
  const changedArea = metrics.changed_area_km2;
  const changedPct = metrics.changed_pct;
  const deltaIndex = metrics.delta_index;
  const direction = metrics.direction;
  const changedPixels = result.change_detection?.changed_pixels || result.change_detection?.changedPixels || 0;
  const totalPixels = result.change_detection?.total_pixels || 0;

  // Format direction as trend label
  const trendLabel = (() => {
    if (!direction || direction === 'N/A') return null;
    const map: Record<string, string> = {
      expansion: 'URBAN EXPANSION', increase: 'INCREASE', loss: 'LOSS', decrease: 'DECREASE',
      flooding: 'FLOODING', shrinking: 'SHRINKING', retreat: 'GLACIER RETREAT',
      erosion: 'EROSION', burned: 'BURN DAMAGE', drier: 'DROUGHT', wetter: 'WETTING',
      stable: 'STABLE', accretion: 'ACCRETION', gain: 'VEGETATION GAIN',
    };
    return map[direction] || direction.toUpperCase();
  })();

  // ── Has valid imagery? ───────────────────────────────────
  const hasImagery = !isFallback && result.aoi_bbox && result.aoi_bbox.length === 4;

  return (
    <div className="space-y-0" style={{ background: 'var(--color-bg-deep)' }}>

      {/* ════════════════════════════════════════════════════════ */}
      {/* ── MAP AREA (dominant element) ─────────────────────── */}
      {/* ════════════════════════════════════════════════════════ */}
      {hasImagery && (
        <>
          {/* ── Map container with mode switcher overlaid ── */}
          <div className="relative border border-oq-700/20 rounded-lg overflow-hidden">
            {/* Mode switcher — centered at top of map */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1010]">
              <div className="inline-flex bg-oq-950/85 backdrop-blur-sm rounded border border-oq-700/30 p-[2px]">
                {(['side-by-side', 'swipe', 'difference', 'change-mask'] as ViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={`px-3 py-1 rounded text-[9px] font-semibold uppercase tracking-wider transition-all ${
                      viewMode === mode ? 'bg-lime text-oq-950' : 'text-oq-300 hover:text-oq-100 hover:bg-oq-800/50'
                    }`}
                  >
                    {mode === 'side-by-side' && 'Side by Side'}
                    {mode === 'swipe' && 'Swipe'}
                    {mode === 'difference' && 'Difference'}
                    {mode === 'change-mask' && 'Change Mask'}
                  </button>
                ))}
              </div>
            </div>

            {/* Map views */}
          {viewMode === 'side-by-side' && (
            <SynchronizedDualMap
              bbox={result.aoi_bbox}
              sceneT1={result.scene_t1} sceneT2={result.scene_t2}
              thumbnailT1={result.imagery?.period1?.thumbnail} thumbnailT2={result.imagery?.period2?.thumbnail}
              signedTileUrl1={result.imagery?.period1?.tile_url as string}
              signedTileUrl2={result.imagery?.period2?.tile_url as string}
              tilejsonUrl1={result.imagery?.period1?.tilejson as string}
              tilejsonUrl2={result.imagery?.period2?.tilejson as string}
              sceneBboxT1={result.imagery?.period1?.bbox || result.scene_t1?.bbox}
              sceneBboxT2={result.imagery?.period2?.bbox || result.scene_t2?.bbox}
            />
          )}
          {viewMode === 'swipe' && (
            <SwipeMap
              bbox={result.aoi_bbox}
              thumbnailT1={result.imagery?.period1?.thumbnail} thumbnailT2={result.imagery?.period2?.thumbnail}
              signedTileUrl1={result.imagery?.period1?.tile_url as string}
              signedTileUrl2={result.imagery?.period2?.tile_url as string}
              tilejsonUrl1={result.imagery?.period1?.tilejson as string}
              tilejsonUrl2={result.imagery?.period2?.tilejson as string}
              sceneT1={result.scene_t1} sceneT2={result.scene_t2}
              sceneBboxT1={result.imagery?.period1?.bbox || result.scene_t1?.bbox}
              sceneBboxT2={result.imagery?.period2?.bbox || result.scene_t2?.bbox}
            />
          )}
          {viewMode === 'difference' && (
            <DifferenceView
              bbox={result.aoi_bbox}
              changeDetection={result.change_detection} config={config} metrics={metrics}
              sceneT1={result.scene_t1} sceneT2={result.scene_t2}
              thumbnailT1={result.imagery?.period1?.thumbnail} thumbnailT2={result.imagery?.period2?.thumbnail}
              signedTileUrl1={result.imagery?.period1?.tile_url as string}
              signedTileUrl2={result.imagery?.period2?.tile_url as string}
              sceneBboxT1={result.imagery?.period1?.bbox || result.scene_t1?.bbox}
              sceneBboxT2={result.imagery?.period2?.bbox || result.scene_t2?.bbox}
            />
          )}
          {viewMode === 'change-mask' && (
            <ThreePanelView
              bbox={result.aoi_bbox}
              sceneT1={result.scene_t1} sceneT2={result.scene_t2}
              thumbnailT1={result.imagery?.period1?.thumbnail} thumbnailT2={result.imagery?.period2?.thumbnail}
              sceneBboxT1={result.imagery?.period1?.bbox || result.scene_t1?.bbox}
              sceneBboxT2={result.imagery?.period2?.bbox || result.scene_t2?.bbox}
              changeMaskB64={result.change_visualizations?.change_mask_png || null}
              diffVisB64={result.change_visualizations?.difference_png || null}
              changeVisBbox={result.change_visualizations?.bbox || null}
              config={config}
            />
          )}

          </div>{/* end map container */}

          {/* ── CHANGE SUMMARY (below map) ─── */}
          <div className="mt-4 px-1">
            <div className="max-w-3xl mx-auto">
              {/* Phenomenon label */}
              <div className="mb-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider" style={{ background: `${config.color}15`, color: config.color, border: `1px solid ${config.color}25` }}>
                  {config.label}
                </span>
                <span className="text-[10px] text-oq-300 ml-2 font-mono">{result.aoi_name}</span>
              </div>

              {/* Key metrics row */}
              <div className="flex items-end gap-6 flex-wrap">
                {/* Changed area */}
                {changedArea != null && changedArea > 0 ? (
                  <div>
                    <div className="text-[8px] uppercase tracking-wider font-medium mb-0.5" style={{ color: '#E5E7EB' }}>Change Detected</div>
                    <div className="text-[28px] font-bold leading-none tracking-tight" style={{ color: '#FFFFFF' }}>
                      {typeof changedArea === 'number' ? changedArea.toLocaleString(undefined, { maximumFractionDigits: 0 }) : changedArea} km²
                    </div>
                    {changedPct != null && (
                      <div className="text-[10px] mt-0.5" style={{ color: '#E5E7EB' }}>{typeof changedPct === 'number' ? changedPct.toFixed(1) : changedPct}% of study area</div>
                    )}
                  </div>
                ) : changedPct != null && changedPct > 0 ? (
                  <div>
                    <div className="text-[8px] text-oq-300 uppercase tracking-wider font-medium mb-0.5">Change Detected</div>
                    <div className="text-[28px] font-bold text-oq-50 leading-none tracking-tight">{typeof changedPct === 'number' ? changedPct.toFixed(1) : changedPct}%</div>
                    <div className="text-[10px] text-oq-300 mt-0.5">of study area</div>
                  </div>
                ) : (
                  <div>
                    <div className="text-[8px] text-oq-300 uppercase tracking-wider font-medium mb-0.5">Status</div>
                    <div className="text-[28px] font-bold text-oq-50 leading-none tracking-tight">STABLE</div>
                    <div className="text-[10px] text-oq-300 mt-0.5">minimal change detected</div>
                  </div>
                )}

                {/* Index change */}
                {deltaIndex != null && (
                  <div>
                    <div className="text-[8px] uppercase tracking-wider font-medium mb-0.5" style={{ color: '#E5E7EB' }}>{config.indexLabel} Change</div>
                    <div className="text-[22px] font-bold leading-none tracking-tight" style={{ color: config.color }}>
                      {deltaIndex > 0 ? '+' : ''}{typeof deltaIndex === 'number' ? deltaIndex.toFixed(2) : deltaIndex}
                    </div>
                  </div>
                )}

                {/* Direction / trend */}
                {trendLabel && (
                  <div>
                    <div className="text-[8px] uppercase tracking-wider font-medium mb-0.5" style={{ color: '#E5E7EB' }}>Detected Trend</div>
                    <div className="text-[16px] font-bold leading-none tracking-tight" style={{ color: '#FFFFFF' }}>{trendLabel}</div>
                  </div>
                )}
              </div>

              {/* Changed pixels (if raster-derived) */}
              {changedPixels > 0 && (
                <div className="mt-2 flex items-center gap-3">
                  <span className="text-[9px] font-mono" style={{ color: '#E5E7EB' }}>{changedPixels.toLocaleString()} changed pixels</span>
                  {totalPixels > 0 && <span className="text-[9px]" style={{ color: '#9CA3AF' }}>/ {totalPixels.toLocaleString()} total</span>}
                  {metrics.raster_derived && <span className="text-[8px] text-lime/70 font-medium">RASTER-DERIVED</span>}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/* ── PROGRESSIVE DISCLOSURE SECTIONS ─────────────────── */}
      {/* ════════════════════════════════════════════════════════ */}
      <div className="max-w-[1400px] mx-auto px-6 py-4 space-y-2">

        {/* ── 1. Analysis Summary ──────────────────────────── */}
        <details className="rounded-lg border border-oq-700/15 bg-oq-800/15 overflow-hidden group" open>
          <summary className="px-4 py-2.5 text-[10px] font-semibold text-oq-200 uppercase tracking-wider cursor-pointer hover:text-oq-50 transition-colors flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <svg className="w-3 h-3 text-oq-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              Analysis Summary
            </span>
            <svg className="w-3.5 h-3.5 text-oq-300 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </summary>
          <div className="px-4 pb-3 space-y-3">
            {/* Executive summary */}
            {explanation.summary && (
              <p className="text-[11px] text-oq-200 leading-relaxed" style={{ maxWidth: '75ch' }}>{explanation.summary}</p>
            )}
            {/* Key findings */}
            {explanation.key_findings && Array.isArray(explanation.key_findings) && explanation.key_findings.length > 0 && (
              <div className="space-y-1">
                {explanation.key_findings.map((f: string, i: number) => (
                  <div key={i} className="flex items-start gap-1.5 text-[11px] text-oq-200">
                    <span className="mt-0.5 flex-shrink-0" style={{ color: config.color }}>▸</span>
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            )}
            {/* Confidence */}
            {explanation.confidence && (
              <div className="p-2.5 rounded bg-oq-800/30 border border-oq-700/15">
                <div className="text-[8px] text-oq-300 uppercase tracking-wider font-medium mb-1">Confidence</div>
                <p className="text-[10px] text-oq-200 leading-relaxed">{explanation.confidence}</p>
              </div>
            )}
            {/* Limitations */}
            {explanation.limitations && explanation.limitations.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {explanation.limitations.map((lim: string, i: number) => (
                  <span key={i} className="text-[8px] text-oq-300 bg-oq-800/30 px-1.5 py-0.5 rounded border border-oq-700/10">{lim}</span>
                ))}
              </div>
            )}
          </div>
        </details>

        {/* ── 2. Scene Evidence ─────────────────────────────── */}
        {!isFallback && (
          <details className="rounded-lg border border-oq-700/15 bg-oq-800/15 overflow-hidden group">
            <summary className="px-4 py-2.5 text-[10px] font-semibold text-oq-200 uppercase tracking-wider cursor-pointer hover:text-oq-50 transition-colors flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <svg className="w-3 h-3 text-oq-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                Scene Evidence
              </span>
              <svg className="w-3.5 h-3.5 text-oq-300 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </summary>
            <div className="px-4 pb-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <SceneStrip scene={result.scene_t1} indexStats={result.index_t1} label="Baseline" color="var(--color-before)" />
                <SceneStrip scene={result.scene_t2} indexStats={result.index_t2} label="Comparison" color="var(--color-after)" />
              </div>
              {/* Change detection details */}
              {result.change_detection && (
                <div className="mt-2 p-2.5 rounded bg-oq-800/20 border border-oq-700/10">
                  <div className="text-[8px] text-oq-300 uppercase tracking-wider font-medium mb-1.5">Change Detection</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-1">
                    <div><div className="text-[7px] text-oq-300 uppercase">Algorithm</div><div className="text-[10px] text-oq-100 font-mono">{result.change_detection.algorithm || 'difference_threshold'}</div></div>
                    <div><div className="text-[7px] text-oq-300 uppercase">Index</div><div className="text-[10px] text-oq-100 font-mono">{config.indexLabel}</div></div>
                    <div><div className="text-[7px] text-oq-300 uppercase">Changed Pixels</div><div className="text-[10px] text-oq-100 font-mono">{(result.change_detection.changed_pixels || result.change_detection.changedPixels || 0).toLocaleString()}</div></div>
                    <div><div className="text-[7px] text-oq-300 uppercase">Regions</div><div className="text-[10px] text-oq-100 font-mono">{result.change_detection.num_regions || result.change_detection.numRegions || 0}</div></div>
                  </div>
                </div>
              )}
            </div>
          </details>
        )}

        {/* ── 3. Annual Trend ──────────────────────────────── */}
        <AnnualTrendChart result={result} config={config} />

        {/* ── 4. Methodology ────────────────────────────────── */}
        {(explanation.methodology || sensorInfo.index_formula) && (
          <details className="rounded-lg border border-oq-700/15 bg-oq-800/15 overflow-hidden group">
            <summary className="px-4 py-2.5 text-[10px] font-semibold text-oq-200 uppercase tracking-wider cursor-pointer hover:text-oq-50 transition-colors flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <svg className="w-3 h-3 text-oq-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                Methodology
              </span>
              <svg className="w-3.5 h-3.5 text-oq-300 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </summary>
            <div className="px-4 pb-3 space-y-2">
              {explanation.methodology && (
                <p className="text-[11px] text-oq-200 leading-relaxed">{explanation.methodology}</p>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <div>
                  <div className="text-[8px] text-oq-300 uppercase">Index</div>
                  <div className="text-[11px] text-oq-100 font-mono">{sensorInfo.index_used || config.indexLabel}</div>
                </div>
                {sensorInfo.index_formula && (
                  <div className="col-span-2">
                    <div className="text-[8px] text-oq-300 uppercase">Formula</div>
                    <div className="text-[11px] text-oq-100 font-mono">{sensorInfo.index_formula}</div>
                  </div>
                )}
                <div>
                  <div className="text-[8px] text-oq-300 uppercase">Resolution</div>
                  <div className="text-[11px] text-oq-100">{sensorInfo.resolution_m || 10}m</div>
                </div>
              </div>
            </div>
          </details>
        )}

        {/* ── 5. Processing Pipeline ────────────────────────── */}
        {result.processing_steps && result.processing_steps.length > 0 && (
          <details className="rounded-lg border border-oq-700/15 bg-oq-800/15 overflow-hidden group">
            <summary className="px-4 py-2.5 text-[10px] font-semibold text-oq-200 uppercase tracking-wider cursor-pointer hover:text-oq-50 transition-colors flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <svg className="w-3 h-3 text-oq-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                Processing Pipeline — {result.processing_steps.length} stages
              </span>
              <svg className="w-3.5 h-3.5 text-oq-300 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </summary>
            <div className="px-4 pb-3">
              <ProcessingPipeline steps={result.processing_steps} />
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
