'use client';

import { useEffect, useRef, useState } from 'react';
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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const footprintLayers = useRef<any[]>([]);
  const bboxRect = useRef<any>(null);
  const [mapProvider, setMapProvider] = useState<MapProvider>('carto-dark');
  const [isDrawing, setIsDrawing] = useState(false);
  const drawStartRef = useRef<any>(null);

  // ─── Initialize map ONCE ────────────────────────────────────────────
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || leafletMap.current) return;

    let destroyed = false;

    import('leaflet').then((L) => {
      if (destroyed || !wrapper) return;

      // Create the map div inside the wrapper
      const mapDiv = document.createElement('div');
      mapDiv.style.width = '100%';
      mapDiv.style.height = '100%';
      mapDiv.style.position = 'absolute';
      mapDiv.style.top = '0';
      mapDiv.style.left = '0';
      mapDiv.style.right = '0';
      mapDiv.style.bottom = '0';
      wrapper.appendChild(mapDiv);

      const map = L.map(mapDiv, {
        center: [20, 78],
        zoom: 3,
        zoomControl: false,
        attributionControl: false,
        minZoom: 2,
        maxZoom: 18,
      });

      if (destroyed) { map.remove(); return; }

      leafletMap.current = map;

      L.control.zoom({ position: 'topleft' }).addTo(map);
      L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map);

      const tileConfig = MAP_TILES[mapProvider];
      const tiles = L.tileLayer(tileConfig.url, {
        attribution: tileConfig.attribution,
        subdomains: tileConfig.subdomains || '',
        maxZoom: 20,
      }).addTo(map);
      tileLayerRef.current = tiles;

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

      // Critical: invalidateSize after render
      const timers: NodeJS.Timeout[] = [];
      timers.push(setTimeout(() => { if (!destroyed) map.invalidateSize(); }, 100));
      timers.push(setTimeout(() => { if (!destroyed) map.invalidateSize(); }, 500));
      timers.push(setTimeout(() => { if (!destroyed) map.invalidateSize(); }, 1500));

      // Also invalidate on window resize
      const onResize = () => { if (!destroyed && leafletMap.current) leafletMap.current.invalidateSize(); };
      window.addEventListener('resize', onResize);

      return () => {
        timers.forEach(clearTimeout);
        window.removeEventListener('resize', onResize);
      };
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
      if (tileLayerRef.current) {
        try { map.removeLayer(tileLayerRef.current); } catch {}
      }
      const tileConfig = MAP_TILES[mapProvider];
      const newTile = L.tileLayer(tileConfig.url, {
        attribution: tileConfig.attribution,
        subdomains: tileConfig.subdomains || '',
        maxZoom: 20,
      }).addTo(map);
      tileLayerRef.current = newTile;
      setTimeout(() => map.invalidateSize(), 200);
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
      footprintLayers.current.forEach(l => { try { map.removeLayer(l); } catch {} });
      footprintLayers.current = [];

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
          footprintLayers.current.push(layer);
        } catch {}
      });

      if (results.length > 0) {
        try {
          const coords = results
            .filter(d => d.centroidLat && d.centroidLng)
            .map(d => [d.centroidLat!, d.centroidLng!] as [number, number]);
          if (coords.length > 0) map.fitBounds(coords, { padding: [50, 50], maxZoom: 6 });
        } catch {}
      }
    });
  }, [results, selectedDataset]);

  return (
    <div className="relative">
      {/* Wrapper: position:relative is CRITICAL for Leaflet absolute positioning */}
      <div
        ref={wrapperRef}
        className="map-wrapper w-full h-[400px] sm:h-[500px] lg:h-[600px]"
      />

      {/* Map Provider Selector */}
      <div className="absolute top-4 left-4 z-[1000]">
        <select
          value={mapProvider}
          onChange={(e) => setMapProvider(e.target.value as MapProvider)}
          className="glass rounded-xl px-3 py-2 text-xs text-slate-300 bg-slate-900/80 border border-slate-700/50 focus:border-blue-500/50 focus:outline-none cursor-pointer"
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
