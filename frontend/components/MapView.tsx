'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { DatasetResult, BoundingBox } from '@/app/page';

type MapProvider = 'carto-dark' | 'carto-light' | 'osm' | 'stamen-toner' | 'esri-world';

const MAP_TILES: Record<MapProvider, { url: string; attribution: string; name: string; subdomains?: string }> = {
  'carto-dark': {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CARTO | &copy; OSM',
    name: '🗺️ CARTO Dark',
    subdomains: 'abcd',
  },
  'carto-light': {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CARTO | &copy; OSM',
    name: '🗺️ CARTO Light',
    subdomains: 'abcd',
  },
  'osm': {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap',
    name: '🌍 OpenStreetMap',
    subdomains: 'abc',
  },
  'stamen-toner': {
    url: 'https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}{r}.png',
    attribution: '&copy; Stadia Maps | &copy; OSM',
    name: '🌑 Stamen Toner',
  },
  'esri-world': {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri | &copy; OSM',
    name: '🛰️ Esri Satellite',
  },
};

interface MapViewProps {
  results: DatasetResult[];
  selectedDataset: DatasetResult | null;
  onSelectDataset: (dataset: DatasetResult | null) => void;
  bbox: BoundingBox | null;
  onBboxChange: (bbox: BoundingBox | null) => void;
}

export default function MapView({ results, selectedDataset, onSelectDataset, bbox, onBboxChange }: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const footprintLayersRef = useRef<any[]>([]);
  const bboxRectRef = useRef<any>(null);
  const drawRectRef = useRef<any>(null);
  const drawStartRef = useRef<any>(null);

  const [mapProvider, setMapProvider] = useState<MapProvider>('carto-dark');
  const [isDrawing, setIsDrawing] = useState(false);
  const [mapHeight, setMapHeight] = useState<string>('600px');

  // Calculate height on mount
  useEffect(() => {
    const updateHeight = () => {
      const w = window.innerWidth;
      if (w < 640) setMapHeight('500px');
      else if (w < 1024) setMapHeight('500px');
      else setMapHeight('620px');
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // ─── Initialize map ─────────────────────────────────────────────────
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || mapRef.current) return;

    let destroyed = false;
    let map: any = null;

    const init = async () => {
      const L = await import('leaflet');
      if (destroyed || !container) return;

      // Ensure container has dimensions
      container.style.height = mapHeight;
      container.style.width = '100%';

      map = L.map(container, {
        center: [20, 78],
        zoom: 3,
        zoomControl: true,
        attributionControl: true,
        minZoom: 2,
        maxZoom: 18,
        doubleClickZoom: true,
        scrollWheelZoom: true,
      });

      if (destroyed) { map.remove(); return; }

      mapRef.current = map;

      // Add tile layer
      const tc = MAP_TILES[mapProvider];
      const tiles = L.tileLayer(tc.url, {
        attribution: tc.attribution,
        subdomains: tc.subdomains || '',
        maxZoom: 20,
      }).addTo(map);
      tileLayerRef.current = tiles;

      // Invalidate size multiple times for reliable rendering
      const timers: number[] = [];
      timers.push(window.setTimeout(() => { if (!destroyed && map) map.invalidateSize(); }, 200));
      timers.push(window.setTimeout(() => { if (!destroyed && map) map.invalidateSize(); }, 500));
      timers.push(window.setTimeout(() => { if (!destroyed && map) map.invalidateSize(); }, 1000));
      timers.push(window.setTimeout(() => { if (!destroyed && map) map.invalidateSize(); }, 2000));

      // ResizeObserver for bulletproof sizing
      const ro = new ResizeObserver(() => {
        if (!destroyed && map) map.invalidateSize();
      });
      ro.observe(container);

      // Store cleanup refs
      (map as any)._orbitalTimers = timers;
      (map as any)._orbitalRO = ro;
    };

    init();

    return () => {
      destroyed = true;
      if (map) {
        if ((map as any)._orbitalTimers) {
          (map as any)._orbitalTimers.forEach((t: number) => window.clearTimeout(t));
        }
        if ((map as any)._orbitalRO) {
          (map as any)._orbitalRO.disconnect();
        }
        map.remove();
        mapRef.current = null;
      }
    };
  }, [mapHeight]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Update map height when it changes ──────────────────────────────
  useEffect(() => {
    if (mapContainerRef.current) {
      mapContainerRef.current.style.height = mapHeight;
      if (mapRef.current) {
        setTimeout(() => mapRef.current.invalidateSize(), 100);
      }
    }
  }, [mapHeight]);

  // ─── Draw mode: disable drag when drawing ───────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (isDrawing) {
      map.dragging.disable();
      map.getContainer().style.cursor = 'crosshair';
    } else {
      map.dragging.enable();
      map.getContainer().style.cursor = '';
    }
  }, [isDrawing]);

  // ─── Drawing: mousedown + mousemove + mouseup ───────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const L = require('leaflet');

    const onMouseDown = (e: any) => {
      if (!isDrawing) return;
      e.originalEvent.preventDefault();
      drawStartRef.current = e.latlng;

      // Remove previous draw rect
      if (drawRectRef.current) {
        try { map.removeLayer(drawRectRef.current); } catch {}
        drawRectRef.current = null;
      }
    };

    const onMouseMove = (e: any) => {
      if (!isDrawing || !drawStartRef.current) return;
      const start = drawStartRef.current;
      const end = e.latlng;

      if (drawRectRef.current) {
        try { map.removeLayer(drawRectRef.current); } catch {}
      }

      drawRectRef.current = L.rectangle(
        [[start.lat, start.lng], [end.lat, end.lng]],
        { color: '#4c6ef5', weight: 2, fillColor: '#4c6ef5', fillOpacity: 0.15, dashArray: '5, 5' }
      ).addTo(map);
    };

    const onMouseUp = (e: any) => {
      if (!isDrawing || !drawStartRef.current) return;
      const start = drawStartRef.current;
      const end = e.latlng;

      // Remove temporary draw rect
      if (drawRectRef.current) {
        try { map.removeLayer(drawRectRef.current); } catch {}
        drawRectRef.current = null;
      }

      const north = Math.max(start.lat, end.lat);
      const south = Math.min(start.lat, end.lat);
      const east = Math.max(start.lng, end.lng);
      const west = Math.min(start.lng, end.lng);

      // Only accept if the rectangle has meaningful size
      if (Math.abs(north - south) > 0.001 && Math.abs(east - west) > 0.001) {
        onBboxChange({ north, south, east, west });
      }

      setIsDrawing(false);
      drawStartRef.current = null;
    };

    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);

    return () => {
      map.off('mousedown', onMouseDown);
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
    };
  }, [isDrawing, onBboxChange]);

  // ─── Switch tile layer ──────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const L = require('leaflet');

    if (tileLayerRef.current) {
      try { map.removeLayer(tileLayerRef.current); } catch {}
    }
    const tc = MAP_TILES[mapProvider];
    const newTile = L.tileLayer(tc.url, {
      attribution: tc.attribution,
      subdomains: tc.subdomains || '',
      maxZoom: 20,
    }).addTo(map);
    tileLayerRef.current = newTile;
    setTimeout(() => map.invalidateSize(), 300);
  }, [mapProvider]);

  // ─── Draw bbox rectangle from filter ────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const L = require('leaflet');

    if (bboxRectRef.current) {
      try { map.removeLayer(bboxRectRef.current); } catch {}
      bboxRectRef.current = null;
    }
    if (bbox) {
      bboxRectRef.current = L.rectangle(
        [[bbox.south, bbox.west], [bbox.north, bbox.east]],
        { color: '#22c55e', weight: 2, fillColor: '#22c55e', fillOpacity: 0.1, dashArray: '5, 5' }
      ).addTo(map);
    }
  }, [bbox]);

  // ─── Draw dataset footprints ────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const L = require('leaflet');

    // Clear existing footprints
    footprintLayersRef.current.forEach(l => { try { map.removeLayer(l); } catch {} });
    footprintLayersRef.current = [];

    results.forEach(dataset => {
      if (!dataset.geometry) return;
      try {
        const sel = selectedDataset?.id === dataset.id;
        const layer = L.geoJSON(dataset.geometry, {
          color: sel ? '#a78bfa' : '#4c6ef5',
          weight: sel ? 3 : 1.5,
          fillColor: sel ? '#a78bfa' : '#4c6ef5',
          fillOpacity: sel ? 0.25 : 0.1,
          opacity: sel ? 0.9 : 0.6,
        }).addTo(map);

        layer.bindPopup(`
          <div style="min-width:200px;font-size:13px">
            <div style="font-weight:600;margin-bottom:4px;color:#e2e8f0">${dataset.title}</div>
            <div style="color:#94a3b8;font-size:11px">${dataset.provider}${dataset.collection ? ' • ' + dataset.collection : ''}</div>
            ${dataset.gsd ? `<div style="color:#64748b;font-size:11px">Resolution: ${dataset.gsd}m</div>` : ''}
            ${dataset.startDate ? `<div style="color:#64748b;font-size:11px">Date: ${new Date(dataset.startDate).toLocaleDateString()}</div>` : ''}
          </div>
        `);

        layer.on('click', () => onSelectDataset(dataset));
        footprintLayersRef.current.push(layer);
      } catch {}
    });

    // Fit bounds to results
    if (results.length > 0) {
      try {
        const coords = results
          .filter(d => d.centroidLat && d.centroidLng)
          .map(d => [d.centroidLat!, d.centroidLng!] as [number, number]);
        if (coords.length > 0) map.fitBounds(coords, { padding: [50, 50], maxZoom: 6 });
      } catch {}
    }
  }, [results, selectedDataset, onSelectDataset]);

  const toggleDrawing = useCallback(() => {
    setIsDrawing(prev => !prev);
  }, []);

  return (
    <div className="relative rounded-2xl overflow-hidden" style={{ height: mapHeight }}>
      {/* The actual map container — Leaflet attaches here directly */}
      <div
        ref={mapContainerRef}
        style={{ height: mapHeight, width: '100%', background: '#0d1117' }}
        className="rounded-2xl"
      />

      {/* Map Provider Selector */}
      <div className="absolute top-4 left-4 z-[1000]">
        <select
          value={mapProvider}
          onChange={(e) => setMapProvider(e.target.value as MapProvider)}
          className="px-3 py-2 text-xs text-slate-300 rounded-xl cursor-pointer focus:outline-none"
          style={{
            background: 'rgba(15, 23, 42, 0.9)',
            border: '1px solid rgba(71, 85, 105, 0.5)',
          }}
        >
          {Object.entries(MAP_TILES).map(([key, val]) => (
            <option key={key} value={key} className="bg-slate-900 text-slate-300">{val.name}</option>
          ))}
        </select>
      </div>

      {/* Draw BBOX Button */}
      <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
        <button
          onClick={toggleDrawing}
          className="px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200 shadow-lg"
          style={{
            background: isDrawing ? '#4c6ef5' : 'rgba(15, 23, 42, 0.9)',
            color: isDrawing ? 'white' : '#94a3b8',
            border: isDrawing ? '1px solid #4c6ef5' : '1px solid rgba(71, 85, 105, 0.5)',
          }}
        >
          <div className="flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {isDrawing ? 'Drawing...' : 'Draw BBOX'}
          </div>
        </button>
        {bbox && (
          <button
            onClick={() => onBboxChange(null)}
            className="px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200 shadow-lg"
            style={{
              background: 'rgba(15, 23, 42, 0.9)',
              color: '#f87171',
              border: '1px solid rgba(71, 85, 105, 0.5)',
            }}
          >
            Clear BBOX
          </button>
        )}
      </div>

      {/* Info badges */}
      {results.length > 0 && (
        <div className="absolute bottom-4 left-4 z-[1000] rounded-xl px-3 py-1.5 text-xs text-slate-400"
          style={{ background: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(71, 85, 105, 0.3)' }}
        >
          {results.length} datasets shown
        </div>
      )}
      {isDrawing && (
        <div className="absolute bottom-4 right-4 z-[1000] rounded-xl px-3 py-1.5 text-xs text-blue-400"
          style={{ background: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(76, 110, 245, 0.3)' }}
        >
          Click and drag on the map to select an area
        </div>
      )}
    </div>
  );
}
