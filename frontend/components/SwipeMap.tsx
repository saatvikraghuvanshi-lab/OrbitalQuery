'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import {
  loadSatelliteTiles,
  buildTileJsonUrl,
  boundsToLatLng,
} from '@/lib/satellite-tiles';

const GOOGLE_TILE = 'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}';

interface SwipeMapProps {
  bbox: number[];
  thumbnailT1?: string;
  thumbnailT2?: string;
  tilejsonT1?: string;
  tilejsonT2?: string;
  sceneBboxT1?: any;
  sceneBboxT2?: any;
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
  tilejsonT1,
  tilejsonT2,
  sceneBboxT1,
  sceneBboxT2,
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

      const [west, south, east, north] = bbox;
      const center: [number, number] = [(south + north) / 2, (west + east) / 2];

      // ── Create both maps with Google Satellite basemap ──────
      const bottomMap = L.map(bottomRef.current, {
        center, zoom: 10, zoomControl: false, attributionControl: false,
        zoomSnap: 0.25, zoomDelta: 0.5,
      });
      L.tileLayer(GOOGLE_TILE, { maxZoom: 22, subdomains: ['0', '1', '2', '3'] }).addTo(bottomMap);

      const topMap = L.map(topRef.current, {
        center, zoom: 10, zoomControl: false, attributionControl: false,
        zoomSnap: 0.25, zoomDelta: 0.5,
      });
      L.tileLayer(GOOGLE_TILE, { maxZoom: 22, subdomains: ['0', '1', '2', '3'] }).addTo(topMap);

      // ── Load satellite imagery for both periods ──────────────
      // Period 2 (After) → Bottom map (full, no clipping)
      const bottomResult = await loadSatelliteTiles(bottomMap, {
        L,
        tilejsonUrl: tilejsonT2,
        thumbnailUrl: thumbnailT2,
        sceneBbox: sceneBboxT2,
        aoiBbox: bbox,
        opacity: 0.9,
      });

      // Period 1 (Before) → Top map (clipped via CSS clip-path)
      const topResult = await loadSatelliteTiles(topMap, {
        L,
        tilejsonUrl: tilejsonT1,
        thumbnailUrl: thumbnailT1,
        sceneBbox: sceneBboxT1,
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
      bottomMap.fitBounds(sharedBounds, { padding: [20, 20], maxZoom: 14 });
      topMap.fitBounds(sharedBounds, { padding: [20, 20], maxZoom: 14 });

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
  }, [bbox, thumbnailT1, thumbnailT2, tilejsonT1, tilejsonT2, sceneBboxT1, sceneBboxT2]);

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
      className="relative w-full rounded-xl overflow-hidden border border-slate-700/30 select-none"
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
        <span className="text-slate-500">|</span>
        <span className="flex items-center gap-1.5 text-orange-300"><span className="w-2 h-2 rounded-full bg-orange-400" /> After</span>
        <span className="text-slate-500">|</span>
        <span className="text-slate-400">Drag divider to compare</span>
      </div>
    </div>
  );
}
