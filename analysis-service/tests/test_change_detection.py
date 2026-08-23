"""Tests for the change detection engine with known expected results."""

import numpy as np
import pytest

from app.services.change_detection import (
    apply_threshold,
    compute_difference,
    compute_region_stats,
    find_connected_components,
    remove_small_regions,
    run_change_detection,
    vectorize_regions,
)


# ── Synthetic data generators ───────────────────────────────────────

def make_no_change_arrays(size: int = 50) -> tuple[np.ndarray, np.ndarray]:
    """
    Create two identical arrays — no change expected.

    Both arrays are uniform at 0.5.
    Difference: 0.0 everywhere.
    """
    baseline = np.full((size, size), 0.5, dtype=np.float32)
    comparison = np.full((size, size), 0.5, dtype=np.float32)
    return baseline, comparison


def make_known_change_arrays(size: int = 50) -> tuple[np.ndarray, np.ndarray, int]:
    """
    Create arrays with a known rectangular change region.

    Baseline: uniform 0.5
    Comparison: 0.5 everywhere except a 10×10 block at (20,20)-(29,29) = 0.9

    Expected:
    - Changed pixels: 100 (the 10×10 block)
    - Unchanged: size² - 100
    - Changed %: 100 / (size²)
    """
    baseline = np.full((size, size), 0.5, dtype=np.float32)
    comparison = np.full((size, size), 0.5, dtype=np.float32)

    # Create known change region: 10×10 block at (20,20)-(29,29)
    comparison[20:30, 20:30] = 0.9

    expected_changed = 10 * 10  # 100 pixels

    return baseline, comparison, expected_changed


def make_multiple_changes_arrays(size: int = 50) -> tuple[np.ndarray, np.ndarray, int]:
    """
    Create arrays with two separate change regions.

    Region 1: 10×10 block at (5,5) — large
    Region 2: 3×3 block at (40,40) — small (should be removed if min_size > 5)
    """
    baseline = np.full((size, size), 0.5, dtype=np.float32)
    comparison = np.full((size, size), 0.5, dtype=np.float32)

    # Region 1: large (100 pixels)
    comparison[5:15, 5:15] = 0.9

    # Region 2: small (9 pixels)
    comparison[40:43, 40:43] = 0.9

    return baseline, comparison


def make_nodata_arrays(size: int = 50) -> tuple[np.ndarray, np.ndarray]:
    """
    Create arrays with NaN nodata values.

    Baseline: uniform 0.5, with a NaN region at (0,0)-(4,4)
    Comparison: uniform 0.8, with a NaN region at (0,0)-(4,4)
    """
    baseline = np.full((size, size), 0.5, dtype=np.float32)
    comparison = np.full((size, size), 0.8, dtype=np.float32)

    baseline[0:5, 0:5] = np.nan
    comparison[0:5, 0:5] = np.nan

    return baseline, comparison


# ── Core algorithm tests ────────────────────────────────────────────

class TestDifference:
    """Test difference computation."""

    def test_identical_arrays(self):
        a = np.full((10, 10), 0.5, dtype=np.float32)
        b = np.full((10, 10), 0.5, dtype=np.float32)
        diff = compute_difference(a, b)
        assert np.all(diff == 0.0)

    def test_known_difference(self):
        a = np.full((10, 10), 0.3, dtype=np.float32)
        b = np.full((10, 10), 0.7, dtype=np.float32)
        diff = compute_difference(a, b)
        assert np.all(np.abs(diff - 0.4) < 1e-6)

    def test_nan_propagation(self):
        a = np.full((10, 10), 0.5, dtype=np.float32)
        b = np.full((10, 10), 0.8, dtype=np.float32)
        a[0, 0] = np.nan
        diff = compute_difference(a, b)
        assert np.isnan(diff[0, 0])
        assert not np.isnan(diff[1, 1])


class TestThreshold:
    """Test threshold application."""

    def test_absolute_threshold(self):
        diff = np.array([[-0.5, -0.1, 0.0, 0.1, 0.5]], dtype=np.float32)
        mask = apply_threshold(diff, 0.2, "absolute")
        expected = np.array([[True, False, False, False, True]])
        np.testing.assert_array_equal(mask, expected)

    def test_increase_threshold(self):
        diff = np.array([[-0.5, -0.1, 0.0, 0.3, 0.5]], dtype=np.float32)
        mask = apply_threshold(diff, 0.2, "increase")
        expected = np.array([[False, False, False, True, True]])
        np.testing.assert_array_equal(mask, expected)

    def test_decrease_threshold(self):
        diff = np.array([[-0.5, -0.3, 0.0, 0.1, 0.5]], dtype=np.float32)
        mask = apply_threshold(diff, 0.2, "decrease")
        expected = np.array([[True, True, False, False, False]])
        np.testing.assert_array_equal(mask, expected)

    def test_nan_excluded(self):
        diff = np.array([[np.nan, 0.5]], dtype=np.float32)
        mask = apply_threshold(diff, 0.2, "absolute")
        assert mask[0, 0] == False  # NaN excluded
        assert mask[0, 1] == True


class TestSmallRegionRemoval:
    """Test small region filtering."""

    def test_removes_small_region(self):
        mask = np.zeros((20, 20), dtype=bool)
        # Large region: 25 pixels
        mask[0:5, 0:5] = True
        # Small region: 4 pixels
        mask[15:17, 15:17] = True

        cleaned = remove_small_regions(mask, min_size=5)
        assert np.sum(cleaned) == 25  # Only large region remains
        assert cleaned[0, 0] == True
        assert cleaned[15, 15] == False

    def test_keeps_all_large_regions(self):
        mask = np.zeros((20, 20), dtype=bool)
        mask[0:5, 0:5] = True
        mask[10:15, 10:15] = True

        cleaned = remove_small_regions(mask, min_size=5)
        assert np.sum(cleaned) == 50

    def test_min_size_1(self):
        mask = np.zeros((10, 10), dtype=bool)
        mask[0, 0] = True
        cleaned = remove_small_regions(mask, min_size=1)
        assert np.sum(cleaned) == 1


# ── Full pipeline tests with known results ──────────────────────────

class TestChangeDetectionPipeline:
    """Test full pipeline with known expected results."""

    def test_no_change(self):
        """Identical arrays should produce zero change."""
        baseline, comparison = make_no_change_arrays(50)
        result = run_change_detection(
            baseline=baseline,
            comparison=comparison,
            index_name="NDVI",
            aoi_bbox=[75.7, 26.8, 75.9, 27.0],
            threshold=0.2,
            min_region_size=5,
        )
        assert result.status == "ok"
        assert result.changed_pixels == 0
        assert result.changed_pct == 0.0
        assert result.num_regions == 0

    def test_known_100_pixel_change(self):
        """A 10×10 block should produce exactly 100 changed pixels."""
        baseline, comparison, expected = make_known_change_arrays(50)
        result = run_change_detection(
            baseline=baseline,
            comparison=comparison,
            index_name="NDVI",
            aoi_bbox=[75.7, 26.8, 75.9, 27.0],
            threshold=0.2,
            min_region_size=1,
            resolution_meters=10.0,
        )
        assert result.status == "ok"
        assert result.changed_pixels == expected
        assert result.num_regions == 1

        # Area calculation
        expected_area = expected * (10.0 ** 2)  # 100 * 100 = 10000 m²
        assert abs(result.changed_area_sq_meters - expected_area) < 1.0

    def test_changed_percentage(self):
        """Verify percentage calculation."""
        baseline, comparison, expected = make_known_change_arrays(50)
        result = run_change_detection(
            baseline=baseline,
            comparison=comparison,
            index_name="NDVI",
            aoi_bbox=[75.7, 26.8, 75.9, 27.0],
            threshold=0.2,
            min_region_size=1,
        )
        expected_pct = (expected / (50 * 50)) * 100
        assert abs(result.changed_pct - expected_pct) < 0.01

    def test_small_region_filtered(self):
        """Small regions should be removed when min_size > region."""
        baseline, comparison = make_multiple_changes_arrays(50)
        result = run_change_detection(
            baseline=baseline,
            comparison=comparison,
            index_name="NDVI",
            aoi_bbox=[75.7, 26.8, 75.9, 27.0],
            threshold=0.2,
            min_region_size=10,  # 3×3 = 9 pixels < 10, should be removed
        )
        assert result.status == "ok"
        # Only the large region (100 pixels) should remain
        assert result.changed_pixels == 100
        assert result.num_regions == 1

    def test_nothing_filtered(self):
        """All regions kept when min_size=1."""
        baseline, comparison = make_multiple_changes_arrays(50)
        result = run_change_detection(
            baseline=baseline,
            comparison=comparison,
            index_name="NDVI",
            aoi_bbox=[75.7, 26.8, 75.9, 27.0],
            threshold=0.2,
            min_region_size=1,
        )
        assert result.status == "ok"
        # Both regions: 100 + 9 = 109 pixels
        assert result.changed_pixels == 109
        assert result.num_regions == 2

    def test_nodata_handled(self):
        """NaN pixels should not produce false changes."""
        baseline, comparison = make_nodata_arrays(50)
        result = run_change_detection(
            baseline=baseline,
            comparison=comparison,
            index_name="NDVI",
            aoi_bbox=[75.7, 26.8, 75.9, 27.0],
            threshold=0.2,
            min_region_size=1,
        )
        # The 0.3 difference everywhere except NaN region
        # Changed = 50*50 - 25 (NaN region) = 2475 pixels
        assert result.changed_pixels == 2475

    def test_largest_region(self):
        """Largest region should be identified."""
        baseline, comparison, _ = make_known_change_arrays(50)
        result = run_change_detection(
            baseline=baseline,
            comparison=comparison,
            index_name="NDVI",
            aoi_bbox=[75.7, 26.8, 75.9, 27.0],
            threshold=0.2,
            min_region_size=1,
        )
        assert result.largest_region is not None
        assert result.largest_region["area_pixels"] == 100

    def test_reproducibility_metadata(self):
        """Result must include reproducibility metadata."""
        baseline, comparison, _ = make_known_change_arrays(50)
        result = run_change_detection(
            baseline=baseline,
            comparison=comparison,
            index_name="NDVI",
            aoi_bbox=[75.7, 26.8, 75.9, 27.0],
            threshold=0.2,
            min_region_size=5,
            baseline_date="2024-01-01",
            comparison_date="2024-06-01",
        )
        repro = result.reproducibility
        assert repro["algorithm"] == "difference_threshold"
        assert repro["deterministic"] is True
        assert repro["inputs"]["baseline_date"] == "2024-01-01"
        assert repro["inputs"]["index_name"] == "NDVI"
        assert repro["parameters"]["threshold"] == 0.2
        assert "No ML" in repro["note"]

    def test_processing_steps_documented(self):
        """Every processing step must be documented."""
        baseline, comparison, _ = make_known_change_arrays(50)
        result = run_change_detection(
            baseline=baseline,
            comparison=comparison,
            index_name="NDVI",
            aoi_bbox=[75.7, 26.8, 75.9, 27.0],
            threshold=0.2,
            min_region_size=5,
        )
        assert len(result.processing_steps) >= 6
        step_names = [s["step"] for s in result.processing_steps]
        assert "validate_shapes" in step_names
        assert "compute_difference" in step_names
        assert "apply_threshold" in step_names
        assert "remove_small_regions" in step_names
        assert "connected_components" in step_names
        assert "region_statistics" in step_names

    def test_no_ai_language(self):
        """Results must NOT contain 'AI detected'."""
        baseline, comparison, _ = make_known_change_arrays(50)
        result = run_change_detection(
            baseline=baseline,
            comparison=comparison,
            index_name="NDVI",
            aoi_bbox=[75.7, 26.8, 75.9, 27.0],
            threshold=0.2,
            min_region_size=5,
        )
        # Check no AI language in processing steps
        for step in result.processing_steps:
            assert "AI" not in step["detail"]
            assert "AI" not in step["step"]
        # Check reproducibility note
        assert "ML" not in result.reproducibility["note"] or "No ML" in result.reproducibility["note"]


# ── Shape mismatch test ─────────────────────────────────────────────

class TestShapeMismatch:
    """Test that shape mismatches are rejected."""

    def test_shape_mismatch_raises(self):
        baseline = np.zeros((10, 10), dtype=np.float32)
        comparison = np.zeros((20, 20), dtype=np.float32)
        with pytest.raises(ValueError, match="Shape mismatch"):
            run_change_detection(
                baseline=baseline,
                comparison=comparison,
                index_name="NDVI",
                aoi_bbox=[75.7, 26.8, 75.9, 27.0],
                threshold=0.2,
                min_region_size=5,
            )
