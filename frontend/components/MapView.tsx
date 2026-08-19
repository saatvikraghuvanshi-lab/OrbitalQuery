'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { DatasetResult, BoundingBox } from '@/app/page';

type MapProvider = 'carto-dark' | 'carto-light' | 'osm' | 'stamen-toner' | 'esri-world';

const MAP_TILES: Record<MapProvider, { url: string; attribution: string; name: string }> = {
  'carto-dark': {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> | &copy; <a href="https://osm.org/copyright">OSM</a>',
    name: '🗺️ CARTO Dark',
  },
  'carto-light': {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> | &copy; <a href="https://osm.org/copyright">OSM</a>',
    name: '🗺️ CARTO Light',
  },
  'osm': {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>',
    name: '🌍 OpenStreetMap',
  },
  'stamen-toner': {
    url: 'https://stamen-tiles-{s}.a.ssl.fastly.net/toner/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://stamen.com">Stamen</a> | &copy; <a href="https://osm.org/copyright">OSM</a>',
    name: '🌑 Stamen Toner',
  },
  'esri-world': {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; <a href="https://www.esri.com">Esri</a> | &copy; <a href="https://osm.org/copyright">OSM</a>',
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
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<any>(null);
  const tileLayer = useRef<any>([]);
  const footprintLayers = useRef<any[]>([]);
  const bboxRect = useRef<any>(null);
  const [mapProvider, setMapProvider] = useState<MapProvider>('carto-dark');
  const [isDrawing, setIsDrawing] = useState(false);
  const drawStartRef = useRef<any>(null);

  // ─── Initialize map ONCE ────────────────────────────────────────────
  useEffect(() => {
    const container = mapRef.current;
    if (!container) return;

    // Check if already initialized (HMR / StrictMode guard)
    if (leafletMap.current) return;

    // Check if Leaflet already attached
    if ((container as any)._leaflet_id) return;

    let destroyed = false;

    import('leaflet').then((L) => {
      if (destroyed || !container) return;
      if ((container as any)._leaflet_id) return;

      const map = L.map(container, {
        center: [20, 78],
        zoom: 3,
        zoomControl: false,
        attributionControl: false,
        minZoom: 2,
        maxZoom: 18,
      });

      if (destroyed) { map.remove(); return; }

      leafletMap.current = map;

      // Add zoom control top-left
      L.control.zoom({ position: 'topleft' }).addTo(map);

      // Add attribution bottom-right
      L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map);

      // Add initial tile layer
      const tiles = L.tileLayer(MAP_TILES[mapProvider].url, {
        attribution: MAP_TILES[mapProvider].attribution,
        subdomains: 'abcd',
        maxZoom: 20,
      }).addTo(map);
      tileLayer.current = [tiles];

      // Drawing handlers
      map.on('mousedown', (e: any) => {
        if (!isDrawing) return;
        drawStartRef.current = e.latlng;
      });

      map.on('mouseup', (e: any) => {
        if (!isDrawing || !drawStartRef.current) return;
        const start = drawStartRef.current;
        const end = e.latlng;
        onBboxChange({
          north: Math.max(start.lat, end.lat),
          south: Math.min(start.lat, end.lat),
          east: Math.max(start.lng, end.lng),
          west: Math.min(start.lng, end.lng),
        });
        setIsDrawing(false);
        drawStartRef.current = null;
      });

      setTimeout(() => { if (!destroyed) map.invalidateSize(); }, 300);
    });

    return () => {
      destroyed = true;
      if (leafletMap.current) {
        leafletMap.current.remove();
        leafletMap.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Switch tile layer ──────────────────────────────────────────────
  useEffect(() => {
    const map = leafletMap.current;
    if (!map) return;

    import('leaflet').then((L) => {
      // Remove old tiles
      tileLayer.current.forEach((t: any) => { try { map.removeLayer(t); } catch {} });

      // Add new tiles
      const newTile = L.tileLayer(MAP_TILES[mapProvider].url, {
        attribution: MAP_TILES[mapProvider].attribution,
        subdomains: 'abcd',
        maxZoom: 20,
      }).addTo(map);
      tileLayer.current = [newTile];
    });
  }, [mapProvider]);

  // ─── Draw bounding box ──────────────────────────────────────────────
  useEffect(() => {
    const map = leafletMap.current;
    if (!map) return;

    import('leaflet').then((L) => {
      if (bboxRect.current) {
        try { map.removeLayer(bboxRect.current); } catch {}
        bboxRect.current = null;
      }
      if (bbox) {
        bboxRect.current = L.rectangle(
          [[bbox.south, bbox.west], [bbox.north, bbox.east]],
          { color: '#4c6ef5', weight: 2, fillColor: '#4c6ef5', fillOpacity: 0.1, dashArray: '5, 5' }
        ).addTo(map);
      }
    });
  }, [bbox]);

  // ─── Draw dataset footprints ────────────────────────────────────────
  useEffect(() => {
    const map = leafletMap.current;
    if (!map) return;

    import('leaflet').then((L) => {
      // Clear old
      footprintLayers.current.forEach(l => { try { map.removeLayer(l); } catch {} });
      footprintLayers.current = [];

      results.forEach(dataset => {
        if (!dataset.geometry) return;
        try {
          const sel = selectedDataset?.id === dataset.id;
          const style = {
            color: sel ? '#a78bfa' : '#4c6ef5',
            weight: sel ? 3 : 1.5,
            fillColor: sel ? '#a78bfa' : '#4c6ef5',
            fillOpacity: sel ? 0.25 : 0.1,
            opacity: sel ? 0.9 : 0.6,
          };
          const layer = L.geoJSON(dataset.geometry, { style }).addTo(map);
          layer.bindPopup(`
            <div style="min-width:220px;font-size:13px">
              <div style="font-weight:600;margin-bottom:4px;color:#e2e8f0">${dataset.title}</div>
              <div style="color:#94a3b8;font-size:11px;margin-bottom:6px">${dataset.provider}${dataset.collection ? ' • ' + dataset.collection : ''}</div>
              ${dataset.gsd ? `<div style="color:#64748b;font-size:11px">Resolution: ${dataset.gsd}m</div>` : ''}
              ${dataset.startDate ? `<div style="color:#64748b;font-size:11px">Date: ${new Date(dataset.startDate).toLocaleDateString()}</div>` : ''}
              ${dataset.cloudCover != null ? `<div style="color:#64748b;font-size:11px">Cloud: ${dataset.cloudCover}%</div>` : ''}
            </div>
          `);
          layer.on('click', () => onSelectDataset(dataset));
          footprintLayers.current.push(layer);
        } catch {}
      });

      if (results.length > 0) {
        try {
          const coords: [number, number][] = results
            .filter(d => d.centroidLat && d.centroidLng)
            .map(d => [d.centroidLat!, d.centroidLng!]);
          if (coords.length > 0) map.fitBounds(coords, { padding: [50, 50], maxZoom: 6 });
        } catch {}
      }
    });
  }, [results, selectedDataset]);

  return (
    <div className="relative">
      <div ref={mapRef} className="w-full h-[400px] sm:h-[500px] lg:h-[600px] rounded-2xl overflow-hidden border border-slate-700/50 bg-slate-900" />

      {/* Map Provider Selector */}
      <div className="absolute top-4 left-4 z-[1000]">
        <select
          value={mapProvider}
          onChange={(e) => setMapProvider(e.target.value as MapProvider)}
          className="glass rounded-xl px-3 py-2 text-xs text-slate-300 bg-transparent border border-slate-700/50 focus:border-blue-500/50 focus:outline-none cursor-pointer"
        >
          {Object.entries(MAP_TILES).map(([key, val]) => (
            <option key={key} value={key} className="bg-slate-900 text-slate-300">{val.name}</option>
          ))}
        </select>
      </div>

      {/* Drawing Controls */}
      <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
        <button
          onClick={() => setIsDrawing(!isDrawing)}
          className={`px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200 shadow-lg ${
            isDrawing ? 'bg-blue-500 text-white shadow-blue-500/30' : 'glass text-slate-300 hover:text-white'
          }`}
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
            className="px-3 py-2 rounded-xl text-xs font-medium glass text-red-400 hover:text-red-300 transition-all duration-200 shadow-lg"
          >
            Clear BBOX
          </button>
        )}
      </div>

      {results.length > 0 && (
        <div className="absolute bottom-4 left-4 z-[1000] glass-light rounded-xl px-3 py-1.5 text-xs text-slate-400">
          {results.length} datasets shown
        </div>
      )}
      {isDrawing && (
        <div className="absolute bottom-4 right-4 z-[1000] glass rounded-xl px-3 py-1.5 text-xs text-blue-400">
          Click and drag on the map to select an area
        </div>
      )}
    </div>
  );
}
