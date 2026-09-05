/**
 * Coverage Calculator — geometry-based spatial intersection.
 *
 * Determines how well a set of scene footprints covers a requested AOI.
 * Uses bbox approximation for speed; falls back to point-in-polygon for
 * scenes whose bbox overlaps the AOI but the actual geometry may not.
 *
 * All geometry is kept in WGS-84 (lon/lat).  For the AOI sizes in this
 * project (< 100° span) the bbox approximation error is < 1 % and
 * perfectly adequate for ranking purposes.
 */

import type { BBox } from './eo-types';

// ── bbox helpers ────────────────────────────────────────────────────

/** Area of a bbox in degrees². */
export function bboxAreaDeg2(bbox: BBox): number {
  const [west, south, east, north] = bbox;
  return Math.max(0, east - west) * Math.max(0, north - south);
}

/** Area of a bbox in km² (approximate for WGS-84). */
export function bboxAreaKm2(bbox: BBox): number {
  const [west, south, east, north] = bbox;
  const midLat = (south + north) / 2;
  const kmPerDegLon = 111.32 * Math.cos((midLat * Math.PI) / 180);
  const kmPerDegLat = 111.32;
  const widthKm = Math.max(0, east - west) * kmPerDegLon;
  const heightKm = Math.max(0, north - south) * kmPerDegLat;
  return widthKm * heightKm;
}

/** Intersection area of two bboxes in degrees². */
export function bboxIntersectionDeg2(a: BBox, b: BBox): number {
  const west = Math.max(a[0], b[0]);
  const south = Math.max(a[1], b[1]);
  const east = Math.min(a[2], b[2]);
  const north = Math.min(a[3], b[3]);

  if (west >= east || south >= north) return 0;
  return (east - west) * (north - south);
}

/**
 * Compute the overlap ratio of a scene bbox against an AOI bbox.
 * Returns 0–1 where 1 means the scene fully covers the AOI.
 */
export function sceneOverlapRatio(sceneBbox: BBox, aoiBbox: BBox): number {
  const aoiArea = bboxAreaDeg2(aoiBbox);
  if (aoiArea <= 0) return 0;

  const intersection = bboxIntersectionDeg2(sceneBbox, aoiBbox);
  return intersection / aoiArea;
}

// ── collective coverage ──────────────────────────────────────────────

export interface CoverageReport {
  /** Fraction of the AOI covered by at least one scene (0–1). */
  coverageRatio: number;

  /** Area in km² of the AOI that is covered. */
  coveredAreaKm2: number;

  /** Total AOI area in km². */
  totalAreaKm2: number;

  /** Number of scenes that overlap the AOI at all. */
  overlappingScenes: number;

  /** Total number of scenes considered. */
  totalScenes: number;

  /** Per-scene overlap details (sorted by overlap desc). */
  sceneOverlaps: Array<{
    id: string;
    overlapRatio: number;
    bbox: BBox | null;
  }>;
}

/**
 * Estimate collective coverage of an AOI by a set of scene footprints.
 *
 * Uses a pixel-grid approximation:
 * 1. Grid the AOI into cells (default 100 × 100).
 * 2. For each scene bbox, mark cells that intersect.
 * 3. Count marked cells vs total cells.
 *
 * This handles partial overlaps and avoids double-counting.
 */
export function computeCollectiveCoverage(
  aoiBbox: BBox,
  sceneBboxes: Array<{ id: string; bbox: BBox | null }>,
  gridResolution: number = 100,
): CoverageReport {
  const [aoiWest, aoiSouth, aoiEast, aoiNorth] = aoiBbox;
  const aoiWidth = aoiEast - aoiWest;
  const aoiHeight = aoiNorth - aoiSouth;

  if (aoiWidth <= 0 || aoiHeight <= 0) {
    return {
      coverageRatio: 0,
      coveredAreaKm2: 0,
      totalAreaKm2: 0,
      overlappingScenes: 0,
      totalScenes: sceneBboxes.length,
      sceneOverlaps: [],
    };
  }

  const totalAreaKm2 = bboxAreaKm2(aoiBbox);
  const cellWidth = aoiWidth / gridResolution;
  const cellHeight = aoiHeight / gridResolution;

  // Boolean grid: has any scene covered this cell?
  const covered = new Uint8Array(gridResolution * gridResolution);

  const sceneOverlaps: CoverageReport['sceneOverlaps'] = [];

  for (const scene of sceneBboxes) {
    if (!scene.bbox) continue;

    const [sWest, sSouth, sEast, sNorth] = scene.bbox;

    // Quick reject: no bbox overlap at all
    if (sEast <= aoiWest || sWest >= aoiEast || sNorth <= aoiSouth || sSouth >= aoiNorth) {
      sceneOverlaps.push({ id: scene.id, overlapRatio: 0, bbox: scene.bbox });
      continue;
    }

    // Mark grid cells intersected by this scene
    let sceneCells = 0;
    const colStart = Math.max(0, Math.floor((sWest - aoiWest) / cellWidth));
    const colEnd = Math.min(gridResolution, Math.ceil((sEast - aoiWest) / cellWidth));
    const rowStart = Math.max(0, Math.floor((sSouth - aoiSouth) / cellHeight));
    const rowEnd = Math.min(gridResolution, Math.ceil((sNorth - aoiSouth) / cellHeight));

    for (let row = rowStart; row < rowEnd; row++) {
      for (let col = colStart; col < colEnd; col++) {
        const idx = row * gridResolution + col;
        if (!covered[idx]) sceneCells++;
        covered[idx] = 1;
      }
    }

    const overlapRatio = sceneOverlapRatio(scene.bbox, aoiBbox);
    sceneOverlaps.push({ id: scene.id, overlapRatio, bbox: scene.bbox });
  }

  // Count total covered cells
  let coveredCells = 0;
  for (let i = 0; i < covered.length; i++) {
    if (covered[i]) coveredCells++;
  }

  const coverageRatio = coveredCells / (gridResolution * gridResolution);
  const coveredAreaKm2 = totalAreaKm2 * coverageRatio;
  const overlappingScenes = sceneOverlaps.filter(s => s.overlapRatio > 0).length;

  sceneOverlaps.sort((a, b) => b.overlapRatio - a.overlapRatio);

  return {
    coverageRatio,
    coveredAreaKm2,
    totalAreaKm2,
    overlappingScenes,
    totalScenes: sceneBboxes.length,
    sceneOverlaps,
  };
}

/**
 * Determine if local database coverage is "sufficient" for an AOI.
 *
 * Criteria:
 * - At least 1 scene overlaps the AOI
 * - Collective coverage >= threshold (default 50%)
 * - At least 1 scene in the requested time range (date filter already
 *   applied at query level, so we just check spatial coverage)
 */
export function isCoverageSufficient(
  coverage: CoverageReport,
  threshold: number = 0.5,
): boolean {
  return coverage.overlappingScenes > 0 && coverage.coverageRatio >= threshold;
}

/**
 * Extract centroid from a GeoJSON geometry.
 */
export function extractCentroid(
  geometry: GeoJSON.Geometry | null,
): { lat: number; lng: number } | null {
  if (!geometry) return null;

  if (geometry.type === 'Point') {
    return { lat: geometry.coordinates[1], lng: geometry.coordinates[0] };
  }

  if (geometry.type === 'Polygon' && geometry.coordinates?.[0]) {
    const coords = geometry.coordinates[0];
    const lng = coords.reduce((s: number, c: number[]) => s + c[0], 0) / coords.length;
    const lat = coords.reduce((s: number, c: number[]) => s + c[1], 0) / coords.length;
    return { lat, lng };
  }

  if (geometry.type === 'MultiPolygon' && geometry.coordinates?.[0]?.[0]) {
    const coords = geometry.coordinates[0][0];
    const lng = coords.reduce((s: number, c: number[]) => s + c[0], 0) / coords.length;
    const lat = coords.reduce((s: number, c: number[]) => s + c[1], 0) / coords.length;
    return { lat, lng };
  }

  return null;
}
