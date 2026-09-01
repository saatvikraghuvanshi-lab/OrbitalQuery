'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import {
  loadSatelliteTiles,
  buildTileJsonUrl,
  boundsToLatLng,
  parseBbox,
} from '@/lib/satellite-tiles';
import type { SceneInfo } from '@/hooks/useAnalysis';

const GOOGLE_TILE = 'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}';

interface SwipeMapProps {
  bbox: number[];
  thumbnailT1?: string;
  thumbnailT2?: string;
  tilejsonUrl1?: string;
  tilejsonUrl2?: string;
  signedTileUrl1?: string;
  signedTileUrl2?: string;
  sceneBboxT1?: any;
  sceneBboxT2?: any;
  sceneT1?: SceneInfo | null;
  sceneT2?: SceneInfo | null;
}

/**
 * Swipe comparison using two full-size stacked Leaflet maps.
 *
 * Architecture:
 * - Bottom map (z-index 1): Period 2 (After) — full satellite imagery
 * - Top map (z-index 2): Period 1 (Before) — satellite imagery clipped by CSS clip-path
 * - Both maps share the same Google basemap and are always at the same center/zoom
 * - A draggable divider controls the clip-path of the top map's satellite layer
 *
 * Key insight: We clip the SATELLITE IMAGERY LAYER, not the entire map.
 * Both maps' basemaps, controls, and interactions remain fully intact.
 */
export default function SwipeMap({
  bbox,
  thumbnailT1,
  thumbnailT2,
  signedTileUrl1,
  signedTileUrl2,
  tilejsonUrl1,
  tilejsonUrl2,
  sceneBboxT1,
  sceneBboxT2,
  sceneT1,
  sceneT2,
}: SwipeMapProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomMapRef = useRef<any>(null);
  const topMapRef = useRef<any>(null);
  const syncingRef = useRef(false);
  const topSatelliteRef = useRef<any>(null); // Ref to the clipped satellite layer
  const [splitPos, setSplitPos] = useState(50);
  const draggingRef = useRef(false);
  const [bottomError, setBottomError] = useState<string | null>(null);
  const [topError, setTopError] = useState<string | null>(null);

  useEffect(() => {
    if (!bottomRef.current || !topRef.current || bottomMapRef.current) return;
    let cancelled = false;

    import('leaflet').then(async (L) => {
      if (cancelled || !bottomRef.current || !topRef.current) return;

      // Fetch TileJSON to get correct tile templates + bounds for each scene
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

      // Use TileJSON bounds for init zoom if available
      const initBounds = (tj2?.bounds && tj2.bounds.length === 4 ? tj2.bounds : null)
        || (tj1?.bounds && tj1.bounds.length === 4 ? tj1.bounds : null)
        || parseBbox(sceneBboxT1) || parseBbox(sceneBboxT2) || bbox;
      const [west, south, east, north] = initBounds;
      const center: [number, number] = [(south + north) / 2, (west + east) / 2];
      const latDiff = north - south;
      const lngDiff = east - west;
      const initZoom = Math.min(12, Math.max(6, Math.floor(Math.log2(360 / Math.max(latDiff, lngDiff)))));

      // Use TileJSON tile templates if available (they work without signing)
      const tileUrl1 = tj1?.tileTemplate || signedTileUrl1;
      const tileUrl2 = tj2?.tileTemplate || signedTileUrl2;

      // ── Create both maps with Google Satellite basemap ──────
      const bottomMap = L.map(bottomRef.current, {
        center, zoom: initZoom, zoomControl: false, attributionControl: false,
        zoomSnap: 0.25, zoomDelta: 0.5,
      });
      L.tileLayer(GOOGLE_TILE, { maxZoom: 22, subdomains: ['0', '1', '2', '3'] }).addTo(bottomMap);

      const topMap = L.map(topRef.current, {
        center, zoom: initZoom, zoomControl: false, attributionControl: false,
        zoomSnap: 0.25, zoomDelta: 0.5,
      });
      L.tileLayer(GOOGLE_TILE, { maxZoom: 22, subdomains: ['0', '1', '2', '3'] }).addTo(topMap);

      // ── Load satellite imagery for both periods ──────────────
      // Period 2 (After) → Bottom map (full, no clipping)
      const bottomResult = await loadSatelliteTiles(bottomMap, {
        L,
        signedTileUrl: tileUrl2,
        tilejsonUrl: tilejsonUrl2,
        sceneCollection: sceneT2?.collection,
        sceneItemId: sceneT2?.item_id,
        thumbnailUrl: thumbnailT2,
        sceneBbox: tj2?.bounds?.length === 4 ? tj2.bounds : sceneBboxT2,
        aoiBbox: bbox,
        opacity: 0.9,
      });

      // Period 1 (Before) → Top map (clipped via CSS clip-path)
      const topResult = await loadSatelliteTiles(topMap, {
        L,
        signedTileUrl: tileUrl1,
        tilejsonUrl: tilejsonUrl1,
        sceneCollection: sceneT1?.collection,
        sceneItemId: sceneT1?.item_id,
        thumbnailUrl: thumbnailT1,
        sceneBbox: tj1?.bounds?.length === 4 ? tj1.bounds : sceneBboxT1,
        aoiBbox: bbox,
        opacity: 0.9,
      });

      if (cancelled) return;

      if (!bottomResult.hasImagery) setBottomError(bottomResult.error || null);
      if (!topResult.hasImagery) setTopError(topResult.error || null);

      // Store reference to the top satellite layer for clip-path application
      if (topResult.layer) {
        topSatelliteRef.current = topResult.layer;
        // Apply initial clip-path to the satellite layer's container
        applyClip(topResult.layer, splitPos);
      }

      // ── Fit both maps to the same bounds ────────────────────
      const sharedBounds = bottomResult.bounds;
      bottomMap.fitBounds(sharedBounds, { padding: [30, 30] });
      topMap.fitBounds(sharedBounds, { padding: [30, 30] });

      setTimeout(() => {
        bottomMap.invalidateSize();
        topMap.invalidateSize();
      }, 100);

      // ── Synchronize navigation ──────────────────────────────
      bottomMap.on('move', () => {
        if (syncingRef.current) return;
        syncingRef.current = true;
        topMap.setView(bottomMap.getCenter(), bottomMap.getZoom(), { animate: false });
        syncingRef.current = false;
      });
      topMap.on('move', () => {
        if (syncingRef.current) return;
        syncingRef.current = true;
        bottomMap.setView(topMap.getCenter(), topMap.getZoom(), { animate: false });
        syncingRef.current = false;
      });

      bottomMapRef.current = bottomMap;
      topMapRef.current = topMap;
    });

    return () => {
      cancelled = true;
      bottomMapRef.current?.remove();
      topMapRef.current?.remove();
      bottomMapRef.current = null;
      topMapRef.current = null;
      topSatelliteRef.current = null;
    };
  }, [bbox, thumbnailT1, thumbnailT2, signedTileUrl1, signedTileUrl2, tilejsonUrl1, tilejsonUrl2, sceneBboxT1, sceneBboxT2]);

  // Apply clip-path to the satellite imagery layer
  function applyClip(layer: any, pos: number) {
    if (!layer?.getContainer) return;
    const el = layer.getContainer();
    if (el) {
      el.style.clipPath = `inset(0 ${100 - pos}% 0 0)`;
      el.style.zIndex = '500'; // Above basemap, below controls
    }
  }

  // Update clip when split position changes
  useEffect(() => {
    if (topSatelliteRef.current) {
      applyClip(topSatelliteRef.current, splitPos);
    }
  }, [splitPos]);

  const handleMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    draggingRef.current = true;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingRef.current || !bottomRef.current) return;
    const rect = bottomRef.current.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setSplitPos(Math.max(5, Math.min(95, pct)));
  }, []);

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!bottomRef.current) return;
    const rect = bottomRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    const pct = ((touch.clientX - rect.left) / rect.width) * 100;
    setSplitPos(Math.max(5, Math.min(95, pct)));
  }, []);

  return (
    <div
      className="relative w-full rounded-xl overflow-hidden border border-[var(--color-accent-border)] select-none"
      style={{ height: '520px' }}
      onMouseMove={handleMouseMove}
      onMouseUp={handlePointerUp}
      onMouseLeave={handlePointerUp}
      onTouchMove={handleTouchMove}
      onTouchEnd={handlePointerUp}
    >
      {/* Bottom map = Period 2 (After) — full satellite imagery visible */}
      <div ref={bottomRef} className="absolute inset-0" />

      {/* Top map = Period 1 (Before) — satellite imagery clipped, basemap visible everywhere */}
      <div ref={topRef} className="absolute inset-0" style={{ pointerEvents: 'none' }} />

      {/* Draggable divider */}
      <div
        className="absolute top-0 bottom-0 z-[1000] w-[3px] bg-white/90 cursor-col-resize hover:bg-white transition-colors"
        style={{ left: `${splitPos}%`, transform: 'translateX(-50%)' }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
        onClick={() => {}} // Absorb clicks
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white shadow-xl flex items-center justify-center">
          <svg className="w-4 h-4 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
          </svg>
        </div>
      </div>

      {/* Labels */}
      <div className="absolute top-3 left-3 z-[1001] px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-blue-500/80 text-white backdrop-blur-sm">
        Before
        {topError && <span className="ml-1.5 text-[8px] font-normal opacity-70">(basemap only)</span>}
      </div>
      <div className="absolute top-3 right-3 z-[1001] px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-orange-500/80 text-white backdrop-blur-sm">
        After
        {bottomError && <span className="ml-1.5 text-[8px] font-normal opacity-70">(basemap only)</span>}
      </div>

      {/* Zoom controls — sync both maps */}
      <div className="absolute bottom-3 right-3 z-[1001] flex flex-col rounded-lg overflow-hidden border border-white/10 shadow-lg">
        <button onClick={() => {
          if (bottomMapRef.current) bottomMapRef.current.zoomIn();
        }} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm font-bold bg-black/50 backdrop-blur-sm">+</button>
        <div className="h-px bg-white/10" />
        <button onClick={() => {
          if (bottomMapRef.current) bottomMapRef.current.zoomOut();
        }} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm font-bold bg-black/50 backdrop-blur-sm">−</button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-[1001] flex items-center gap-3 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 text-[10px]">
        <span className="flex items-center gap-1.5 text-blue-300"><span className="w-2 h-2 rounded-full bg-blue-400" /> Before</span>
        <span className="text-[var(--color-text-muted)]">|</span>
        <span className="flex items-center gap-1.5 text-orange-300"><span className="w-2 h-2 rounded-full bg-orange-400" /> After</span>
        <span className="text-[var(--color-text-muted)]">|</span>
        <span className="text-[var(--color-text-muted)]">Drag divider to compare</span>
      </div>
    </div>
  );
}
