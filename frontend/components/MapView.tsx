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

const MAP_HEIGHT = 580;

export default function MapView({ results, selectedDataset, onSelectDataset, bbox, onBboxChange }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const footprintLayersRef = useRef<any[]>([]);
  const bboxRectRef = useRef<any>(null);
  const drawRectRef = useRef<any>(null);
  const drawStartRef = useRef<any>(null);
  const resizeTimerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [mapProvider, setMapProvider] = useState<MapProvider>('carto-dark');
  const [isDrawing, setIsDrawing] = useState(false);

  const safeRemoveMap = useCallback(() => {
    const map = mapRef.current;
    if (map) {
      try { map.remove(); } catch {}
      mapRef.current = null;
    }
  }, []);

  // ─── Initialize map ──────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    safeRemoveMap();
    // Clean any stale Leaflet state
    try { container.innerHTML = ''; } catch {}
    delete (container as any)._leaflet_id;

    let cancelled = false;

    const init = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (cancelled) return;

          let L: any;
          try { L = require('leaflet'); } catch { return; }

          // Fix Leaflet default icon paths
          try {
            delete (L.Icon.Default.prototype as any)._getIconUrl;
            L.Icon.Default.mergeOptions({
              iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
              iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
              shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
            });
          } catch {}

          if (cancelled) return;

          // KEY FIX: Ensure container has explicit pixel dimensions before Leaflet reads them
          container.style.height = MAP_HEIGHT + 'px';
          container.style.width = '100%';

          const map = L.map(container, {
            center: [20, 78],
            zoom: 3,
            zoomControl: true,
            attributionControl: true,
            minZoom: 2,
            maxZoom: 18,
          });

          if (cancelled) { try { map.remove(); } catch {} return; }
          mapRef.current = map;

          // Add tile layer
          const tc = MAP_TILES[mapProvider];
          tileLayerRef.current = L.tileLayer(tc.url, {
            attribution: tc.attribution,
            subdomains: tc.subdomains || '',
            maxZoom: 20,
          }).addTo(map);

          // Force invalidateSize at multiple intervals
          const forceResize = () => {
            if (cancelled) return;
            try { map.invalidateSize({ animate: false }); } catch {}
          };
          resizeTimerRefs.current = [50, 100, 250, 500, 1000, 2000, 3000].map(
            ms => setTimeout(forceResize, ms)
          );

          window.addEventListener('resize', forceResize);

          return () => {
            resizeTimerRefs.current.forEach(t => clearTimeout(t));
            resizeTimerRefs.current = [];
            window.removeEventListener('resize', forceResize);
            try { map.remove(); } catch {}
            mapRef.current = null;
          };
        });
      });
    };

    let cleanupFn: (() => void) | undefined;
    init();

    return () => {
      cancelled = true;
      resizeTimerRefs.current.forEach(t => clearTimeout(t));
      resizeTimerRefs.current = [];
      safeRemoveMap();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Switch tile layer ────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let L: any;
    try { L = require('leaflet'); } catch { return; }

    if (tileLayerRef.current) {
      try { map.removeLayer(tileLayerRef.current); } catch {}
    }
    const tc = MAP_TILES[mapProvider];
    tileLayerRef.current = L.tileLayer(tc.url, {
      attribution: tc.attribution,
      subdomains: tc.subdomains || '',
      maxZoom: 20,
    }).addTo(map);

    setTimeout(() => {
      try { map.invalidateSize({ animate: false }); } catch {}
    }, 200);
  }, [mapProvider]);

  // ─── Draw mode toggle ─────────────────────────────────────────
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

  // ─── Drawing events ───────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let L: any;
    try { L = require('leaflet'); } catch { return; }

    const onMouseDown = (e: any) => {
      if (!isDrawing) return;
      e.originalEvent.preventDefault();
      e.originalEvent.stopPropagation();
      drawStartRef.current = e.latlng;
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
      if (drawRectRef.current) {
        try { map.removeLayer(drawRectRef.current); } catch {}
        drawRectRef.current = null;
      }
      const north = Math.max(start.lat, end.lat);
      const south = Math.min(start.lat, end.lat);
      const east = Math.max(start.lng, end.lng);
      const west = Math.min(start.lng, end.lng);
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

  // ─── Bbox filter rectangle ────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let L: any;
    try { L = require('leaflet'); } catch { return; }

    if (bboxRectRef.current) {
      try { map.removeLayer(bboxRectRef.current); } catch {}
      bboxRectRef.current = null;
    }
    if (bbox) {
      bboxRectRef.current = L.rectangle(
        [[bbox.south, bbox.west], [bbox.north, bbox.east]],
        { color: '#22c55e', weight: 2, fillColor: '#22c55e', fillOpacity: 0.1, dashArray: '5, 5' }
      ).addTo(map);
      map.fitBounds([[bbox.south, bbox.west], [bbox.north, bbox.east]], { padding: [50, 50] });
    }
  }, [bbox]);

  // ─── Dataset footprints ───────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let L: any;
    try { L = require('leaflet'); } catch { return; }

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

    if (results.length > 0) {
      try {
        const coords = results
          .filter(d => d.centroidLat && d.centroidLng)
          .map(d => [d.centroidLat!, d.centroidLng!] as [number, number]);
        if (coords.length > 0) map.fitBounds(coords, { padding: [50, 50], maxZoom: 6 });
      } catch {}
    }
  }, [results, selectedDataset, onSelectDataset]);

  // ─── Zoom to selected dataset ─────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedDataset) return;

    let L: any;
    try { L = require('leaflet'); } catch { return; }

    try {
      if (selectedDataset.bbox && Array.isArray(selectedDataset.bbox) && selectedDataset.bbox.length === 4) {
        const [west, south, east, north] = selectedDataset.bbox;
        map.fitBounds([[south, west], [north, east]], { padding: [60, 60], maxZoom: 12, animate: true });
      } else if (selectedDataset.geometry) {
        const geoLayer = L.geoJSON(selectedDataset.geometry);
        const bounds = geoLayer.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [60, 60], maxZoom: 12, animate: true });
        }
      } else if (selectedDataset.centroidLat && selectedDataset.centroidLng) {
        map.setView([selectedDataset.centroidLat, selectedDataset.centroidLng], 8, { animate: true });
      }
    } catch {}
  }, [selectedDataset]);

  const toggleDrawing = useCallback(() => {
    setIsDrawing(prev => !prev);
  }, []);

  return (
    <div style={{
      position: 'relative',
      borderRadius: '16px',
      border: '1px solid rgba(71, 85, 105, 0.3)',
      overflow: 'hidden',
      width: '100%',
      height: MAP_HEIGHT + 'px',
    }}>
      {/* Map container — explicit pixel height, Leaflet attaches here */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: MAP_HEIGHT + 'px',
          position: 'relative',
          background: '#0d1117',
        }}
      />

      {/* Provider selector */}
      <div style={{ position: 'absolute', top: '16px', left: '16px', zIndex: 1000 }}>
        <select
          value={mapProvider}
          onChange={(e) => setMapProvider(e.target.value as MapProvider)}
          style={{
            padding: '8px 12px',
            fontSize: '12px',
            color: '#cbd5e1',
            borderRadius: '12px',
            cursor: 'pointer',
            background: 'rgba(15, 23, 42, 0.92)',
            border: '1px solid rgba(71, 85, 105, 0.5)',
            outline: 'none',
          }}
        >
          {Object.entries(MAP_TILES).map(([key, val]) => (
            <option key={key} value={key} style={{ background: '#0f172a', color: '#cbd5e1' }}>{val.name}</option>
          ))}
        </select>
      </div>

      {/* Draw controls */}
      <div style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button
          onClick={toggleDrawing}
          style={{
            padding: '8px 12px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
            background: isDrawing ? '#4c6ef5' : 'rgba(15, 23, 42, 0.92)',
            color: isDrawing ? 'white' : '#94a3b8',
            border: isDrawing ? '1px solid #4c6ef5' : '1px solid rgba(71, 85, 105, 0.5)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {isDrawing ? 'Drawing...' : 'Draw BBOX'}
        </button>
        {bbox && (
          <button
            onClick={() => onBboxChange(null)}
            style={{
              padding: '8px 12px',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              background: 'rgba(15, 23, 42, 0.92)',
              color: '#f87171',
              border: '1px solid rgba(71, 85, 105, 0.5)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}
          >
            Clear BBOX
          </button>
        )}
      </div>

      {/* Dataset count */}
      {results.length > 0 && (
        <div style={{
          position: 'absolute', bottom: '16px', left: '16px', zIndex: 1000,
          borderRadius: '12px', padding: '6px 12px', fontSize: '12px', color: '#94a3b8',
          background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(71, 85, 105, 0.3)',
        }}>
          {results.length} datasets shown
        </div>
      )}

      {/* Drawing hint */}
      {isDrawing && (
        <div style={{
          position: 'absolute', bottom: '16px', right: '16px', zIndex: 1000,
          borderRadius: '12px', padding: '6px 12px', fontSize: '12px', color: '#60a5fa',
          background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(76, 110, 245, 0.3)',
        }}>
          Click and drag on the map to select an area
        </div>
      )}
    </div>
  );
}
