"""Unit tests for the Robust Change Detection pipeline.

Uses small synthetic arrays (20x20) for deterministic testing.

Tests:
  1. No change.
  2. One localized changed block.
  3. Multiple separated regions.
  4. Nodata region.
  5. Cloud/invalid region.
  6. Tiny isolated noise removal.
  7. Phenomenon-specific thresholds.
  8. Multi-signal urban detection.
  9. Alignment of different-shaped arrays.
  10. Valid-pixel area calculations.
"""

import numpy as np
import pytest

from app.services.change_detection import (
    align_rasters,
    apply_threshold,
    build_geojson,
    compute_array_stats,
    compute_difference,
    compute_valid_mask,
    extract_regions,
    generate_change_visualization,
    morphological_cleanup,
    run_change_detection,
    PHENOMENON_CONFIG,
)


# ── Helpers ──────────────────────────────────────────────────────────

def make_uniform_array(shape: tuple[int, int] = (20, 20), value: float = 0.3) -> np.ndarray:
    """Create a uniform array."""
    return np.full(shape, value, dtype=np.float32)


def make_noise(shape: tuple[int, int] = (20, 20), scale: float = 0.02) -> np.ndarray:
    """Create a small random noise array."""
    rng = np.random.default_rng(42)
    return rng.normal(0, scale, shape).astype(np.float32)


def make_block_change(
    baseline: np.ndarray,
    block_slice: tuple[slice, slice],
    delta: float,
) -> np.ndarray:
    """Create a comparison array with a localized change block."""
    comparison = baseline.copy()
    comparison[block_slice] += delta
    return comparison


# ── Tests ────────────────────────────────────────────────────────────

class TestNoChange:
    def test_identical_arrays_produce_no_regions(self):
        arr = make_uniform_array() + make_noise()
        result = run_change_detection(
            baseline=arr,
            comparison=arr.copy(),
            index_name="NDVI",
            aoi_bbox=[75.7, 26.8, 75.9, 27.0],
        )
        assert result.status == "ok"
        assert result.num_regions == 0
        assert result.changed_pixels == 0
        assert result.changed_pct == 0.0

    def test_very_small_difference_produce_no_regions(self):
        baseline = make_uniform_array(value=0.30)
        comparison = baseline + 0.001  # way below threshold
        result = run_change_detection(
            baseline=baseline,
            comparison=comparison,
            index_name="NDVI",
            aoi_bbox=[75.7, 26.8, 75.9, 27.0],
            threshold=0.15,
        )
        assert result.num_regions == 0


class TestSingleChangeBlock:
    def test_one_localized_block_detected(self):
        baseline = make_uniform_array(value=0.30)
        # Create a 8x8 block with significant change
        comparison = make_block_change(
            baseline, (slice(5, 13), slice(5, 13)), delta=-0.25,
        )

        result = run_change_detection(
            baseline=baseline,
            comparison=comparison,
            index_name="NDVI",
            aoi_bbox=[75.7, 26.8, 75.9, 27.0],
            threshold=0.15,
            min_region_size=5,
        )

        assert result.status == "ok"
        assert result.num_regions >= 1
        assert result.changed_pixels > 0
        assert result.changed_pct > 0
        assert result.largest_region is not None
        assert result.largest_region["area_pixels"] >= 25  # 8x8 = 64

    def test_change_direction_is_decrease(self):
        baseline = make_uniform_array(value=0.30)
        comparison = make_block_change(
            baseline, (slice(5, 13), slice(5, 13)), delta=-0.25,
        )

        result = run_change_detection(
            baseline=baseline,
            comparison=comparison,
            index_name="NDVI",
            aoi_bbox=[75.7, 26.8, 75.9, 27.0],
            threshold=0.15,
            min_region_size=5,
            direction="decrease",
        )

        assert result.num_regions >= 1
        assert result.largest_region["direction"] == "decrease"


class TestMultipleRegions:
    def test_two_separated_blocks(self):
        baseline = make_uniform_array(value=0.30)
        comparison = baseline.copy()
        # Two separate change blocks
        comparison[2:6, 2:6] -= 0.25   # top-left block
        comparison[14:18, 14:18] -= 0.25  # bottom-right block

        result = run_change_detection(
            baseline=baseline,
            comparison=comparison,
            index_name="NDVI",
            aoi_bbox=[0, 0, 10, 10],
            threshold=0.15,
            min_region_size=5,
        )

        assert result.num_regions == 2
        # Both blocks should be detected
        areas = [r["area_pixels"] for r in result.regions]
        assert all(a >= 5 for a in areas)


class TestNodataHandling:
    def test_nodata_excluded_from_valid_pixels(self):
        baseline = make_uniform_array(value=0.30)
        comparison = baseline.copy()
        comparison[5:15, 5:15] -= 0.25

        nodata = np.zeros((20, 20), dtype=bool)
        nodata[0:5, 0:5] = True  # mark some pixels as nodata

        result = run_change_detection(
            baseline=baseline,
            comparison=comparison,
            index_name="NDVI",
            aoi_bbox=[0, 0, 10, 10],
            threshold=0.15,
            min_region_size=5,
            nodata_baseline=nodata,
        )

        assert result.nodata_pixels > 0
        assert result.total_pixels < 400  # less than full 20x20

    def test_nodata_not_counted_as_change(self):
        baseline = make_uniform_array(value=0.30)
        comparison = baseline.copy()
        # Set nodata region to very different values
        comparison[0:5, 0:5] = 0.0  # this should NOT be counted as change

        nodata = np.zeros((20, 20), dtype=bool)
        nodata[0:5, 0:5] = True  # but it's nodata

        result = run_change_detection(
            baseline=baseline,
            comparison=comparison,
            index_name="NDVI",
            aoi_bbox=[0, 0, 10, 10],
            threshold=0.15,
            min_region_size=1,
            nodata_baseline=nodata,
        )

        # The nodata region should not be in the change regions
        for region in result.regions:
            min_row, min_col = region["bbox"][0], region["bbox"][1]
            max_row, max_col = region["bbox"][2], region["bbox"][3]
            # Region should not be entirely within the nodata area
            assert not (max_row < 5 and max_col < 5)


class TestCloudMasking:
    def test_cloud_pixels_excluded(self):
        baseline = make_uniform_array(value=0.30)
        comparison = baseline.copy()
        comparison[5:15, 5:15] -= 0.25

        cloud = np.zeros((20, 20), dtype=bool)
        cloud[0:3, 0:3] = True  # small cloud patch

        result = run_change_detection(
            baseline=baseline,
            comparison=comparison,
            index_name="NDVI",
            aoi_bbox=[0, 0, 10, 10],
            threshold=0.15,
            min_region_size=5,
            cloud_baseline=cloud,
        )

        assert result.cloud_masked_pixels > 0


class TestNoiseRemoval:
    def test_isolated_pixels_removed(self):
        baseline = make_uniform_array(value=0.30)
        comparison = baseline.copy()
        # One big block (should survive)
        comparison[5:10, 5:10] -= 0.25
        # Scattered single pixels (should be removed)
        comparison[0, 0] -= 0.25
        comparison[1, 1] -= 0.25
        comparison[18, 18] -= 0.25

        result = run_change_detection(
            baseline=baseline,
            comparison=comparison,
            index_name="NDVI",
            aoi_bbox=[0, 0, 10, 10],
            threshold=0.15,
            min_region_size=10,  # requires 10+ pixel regions
        )

        # The 5x5 = 25 pixel block should survive
        assert result.num_regions >= 1
        # Single pixels should be removed
        for region in result.regions:
            assert region["area_pixels"] >= 10


class TestPhenomenonThresholds:
    def test_urban_expansion_uses_ndbi(self):
        assert PHENOMENON_CONFIG["urban_expansion"]["index"] == "NDBI"
        assert PHENOMENON_CONFIG["urban_expansion"]["multi_signal"] is True

    def test_deforestation_uses_ndvi_decrease(self):
        assert PHENOMENON_CONFIG["deforestation"]["index"] == "NDVI"
        assert PHENOMENON_CONFIG["deforestation"]["direction"] == "decrease"

    def test_flood_uses_ndwi_increase(self):
        assert PHENOMENON_CONFIG["flood_impact"]["index"] == "NDWI"
        assert PHENOMENON_CONFIG["flood_impact"]["direction"] == "increase"

    def test_burn_uses_nbr_decrease(self):
        assert PHENOMENON_CONFIG["burn_severity"]["index"] == "NBR"
        assert PHENOMENON_CONFIG["burn_severity"]["direction"] == "decrease"


class TestMultiSignalUrban:
    def test_dual_signal_detection(self):
        """Urban expansion: NDBI increase + NDVI decrease."""
        ndbi_baseline = make_uniform_array(value=0.0)
        ndbi_comparison = make_block_change(
            ndbi_baseline, (slice(5, 15), slice(5, 15)), delta=+0.20,
        )

        ndvi_baseline = make_uniform_array(value=0.40)
        ndvi_comparison = make_block_change(
            ndvi_baseline, (slice(5, 15), slice(5, 15)), delta=-0.15,
        )

        result = run_change_detection(
            baseline=ndbi_baseline,
            comparison=ndbi_comparison,
            index_name="NDBI",
            aoi_bbox=[0, 0, 10, 10],
            threshold=0.12,
            min_region_size=10,
            direction="increase",
            phenomenon="urban_expansion",
            ndvi_baseline=ndvi_baseline,
            ndvi_comparison=ndvi_comparison,
        )

        assert result.num_regions >= 1
        assert result.parameters["multi_signal"] is True


class TestAlignment:
    def test_different_shapes_aligned(self):
        """Rasters with different shapes should be aligned."""
        baseline = np.full((25, 30), 0.30, dtype=np.float32)
        comparison = np.full((20, 20), 0.30, dtype=np.float32)

        aligned_b, aligned_c, info = align_rasters(baseline, comparison)
        assert aligned_b.shape == aligned_c.shape
        assert aligned_b.shape == (20, 20)
        assert info["aligned"] is True

    def test_same_shape_no_alignment_needed(self):
        baseline = np.full((20, 20), 0.30, dtype=np.float32)
        comparison = np.full((20, 20), 0.30, dtype=np.float32)

        _, _, info = align_rasters(baseline, comparison)
        assert info["aligned"] is False


class TestAreaCalculation:
    def test_valid_pixel_area_used(self):
        """Changed area should be calculated from valid pixels only."""
        baseline = make_uniform_array(value=0.30)
        comparison = baseline.copy()
        comparison[5:10, 5:10] -= 0.25

        nodata = np.zeros((20, 20), dtype=bool)
        nodata[0:5, 0:5] = True  # 25 nodata pixels

        result = run_change_detection(
            baseline=baseline,
            comparison=comparison,
            index_name="NDVI",
            aoi_bbox=[0, 0, 10, 10],
            threshold=0.15,
            min_region_size=5,
            nodata_baseline=nodata,
        )

        # Total valid = 400 - 25 = 375
        assert result.total_pixels == 375
        # Changed area should be based on valid pixels
        assert result.valid_area_sq_meters > 0


class TestGeoJSON:
    def test_geojson_structure(self):
        baseline = make_uniform_array(value=0.30)
        comparison = make_block_change(
            baseline, (slice(5, 13), slice(5, 13)), delta=-0.25,
        )

        result = run_change_detection(
            baseline=baseline,
            comparison=comparison,
            index_name="NDVI",
            aoi_bbox=[75.7, 26.8, 75.9, 27.0],
            threshold=0.15,
            min_region_size=5,
        )

        geojson = result.change_geojson
        assert geojson is not None
        assert geojson["type"] == "FeatureCollection"
        assert len(geojson["features"]) == result.num_regions

        if result.num_regions > 0:
            feature = geojson["features"][0]
            assert feature["type"] == "Feature"
            assert feature["geometry"]["type"] == "Polygon"
            assert len(feature["geometry"]["coordinates"][0]) == 5  # closed polygon


class TestVisualization:
    def test_visualization_generated(self):
        baseline = make_uniform_array(value=0.30)
        comparison = make_block_change(
            baseline, (slice(5, 13), slice(5, 13)), delta=-0.25,
        )

        result = run_change_detection(
            baseline=baseline,
            comparison=comparison,
            index_name="NDVI",
            aoi_bbox=[75.7, 26.8, 75.9, 27.0],
            threshold=0.15,
            min_region_size=5,
        )

        assert result.change_visualization_png is not None
        # Should be a valid hex string
        assert len(result.change_visualization_png) > 0
        # Verify it's valid hex
        bytes.fromhex(result.change_visualization_png)

    def test_no_change_visualization_empty(self):
        arr = make_uniform_array()
        result = run_change_detection(
            baseline=arr,
            comparison=arr.copy(),
            index_name="NDVI",
            aoi_bbox=[75.7, 26.8, 75.9, 27.0],
        )
        assert result.change_visualization_png is not None


class TestDifferenceComputation:
    def test_positive_difference(self):
        baseline = np.array([[0.3, 0.3], [0.3, 0.3]], dtype=np.float32)
        comparison = np.array([[0.5, 0.5], [0.5, 0.5]], dtype=np.float32)
        diff = compute_difference(baseline, comparison)
        np.testing.assert_allclose(diff, 0.2)

    def test_nan_propagation(self):
        baseline = np.array([[0.3, np.nan], [0.3, 0.3]], dtype=np.float32)
        comparison = np.array([[0.5, 0.5], [0.5, 0.5]], dtype=np.float32)
        diff = compute_difference(baseline, comparison)
        assert np.isnan(diff[0, 1])
        assert not np.isnan(diff[0, 0])


class TestThreshold:
    def test_absolute_threshold(self):
        diff = np.array([[-0.2, 0.0, 0.3], [0.05, -0.15, 0.1]], dtype=np.float32)
        mask = apply_threshold(diff, 0.1, "absolute")
        assert mask[0, 0]  # |-0.2| > 0.1
        assert mask[0, 2]  # |0.3| > 0.1
        assert mask[1, 1]  # |-0.15| > 0.1
        assert not mask[0, 1]  # |0.0| < 0.1
        assert not mask[1, 0]  # |0.05| < 0.1

    def test_increase_only(self):
        diff = np.array([[-0.2, 0.0, 0.3], [0.05, -0.15, 0.1]], dtype=np.float32)
        mask = apply_threshold(diff, 0.1, "increase")
        assert mask[0, 2]  # 0.3 > 0.1
        assert not mask[0, 0]  # -0.2 not > 0.1

    def test_decrease_only(self):
        diff = np.array([[-0.2, 0.0, 0.3], [0.05, -0.15, 0.1]], dtype=np.float32)
        mask = apply_threshold(diff, 0.1, "decrease")
        assert mask[0, 0]  # -0.2 < -0.1
        assert mask[1, 1]  # -0.15 < -0.1
        assert not mask[0, 2]  # 0.3 not < -0.1


class TestMorphology:
    def test_opening_removes_noise(self):
        mask = np.zeros((10, 10), dtype=bool)
        mask[5, 5] = True  # isolated pixel
        mask[2:5, 2:5] = True  # 3x3 block

        cleaned, num = morphological_cleanup(mask, min_region_size=2)
        assert not cleaned[5, 5]  # isolated pixel removed
        assert cleaned[3, 3]  # block preserved

    def test_min_region_size_filtering(self):
        mask = np.zeros((20, 20), dtype=bool)
        mask[2:4, 2:4] = True   # 4 pixels
        mask[10:15, 10:15] = True  # 25 pixels

        cleaned, num = morphological_cleanup(mask, min_region_size=5)
        assert not cleaned[2, 2]  # small region removed
        assert cleaned[12, 12]  # large region preserved
        assert num == 1
