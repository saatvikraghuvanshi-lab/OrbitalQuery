"""
Tests for Temporal Compositor — analysis grid, cloud masking, compositing.
"""
import numpy as np
import pytest
from app.services.compositor import (
    AnalysisGrid,
    compute_analysis_grid,
    create_cloud_mask,
    compute_temporal_composite,
    CompositeResult,
)


class TestAnalysisGrid:
    """Tests for analysis grid computation."""

    def test_grid_dimensions(self):
        """Grid should have correct pixel dimensions."""
        grid = compute_analysis_grid(
            bbox=[78.0, 17.0, 79.0, 18.0],
            target_resolution=0.001,  # ~100m
            max_pixels=512,
        )
        assert grid.width > 0
        assert grid.height > 0
        assert grid.width <= 512
        assert grid.height <= 512

    def test_grid_bounds_preserved(self):
        """Grid bounds should match input bbox."""
        bbox = [78.0, 17.0, 79.0, 18.0]
        grid = compute_analysis_grid(bbox=bbox)
        assert grid.bbox == bbox

    def test_grid_max_pixels_constraint(self):
        """Grid should respect max_pixels constraint."""
        grid = compute_analysis_grid(
            bbox=[70.0, 10.0, 80.0, 20.0],  # Large AOI
            target_resolution=0.0001,
            max_pixels=256,
        )
        assert grid.width <= 256
        assert grid.height <= 256

    def test_grid_shape_tuple(self):
        """Grid shape should be (height, width)."""
        grid = compute_analysis_grid(
            bbox=[78.0, 17.0, 79.0, 18.0],
            target_resolution=0.001,
        )
        assert grid.shape == (grid.height, grid.width)


class TestCloudMasking:
    """Tests for cloud/quality masking."""

    def test_scl_valid_classes(self):
        """Vegetation and bare soil should be valid."""
        scl = np.array([[4, 5, 6, 7, 11],   # All valid
                        [3, 8, 9, 10, 0]])   # All invalid (cloud/shadow/other)

        mask = create_cloud_mask(scl)
        assert mask[0, 0] == True   # Class 4 (vegetation)
        assert mask[0, 1] == True   # Class 5 (bare soil)
        assert mask[0, 2] == True   # Class 6 (water)
        assert mask[1, 0] == False  # Class 3 (cloud shadow)
        assert mask[1, 1] == False  # Class 8 (cloud medium)

    def test_all_clear(self):
        """All valid SCL classes should produce all-True mask."""
        scl = np.full((10, 10), 4, dtype=np.uint8)  # All vegetation
        mask = create_cloud_mask(scl)
        assert mask.all()

    def test_all_cloudy(self):
        """All cloud SCL classes should produce all-False mask."""
        scl = np.full((10, 10), 9, dtype=np.uint8)  # All cloud high probability
        mask = create_cloud_mask(scl)
        assert not mask.any()


class TestTemporalComposite:
    """Tests for temporal compositing algorithms."""

    def test_median_composite(self):
        """Median composite should handle NaN correctly."""
        # (T=3, H=2, W=2)
        stack = np.array([
            [[1.0, 2.0], [3.0, 4.0]],
            [[1.5, 2.5], [3.5, 4.5]],
            [[np.nan, 2.0], [3.0, np.nan]],
        ])

        composite, stats = compute_temporal_composite(stack, method="median")

        assert composite.shape == (2, 2)
        assert composite[0, 0] == pytest.approx(1.25, abs=0.01)  # median(1.0, 1.5) = 1.25
        assert stats["method"] == "median"
        assert stats["n_observations"] == 3

    def test_first_quartile(self):
        """First quartile should favor lower values (cloud-free)."""
        stack = np.array([
            [[0.3, 0.4], [0.5, 0.6]],
            [[0.7, 0.8], [0.9, 1.0]],
        ])

        composite, stats = compute_temporal_composite(stack, method="first_quartile")

        # First quartile should pick the lower values
        assert composite[0, 0] <= 0.5

    def test_with_cloud_mask(self):
        """Cloud mask should exclude cloudy observations."""
        stack = np.array([
            [[0.1, 0.2], [0.3, 0.4]],   # Cloudy (low values)
            [[0.8, 0.9], [0.7, 0.6]],   # Clear (high values)
        ])
        valid_mask = np.array([
            [[False, False], [False, False]],  # All cloudy
            [[True, True], [True, True]],       # All clear
        ])

        composite, stats = compute_temporal_composite(stack, valid_mask, method="median")

        # Should mostly reflect clear observations
        assert composite[0, 0] == pytest.approx(0.8, abs=0.1)

    def test_single_observation(self):
        """Single observation should pass through."""
        stack = np.array([[[0.5, 0.6], [0.7, 0.8]]])

        composite, stats = compute_temporal_composite(stack, method="median")

        assert composite.shape == (2, 2)
        assert composite[0, 0] == pytest.approx(0.5)

    def test_all_nan_observation(self):
        """All-NaN input should produce zero composite."""
        stack = np.array([[[np.nan, np.nan], [np.nan, np.nan]]])

        composite, stats = compute_temporal_composite(stack, method="median")

        assert composite.shape == (2, 2)
        assert np.all(composite == 0)

    def test_multiband_composite(self):
        """Should handle (T, C, H, W) shaped input."""
        stack = np.array([
            [[[0.1, 0.2], [0.3, 0.4]], [[0.5, 0.6], [0.7, 0.8]]],
            [[[0.2, 0.3], [0.4, 0.5]], [[0.6, 0.7], [0.8, 0.9]]],
        ])  # (T=2, C=2, H=2, W=2)

        composite, stats = compute_temporal_composite(stack, method="median")

        assert composite.shape == (2, 2, 2)  # (C, H, W)
        assert stats["n_observations"] == 2

    def test_composite_stats(self):
        """Stats should include observation counts."""
        stack = np.array([
            [[1.0, 2.0], [3.0, 4.0]],
            [[5.0, 6.0], [7.0, 8.0]],
            [[9.0, 10.0], [11.0, 12.0]],
        ])

        composite, stats = compute_temporal_composite(stack, method="median")

        assert "mean_valid_observations" in stats
        assert "min_valid_observations" in stats
        assert "n_fully_masked_pixels" in stats


class TestCompositeResult:
    """Tests for CompositeResult dataclass."""

    def test_result_fields(self):
        """Result should contain all required fields."""
        grid = compute_analysis_grid(bbox=[78.0, 17.0, 79.0, 18.0], target_resolution=0.001)
        composite = np.zeros((1, grid.height, grid.width))

        result = CompositeResult(
            composite=composite,
            grid=grid,
            method="median",
            n_scenes_used=3,
            scene_ids=["s1", "s2", "s3"],
            cloud_pct=5.2,
            composite_stats={"method": "median", "n_observations": 3},
        )

        assert result.n_scenes_used == 3
        assert len(result.scene_ids) == 3
        assert result.cloud_pct == 5.2
