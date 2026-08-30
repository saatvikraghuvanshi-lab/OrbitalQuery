'use client';

import { useRef, useState, useCallback, useEffect } from 'react';

const TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';

interface SwipeMapProps {
  bbox: number[];
  thumbnailT1?: string;
  thumbnailT2?: string;
  tilejsonT1?: string;
  tilejsonT2?: string;
  sceneBboxT1?: any;
  sceneBboxT2?: any;
}

async function fetchTileJson(url: string): Promise<{ tiles: string[]; bounds: number[]; maxzoom: number } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Swipe comparison using two stacked Leaflet maps.
 * Bottom map = Period 2 (full). Top map = Period 1 (clipped by split position).
 * Both maps sync center/zoom so they always show the same view.
 * Uses TileJSON XYZ tiles when available for real zoomable satellite imagery.
 */
export default function SwipeMap({ bbox, thumbnailT1, thumbnailT2, tilejsonT1, tilejsonT2, sceneBboxT1, sceneBboxT2 }: SwipeMapProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomMapRef = useRef<any>(null);
  const topMapRef = useRef<any>(null);
  const syncingRef = useRef(false);
  const [splitPos, setSplitPos] = useState(50);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!bottomRef.current || !topRef.current || bottomMapRef.current) return;
    let cancelled = false;

    import('leaflet').then(async (L) => {
      if (cancelled || !bottomRef.current || !topRef.current) return;

      const [west, south, east, north] = bbox;
      const center: [number, number] = [(south + north) / 2, (west + east) / 2];

      // Bottom map = Period 2
      const bottomMap = L.map(bottomRef.current, {
        center, zoom: 10, zoomControl: false, attributionControl: false,
        zoomSnap: 0.25, zoomDelta: 0.5,
      });
      L.tileLayer(TILE_URL, { maxZoom: 19 }).addTo(bottomMap);

      // Top map = Period 1
      const topMap = L.map(topRef.current, {
        center, zoom: 10, zoomControl: false, attributionControl: false,
        zoomSnap: 0.25, zoomDelta: 0.5,
      });
      L.tileLayer(TILE_URL, { maxZoom: 19 }).addTo(topMap);

      let fitBounds = [[south, west], [north, east]] as L.LatLngBoundsExpression;

      // Period 2 — try TileJSON first
      if (tilejsonT2) {
        const tj = await fetchTileJson(tilejsonT2);
        if (tj && tj.tiles?.[0]) {
          L.tileLayer(tj.tiles[0], { maxZoom: tj.maxzoom || 24, opacity: 0.9 }).addTo(bottomMap);
          if (tj.bounds?.length === 4) {
            fitBounds = [[tj.bounds[1], tj.bounds[0]], [tj.bounds[3], tj.bounds[2]]] as L.LatLngBoundsExpression;
          }
        } else if (thumbnailT2 && sceneBboxT2) {
          L.imageOverlay(thumbnailT2, [[sceneBboxT2[1], sceneBboxT2[0]], [sceneBboxT2[3], sceneBboxT2[2]]], { opacity: 0.9, interactive: false }).addTo(bottomMap);
          fitBounds = [[sceneBboxT2[1], sceneBboxT2[0]], [sceneBboxT2[3], sceneBboxT2[2]]] as L.LatLngBoundsExpression;
        }
      } else if (thumbnailT2 && sceneBboxT2) {
        L.imageOverlay(thumbnailT2, [[sceneBboxT2[1], sceneBboxT2[0]], [sceneBboxT2[3], sceneBboxT2[2]]], { opacity: 0.9, interactive: false }).addTo(bottomMap);
        fitBounds = [[sceneBboxT2[1], sceneBboxT2[0]], [sceneBboxT2[3], sceneBboxT2[2]]] as L.LatLngBoundsExpression;
      }

      // Period 1 — try TileJSON first
      let topBounds = fitBounds;
      if (tilejsonT1) {
        const tj = await fetchTileJson(tilejsonT1);
        if (tj && tj.tiles?.[0]) {
          L.tileLayer(tj.tiles[0], { maxZoom: tj.maxzoom || 24, opacity: 0.9 }).addTo(topMap);
          if (tj.bounds?.length === 4) {
            topBounds = [[tj.bounds[1], tj.bounds[0]], [tj.bounds[3], tj.bounds[2]]] as L.LatLngBoundsExpression;
          }
        } else if (thumbnailT1 && sceneBboxT1) {
          L.imageOverlay(thumbnailT1, [[sceneBboxT1[1], sceneBboxT1[0]], [sceneBboxT1[3], sceneBboxT1[2]]], { opacity: 0.9, interactive: false }).addTo(topMap);
          topBounds = [[sceneBboxT1[1], sceneBboxT1[0]], [sceneBboxT1[3], sceneBboxT1[2]]] as L.LatLngBoundsExpression;
        }
      } else if (thumbnailT1 && sceneBboxT1) {
        L.imageOverlay(thumbnailT1, [[sceneBboxT1[1], sceneBboxT1[0]], [sceneBboxT1[3], sceneBboxT1[2]]], { opacity: 0.9, interactive: false }).addTo(topMap);
        topBounds = [[sceneBboxT1[1], sceneBboxT1[0]], [sceneBboxT1[3], sceneBboxT1[2]]] as L.LatLngBoundsExpression;
      }

      // Fit both maps to imagery bounds
      bottomMap.fitBounds(fitBounds, { padding: [20, 20], maxZoom: 14 });
      topMap.fitBounds(topBounds, { padding: [20, 20], maxZoom: 14 });

      // Sync: bottom → top
      bottomMap.on('move', () => {
        if (syncingRef.current) return;
        syncingRef.current = true;
        topMap.setView(bottomMap.getCenter(), bottomMap.getZoom(), { animate: false });
        syncingRef.current = false;
      });
      bottomMap.on('zoom', () => {
        if (syncingRef.current) return;
        syncingRef.current = true;
        topMap.setView(bottomMap.getCenter(), bottomMap.getZoom(), { animate: false });
        syncingRef.current = false;
      });

      // Sync: top → bottom
      topMap.on('move', () => {
        if (syncingRef.current) return;
        syncingRef.current = true;
        bottomMap.setView(topMap.getCenter(), topMap.getZoom(), { animate: false });
        syncingRef.current = false;
      });
      topMap.on('zoom', () => {
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
    };
  }, [bbox, thumbnailT1, thumbnailT2, tilejsonT1, tilejsonT2, sceneBboxT1, sceneBboxT2]);

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
      className="relative rounded-xl overflow-hidden border border-slate-700/30 select-none"
      style={{ height: 'calc(70vh - 100px)', minHeight: '450px' }}
      onMouseMove={handleMouseMove}
      onMouseUp={handlePointerUp}
      onMouseLeave={handlePointerUp}
      onTouchMove={handleTouchMove}
      onTouchEnd={handlePointerUp}
    >
      {/* Bottom map = Period 2 (full) */}
      <div ref={bottomRef} className="absolute inset-0" />

      {/* Top map = Period 1 (clipped by split) */}
      <div
        ref={topRef}
        className="absolute inset-0"
        style={{ clipPath: `inset(0 ${100 - splitPos}% 0 0)` }}
      />

      {/* Draggable divider */}
      <div
        className="absolute top-0 bottom-0 z-[1000] w-[3px] bg-white/90 cursor-col-resize hover:bg-white transition-colors"
        style={{ left: `${splitPos}%`, transform: 'translateX(-50%)' }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white shadow-xl flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
          </svg>
        </div>
      </div>

      {/* Labels */}
      <div className="absolute top-3 left-3 z-[1000] px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-blue-500/80 text-white backdrop-blur-sm">Before</div>
      <div className="absolute top-3 right-3 z-[1000] px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-orange-500/80 text-white backdrop-blur-sm">After</div>

      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 z-[1000] flex flex-col rounded-lg overflow-hidden border border-white/10 shadow-lg">
        <button onClick={() => bottomMapRef.current?.zoomIn()} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm font-bold bg-black/50 backdrop-blur-sm">+</button>
        <div className="h-px bg-white/10" />
        <button onClick={() => bottomMapRef.current?.zoomOut()} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm font-bold bg-black/50 backdrop-blur-sm">−</button>
      </div>
    </div>
  );
}
