/**
 * Shared satellite tile loading utilities.
 *
 * Constructs Planetary Computer tile URLs directly from scene metadata.
 * Does NOT rely on TileJSON fetch (which times out in browsers).
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

// ── Tile URL construction (direct, no TileJSON fetch) ─────────────

/**
 * Build Planetary Computer tile URL template directly from scene metadata.
 * This bypasses the TileJSON endpoint entirely.
 */
export function buildTileUrl(collection: string, itemId: string): string {
  return (
    `https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x`
    + `?collection=${encodeURIComponent(collection)}`
    + `&item=${encodeURIComponent(itemId)}`
    + `&assets=visual`
    + `&asset_bidx=visual%7C1%2C2%2C3`
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
    + `&asset_bidx=visual%7C1%2C2%2C3`
  );
}

// ── Main tile loading function ───────────────────────────────────

/**
 * Load satellite imagery tiles for a scene into a Leaflet map.
 *
 * Strategy:
 * 1. If scene has item_id + collection → construct tile URL directly (fastest, no fetch)
 * 2. If that fails → try thumbnail image overlay
 * 3. If both fail → error state
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
      console.log('[satellite-tiles] Creating tile layer directly:', tileUrl.slice(0, 100));

      const tileLayer = L.tileLayer(tileUrl, {
        maxZoom: 24,
        opacity,
        zIndex,
        crossOrigin: true,
      });

      let errorCount = 0;
      tileLayer.on('tileerror', () => {
        errorCount++;
        if (errorCount > 3) {
          console.warn('[satellite-tiles] Too many tile errors, removing layer');
          map.removeLayer(tileLayer);
        }
      });

      tileLayer.addTo(map);
      console.log('[satellite-tiles] ✅ Tile layer added successfully');
      return { hasImagery: true, layer: tileLayer, bounds, usedTileJson: true, tileUrl };
    } catch (err: any) {
      console.warn('[satellite-tiles] Direct tile URL failed:', err?.message);
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
