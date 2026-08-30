'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap, Rectangle, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { DatasetResult, BoundingBox } from '@/app/page';

type MapStyle = 'dark' | 'light' | 'streets' | 'satellite' | 'terrain';

const MAP_STYLES: Record<MapStyle, { url: string; attribution: string; name: string }> = {
  dark: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, HERE, Garmin',
    name: '🌑 Dark',
  },
  light: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, HERE, Garmin',
    name: '🗺️ Light',
  },
  streets: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
    name: '🌍 Streets',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, Maxar, Earthstar Geographics',
    name: '🛰️ Satellite',
  },
  terrain: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, HERE, Garmin',
    name: '🏔️ Terrain',
  },
};

interface MapViewProps {
  results: DatasetResult[];
  selectedDataset: DatasetResult | null;
  onSelectDataset: (dataset: DatasetResult | null) => void;
  bbox: BoundingBox | null;
  onBboxChange: (bbox: BoundingBox | null) => void;
}

// Fix Leaflet default marker icon in Next.js
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  });
}


// Auto-fit bounds to search results
function FitBounds({ results }: { results: DatasetResult[] }) {
  const map = useMap();
  useEffect(() => {
    if (results.length === 0) return;
    const coords = results
      .filter(d => d.centroidLat && d.centroidLng)
      .map(d => [d.centroidLat!, d.centroidLng!] as [number, number]);
    if (coords.length > 0) {
      const bounds = L.latLngBounds(coords);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 6 });
    }
  }, [results, map]);
  return null;
}

// Zoom to selected dataset
function ZoomToSelected({ dataset }: { dataset: DatasetResult | null }) {
  const map = useMap();
  useEffect(() => {
    if (!dataset) return;
    if (dataset.bbox && Array.isArray(dataset.bbox) && dataset.bbox.length === 4) {
      const [west, south, east, north] = dataset.bbox;
      map.fitBounds([[south, west], [north, east]], { padding: [60, 60], maxZoom: 12 });
    } else if (dataset.centroidLat && dataset.centroidLng) {
      map.flyTo([dataset.centroidLat, dataset.centroidLng], 8);
    }
  }, [dataset, map]);
  return null;
}

// Toggle map dragging based on draw mode
function ToggleDrag({ isDrawing }: { isDrawing: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (isDrawing) {
      map.dragging.disable();
      map.getContainer().style.cursor = 'crosshair';
    } else {
      map.dragging.enable();
      map.getContainer().style.cursor = '';
    }
    return () => {
      map.dragging.enable();
      map.getContainer().style.cursor = '';
    };
  }, [isDrawing, map]);
  return null;
}

// Handle draw bbox events
function DrawHandler({ isDrawing, onBboxChange, onDrawBbox }: {
  isDrawing: boolean;
  onBboxChange: (bbox: BoundingBox | null) => void;
  onDrawBbox: (bbox: [number, number, number, number] | null) => void;
}) {
  const startRef = useRef<[number, number] | null>(null);
  const lineRef = useRef<L.Polyline | null>(null);

  useMapEvents({
    mousedown(e) {
      if (!isDrawing) return;
      startRef.current = [e.latlng.lng, e.latlng.lat];
    },
    mousemove(e) {
      if (!isDrawing || !startRef.current) return;
      const map = e.target;
      const start = startRef.current;
      const end = [e.latlng.lng, e.latlng.lat];

      if (lineRef.current) {
        map.removeLayer(lineRef.current);
      }

      lineRef.current = L.polyline([
        [start[1], start[0]],
        [start[1], end[0]],
        [end[1], end[0]],
        [end[1], start[0]],
        [start[1], start[0]],
      ], {
        color: '#4c6ef5',
        weight: 2,
        dashArray: '5 5',
        fillOpacity: 0.1,
        fillColor: '#4c6ef5',
      }).addTo(map);
    },
    mouseup(e) {
      if (!isDrawing || !startRef.current) return;
      const map = e.target;
      const start = startRef.current;
      const end = [e.latlng.lng, e.latlng.lat];

      if (lineRef.current) {
        map.removeLayer(lineRef.current);
        lineRef.current = null;
      }

      const north = Math.max(start[1], end[1]);
      const south = Math.min(start[1], end[1]);
      const east = Math.max(start[0], end[0]);
      const west = Math.min(start[0], end[0]);

      if (Math.abs(north - south) > 0.001 && Math.abs(east - west) > 0.001) {
        onBboxChange({ north, south, east, west });
        onDrawBbox([west, south, east, north]);
      }

      startRef.current = null;
    },
  });

  return null;
}

export default function MapView({ results, selectedDataset, onSelectDataset, bbox, onBboxChange }: MapViewProps) {
  const [mapStyle, setMapStyle] = useState<MapStyle>('dark');
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawBbox, setDrawBbox] = useState<[number, number, number, number] | null>(null);

  // Clear draw bbox when results change
  useEffect(() => { setDrawBbox(null); }, [results]);

  const toggleDrawing = useCallback(() => { setIsDrawing(p => !p); }, []);

  const style = MAP_STYLES[mapStyle];

  // Build GeoJSON from results
  const geoJsonData = {
    type: 'FeatureCollection' as const,
    features: results
      .filter(d => d.geometry)
      .map(dataset => {
        const sel = selectedDataset?.id === dataset.id;
        return {
          type: 'Feature' as const,
          properties: {
            id: dataset.id,
            title: dataset.title,
            fillColor: sel ? '#a78bfa' : '#4c6ef5',
            fillOpacity: sel ? 0.35 : 0.15,
            color: sel ? '#a78bfa' : '#4c6ef5',
            weight: sel ? 3 : 1.5,
            opacity: sel ? 0.9 : 0.6,
          },
          geometry: dataset.geometry,
        };
      }),
  };

  return (
    <div style={{ position: 'relative', borderRadius: '16px', border: '1px solid rgba(71, 85, 105, 0.3)', width: '100%', height: '580px' }}>
      <MapContainer
        center={[20, 78]}
        zoom={3}
        style={{ width: '100%', height: '100%' }}
        zoomControl={true}
        attributionControl={true}
        key="map"  // Stable key prevents re-mount
      >
        <TileLayer
          key={mapStyle}
          url={style.url}
          attribution={style.attribution}
        />
        <GeoJSON
          key={`geo-${results.length}-${selectedDataset?.id || 'none'}`}
          data={geoJsonData}
          style={(feature) => {
            if (!feature?.properties) return {};
            return {
              fillColor: feature.properties.fillColor,
              fillOpacity: feature.properties.fillOpacity,
              color: feature.properties.color,
              weight: feature.properties.weight,
              opacity: feature.properties.opacity,
            };
          }}
          onEachFeature={(feature, layer) => {
            layer.on('click', () => {
              if (!isDrawing) {
                const dataset = results.find(r => r.id === feature.properties?.id);
                if (dataset) onSelectDataset(dataset);
              }
            });
          }}
        />
        {/* Selected dataset bbox overlay */}
        {selectedDataset?.bbox && Array.isArray(selectedDataset.bbox) && selectedDataset.bbox.length === 4 && (
          <Rectangle
            key={`sel-${selectedDataset.id}`}
            bounds={[[selectedDataset.bbox[1], selectedDataset.bbox[0]], [selectedDataset.bbox[3], selectedDataset.bbox[2]]]}
            pathOptions={{ color: '#22d3ee', weight: 2.5, fillColor: '#22d3ee', fillOpacity: 0.08, dashArray: '8 4' }}
          />
        )}
        {/* User-drawn bbox overlay */}
        {bbox && (
          <Rectangle
            bounds={[[bbox.south, bbox.west], [bbox.north, bbox.east]]}
            pathOptions={{ color: '#f87171', weight: 2, fillColor: '#f87171', fillOpacity: 0.1, dashArray: '5 5' }}
          />
        )}
        {drawBbox && (
          <Rectangle
            bounds={[[drawBbox[1], drawBbox[0]], [drawBbox[3], drawBbox[2]]]}
            pathOptions={{ color: '#4c6ef5', weight: 2, fillColor: '#4c6ef5', fillOpacity: 0.15, dashArray: '5 5' }}
          />
        )}
        <FitBounds results={results} />
        <ZoomToSelected dataset={selectedDataset} />
        <ToggleDrag isDrawing={isDrawing} />
        <DrawHandler isDrawing={isDrawing} onBboxChange={onBboxChange} onDrawBbox={setDrawBbox} />
      </MapContainer>

      {/* Style selector */}
      <div style={{ position: 'absolute', top: '16px', left: '16px', zIndex: 1000 }}>
        <select
          value={mapStyle}
          onChange={(e) => setMapStyle(e.target.value as MapStyle)}
          style={{ padding: '8px 12px', fontSize: '12px', color: '#cbd5e1', borderRadius: '12px', cursor: 'pointer', background: 'rgba(15, 23, 42, 0.92)', border: '1px solid rgba(71, 85, 105, 0.5)', outline: 'none' }}
        >
          {Object.entries(MAP_STYLES).map(([key, val]) => (
            <option key={key} value={key} style={{ background: '#0f172a', color: '#cbd5e1' }}>{val.name}</option>
          ))}
        </select>
      </div>

      {/* Draw controls */}
      <div style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button
          onClick={toggleDrawing}
          style={{ padding: '8px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', background: isDrawing ? '#4c6ef5' : 'rgba(15, 23, 42, 0.92)', color: isDrawing ? 'white' : '#94a3b8', border: isDrawing ? '1px solid #4c6ef5' : '1px solid rgba(71, 85, 105, 0.5)', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {isDrawing ? 'Drawing...' : 'Draw BBOX'}
        </button>
        {bbox && (
          <button
            onClick={() => { onBboxChange(null); setDrawBbox(null); }}
            style={{ padding: '8px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', background: 'rgba(15, 23, 42, 0.92)', color: '#f87171', border: '1px solid rgba(71, 85, 105, 0.5)', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
          >
            Clear BBOX
          </button>
        )}
      </div>

      {/* Dataset count */}
      {results.length > 0 && (
        <div style={{ position: 'absolute', bottom: '16px', left: '16px', zIndex: 1000, borderRadius: '12px', padding: '6px 12px', fontSize: '12px', color: '#94a3b8', background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(71, 85, 105, 0.3)' }}>
          {results.length} datasets shown
        </div>
      )}

      {/* Drawing hint */}
      {isDrawing && (
        <div style={{ position: 'absolute', bottom: '16px', right: '16px', zIndex: 1000, borderRadius: '12px', padding: '6px 12px', fontSize: '12px', color: '#60a5fa', background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(76, 110, 245, 0.3)' }}>
          Click and drag on the map to select an area
        </div>
      )}
    </div>
  );
}
