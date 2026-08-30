/**
 * Shared satellite tile loading utilities.
 *
 * Constructs Planetary Computer tile URLs directly from scene metadata.
 * Does NOT rely on TileJSON fetch (which times out in browsers).
 *
 * Key insight: Sentinel-2 scenes only cover their tile footprint.
 * Tiles outside the footprint return empty/transparent — this is NORMAL.
 * The tileerror handler must NOT remove the layer for these expected failures.
 */

// ── Types ────────────────────────────────────────────────────────

export interface SatelliteLayerResult {
  hasImagery: boolean;
  layer?: any;
  bounds: any;
  usedTileJson: boolean;
  error?: string;
  tileUrl?: string;
}

// ── Bounds helpers ────────────────────────────────────────────────

export function validateBounds(bounds: number[]): boolean {
  if (!Array.isArray(bounds) || bounds.length !== 4) return false;
  const [a, b, c, d] = bounds;
  if (!isFinite(a) || !isFinite(b) || !isFinite(c) || !isFinite(d)) return false;
  if (Math.abs(a) > 180 || Math.abs(c) > 180) return false;
  if (Math.abs(b) > 90 || Math.abs(d) > 90) return false;
  const west = Math.min(a, c);
  const east = Math.max(a, c);
  const south = Math.min(b, d);
  const north = Math.max(b, d);
  if (west >= east || south >= north) return false;
  return true;
}

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

export function boundsToLatLng(bbox: number[]): L.LatLngBoundsExpression {
  const [west, south, east, north] = bbox;
  return [[south, west], [north, east]];
}

export function getBestBounds(
  sceneBbox: any,
  aoiBbox: number[],
): L.LatLngBoundsExpression {
  const sb = parseBbox(sceneBbox);
  if (sb) return boundsToLatLng(sb);
  if (aoiBbox && aoiBbox.length === 4) {
    return boundsToLatLng(aoiBbox);
  }
  return [[-85, -180], [85, 180]];
}

// ── Tile URL construction ─────────────────────────────────────────

/**
 * Build Planetary Computer tile URL template from scene metadata.
 * This is the exact URL format returned by the TileJSON endpoint.
 */
export function buildTileUrl(collection: string, itemId: string): string {
  return (
    `https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x`
    + `?collection=${encodeURIComponent(collection)}`
    + `&item=${encodeURIComponent(itemId)}`
    + `&assets=visual`
  );
}

/**
 * Build TileJSON URL from scene metadata (kept for compatibility).
 */
export function buildTileJsonUrl(collection: string, itemId: string): string {
  return (
    `https://planetarycomputer.microsoft.com/api/data/v1/item/tilejson.json`
    + `?collection=${encodeURIComponent(collection)}`
    + `&item=${encodeURIComponent(itemId)}`
    + `&assets=visual`
  );
}

// ── Main tile loading function ────────────────────────────────────

/**
 * Load satellite imagery tiles for a scene into a Leaflet map.
 *
 * Strategy:
 * 1. If scene has item_id + collection → construct tile URL directly
 * 2. If that fails → try thumbnail image overlay
 * 3. If both fail → error state
 *
 * IMPORTANT: Tiles outside the Sentinel-2 footprint return empty/transparent.
 * This is normal and expected. The tile layer must NOT be removed for this.
 */
export async function loadSatelliteTiles(
  map: any,
  opts: {
    L: any;
    tilejsonUrl?: string;
    thumbnailUrl?: string;
    sceneBbox?: any;
    aoiBbox: number[];
    sceneCollection?: string;
    sceneItemId?: string;
    opacity?: number;
    zIndex?: number;
  },
): Promise<SatelliteLayerResult> {
  const { thumbnailUrl, sceneBbox, aoiBbox, opacity = 0.9, zIndex = 400 } = opts;
  const L = opts.L;
  const collection = opts.sceneCollection || 'sentinel-2-l2a';
  const itemId = opts.sceneItemId;

  console.log('[satellite-tiles] loadSatelliteTiles:', { collection, itemId, hasThumbnail: !!thumbnailUrl });

  // ── Attempt 1: Direct tile URL from scene metadata ──────────
  if (itemId && collection) {
    try {
      const tileUrl = buildTileUrl(collection, itemId);
      const bounds = getBestBounds(sceneBbox, aoiBbox);
      console.log('[satellite-tiles] Creating tile layer:', tileUrl.slice(0, 120));

      const tileLayer = L.tileLayer(tileUrl, {
        maxZoom: 24,
        minZoom: 0,
        opacity,
        zIndex,
        // Do NOT set crossOrigin — Planetary Computer tiles work without it
        // Setting crossOrigin: true can cause CORS preflight failures
        errorTileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAABl0RVh0U29mdHdhcmUAcGFpbnQubmV0IDQuMC41ZYUyZQAAAA1JREFUGFdjYPj/nwEABQAB/VjLQQAAAABJRU5ErkJggg==',
      });

      // Count tile loads vs errors for diagnostics
      let loadedCount = 0;
      let errorCount = 0;

      tileLayer.on('tileload', () => {
        loadedCount++;
        if (loadedCount === 1) {
          console.log('[satellite-tiles] ✅ First tile loaded — imagery is rendering');
        }
      });

      // Do NOT remove the layer on tile errors.
      // Tiles outside the Sentinel-2 footprint return empty/transparent — this is normal.
      tileLayer.on('tileerror', () => {
        errorCount++;
        // Only log periodically to avoid console spam
        if (errorCount === 1) {
          console.log('[satellite-tiles] Some tiles returned empty (expected for tiles outside scene footprint)');
        }
      });

      tileLayer.addTo(map);
      console.log('[satellite-tiles] ✅ Tile layer added to map');
      return { hasImagery: true, layer: tileLayer, bounds, usedTileJson: true, tileUrl };
    } catch (err: any) {
      console.warn('[satellite-tiles] Tile layer creation failed:', err?.message);
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
        console.log('[satellite-tiles] ✅ Thumbnail overlay added');
        return { hasImagery: true, layer: imgOverlay, bounds, usedTileJson: false };
      } catch (err: any) {
        console.warn('[satellite-tiles] Thumbnail overlay failed:', err?.message);
      }
    }
  }

  // ── Fallback: No imagery ────────────────────────────────────
  const fallbackBounds = getBestBounds(sceneBbox, aoiBbox);
  console.warn('[satellite-tiles] ❌ No imagery loaded — basemap only');
  return {
    hasImagery: false,
    bounds: fallbackBounds,
    usedTileJson: false,
    error: 'Satellite imagery unavailable for this scene',
  };
}
