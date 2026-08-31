'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { AnalysisOverrides } from '@/hooks/useAnalysis';

interface Props {
  onSubmit: (query: string, overrides: AnalysisOverrides) => void;
  loading: boolean;
}

const ANALYSIS_TYPES = [
  { value: 'change_detection', label: 'Change Detection', description: 'Pixel-level difference between two dates' },
  { value: 'urban_expansion', label: 'Urban Expansion', description: 'Built-up area growth using NDBI' },
  { value: 'vegetation_change', label: 'Vegetation Change', description: 'Vegetation health change using NDVI' },
  { value: 'flood_impact', label: 'Flood Impact', description: 'Water extent change using NDWI' },
  { value: 'deforestation', label: 'Deforestation', description: 'Forest cover loss using NDVI' },
  { value: 'glacier_retreat', label: 'Glacier Retreat', description: 'Snow/ice change using NDSI' },
];

export default function ChangeAnalysisForm({ onSubmit, loading }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const drawLayerRef = useRef<any>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [bbox, setBbox] = useState<number[] | null>(null);
  const [beforeDate, setBeforeDate] = useState('2022-01-01');
  const [afterDate, setAfterDate] = useState('2024-08-28');
  const [analysisType, setAnalysisType] = useState('change_detection');
  const [locationName, setLocationName] = useState('');
  const startRef = useRef<any>(null);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    import('leaflet').then((L) => {
      const map = L.map(mapRef.current!, {
        center: [20.5, 78.9],
        zoom: 5,
        zoomControl: false,
        attributionControl: false,
      });

      L.tileLayer('https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        maxZoom: 22,
        subdomains: ['0', '1', '2', '3'],
      }).addTo(map);

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      mapInstanceRef.current = map;
    });

    return () => {
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Drawing handlers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    import('leaflet').then((L) => {
      const onClick = (e: any) => {
        if (!isDrawing) return;
        if (!startRef.current) {
          startRef.current = e.latlng;
        } else {
          const start = startRef.current;
          const end = e.latlng;
          const south = Math.min(start.lat, end.lat);
          const north = Math.max(start.lat, end.lat);
          const west = Math.min(start.lng, end.lng);
          const east = Math.max(start.lng, end.lng);

          const newBbox = [west, south, east, north];
          setBbox(newBbox);

          if (drawLayerRef.current) {
            map.removeLayer(drawLayerRef.current);
          }

          const rect = L.rectangle(
            [[south, west], [north, east]],
            { color: '#A3E635', weight: 2, fillColor: '#A3E635', fillOpacity: 0.1, dashArray: '6 3' }
          ).addTo(map);

          drawLayerRef.current = rect;
          startRef.current = null;
          setIsDrawing(false);
          map.fitBounds(rect.getBounds(), { padding: [30, 30] });
        }
      };

      map.on('click', onClick);
      return () => { map.off('click', onClick); };
    });
  }, [isDrawing]);

  const clearBbox = () => {
    setBbox(null);
    if (drawLayerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(drawLayerRef.current);
      drawLayerRef.current = null;
    }
  };

  const handleSubmit = () => {
    if (!bbox || loading) return;

    const phenom = ANALYSIS_TYPES.find(t => t.value === analysisType)?.label || 'Change Detection';
    const location = locationName || `${bbox[1].toFixed(2)}°N, ${bbox[0].toFixed(2)}°E`;
    const query = `${phenom} in ${location} from ${beforeDate} to ${afterDate}`;

    onSubmit(query, {
      bbox,
      start_date: beforeDate,
      end_date: afterDate,
      phenomenon: analysisType === 'change_detection' ? undefined : analysisType,
    });
  };

  const bboxStr = bbox ? `${bbox[1].toFixed(4)}°N, ${bbox[0].toFixed(4)}°E → ${bbox[3].toFixed(4)}°N, ${bbox[2].toFixed(4)}°E` : null;

  return (
    <div className="flex-1 flex flex-col" style={{ background: '#050907' }}>
      {/* Top: Map with BBOX drawing */}
      <div className="flex-1 relative min-h-[400px]">
        <div ref={mapRef} className="absolute inset-0" />

        {/* Draw controls overlay */}
        <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-2">
          <button
            onClick={() => { setIsDrawing(!isDrawing); startRef.current = null; }}
            className={`px-3 py-2 rounded-lg text-[10px] font-semibold uppercase tracking-wider transition-all flex items-center gap-2 ${
              isDrawing
                ? 'bg-lime text-oq-950'
                : 'bg-oq-900/90 backdrop-blur-sm text-oq-200 hover:text-oq-50 border border-oq-700/30'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {isDrawing ? 'Click two points on map' : 'Draw AOI'}
          </button>

          {bbox && (
            <button
              onClick={clearBbox}
              className="px-3 py-2 rounded-lg text-[10px] font-semibold uppercase tracking-wider bg-oq-900/90 backdrop-blur-sm text-red-400 hover:text-red-300 border border-oq-700/30 transition-all"
            >
              Clear AOI
            </button>
          )}
        </div>

        {/* AOI info */}
        {bboxStr && (
          <div className="absolute bottom-3 left-3 z-[1000] bg-oq-900/90 backdrop-blur-sm rounded-lg border border-oq-700/30 px-3 py-2">
            <div className="text-[8px] text-oq-400 uppercase tracking-wider mb-0.5">Selected AOI</div>
            <div className="text-[10px] text-oq-100 font-mono">{bboxStr}</div>
          </div>
        )}

        {isDrawing && !bbox && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] bg-oq-900/90 backdrop-blur-sm rounded-lg border border-lime/30 px-4 py-2">
            <div className="text-[10px] text-lime font-medium">Click first corner, then second corner to define AOI</div>
          </div>
        )}
      </div>

      {/* Bottom: Configuration panel */}
      <div className="border-t border-oq-700/20 bg-oq-950">
        <div className="max-w-[1400px] mx-auto px-6 py-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            {/* Before date */}
            <div>
              <label className="block text-[9px] uppercase tracking-wider text-oq-400 font-medium mb-1.5">Before Date</label>
              <input
                type="date"
                value={beforeDate}
                onChange={(e) => setBeforeDate(e.target.value)}
                className="w-full bg-oq-800/60 border border-oq-700/30 rounded-lg px-3 py-2.5 text-[12px] text-oq-100 font-mono focus:border-lime/40 focus:outline-none transition-colors"
              />
            </div>

            {/* After date */}
            <div>
              <label className="block text-[9px] uppercase tracking-wider text-oq-400 font-medium mb-1.5">After Date</label>
              <input
                type="date"
                value={afterDate}
                onChange={(e) => setAfterDate(e.target.value)}
                className="w-full bg-oq-800/60 border border-oq-700/30 rounded-lg px-3 py-2.5 text-[12px] text-oq-100 font-mono focus:border-lime/40 focus:outline-none transition-colors"
              />
            </div>

            {/* Analysis type */}
            <div>
              <label className="block text-[9px] uppercase tracking-wider text-oq-400 font-medium mb-1.5">Analysis Type</label>
              <select
                value={analysisType}
                onChange={(e) => setAnalysisType(e.target.value)}
                className="w-full bg-oq-800/60 border border-oq-700/30 rounded-lg px-3 py-2.5 text-[12px] text-oq-100 focus:border-lime/40 focus:outline-none transition-colors"
              >
                {ANALYSIS_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Run button */}
            <div>
              <button
                onClick={handleSubmit}
                disabled={!bbox || loading}
                className="w-full px-4 py-2.5 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{
                  background: bbox && !loading ? '#A3E635' : '#0D1712',
                  color: bbox && !loading ? '#050907' : '#68756E',
                  border: `1px solid ${bbox && !loading ? 'rgba(163,230,53,0.3)' : 'rgba(23,37,28,0.5)'}`,
                }}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Analyzing...
                  </>
                ) : (
                  <>
                    Run Analysis
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Location name (optional) */}
          <div className="mt-3">
            <label className="block text-[9px] uppercase tracking-wider text-oq-400 font-medium mb-1.5">Location Name (optional)</label>
            <input
              type="text"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder="e.g. Hyderabad, Western Ghats, Sundarbans"
              className="w-full max-w-md bg-oq-800/40 border border-oq-700/20 rounded-lg px-3 py-2 text-[12px] text-oq-100 placeholder:text-oq-500 focus:border-oq-500/40 focus:outline-none transition-colors"
            />
          </div>

          {/* Quick info */}
          <div className="mt-3 flex items-center gap-4 text-[9px] text-oq-500">
            <span>{ANALYSIS_TYPES.find(t => t.value === analysisType)?.description}</span>
            {bbox && <span className="text-oq-400">AOI: {((bbox[2] - bbox[0]) * 111 * Math.cos((bbox[1] + bbox[3]) / 2 * Math.PI / 180)).toFixed(1)} × {((bbox[3] - bbox[1]) * 111).toFixed(1)} km</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
