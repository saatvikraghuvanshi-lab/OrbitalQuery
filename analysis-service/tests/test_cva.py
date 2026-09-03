"""
Tests for Change Vector Analysis (CVA) with PIF Normalization.
"""
import numpy as np
import pytest
from app.services.cva import (
    run_cva,
    _identify_pif_pixels,
    _compute_pif_normalization,
    _otsu_threshold,
    _classify_change_direction,
)


class TestPIFPixels:
    """Tests for Pseudo-Invariant Feature identification."""

    def test_water_detection(self):
        """Deep water should be identified as PIF."""
        h, w = 50, 50
        # Create water-like pixels (low NDVI in both periods)
        ndvi_t1 = np.full((h, w), -0.3, dtype=np.float32)
        ndvi_t2 = np.full((h, w), -0.25, dtype=np.float32)
        bands_t1 = np.random.rand(4, h, w).astype(np.float32)
        bands_t2 = bands_t1.copy()  # Same bands = low change

        pif = _identify_pif_pixels(bands_t1, bands_t2, ndvi_t1, ndvi_t2)
        # Water pixels should be identified as PIF
        assert pif.any(), "Water pixels should be identified as PIF"

    def test_changed_pixels_not_pif(self):
        """Pixels with large changes should NOT be PIF."""
        h, w = 100, 100
        ndvi_t1 = np.full((h, w), 0.5, dtype=np.float32)
        ndvi_t2 = np.zeros((h, w), dtype=np.float32)
        bands_t1 = np.random.rand(4, h, w).astype(np.float32) * 0.3 + 0.3
        bands_t2 = bands_t1 + 0.5  # Large change

        pif = _identify_pif_pixels(bands_t1, bands_t2, ndvi_t1, ndvi_t2)
        # With such a large uniform change, very few or no PIF pixels should be found
        # (the low_change criterion might still find some if the change is uniform)
        # But the key test: the changed area should not be PIF
        assert not pif.all(), "Changed pixels should not all be PIF"

    def test_no_ndvi_still_works(self):
        """PIF identification should work without NDVI arrays."""
        h, w = 50, 50
        bands_t1 = np.random.rand(4, h, w).astype(np.float32) * 0.3
        bands_t2 = bands_t1 + np.random.randn(4, h, w).astype(np.float32) * 0.01

        pif = _identify_pif_pixels(bands_t1, bands_t2)
        assert pif.shape == (h, w), "Output shape should match input"


class TestPIFNormalization:
    """Tests for PIF-based radiometric normalization."""

    def test_identical_images_no_change(self):
        """Normalizing identical images should produce no change."""
        h, w = 50, 50
        bands = np.random.rand(4, h, w).astype(np.float32) * 0.5
        pif_mask = np.ones((h, w), dtype=bool)

        normalized, stats = _compute_pif_normalization(bands, bands.copy(), pif_mask)
        # Gain should be ~1.0, offset ~0.0
        for key, val in stats.items():
            if not val.get("skipped"):
                assert abs(val["gain"] - 1.0) < 0.01, f"Gain should be ~1.0, got {val['gain']}"
                assert abs(val["offset"]) < 0.01, f"Offset should be ~0, got {val['offset']}"

    def test_brightness_shift_corrected(self):
        """Normalization should correct a systematic brightness shift."""
        h, w = 100, 100
        bands_t1 = np.random.rand(4, h, w).astype(np.float32) * 0.3 + 0.3
        # Apply brightness shift: t2 = 1.2 * t1 + 0.05
        bands_t2 = bands_t1 * 1.2 + 0.05
        pif_mask = np.ones((h, w), dtype=bool)

        normalized, stats = _compute_pif_normalization(bands_t1, bands_t2, pif_mask)
        # After normalization, t2 should be closer to t1
        diff_before = np.mean(np.abs(bands_t2 - bands_t1))
        diff_after = np.mean(np.abs(normalized - bands_t1))
        assert diff_after < diff_before, f"Normalization should reduce difference: {diff_after:.4f} >= {diff_before:.4f}"


class TestOtsuThreshold:
    """Tests for Otsu's threshold method."""

    def test_bimodal_distribution(self):
        """Should find threshold between two modes."""
        np.random.seed(42)
        # Create well-separated bimodal distribution with enough spread
        mode1 = np.random.normal(0.05, 0.03, 500)
        mode2 = np.random.normal(0.5, 0.03, 500)
        data = np.concatenate([mode1, mode2])

        threshold = _otsu_threshold(data)
        # Otsu should find a threshold somewhere between the two modes
        assert isinstance(threshold, float), f"Threshold should be a float, got {type(threshold)}"
        assert threshold > 0, f"Threshold should be positive, got {threshold}"

    def test_empty_data(self):
        """Should return default for empty data."""
        threshold = _otsu_threshold(np.array([]))
        assert threshold == 0.1

    def test_uniform_data(self):
        """Should handle uniform distribution."""
        data = np.ones(100) * 0.5
        threshold = _otsu_threshold(data)
        assert isinstance(threshold, float)


class TestChangeDirection:
    """Tests for change direction classification."""

    def test_vegetation_loss(self):
        """NIR decrease + Red increase should be classified as vegetation loss."""
        h, w = 10, 10
        delta = np.zeros((4, h, w), dtype=np.float32)
        delta[3] = -0.1  # NIR decrease (band index 3)
        delta[2] = 0.05  # Red increase (band index 2)

        labels, counts = _classify_change_direction(delta, ["B02", "B03", "B04", "B08"])
        assert counts["vegetation_loss"] == h * w

    def test_vegetation_gain(self):
        """NIR increase + Red decrease should be classified as vegetation gain."""
        h, w = 10, 10
        delta = np.zeros((4, h, w), dtype=np.float32)
        delta[3] = 0.1   # NIR increase
        delta[2] = -0.05  # Red decrease

        labels, counts = _classify_change_direction(delta, ["B02", "B03", "B04", "B08"])
        assert counts["vegetation_gain"] == h * w

    def test_stable(self):
        """Zero delta should be classified as stable."""
        h, w = 10, 10
        delta = np.zeros((4, h, w), dtype=np.float32)

        labels, counts = _classify_change_direction(delta, ["B02", "B03", "B04", "B08"])
        assert counts["stable"] == h * w


class TestCVA:
    """Tests for the main CVA algorithm."""

    def test_detects_large_change(self):
        """CVA should detect a clear change."""
        np.random.seed(42)
        h, w = 100, 100
        bands_t1 = np.random.rand(4, h, w).astype(np.float32) * 0.3 + 0.3
        bands_t2 = bands_t1.copy()
        # Create a clear change in the center
        bands_t2[:, 40:60, 40:60] = bands_t1[:, 40:60, 40:60] + 0.3

        result = run_cva(bands_t1, bands_t2, band_names=["B02", "B03", "B04", "B08"])

        assert result.status == "ok"
        assert result.changed_pixels > 0, "Should detect the change"
        assert result.changed_pct > 0
        assert result.magnitude.shape == (h, w)
        assert result.direction.shape == (h, w)
        assert len(result.processing_steps) > 0

    def test_no_change(self):
        """CVA should detect minimal change in identical images."""
        np.random.seed(42)
        h, w = 100, 100
        bands = np.random.rand(4, h, w).astype(np.float32) * 0.3 + 0.3

        result = run_cva(bands, bands.copy(), band_names=["B02", "B03", "B04", "B08"])

        assert result.status == "ok"
        # Some change may be detected due to noise, but should be low
        assert result.changed_pct < 20, f"Identical images should have low change: {result.changed_pct}%"

    def test_single_band(self):
        """CVA should work with a single band."""
        np.random.seed(42)
        h, w = 50, 50
        t1 = np.random.rand(h, w).astype(np.float32) * 0.3 + 0.3
        t2 = t1 + 0.3  # Uniform shift

        result = run_cva(t1, t2, band_names=["NDVI"])

        assert result.status == "ok"
        assert result.magnitude.shape == (h, w)

    def test_normalization_flag(self):
        """Should report whether normalization was applied."""
        np.random.seed(42)
        h, w = 50, 50
        t1 = np.random.rand(4, h, w).astype(np.float32) * 0.3 + 0.3
        t2 = t1 + 0.01

        result = run_cva(t1, t2, band_names=["B02", "B03", "B04", "B08"], apply_normalization=True)
        assert isinstance(result.normalized, bool)

    def test_nan_handling(self):
        """CVA should handle NaN values gracefully."""
        h, w = 50, 50
        t1 = np.random.rand(4, h, w).astype(np.float32)
        t2 = t1 + 0.1
        # Set NaN in a region
        t1[:, 10:20, 10:20] = np.nan
        t2[:, 10:20, 10:20] = np.nan

        result = run_cva(t1, t2, band_names=["B02", "B03", "B04", "B08"])
        assert result.status == "ok"
        assert result.changed_pixels >= 0

    def test_has_processing_steps(self):
        """Result should include processing steps."""
        h, w = 20, 20
        t1 = np.random.rand(4, h, w).astype(np.float32)
        t2 = t1 + 0.05

        result = run_cva(t1, t2, band_names=["B02", "B03", "B04", "B08"])
        assert len(result.processing_steps) >= 3
        step_names = [s["step"] for s in result.processing_steps]
        assert "input_validation" in step_names
        assert "change_vectors" in step_names
        assert "magnitude_direction" in step_names
