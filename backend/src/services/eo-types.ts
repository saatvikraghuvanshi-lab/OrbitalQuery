/**
 * Normalized EO Dataset representation.
 *
 * Every STAC item — regardless of provider — is mapped to this shape
 * before entering the search/ranking pipeline.  Fields that a provider
 * cannot supply are `null`, never undefined.
 */

export interface NormalizedDataset {
  /** Stable unique identifier (STAC item id or synthetic key). */
  id: string;

  /** Provider that served this item (e.g. "AWS Earth Search", "Planetary Computer"). */
  provider: string;

  /** STAC collection (e.g. "sentinel-2-l2a"). */
  collection: string;

  /** Human-readable title (falls back to `{collection} – {id}`). */
  title: string;

  /** Optional description. */
  description: string | null;

  /** Acquisition datetime (ISO 8601). */
  datetime: string;

  /** GeoJSON geometry of the scene footprint. */
  geometry: GeoJSON.Geometry | null;

  /** Bounding box [west, south, east, north]. */
  bbox: number[] | null;

  /** Cloud cover percentage (0–100). */
  cloudCover: number | null;

  /** Ground sampling distance in metres. */
  resolutionM: number | null;

  /** Platform / satellite name (e.g. "Sentinel-2A"). */
  platform: string | null;

  /** Instrument name (e.g. "MSI"). */
  instrument: string | null;

  /** Available band / asset keys. */
  assets: Record<string, { href: string; mediaType?: string }> | null;

  /** Thumbnail or rendered-preview URL. */
  previewUrl: string | null;

  /** Self-link or STAC item URL. */
  stacLink: string | null;

  /** URL to the TileJSON endpoint (if available). */
  tilejsonUrl: string | null;

  /** Which original source: "sqlite" | "live". */
  source: 'sqlite' | 'live';

  /** Spatial overlap with the query AOI (0–1).  null = not computed. */
  aoiOverlap: number | null;

  /** Pre-computed centroid for quick spatial filtering. */
  centroid: { lat: number; lng: number } | null;
}

/** Minimal bounding-box type. */
export type BBox = [number, number, number, number]; // [west, south, east, north]
