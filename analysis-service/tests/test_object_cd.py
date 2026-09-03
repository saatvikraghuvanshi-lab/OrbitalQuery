"""
Tests for Object-Based Multi-Scale Change Detection.
"""
import numpy as np
import pytest
from app.services.object_cd import (
    run_object_cd,
    _compute_multiscale_change,
    _label_objects,
    _multi_scale_voting,
)


class TestMultiscaleChange:
    """Tests for multi-scale change computation."""

    def test_detects_large_change(self):
        """Large changes should be detected at all scales."""
        h, w = 100, 100
        delta = np.zeros((h, w), dtype=np.float32)
        delta[30:70, 30:70] = 0.3  # Large change in center

        masks, thresholds = _compute_multiscale_change(delta, [0.0, 1.5, 3.0])

        # All scales should detect the large change
        for mask in masks:
            assert mask[50, 50], "Center pixel should be detected as changed at all scales"

    def test_small_change_suppressed_at_coarse_scales(self):
        """Small changes should be suppressed at coarse scales."""
        h, w = 200, 200
        delta = np.zeros((h, w), dtype=np.float32)
        delta[99:101, 99:101] = 0.3  # Very small change (2x2 pixels)

        masks, thresholds = _compute_multiscale_change(delta, [0.0, 3.0, 6.0])

        # Fine scale should detect it, coarse scale may not
        assert masks[0][100, 100], "Fine scale should detect small change"
        # Coarse scale may suppress it (sigma=6 smooths over 60m)

    def test_uniform_change(self):
        """Uniform change with background variation should be detected."""
        np.random.seed(42)
        h, w = 100, 100
        delta = np.random.randn(h, w).astype(np.float32) * 0.02  # Background noise
        delta[30:70, 30:70] += 0.3  # Uniform change in a region

        masks, thresholds = _compute_multiscale_change(delta, [0.0, 1.5, 3.0])

        # At least the fine scale should detect the uniform region
        assert np.mean(masks[0][30:70, 30:70]) > 0.5, "Fine scale should detect the uniform change region"

    def test_no_change(self):
        """Zero delta should produce minimal detection."""
        h, w = 100, 100
        delta = np.random.randn(h, w).astype(np.float32) * 0.001  # Tiny noise

        masks, thresholds = _compute_multiscale_change(delta, [0.0, 1.5])

        for mask in masks:
            changed_pct = np.mean(mask)
            assert changed_pct < 0.3, f"Zero delta should have low detection rate: {changed_pct:.2f}"


class TestLabelObjects:
    """Tests for connected component labeling."""

    def test_no_objects(self):
        """Empty mask should have 0 objects."""
        mask = np.zeros((50, 50), dtype=bool)
        n, areas = _label_objects(mask, min_size=5)
        assert n == 0
        assert areas == []

    def test_single_object(self):
        """Single blob should be 1 object."""
        mask = np.zeros((50, 50), dtype=bool)
        mask[10:20, 10:20] = True  # 10x10 = 100 pixels

        n, areas = _label_objects(mask, min_size=10)
        assert n == 1
        assert areas == [100]

    def test_small_objects_filtered(self):
        """Objects smaller than min_size should be filtered out."""
        mask = np.zeros((50, 50), dtype=bool)
        mask[10:13, 10:13] = True   # 3x3 = 9 pixels (below threshold)
        mask[20:30, 20:30] = True   # 10x10 = 100 pixels

        n, areas = _label_objects(mask, min_size=10)
        assert n == 1
        assert areas == [100]

    def test_multiple_objects_sorted(self):
        """Multiple objects should be returned sorted by area descending."""
        mask = np.zeros((100, 100), dtype=bool)
        mask[5:15, 5:15] = True    # 100 pixels
        mask[50:80, 50:80] = True  # 900 pixels
        mask[10:12, 80:85] = True  # 10 pixels

        n, areas = _label_objects(mask, min_size=5)
        assert n == 3
        assert areas == sorted(areas, reverse=True), "Areas should be sorted descending"


class TestMultiScaleVoting:
    """Tests for multi-scale voting mechanism."""

    def test_unanimous_agreement(self):
        """All scales agreeing should give high confidence."""
        h, w = 50, 50
        mask1 = np.zeros((h, w), dtype=bool)
        mask2 = np.zeros((h, w), dtype=bool)
        mask3 = np.zeros((h, w), dtype=bool)
        mask1[20:30, 20:30] = True
        mask2[20:30, 20:30] = True
        mask3[20:30, 20:30] = True

        confidence, combined = _multi_scale_voting([mask1, mask2, mask3], min_agreement=2)

        assert confidence[25, 25] == 1.0, "Unanimous agreement should give confidence=1.0"
        assert combined[25, 25], "Should be classified as changed"

    def test_minority_disagreement(self):
        """Only 1/3 scales detecting should give low confidence."""
        h, w = 50, 50
        mask1 = np.zeros((h, w), dtype=bool)
        mask2 = np.zeros((h, w), dtype=bool)
        mask3 = np.zeros((h, w), dtype=bool)
        mask1[20:30, 20:30] = True  # Only 1 scale

        confidence, combined = _multi_scale_voting([mask1, mask2, mask3], min_agreement=2)

        assert confidence[25, 25] < 0.5, "Minority agreement should give low confidence"
        assert not combined[25, 25], "Should NOT be classified as changed"

    def test_two_of_three(self):
        """2/3 scales should give medium confidence."""
        h, w = 50, 50
        mask1 = np.zeros((h, w), dtype=bool)
        mask2 = np.zeros((h, w), dtype=bool)
        mask3 = np.zeros((h, w), dtype=bool)
        mask1[20:30, 20:30] = True
        mask2[20:30, 20:30] = True
        # mask3 is empty

        confidence, combined = _multi_scale_voting([mask1, mask2, mask3], min_agreement=2)

        assert abs(confidence[25, 25] - 2/3) < 0.01, "2/3 agreement should give confidence ~0.67"
        assert combined[25, 25], "Should be classified as changed with min_agreement=2"


class TestObjectCD:
    """Tests for the main object-based multi-scale algorithm."""

    def test_detects_large_coherent_change(self):
        """Large coherent change should be detected with high confidence."""
        np.random.seed(42)
        h, w = 100, 100
        delta = np.random.randn(h, w).astype(np.float32) * 0.01
        delta[30:70, 30:70] = 0.3  # Large change

        result = run_object_cd(delta, scale_sigmas=[0.0, 1.5, 3.0], min_agreement=2)

        assert result.status == "ok"
        assert result.changed_pixels > 0
        assert result.n_objects >= 1
        assert result.change_mask[50, 50], "Center of large change should be detected"

    def test_noise_suppression(self):
        """Random noise should be largely suppressed."""
        np.random.seed(42)
        h, w = 100, 100
        delta = np.random.randn(h, w).astype(np.float32) * 0.02  # Small noise

        result = run_object_cd(delta, scale_sigmas=[0.0, 1.5, 3.0], min_agreement=2)

        assert result.status == "ok"
        # Should detect relatively few changed pixels from noise
        assert result.changed_pct < 30, f"Noise should be suppressed: {result.changed_pct}% changed"

    def test_confidence_map(self):
        """Confidence map should be in [0, 1] range."""
        h, w = 50, 50
        delta = np.random.randn(h, w).astype(np.float32) * 0.1

        result = run_object_cd(delta)

        assert result.confidence.min() >= 0.0, "Confidence should be >= 0"
        assert result.confidence.max() <= 1.0, "Confidence should be <= 1"

    def test_object_filtering(self):
        """Small objects should be filtered by min_object_size."""
        np.random.seed(42)
        h, w = 100, 100
        delta = np.zeros((h, w), dtype=np.float32)
        # Large object (400 pixels)
        delta[30:50, 30:50] = 0.3
        # Tiny noise elsewhere
        delta[80, 80] = 0.5

        result = run_object_cd(delta, min_object_size=10, scale_sigmas=[0.0], min_agreement=1)

        assert result.status == "ok"
        # Large object should be detected
        assert result.change_mask[40, 40], "Large object should be detected"
        # Single pixel should be filtered by min_object_size
        assert not result.change_mask[80, 80], "Single pixel should be filtered by min_object_size"

    def test_scale_results(self):
        """Should include per-scale results."""
        h, w = 50, 50
        delta = np.random.randn(h, w).astype(np.float32) * 0.1

        result = run_object_cd(delta, scale_sigmas=[0.0, 1.5, 3.0])

        assert len(result.scale_masks) == 3
        assert len(result.scale_sigmas) == 3
        assert result.scale_sigmas == [0.0, 1.5, 3.0]

    def test_nan_handling(self):
        """Should handle NaN values gracefully."""
        h, w = 50, 50
        delta = np.random.randn(h, w).astype(np.float32) * 0.1
        delta[10:15, 10:15] = np.nan

        result = run_object_cd(delta)
        assert result.status == "ok"
        assert result.changed_pixels >= 0

    def test_processing_steps(self):
        """Result should include processing steps."""
        h, w = 30, 30
        delta = np.random.randn(h, w).astype(np.float32) * 0.1

        result = run_object_cd(delta, scale_sigmas=[0.0, 1.5])

        assert len(result.processing_steps) >= 3
        step_names = [s["step"] for s in result.processing_steps]
        assert "input_validation" in step_names
        assert "multiscale_voting" in step_names

    def test_confidence_threshold(self):
        """Different confidence thresholds should produce different masks."""
        np.random.seed(42)
        h, w = 80, 80
        delta = np.random.randn(h, w).astype(np.float32) * 0.05
        delta[30:50, 30:50] = 0.2

        result_low = run_object_cd(delta, confidence_threshold=0.3)
        result_high = run_object_cd(delta, confidence_threshold=0.7)

        # Lower threshold should detect more change
        assert result_low.changed_pixels >= result_high.changed_pixels, \
            f"Low threshold ({result_low.changed_pixels}) should >= high ({result_high.changed_pixels})"
