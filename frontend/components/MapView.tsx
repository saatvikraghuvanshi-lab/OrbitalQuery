'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { DatasetResult, BoundingBox } from '@/app/page';

type MapStyle = 'dark' | 'light' | 'streets' | 'satellite' | 'terrain';

const MAP_STYLES: Record<MapStyle, { url: string; name: string }> = {
  'dark': {
    url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    name: '🗺️ CARTO Dark',
  },
  'light': {
    url: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
    name: '🗺️ CARTO Voyager',
  },
  'streets': {
    url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    name: '🌍 Streets',
  },
  'satellite': {
    url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    name: '🛰️ Positron',
  },
  'terrain': {
    url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    name: '🌑 Dark Matter',
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
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const maplibreglRef = useRef<any>(null);
  const [mapStyle, setMapStyle] = useState<MapStyle>('dark');
  const [isDrawing, setIsDrawing] = useState(false);
  const drawStartRef = useRef<any>(null);
  const drawRectRef = useRef<string | null>(null);

  // ─── Initialize MapLibre map ──────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let destroyed = false;
    let map: any = null;

    const init = async () => {
      const maplibregl = await import('maplibre-gl');
      maplibreglRef.current = maplibregl;

      if (destroyed || !container) return;

      // Explicitly set dimensions before init
      container.style.width = '100%';
      container.style.height = '580px';
      container.style.position = 'relative';

      map = new maplibregl.Map({
        container,
        style: MAP_STYLES[mapStyle].url,
        center: [78, 20],
        zoom: 3,
        attributionControl: {},
      });

      if (destroyed) { map.remove(); return; }
      mapRef.current = map;

      // Force resize after creation
      map.on('load', () => {
        if (destroyed) return;
        map.resize();

        // Add GeoJSON source for dataset footprints
        map.addSource('datasets', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });

        map.addLayer({
          id: 'datasets-fill',
          type: 'fill',
          source: 'datasets',
          paint: {
            'fill-color': ['get', 'fillColor'],
            'fill-opacity': ['get', 'fillOpacity'],
          },
        });

        map.addLayer({
          id: 'datasets-line',
          type: 'line',
          source: 'datasets',
          paint: {
            'line-color': ['get', 'strokeColor'],
            'line-width': ['get', 'strokeWidth'],
            'line-opacity': ['get', 'strokeOpacity'],
          },
        });

        map.on('click', 'datasets-fill', (e: any) => {
          if (isDrawing) return;
          if (e.features && e.features.length > 0) {
            const feature = e.features[0];
            const datasetId = feature.properties?.id;
            if (datasetId) {
              const dataset = results.find(r => r.id === datasetId);
              if (dataset) onSelectDataset(dataset);
            }
          }
        });

        map.on('mouseenter', 'datasets-fill', () => {
          if (!isDrawing) map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'datasets-fill', () => {
          if (!isDrawing) map.getCanvas().style.cursor = '';
        });

        updateFootprints();
      });

      // Drawing handlers
      map.on('mousedown', (e: any) => {
        if (!isDrawing) return;
        e.preventDefault();
        drawStartRef.current = [e.lngLat.lng, e.lngLat.lat];
      });

      map.on('mousemove', (e: any) => {
        if (!isDrawing || !drawStartRef.current) return;
        const start = drawStartRef.current;
        const end = [e.lngLat.lng, e.lngLat.lat];

        if (drawRectRef.current && map.getLayer(drawRectRef.current)) {
          map.removeLayer(drawRectRef.current);
          map.removeLayer(drawRectRef.current + '-line');
          map.removeSource(drawRectRef.current);
        }

        const id = 'draw-rect-' + Date.now();
        drawRectRef.current = id;

        map.addSource(id, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [[
                [start[0], start[1]],
                [end[0], start[1]],
                [end[0], end[1]],
                [start[0], end[1]],
                [start[0], start[1]],
              ]],
            },
          },
        });

        map.addLayer({
          id,
          type: 'fill',
          source: id,
          paint: { 'fill-color': '#4c6ef5', 'fill-opacity': 0.15 },
        });

        map.addLayer({
          id: id + '-line',
          type: 'line',
          source: id,
          paint: { 'line-color': '#4c6ef5', 'line-width': 2, 'line-dasharray': [5, 5] },
        });
      });

      map.on('mouseup', (e: any) => {
        if (!isDrawing || !drawStartRef.current) return;
        const start = drawStartRef.current;
        const end = [e.lngLat.lng, e.lngLat.lat];

        if (drawRectRef.current) {
          try {
            if (map.getLayer(drawRectRef.current)) map.removeLayer(drawRectRef.current);
            if (map.getLayer(drawRectRef.current + '-line')) map.removeLayer(drawRectRef.current + '-line');
            if (map.getSource(drawRectRef.current)) map.removeSource(drawRectRef.current);
          } catch {}
          drawRectRef.current = null;
        }

        const north = Math.max(start[1], end[1]);
        const south = Math.min(start[1], end[1]);
        const east = Math.max(start[0], end[0]);
        const west = Math.min(start[0], end[0]);

        if (Math.abs(north - south) > 0.001 && Math.abs(east - west) > 0.001) {
          onBboxChange({ north, south, east, west });
        }

        setIsDrawing(false);
        drawStartRef.current = null;
      });
    };

    init();

    return () => {
      destroyed = true;
      if (map) {
        try { map.remove(); } catch {}
        mapRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Switch style ─────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(MAP_STYLES[mapStyle].url);

    map.once('style.load', () => {
      map.addSource('datasets', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'datasets-fill',
        type: 'fill',
        source: 'datasets',
        paint: {
          'fill-color': ['get', 'fillColor'],
          'fill-opacity': ['get', 'fillOpacity'],
        },
      });

      map.addLayer({
        id: 'datasets-line',
        type: 'line',
        source: 'datasets',
        paint: {
          'line-color': ['get', 'strokeColor'],
          'line-width': ['get', 'strokeWidth'],
          'line-opacity': ['get', 'strokeOpacity'],
        },
      });

      updateFootprints();
    });
  }, [mapStyle]);

  // ─── Update footprints on map ─────────────────────────────────
  const updateFootprints = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const features = results
      .filter(d => d.geometry)
      .map(dataset => {
        const sel = selectedDataset?.id === dataset.id;
        return {
          type: 'Feature' as const,
          id: dataset.id,
          properties: {
            id: dataset.id,
            title: dataset.title,
            fillColor: sel ? '#a78bfa' : '#4c6ef5',
            fillOpacity: sel ? 0.3 : 0.15,
            strokeColor: sel ? '#a78bfa' : '#4c6ef5',
            strokeWidth: sel ? 3 : 1.5,
            strokeOpacity: sel ? 0.9 : 0.6,
          },
          geometry: dataset.geometry,
        };
      });

    try {
      const source = map.getSource('datasets') as any;
      if (source) {
        source.setData({ type: 'FeatureCollection', features });
      }
    } catch {}

    if (results.length > 0) {
      try {
        const coords = results
          .filter(d => d.centroidLat && d.centroidLng)
          .map(d => [d.centroidLng!, d.centroidLat!] as [number, number]);
        if (coords.length > 0 && maplibreglRef.current) {
          const bounds = coords.reduce(
            (b, c) => b.extend(c),
            new maplibreglRef.current.LngLatBounds(coords[0], coords[0])
          );
          map.fitBounds(bounds, { padding: { top: 50, bottom: 50, left: 50, right: 50 }, maxZoom: 6 });
        }
      } catch {}
    }
  }, [results, selectedDataset]);

  useEffect(() => {
    updateFootprints();
  }, [updateFootprints]);

  // ─── Zoom to selected dataset ─────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedDataset) return;

    try {
      if (selectedDataset.bbox && Array.isArray(selectedDataset.bbox) && selectedDataset.bbox.length === 4) {
        const [west, south, east, north] = selectedDataset.bbox;
        map.fitBounds([[west, south], [east, north]], { padding: { top: 60, bottom: 60, left: 60, right: 60 }, maxZoom: 12 });
      } else if (selectedDataset.geometry) {
        const coords = extractCoords(selectedDataset.geometry);
        if (coords.length > 0 && maplibreglRef.current) {
          const bounds = coords.reduce((b, c) => b.extend(c), new maplibreglRef.current.LngLatBounds(coords[0], coords[0]));
          map.fitBounds(bounds, { padding: { top: 60, bottom: 60, left: 60, right: 60 }, maxZoom: 12 });
        }
      } else if (selectedDataset.centroidLat && selectedDataset.centroidLng) {
        map.flyTo({ center: [selectedDataset.centroidLng, selectedDataset.centroidLat], zoom: 8 });
      }
    } catch {}
  }, [selectedDataset]);

  // ─── Draw mode toggle ─────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = isDrawing ? 'crosshair' : '';
  }, [isDrawing]);

  const toggleDrawing = useCallback(() => {
    setIsDrawing(prev => !prev);
  }, []);

  return (
    <div style={{
      position: 'relative',
      borderRadius: '16px',
      border: '1px solid rgba(71, 85, 105, 0.3)',
      width: '100%',
      height: '580px',
    }}>
      <div
        ref={containerRef}
        className="maplibregl-map"
        style={{ width: '100%', height: '580px' }}
      />

      {/* Style selector */}
      <div style={{ position: 'absolute', top: '16px', left: '16px', zIndex: 10 }}>
        <select
          value={mapStyle}
          onChange={(e) => setMapStyle(e.target.value as MapStyle)}
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
          {Object.entries(MAP_STYLES).map(([key, val]) => (
            <option key={key} value={key} style={{ background: '#0f172a', color: '#cbd5e1' }}>{val.name}</option>
          ))}
        </select>
      </div>

      {/* Draw controls */}
      <div style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
          position: 'absolute', bottom: '16px', left: '16px', zIndex: 10,
          borderRadius: '12px', padding: '6px 12px', fontSize: '12px', color: '#94a3b8',
          background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(71, 85, 105, 0.3)',
        }}>
          {results.length} datasets shown
        </div>
      )}

      {/* Drawing hint */}
      {isDrawing && (
        <div style={{
          position: 'absolute', bottom: '16px', right: '16px', zIndex: 10,
          borderRadius: '12px', padding: '6px 12px', fontSize: '12px', color: '#60a5fa',
          background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(76, 110, 245, 0.3)',
        }}>
          Click and drag on the map to select an area
        </div>
      )}
    </div>
  );
}

// ─── Helper: extract all coordinates from GeoJSON ──────────────
function extractCoords(geojson: any): [number, number][] {
  const coords: [number, number][] = [];
  if (!geojson) return coords;

  const extract = (c: any) => {
    if (!c) return;
    if (typeof c[0] === 'number') {
      coords.push([c[0], c[1]]);
    } else if (Array.isArray(c)) {
      c.forEach(extract);
    }
  };

  if (geojson.type === 'Feature') {
    extract(geojson.geometry?.coordinates);
  } else if (geojson.type === 'FeatureCollection') {
    geojson.features?.forEach((f: any) => extract(f.geometry?.coordinates));
  } else {
    extract(geojson.coordinates);
  }

  return coords;
}
