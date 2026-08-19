'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { DatasetResult, BoundingBox } from '@/app/page';

interface MapViewProps {
  results: DatasetResult[];
  selectedDataset: DatasetResult | null;
  onSelectDataset: (dataset: DatasetResult | null) => void;
  bbox: BoundingBox | null;
  onBboxChange: (bbox: BoundingBox | null) => void;
}

export default function MapView({ results, selectedDataset, onSelectDataset, bbox, onBboxChange }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const layersRef = useRef<any[]>([]);
  const rectRef = useRef<any>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const drawStartRef = useRef<any>(null);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Dynamic import of Leaflet (needs window)
    import('leaflet').then((L) => {
      const map = L.map(mapRef.current!, {
        center: [20, 78],
        zoom: 3,
        zoomControl: true,
        attributionControl: true,
        minZoom: 2,
        maxZoom: 18,
      });

      // Dark map tiles
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a> | &copy; <a href="https://osm.org/copyright">OpenStreetMap</a>',
        subdomains: 'abcd',
        maxZoom: 20,
      }).addTo(map);

      // Draw bounding box mode
      map.on('mousedown', (e: any) => {
        if (!isDrawing) return;
        drawStartRef.current = e.latlng;
      });

      map.on('mouseup', (e: any) => {
        if (!isDrawing || !drawStartRef.current) return;
        const start = drawStartRef.current;
        const end = e.latlng;

        const newBbox: BoundingBox = {
          north: Math.max(start.lat, end.lat),
          south: Math.min(start.lat, end.lat),
          east: Math.max(start.lng, end.lng),
          west: Math.min(start.lng, end.lng),
        };

        onBboxChange(newBbox);
        setIsDrawing(false);
        drawStartRef.current = null;
      });

      mapInstanceRef.current = map;

      // Fix Leaflet rendering on mount
      setTimeout(() => map.invalidateSize(), 100);
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Draw bounding box on map
  useEffect(() => {
    const L = require('leaflet');
    const map = mapInstanceRef.current;
    if (!map) return;

    // Remove old rectangle
    if (rectRef.current) {
      map.removeLayer(rectRef.current);
      rectRef.current = null;
    }

    if (bbox) {
      rectRef.current = L.rectangle(
        [[bbox.south, bbox.west], [bbox.north, bbox.east]],
        {
          color: '#4c6ef5',
          weight: 2,
          fillColor: '#4c6ef5',
          fillOpacity: 0.1,
          dashArray: '5, 5',
        }
      ).addTo(map);
    }
  }, [bbox]);

  // Draw dataset footprints
  useEffect(() => {
    const L = require('leaflet');
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear old layers
    layersRef.current.forEach(layer => {
      map.removeLayer(layer);
    });
    layersRef.current = [];

    // Add new footprint layers
    results.forEach(dataset => {
      if (!dataset.geometry) return;

      try {
        let layer;
        const isSelected = selectedDataset?.id === dataset.id;

        const style = {
          color: isSelected ? '#a78bfa' : '#4c6ef5',
          weight: isSelected ? 3 : 1.5,
          fillColor: isSelected ? '#a78bfa' : '#4c6ef5',
          fillOpacity: isSelected ? 0.25 : 0.1,
          opacity: isSelected ? 0.9 : 0.6,
        };

        layer = L.geoJSON(dataset.geometry, { style }).addTo(map);

        // Add popup
        const popupContent = `
          <div style="min-width: 220px; font-size: 13px;">
            <div style="font-weight: 600; margin-bottom: 4px; color: #e2e8f0;">${dataset.title}</div>
            <div style="color: #94a3b8; font-size: 11px; margin-bottom: 6px;">
              ${dataset.provider} ${dataset.collection ? `• ${dataset.collection}` : ''}
            </div>
            ${dataset.gsd ? `<div style="color: #64748b; font-size: 11px;">Resolution: ${dataset.gsd}m</div>` : ''}
            ${dataset.startDate ? `<div style="color: #64748b; font-size: 11px;">Date: ${new Date(dataset.startDate).toLocaleDateString()}</div>` : ''}
            ${dataset.cloudCover != null ? `<div style="color: #64748b; font-size: 11px;">Cloud Cover: ${dataset.cloudCover}%</div>` : ''}
            <button onclick="document.dispatchEvent(new CustomEvent('selectDataset', { detail: '${dataset.id}' }))"
              style="margin-top: 8px; padding: 4px 12px; background: #4c6ef5; color: white; border: none; border-radius: 6px; font-size: 11px; cursor: pointer;">
              View Details
            </button>
          </div>
        `;

        layer.bindPopup(popupContent);
        layer.on('click', () => {
          onSelectDataset(dataset);
        });

        layersRef.current.push(layer);
      } catch (e) {
        // Invalid geometry, skip
      }
    });

    // Fit bounds if there are results
    if (results.length > 0) {
      try {
        const allCoords: [number, number][] = [];
        results.forEach(d => {
          if (d.centroidLat && d.centroidLng) {
            allCoords.push([d.centroidLat, d.centroidLng]);
          }
        });
        if (allCoords.length > 0) {
          map.fitBounds(allCoords, { padding: [50, 50], maxZoom: 6 });
        }
      } catch (e) {}
    }
  }, [results, selectedDataset]);

  // Listen for select events from popups
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const dataset = results.find(r => r.id === e.detail);
      if (dataset) onSelectDataset(dataset);
    };
    document.addEventListener('selectDataset', handler as EventListener);
    return () => document.removeEventListener('selectDataset', handler as EventListener);
  }, [results]);

  return (
    <div className="relative">
      {/* Map container */}
      <div
        ref={mapRef}
        className="w-full h-[400px] sm:h-[500px] lg:h-[600px] rounded-2xl overflow-hidden glass"
      />

      {/* Drawing controls */}
      <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
        <button
          onClick={() => setIsDrawing(!isDrawing)}
          className={`px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200 shadow-lg ${
            isDrawing
              ? 'bg-blue-500 text-white shadow-blue-500/30'
              : 'glass text-slate-300 hover:text-white'
          }`}
          title="Draw bounding box on map"
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

      {/* Result count overlay */}
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
