/**
 * Shared satellite tile loading utilities.
 *
 * Handles:
 * - TileJSON fetch with timeout and error handling
 * - Thumbnail fallback when TileJSON fails
 * - Bounds validation (must be WGS84, sane range)
 * - Scene bbox vs TileJSON bounds disambiguation
 */

/* Leaflet is passed as a parameter to loadSatelliteTiles to avoid module-level import issues */

// ── Types ────────────────────────────────────────────────────────

export interface TileJsonResponse {
  tiles: string[];
  bounds: number[]; // [west, south, east, north] or [x_min, y_min, x_max, y_max]
  maxzoom: number;
  minzoom?: number;
}

export interface SatelliteLayerResult {
  /** Whether any imagery was successfully loaded */
  hasImagery: boolean;
  /** The Leaflet tile/image layer that was added */
  layer?: any;
  /** Bounds to use for fitBounds (always WGS84) */
  bounds: any;
  /** Whether we used TileJSON (true) or thumbnail fallback (false) */
  usedTileJson: boolean;
  /** Error message if everything failed */
  error?: string;
  /** The tile URL template that was used (for debugging) */
  tileUrl?: string;
}

// ── TileJSON fetch ───────────────────────────────────────────────

export async function fetchTileJson(
  url: string,
  timeoutMs = 8000
): Promise<TileJsonResponse | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`[satellite-tiles] TileJSON ${res.status} for ${url.slice(0, 80)}...`);
      return null;
    }
    const data = await res.json();
    if (!data?.tiles?.length) {
      console.warn('[satellite-tiles] TileJSON has no tiles');
      return null;
    }
    return data;
  } catch (err: any) {
    console.warn('[satellite-tiles] TileJSON fetch failed:', err?.message || err);
    return null;
  }
}

// ── Bounds validation ────────────────────────────────────────────

/**
 * Validate that bounds are in WGS84 and sane.
 * TileJSON may return EPSG:3857 bounds (values in millions) — reject those.
 * WGS84 bounds: lon ∈ [-180, 180], lat ∈ [-90, 90].
 */
export function validateBounds(bounds: number[]): boolean {
  if (!Array.isArray(bounds) || bounds.length !== 4) return false;
  const [a, b, c, d] = bounds;
  // Check values are finite numbers
  if (!isFinite(a) || !isFinite(b) || !isFinite(c) || !isFinite(d)) return false;
  // Check for EPSG:3857 bounds (absolute values > 180 for lon, > 90 for lat)
  const maxLon = 180;
  const maxLat = 90;
  if (Math.abs(a) > maxLon || Math.abs(c) > maxLon) return false;
  if (Math.abs(b) > maxLat || Math.abs(d) > maxLat) return false;
  // Ensure west < east and south < north
  const west = Math.min(a, c);
  const east = Math.max(a, c);
  const south = Math.min(b, d);
  const north = Math.max(b, d);
  if (west >= east || south >= north) return false;
  return true;
}

/**
 * Parse bbox that might be an array, JSON string, or undefined.
 * Returns null if invalid.
 */
export function parseBbox(b: any): number[] | null {
  if (!b) return null;
  if (Array.isArray(b) && b.length === 4 && validateBounds(b)) return b;
  if (typeof b === 'string') {
    try {
      const p = JSON.parse(b);
      if (Array.isArray(p) && p.length === 4 && validateBounds(p)) return p;
    } catch { /* ignore */ }
  }
  return null;
}

// ── Bounds conversion ────────────────────────────────────────────

/**
 * Convert [west, south, east, north] to Leaflet LatLngBoundsExpression.
 */
export function boundsToLatLng(bbox: number[]): L.LatLngBoundsExpression {
  const [west, south, east, north] = bbox;
  return [[south, west], [north, east]];
}

// ── Scene bbox fallback ──────────────────────────────────────────

/**
 * Get the best available bounds for map positioning.
 * Priority: scene bbox > TileJSON bounds > AOI bbox.
 * Always validates WGS84.
 */
export function getBestBounds(
  sceneBbox: any,
  tileJsonBounds: number[] | undefined,
  aoiBbox: number[],
): L.LatLngBoundsExpression {
  // 1. Scene bbox (from STAC item) — always WGS84
  const sb = parseBbox(sceneBbox);
  if (sb) return boundsToLatLng(sb);

  // 2. TileJSON bounds — validate they're WGS84
  if (tileJsonBounds && validateBounds(tileJsonBounds)) {
    return boundsToLatLng(tileJsonBounds);
  }

  // 3. AOI bbox — always WGS84
  if (aoiBbox && aoiBbox.length === 4) {
    return boundsToLatLng(aoiBbox);
  }

  // Default: world
  return [[-85, -180], [85, 180]];
}

// ── Construct TileJSON URL ───────────────────────────────────────

/**
 * Construct a Planetary Computer TileJSON URL from scene metadata.
 */
export function buildTileJsonUrl(collection: string, itemId: string): string {
  return (
    `https://planetarycomputer.microsoft.com/api/data/v1/item/tilejson.json` +
    `?collection=${encodeURIComponent(collection)}` +
    `&item=${encodeURIComponent(itemId)}` +
    `&assets=visual` +
    `&asset_bidx=visual%7C1%2C2%2C3`
  );
}

// ── Main tile loading function ───────────────────────────────────

/**
 * Load satellite imagery tiles for a scene into a Leaflet map.
 *
 * Tries in order:
 * 1. TileJSON → TileLayer (real zoomable tiles)
 * 2. Thumbnail → ImageOverlay (static preview)
 * 3. Nothing (error state)
 */
export async function loadSatelliteTiles(
  map: any,
  opts: {
    L: any; // Leaflet instance (passed from dynamic import)
    tilejsonUrl?: string;
    thumbnailUrl?: string;
    sceneBbox?: any;
    aoiBbox: number[];
    opacity?: number;
    zIndex?: number;
  },
): Promise<SatelliteLayerResult> {
  const { tilejsonUrl, thumbnailUrl, sceneBbox, aoiBbox, opacity = 0.9, zIndex = 400 } = opts;
  const L = opts.L; // Leaflet instance from dynamic import
  console.log('[satellite-tiles] loadSatelliteTiles called:', { tilejsonUrl: tilejsonUrl?.slice(0, 80), thumbnailUrl: thumbnailUrl?.slice(0, 80), sceneBbox: !!sceneBbox, aoiBbox });

  // ── Attempt 1: TileJSON tiles ───────────────────────────────
  if (tilejsonUrl) {
    try {
      console.log('[satellite-tiles] Fetching TileJSON:', tilejsonUrl.slice(0, 100));
      const tj = await fetchTileJson(tilejsonUrl);
      if (tj?.tiles?.[0]) {
        const tileUrl = tj.tiles[0].replace('@1x', '');
        const bounds = getBestBounds(sceneBbox, tj.bounds, aoiBbox);
        console.log('[satellite-tiles] TileJSON loaded, creating tile layer:', { tileUrl: tileUrl.slice(0, 100), bounds });
        const tileLayer = L.tileLayer(tileUrl, {
          maxZoom: tj.maxzoom || 24,
          opacity,
          zIndex,
          crossOrigin: true,
        });
        let errorCount = 0;
        tileLayer.on('tileerror', () => {
          errorCount++;
          if (errorCount > 5) {
            console.warn('[satellite-tiles] Too many tile errors, removing tile layer');
            map.removeLayer(tileLayer);
          }
        });
        tileLayer.addTo(map);
        console.log('[satellite-tiles] Tile layer added to map successfully');
        return { hasImagery: true, layer: tileLayer, bounds, usedTileJson: true, tileUrl };
      }
    } catch (err: any) {
      console.warn('[satellite-tiles] TileJSON attempt failed:', err?.message);
    }
  }

  // ── Attempt 2: Thumbnail image overlay ──────────────────────
  if (thumbnailUrl && sceneBbox) {
    const bbox = parseBbox(sceneBbox);
    if (bbox) {
      try {
        console.log('[satellite-tiles] Falling back to thumbnail overlay');
        const bounds = boundsToLatLng(bbox);
        const imgOverlay = L.imageOverlay(thumbnailUrl, bounds, {
          opacity: Math.min(opacity, 0.85),
          interactive: false,
          zIndex,
        });
        imgOverlay.addTo(map);
        console.log('[satellite-tiles] Thumbnail overlay added to map');
        return {
          hasImagery: true,
          layer: imgOverlay,
          bounds,
          usedTileJson: false,
        };
      } catch (err: any) {
        console.warn('[satellite-tiles] Thumbnail overlay failed:', err?.message);
      }
    }
  }

  // ── Fallback: No imagery ────────────────────────────────────
  const fallbackBounds = getBestBounds(sceneBbox, undefined, aoiBbox);
  console.warn('[satellite-tiles] No imagery loaded — fallback to basemap only');
  return {
    hasImagery: false,
    bounds: fallbackBounds,
    usedTileJson: false,
    error: tilejsonUrl ? 'Tile fetch failed and no thumbnail available' : 'No imagery source provided',
  };
}
