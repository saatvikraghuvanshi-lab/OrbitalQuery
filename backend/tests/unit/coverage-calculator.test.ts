/**
 * Unit tests for the Coverage Calculator.
 *
 * Tests:
 *  1. bbox overlap and area calculations
 *  2. Scene overlap ratio
 *  3. Collective coverage with multiple scenes
 *  4. Small AOI with local database results
 *  5. Large AOI requiring multiple scene footprints
 *  6. No coverage scenario
 *  7. Full coverage scenario
 *  8. Partial coverage (multiple scenes collectively covering an AOI)
 */

import {
  bboxAreaDeg2,
  bboxAreaKm2,
  bboxIntersectionDeg2,
  sceneOverlapRatio,
  computeCollectiveCoverage,
  isCoverageSufficient,
  extractCentroid,
} from '../../src/services/coverage-calculator';
import type { BBox } from '../../src/services/eo-types';

describe('bboxAreaDeg2', () => {
  it('computes area of a 1x1 degree bbox', () => {
    const area = bboxAreaDeg2([0, 0, 1, 1]);
    expect(area).toBeCloseTo(1.0, 6);
  });

  it('computes area of a non-square bbox', () => {
    const area = bboxAreaDeg2([75, 26, 76, 28]);
    expect(area).toBeCloseTo(2.0, 6);
  });

  it('returns 0 for inverted bbox', () => {
    const area = bboxAreaDeg2([1, 1, 0, 0]);
    expect(area).toBe(0);
  });

  it('returns 0 for zero-area bbox', () => {
    const area = bboxAreaDeg2([5, 5, 5, 5]);
    expect(area).toBe(0);
  });
});

describe('bboxAreaKm2', () => {
  it('computes approximate area in km²', () => {
    const area = bboxAreaKm2([75.7, 26.8, 75.9, 27.0]);
    // ~22km × 22km ≈ 484 km²
    expect(area).toBeGreaterThan(400);
    expect(area).toBeLessThan(600);
  });

  it('returns 0 for zero-area bbox', () => {
    expect(bboxAreaKm2([5, 5, 5, 5])).toBe(0);
  });
});

describe('bboxIntersectionDeg2', () => {
  it('computes intersection of overlapping bboxes', () => {
    const a: BBox = [0, 0, 2, 2];
    const b: BBox = [1, 1, 3, 3];
    const area = bboxIntersectionDeg2(a, b);
    expect(area).toBeCloseTo(1.0, 6); // 1×1 overlap
  });

  it('returns 0 for non-overlapping bboxes', () => {
    const a: BBox = [0, 0, 1, 1];
    const b: BBox = [2, 2, 3, 3];
    expect(bboxIntersectionDeg2(a, b)).toBe(0);
  });

  it('returns full area when one bbox contains the other', () => {
    const a: BBox = [0, 0, 3, 3];
    const b: BBox = [1, 1, 2, 2];
    expect(bboxIntersectionDeg2(a, b)).toBeCloseTo(1.0, 6);
  });
});

describe('sceneOverlapRatio', () => {
  it('returns 1.0 when scene fully covers AOI', () => {
    const aoi: BBox = [75.7, 26.8, 75.9, 27.0];
    const scene: BBox = [75.0, 26.0, 76.0, 28.0];
    expect(sceneOverlapRatio(scene, aoi)).toBeCloseTo(1.0, 2);
  });

  it('returns 0.5 when scene covers half the AOI', () => {
    const aoi: BBox = [0, 0, 10, 10];
    const scene: BBox = [0, 0, 5, 10]; // covers left half
    expect(sceneOverlapRatio(scene, aoi)).toBeCloseTo(0.5, 2);
  });

  it('returns 0 for non-overlapping', () => {
    const aoi: BBox = [0, 0, 1, 1];
    const scene: BBox = [5, 5, 6, 6];
    expect(sceneOverlapRatio(scene, aoi)).toBe(0);
  });

  it('returns partial ratio for corner overlap', () => {
    const aoi: BBox = [0, 0, 4, 4];
    const scene: BBox = [2, 2, 6, 6]; // covers bottom-right quarter
    const ratio = sceneOverlapRatio(scene, aoi);
    expect(ratio).toBeCloseTo(0.25, 2);
  });
});

describe('computeCollectiveCoverage', () => {
  it('returns 0 coverage for empty scene list', () => {
    const report = computeCollectiveCoverage([0, 0, 10, 10], []);
    expect(report.coverageRatio).toBe(0);
    expect(report.overlappingScenes).toBe(0);
    expect(report.totalScenes).toBe(0);
  });

  it('returns full coverage when one scene covers the entire AOI', () => {
    const aoi: BBox = [0, 0, 10, 10];
    const scenes = [{ id: 'scene-1', bbox: [-1, -1, 11, 11] as BBox }];
    const report = computeCollectiveCoverage(aoi, scenes);
    expect(report.coverageRatio).toBeCloseTo(1.0, 1);
    expect(report.overlappingScenes).toBe(1);
  });

  it('handles multiple scenes collectively covering a large AOI', () => {
    // Two scenes covering left and right halves of a 10×10 AOI
    const aoi: BBox = [0, 0, 10, 10];
    const scenes = [
      { id: 'left', bbox: [-1, 0, 5, 10] as BBox },
      { id: 'right', bbox: [5, 0, 11, 10] as BBox },
    ];
    const report = computeCollectiveCoverage(aoi, scenes, 20);
    // Should be close to 1.0 coverage
    expect(report.coverageRatio).toBeGreaterThan(0.9);
    expect(report.overlappingScenes).toBe(2);
  });

  it('handles partial coverage', () => {
    // One scene covering only the left third
    const aoi: BBox = [0, 0, 10, 10];
    const scenes = [{ id: 'partial', bbox: [0, 0, 3.33, 10] as BBox }];
    const report = computeCollectiveCoverage(aoi, scenes, 20);
    expect(report.coverageRatio).toBeGreaterThan(0.25);
    expect(report.coverageRatio).toBeLessThan(0.45);
    expect(report.overlappingScenes).toBe(1);
  });

  it('handles scenes with null bbox', () => {
    const aoi: BBox = [0, 0, 10, 10];
    const scenes = [
      { id: 'valid', bbox: [0, 0, 10, 10] as BBox },
      { id: 'no-bbox', bbox: null },
    ];
    const report = computeCollectiveCoverage(aoi, scenes);
    expect(report.overlappingScenes).toBe(1);
  });

  it('handles inverted AOI gracefully', () => {
    const aoi: BBox = [10, 10, 0, 0];
    const scenes = [{ id: 's1', bbox: [0, 0, 10, 10] as BBox }];
    const report = computeCollectiveCoverage(aoi, scenes);
    expect(report.coverageRatio).toBe(0);
  });

  it('calculates correct covered area in km²', () => {
    // Jaipur area: ~25km × 25km = ~625 km²
    const aoi: BBox = [75.7, 26.8, 75.95, 27.05];
    const totalAreaKm2 = bboxAreaKm2(aoi);

    const scenes = [{ id: 'full', bbox: [75.0, 26.0, 76.5, 28.0] as BBox }];
    const report = computeCollectiveCoverage(aoi, scenes);
    expect(report.coverageRatio).toBeCloseTo(1.0, 1);
    expect(report.totalAreaKm2).toBeCloseTo(totalAreaKm2, 0);
  });
});

describe('isCoverageSufficient', () => {
  it('returns true when coverage meets threshold', () => {
    const report = {
      coverageRatio: 0.6,
      overlappingScenes: 3,
    } as any;
    expect(isCoverageSufficient(report, 0.5)).toBe(true);
  });

  it('returns false when coverage is below threshold', () => {
    const report = {
      coverageRatio: 0.3,
      overlappingScenes: 2,
    } as any;
    expect(isCoverageSufficient(report, 0.5)).toBe(false);
  });

  it('returns false when no scenes overlap', () => {
    const report = {
      coverageRatio: 0,
      overlappingScenes: 0,
    } as any;
    expect(isCoverageSufficient(report, 0.5)).toBe(false);
  });

  it('returns true when coverage is exactly at threshold', () => {
    const report = {
      coverageRatio: 0.5,
      overlappingScenes: 1,
    } as any;
    expect(isCoverageSufficient(report, 0.5)).toBe(true);
  });
});

describe('extractCentroid', () => {
  it('extracts centroid from Point geometry', () => {
    const geo = { type: 'Point' as const, coordinates: [75.85, 26.9] };
    const c = extractCentroid(geo);
    expect(c).toEqual({ lat: 26.9, lng: 75.85 });
  });

  it('extracts centroid from Polygon geometry', () => {
    const geo = {
      type: 'Polygon' as const,
      coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
    };
    const c = extractCentroid(geo);
    // Centroid is average of all vertices (including closing vertex)
    expect(c).not.toBeNull();
    expect(c!.lat).toBeGreaterThanOrEqual(0);
    expect(c!.lat).toBeLessThanOrEqual(10);
    expect(c!.lng).toBeGreaterThanOrEqual(0);
    expect(c!.lng).toBeLessThanOrEqual(10);
  });

  it('returns null for null geometry', () => {
    expect(extractCentroid(null)).toBeNull();
  });
});

describe('Edge cases', () => {
  it('collective coverage with scenes that just touch AOI boundary', () => {
    const aoi: BBox = [0, 0, 10, 10];
    const scenes = [{ id: 'touching', bbox: [10, 0, 20, 10] as BBox }];
    const report = computeCollectiveCoverage(aoi, scenes);
    expect(report.overlappingScenes).toBe(0); // touching but not overlapping
  });

  it('collective coverage with many small scenes', () => {
    const aoi: BBox = [0, 0, 10, 10];
    // 4 scenes each covering a quadrant
    const scenes = [
      { id: 'nw', bbox: [0, 5, 5, 10] as BBox },
      { id: 'ne', bbox: [5, 5, 10, 10] as BBox },
      { id: 'sw', bbox: [0, 0, 5, 5] as BBox },
      { id: 'se', bbox: [5, 0, 10, 5] as BBox },
    ];
    const report = computeCollectiveCoverage(aoi, scenes, 20);
    expect(report.coverageRatio).toBeCloseTo(1.0, 1);
    expect(report.overlappingScenes).toBe(4);
  });
});
