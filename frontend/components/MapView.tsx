'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api';
import { DatasetResult, BoundingBox } from '@/app/page';

type MapTypeId = 'roadmap' | 'satellite' | 'hybrid' | 'terrain' | 'dark';

const MAP_TYPES: Record<MapTypeId, { name: string }> = {
  roadmap:  { name: '🗺️ Streets' },
  satellite: { name: '🛰️ Satellite' },
  hybrid:   { name: '🌍 Hybrid' },
  terrain:  { name: '🏔️ Terrain' },
  dark:     { name: '🌑 Dark' },
};

const DARK_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#0d1117' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0d1117' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a919c' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a1f2e' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#5a6070' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1b2a' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#1a2030' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#141a24' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#6b7280' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#141a24' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#0d1117' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.stroke', stylers: [{ color: '#2a3040' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#7a8594' }] },
];

interface MapViewProps {
  results: DatasetResult[];
  selectedDataset: DatasetResult | null;
  onSelectDataset: (dataset: DatasetResult | null) => void;
  bbox: BoundingBox | null;
  onBboxChange: (bbox: BoundingBox | null) => void;
}

const containerStyle = { width: '100%', height: '580px' };
const defaultCenter = { lat: 20, lng: 78 };
const defaultZoom = 3;

export default function MapView({ results, selectedDataset, onSelectDataset, bbox, onBboxChange }: MapViewProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
  });

  const mapRef = useRef<google.maps.Map | null>(null);
  const [mapTypeId, setMapTypeId] = useState<MapTypeId>('dark');
  const [isDrawing, setIsDrawing] = useState(false);
  const drawStartRef = useRef<google.maps.LatLng | null>(null);
  const drawRectRef = useRef<google.maps.Rectangle | null>(null);
  const footprintRefs = useRef<google.maps.Polygon[]>([]);
  const selectedOutlineRef = useRef<google.maps.Polygon | null>(null);

  // ─── On map load ────────────────────────────────────────────
  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;

    // Drawing mousedown
    map.addListener('mousedown', (e: google.maps.MapMouseEvent) => {
      if (!isDrawing || !e.latLng) return;
      drawStartRef.current = e.latLng;
    });

    // Drawing mousemove
    map.addListener('mousemove', (e: google.maps.MapMouseEvent) => {
      if (!isDrawing || !drawStartRef.current || !e.latLng) return;
      if (drawRectRef.current) drawRectRef.current.setMap(null);

      const start = drawStartRef.current;
      const ne = new google.maps.LatLng(
        Math.max(start.lat(), e.latLng.lat()),
        Math.max(start.lng(), e.latLng.lng())
      );
      const sw = new google.maps.LatLng(
        Math.min(start.lat(), e.latLng.lat()),
        Math.min(start.lng(), e.latLng.lng())
      );

      drawRectRef.current = new google.maps.Rectangle({
        map,
        bounds: { north: ne.lat(), south: sw.lat(), east: ne.lng(), west: sw.lng() },
        fillColor: '#4c6ef5',
        fillOpacity: 0.15,
        strokeColor: '#4c6ef5',
        strokeWeight: 2,
        
        editable: false,
        draggable: false,
      });
    });

    // Drawing mouseup
    map.addListener('mouseup', (e: google.maps.MapMouseEvent) => {
      if (!isDrawing || !drawStartRef.current || !e.latLng) return;

      if (drawRectRef.current) {
        const bounds = drawRectRef.current.getBounds();
        if (bounds) {
          const ne = bounds.getNorthEast();
          const sw = bounds.getSouthWest();
          onBboxChange({
            north: ne.lat(),
            south: sw.lat(),
            east: ne.lng(),
            west: sw.lng(),
          });
        }
        drawRectRef.current.setMap(null);
        drawRectRef.current = null;
      }

      drawStartRef.current = null;
      setIsDrawing(false);
    });
  }, [isDrawing, onBboxChange]);

  // ─── Update map type ────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (mapTypeId === 'dark') {
      map.setOptions({ mapTypeId: google.maps.MapTypeId.ROADMAP, styles: DARK_STYLE });
    } else {
      const typeMap: Record<string, google.maps.MapTypeId> = {
        roadmap: google.maps.MapTypeId.ROADMAP,
        satellite: google.maps.MapTypeId.SATELLITE,
        hybrid: google.maps.MapTypeId.HYBRID,
        terrain: google.maps.MapTypeId.TERRAIN,
      };
      map.setOptions({
        mapTypeId: typeMap[mapTypeId] || google.maps.MapTypeId.ROADMAP,
        styles: undefined,
      });
    }
  }, [mapTypeId]);

  // ─── Update footprints ──────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear old footprints
    footprintRefs.current.forEach(p => p.setMap(null));
    footprintRefs.current = [];

    // Clear old draw rect
    if (drawRectRef.current) {
      drawRectRef.current.setMap(null);
      drawRectRef.current = null;
    }

    // Draw new footprints
    results.forEach(dataset => {
      if (!dataset.geometry) return;

      const paths = geometryToPaths(dataset.geometry);
      if (!paths || paths.length === 0) return;

      const isSelected = selectedDataset?.id === dataset.id;

      const polygon = new google.maps.Polygon({
        map,
        paths,
        fillColor: isSelected ? '#a78bfa' : '#4c6ef5',
        fillOpacity: isSelected ? 0.3 : 0.15,
        strokeColor: isSelected ? '#a78bfa' : '#4c6ef5',
        strokeWeight: isSelected ? 3 : 1.5,
        strokeOpacity: isSelected ? 0.9 : 0.6,
        clickable: true,
        zIndex: isSelected ? 100 : 1,
      });

      polygon.addListener('click', () => {
        if (!isDrawing) onSelectDataset(dataset);
      });

      footprintRefs.current.push(polygon);
    });

    // Fit bounds to results
    if (results.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      let hasBounds = false;

      results.forEach(dataset => {
        if (dataset.bbox && Array.isArray(dataset.bbox) && dataset.bbox.length === 4) {
          bounds.extend(new google.maps.LatLng(dataset.bbox[1], dataset.bbox[0]));
          bounds.extend(new google.maps.LatLng(dataset.bbox[3], dataset.bbox[2]));
          hasBounds = true;
        } else if (dataset.centroidLat && dataset.centroidLng) {
          bounds.extend(new google.maps.LatLng(dataset.centroidLat, dataset.centroidLng));
          hasBounds = true;
        }
      });

      if (hasBounds) {
        map.fitBounds(bounds, 50);
      }
    }
  }, [results, selectedDataset, onSelectDataset, isDrawing]);

  // ─── Zoom to selected dataset ───────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedDataset) return;

    // Clear previous selection highlight
    if (selectedOutlineRef.current) {
      selectedOutlineRef.current.setMap(null);
      selectedOutlineRef.current = null;
    }

    if (selectedDataset.bbox && Array.isArray(selectedDataset.bbox) && selectedDataset.bbox.length === 4) {
      const [west, south, east, north] = selectedDataset.bbox;
      map.fitBounds(
        { south, west, north, east },
        { top: 60, right: 60, bottom: 60, left: 60 }
      );
    } else if (selectedDataset.centroidLat && selectedDataset.centroidLng) {
      map.panTo({ lat: selectedDataset.centroidLat, lng: selectedDataset.centroidLng });
      map.setZoom(8);
    }
  }, [selectedDataset]);

  // ─── Draw cursor ────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const div = map.getDiv?.();
    if (div) {
      const canvas = div.querySelector('canvas');
      if (canvas) canvas.style.cursor = isDrawing ? 'crosshair' : '';
    }
  }, [isDrawing]);

  const toggleDrawing = useCallback(() => {
    setIsDrawing(prev => !prev);
  }, []);

  // ─── Loading / Error states ─────────────────────────────────
  if (loadError) {
    return (
      <div style={{ width: '100%', height: '580px', borderRadius: '16px', background: '#0d1117', border: '1px solid rgba(71, 85, 105, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#f87171', gap: '8px' }}>
        <div style={{ fontSize: '32px' }}>⚠️</div>
        <div>Failed to load Google Maps</div>
        <div style={{ fontSize: '12px', color: '#64748b' }}>
          Add your API key to <code>frontend/.env.local</code>
        </div>
        <div style={{ fontSize: '11px', color: '#475569', maxWidth: '400px', textAlign: 'center', marginTop: '8px' }}>
          Get a free key at{' '}
          <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener" style={{ color: '#60a5fa' }}>
            Google Cloud Console
          </a>
          {' '}→ Enable &quot;Maps JavaScript API&quot; → Create API Key
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div style={{ width: '100%', height: '580px', borderRadius: '16px', background: '#0d1117', border: '1px solid rgba(71, 85, 105, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#64748b', gap: '8px' }}>
        <div style={{ fontSize: '32px' }}>🗺️</div>
        <div>Loading Google Maps...</div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', borderRadius: '16px', border: '1px solid rgba(71, 85, 105, 0.3)', width: '100%', height: '580px' }}>
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={defaultCenter}
        zoom={defaultZoom}
        onLoad={onMapLoad}
        options={{
          disableDefaultUI: true,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: 'greedy',
        }}
      />

      {/* Style selector */}
      <div style={{ position: 'absolute', top: '16px', left: '16px', zIndex: 10 }}>
        <select
          value={mapTypeId}
          onChange={(e) => setMapTypeId(e.target.value as MapTypeId)}
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
          {Object.entries(MAP_TYPES).map(([key, val]) => (
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

// ─── Convert GeoJSON geometry to Google Maps paths ──────────────
function geometryToPaths(geometry: any): google.maps.LatLngLiteral[][] | null {
  if (!geometry) return null;

  const toLatLngArray = (coords: number[][][]): google.maps.LatLngLiteral[][] => {
    return coords.map(ring =>
      ring.map(([lng, lat]) => ({ lat, lng }))
    );
  };

  try {
    if (geometry.type === 'Polygon') {
      return toLatLngArray(geometry.coordinates);
    } else if (geometry.type === 'MultiPolygon') {
      return geometry.coordinates.flat().map((polygon: number[][]) =>
        polygon.map(([lng, lat]: number[]) => ({ lat, lng }))
      );
    } else if (geometry.type === 'Feature') {
      return geometryToPaths(geometry.geometry);
    } else if (geometry.type === 'FeatureCollection') {
      const allPaths: google.maps.LatLngLiteral[][] = [];
      geometry.features?.forEach((f: any) => {
        const p = geometryToPaths(f.geometry);
        if (p) allPaths.push(...p);
      });
      return allPaths.length > 0 ? allPaths : null;
    }
  } catch {
    return null;
  }

  return null;
}
