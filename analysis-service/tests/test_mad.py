"""
Tests for IR-MAD (Iteratively Reweighted Multivariate Alteration Detection).
"""
import numpy as np
import pytest
from app.services.mad import (
    run_ir_mad,
    _compute_mad_variates,
    _chi2_test,
)


class TestMADVariates:
    """Tests for MAD variate computation."""

    def test_identical_images(self):
        """MAD variates of identical images should be near zero."""
        h, w = 50, 50
        bands = np.random.rand(4, h, w).astype(np.float64) * 0.3

        mad, stds, proj = _compute_mad_variates(bands, bands)

        assert mad.shape == (4, h * w)
        assert stds.shape == (4,)
        # MAD variates should be near zero for identical images
        mean_abs = np.mean(np.abs(mad))
        assert mean_abs < 0.01, f"MAD of identical images should be ~0, got {mean_abs}"

    def test_different_images(self):
        """MAD variates should be non-zero for different images."""
        np.random.seed(42)
        h, w = 50, 50
        t1 = np.random.rand(4, h, w).astype(np.float64) * 0.3
        t2 = t1.copy()
        # Create spatially varying change (not uniform shift)
        t2[:, 20:30, 20:30] += 0.5  # Large change in a region

        mad, stds, proj = _compute_mad_variates(t1, t2)

        assert mad.shape == (4, h * w)
        # MAD should detect the spatial variation
        mad_2d = mad.reshape(4, h, w)
        region_mag = np.sqrt(np.sum(mad_2d[:, 20:30, 20:30] ** 2, axis=0))
        assert region_mag.max() > 0.01, f"MAD should detect regional change, got max={region_mag.max()}"

    def test_single_band(self):
        """Should work with single band."""
        h, w = 30, 30
        t1 = np.random.rand(1, h, w).astype(np.float64) * 0.3
        t2 = t1 + 0.2

        mad, stds, proj = _compute_mad_variates(t1, t2)

        assert mad.shape == (1, h * w)
        assert stds.shape == (1,)

    def test_with_weights(self):
        """Should handle weights for iterative reweighting."""
        h, w = 30, 30
        t1 = np.random.rand(2, h, w).astype(np.float64) * 0.3
        t2 = t1 + 0.1
        weights = np.ones(h * w, dtype=np.float64)

        mad, stds, proj = _compute_mad_variates(t1, t2, weights)

        assert mad.shape == (2, h * w)

    def test_nan_handling(self):
        """Should handle NaN values gracefully."""
        h, w = 30, 30
        t1 = np.random.rand(3, h, w).astype(np.float64)
        t2 = t1 + 0.1
        t1[0, 5:10, 5:10] = np.nan

        mad, stds, proj = _compute_mad_variates(t1, t2)

        assert mad.shape == (3, h * w)
        # NaN pixels should produce zero MAD
        nan_pixels = np.arange(h * w).reshape(h, w)[5:10, 5:10].flatten()
        assert np.allclose(mad[:, nan_pixels], 0, atol=1e-10)


class TestChi2Test:
    """Tests for chi-squared test."""

    def test_zero_mad_near_zero_pvalue(self):
        """Zero MAD variates should have high p-value (not significant)."""
        n_bands, n_pixels = 4, 100
        mad_variates = np.random.randn(n_bands, n_pixels) * 0.001  # Very small
        mad_stds = np.ones(n_bands)

        chi2, p_value = _chi2_test(mad_variates, mad_stds)

        assert chi2.shape == (n_pixels,)
        assert p_value.shape == (n_pixels,)
        # Most p-values should be high (not significant)
        assert np.mean(p_value > 0.5) > 0.8, "Small MAD should have high p-values"

    def test_large_mad_low_pvalue(self):
        """Large MAD variates should have low p-value (significant)."""
        n_bands, n_pixels = 4, 100
        mad_variates = np.random.randn(n_bands, n_pixels) * 10  # Very large
        mad_stds = np.ones(n_bands)

        chi2, p_value = _chi2_test(mad_variates, mad_stds)

        # Most p-values should be very low (significant change)
        assert np.mean(p_value < 0.01) > 0.9, "Large MAD should have low p-values"


class TestIRMAD:
    """Tests for the main IR-MAD algorithm."""

    def test_detects_change(self):
        """IR-MAD should detect a clear change."""
        np.random.seed(42)
        h, w = 100, 100
        t1 = np.random.rand(4, h, w).astype(np.float32) * 0.3 + 0.3
        t2 = t1.copy()
        # Create a clear change in the center
        t2[:, 40:60, 40:60] = t1[:, 40:60, 40:60] + 0.4

        result = run_ir_mad(t1, t2, significance_level=0.01)

        assert result.status == "ok"
        assert result.changed_pixels > 0, "Should detect the change"
        assert result.changed_pct > 0
        assert result.change_mask.shape == (h, w)
        assert result.chi2.shape == (h, w)
        assert result.p_value.shape == (h, w)

    def test_no_change(self):
        """IR-MAD should detect minimal change in identical images."""
        np.random.seed(42)
        h, w = 100, 100
        t1 = np.random.rand(4, h, w).astype(np.float32) * 0.3 + 0.3

        result = run_ir_mad(t1, t1.copy(), significance_level=0.01)

        assert result.status == "ok"
        # Identical images should have very low change
        assert result.changed_pct < 15, f"Identical images should have low change: {result.changed_pct}%"

    def test_convergence(self):
        """IR-MAD should converge within max_iterations."""
        np.random.seed(42)
        h, w = 50, 50
        t1 = np.random.rand(3, h, w).astype(np.float32) * 0.3 + 0.3
        t2 = t1 + 0.1

        result = run_ir_mad(t1, t2, max_iterations=10)

        assert result.status == "ok"
        assert result.n_iterations <= 10
        assert isinstance(result.converged, bool)

    def test_significance_level(self):
        """Different significance levels should produce different masks."""
        np.random.seed(42)
        h, w = 80, 80
        t1 = np.random.rand(4, h, w).astype(np.float32) * 0.3 + 0.3
        t2 = t1 + 0.05  # Subtle change

        result_strict = run_ir_mad(t1, t2, significance_level=0.001)
        result_permissive = run_ir_mad(t1, t2, significance_level=0.10)

        # More permissive significance should detect more change
        assert result_permissive.changed_pixels >= result_strict.changed_pixels, \
            f"Permissive ({result_permissive.changed_pixels}) should >= strict ({result_strict.changed_pixels})"

    def test_mad_variates_3d(self):
        """MAD variates should be reshaped to (N_bands, H, W)."""
        h, w = 30, 30
        t1 = np.random.rand(3, h, w).astype(np.float32)
        t2 = t1 + 0.1

        result = run_ir_mad(t1, t2)

        assert result.mad_variates.shape == (3, h, w)

    def test_nan_handling(self):
        """Should handle NaN values gracefully."""
        h, w = 50, 50
        t1 = np.random.rand(3, h, w).astype(np.float32)
        t2 = t1 + 0.1
        t1[0, 10:15, 10:15] = np.nan

        result = run_ir_mad(t1, t2)
        assert result.status == "ok"
        assert result.changed_pixels >= 0

    def test_processing_steps(self):
        """Result should include processing steps."""
        h, w = 30, 30
        t1 = np.random.rand(3, h, w).astype(np.float32)
        t2 = t1 + 0.1

        result = run_ir_mad(t1, t2, max_iterations=3)

        assert len(result.processing_steps) >= 2
        step_names = [s["step"] for s in result.processing_steps]
        assert "input_validation" in step_names
        assert "initial_mad" in step_names
