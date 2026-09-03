"""
Tests for Imagery Preparation — cloud masking, seasonal windows, outliers, visual products, NDVI time series.
"""
import numpy as np
import pytest
from app.services.imagery_prep import (
    create_scl_valid_mask,
    detect_outliers,
    compute_seasonal_window,
    select_comparable_periods,
    cloud_aware_composite,
    compute_ndvi_time_series,
    render_true_color,
    render_false_color,
    render_ndvi,
    render_ndwi,
    render_change_mask,
    render_difference,
    CompositeConfig,
    OutlierResult,
)


class TestSCLMasking:
    """Tests for Sentinel-2 SCL cloud masking."""

    def test_vegetation_valid(self):
        """SCL class 4 (vegetation) should be valid."""
        scl = np.full((10, 10), 4, dtype=np.uint8)
        valid, counts = create_scl_valid_mask(scl)
        assert valid.all()
        assert counts["vegetation"] == 100

    def test_cloud_invalid(self):
        """SCL class 9 (cloud high prob) should be invalid."""
        scl = np.full((10, 10), 9, dtype=np.uint8)
        valid, counts = create_scl_valid_mask(scl)
        assert not valid.any()
        assert counts["cloud_high_prob"] == 100

    def test_mixed_classes(self):
        """Should correctly classify mixed SCL scene."""
        scl = np.array([[4, 4, 8, 8],
                        [6, 6, 9, 9]], dtype=np.uint8)
        valid, counts = create_scl_valid_mask(scl)
        assert valid[0, 0] == True   # vegetation
        assert valid[0, 2] == False  # cloud medium
        assert valid[1, 0] == True   # water
        assert valid[1, 2] == False  # cloud high


class TestOutlierDetection:
    """Tests for outlier detection."""

    def test_clear_scene(self):
        """Clear NDVI scene should have few outliers."""
        ndvi = np.random.rand(50, 50).astype(np.float32) * 0.4 + 0.3
        result = detect_outliers(ndvi)
        assert result.outlier_pct < 20

    def test_cloudy_scene(self):
        """Scene with low-NDVI patches should detect outliers."""
        ndvi = np.random.rand(50, 50).astype(np.float32) * 0.4 + 0.3
        ndvi[10:20, 10:20] = -0.2  # Cloud-like
        result = detect_outliers(ndvi)
        assert result.n_outliers > 0

    def test_scl_based_detection(self):
        """Should use SCL when available for detection."""
        ndvi = np.random.rand(10, 10).astype(np.float32) * 0.4 + 0.3
        scl = np.full((10, 10), 4, dtype=np.uint8)
        scl[5:8, 5:8] = 9  # Cloud
        result = detect_outliers(ndvi, scl=scl)
        assert result.n_outliers >= 9  # At least the cloud pixels


class TestSeasonalWindows:
    """Tests for seasonal window computation."""

    def test_north_growing(self):
        """Northern hemisphere growing season should be June-August."""
        start, end = compute_seasonal_window(2023, "north", "growing")
        assert start == "2023-06-01"
        assert end == "2023-08-31"

    def test_south_growing(self):
        """Southern hemisphere growing season should be December-February."""
        start, end = compute_seasonal_window(2023, "south", "growing")
        assert start == "2023-12-01"

    def test_comparable_periods(self):
        """Comparable periods should be same season in different years."""
        p1, p2 = select_comparable_periods(2021, 2025, "north", "growing")
        assert p1[0].startswith("2021")
        assert p2[0].startswith("2025")
        # Same months
        assert p1[0][5:] == p2[0][5:]  # Same month-day


class TestCloudAwareComposite:
    """Tests for cloud-aware temporal compositing."""

    def test_median_composite(self):
        """Median composite should handle clouds correctly."""
        # (T=3, H=10, W=10)
        stack = np.random.rand(3, 10, 10).astype(np.float32) * 0.4 + 0.3
        stack[1, 3:7, 3:7] = 0.01  # Cloud in observation 2

        config = CompositeConfig(method="median", cloud_method="ndvi_threshold")
        composite, stats = cloud_aware_composite(stack, config=config)

        assert composite.shape == (10, 10)
        assert stats["method"] == "median"
        assert stats["n_observations"] == 3

    def test_first_quartile_composite(self):
        """First quartile should favor lower (clearer) values."""
        stack = np.array([
            [[0.3, 0.4], [0.5, 0.6]],
            [[0.7, 0.8], [0.9, 1.0]],
        ])
        config = CompositeConfig(method="first_quartile", cloud_method="ndvi_threshold")
        composite, stats = cloud_aware_composite(stack, config=config)
        # First quartile should pick lower values
        assert composite[0, 0] <= 0.5

    def test_single_observation(self):
        """Single observation should pass through."""
        stack = np.array([[[0.5, 0.6], [0.7, 0.8]]])
        config = CompositeConfig(method="median", cloud_method="ndvi_threshold")
        composite, stats = cloud_aware_composite(stack, config=config)
        assert composite[0, 0] == pytest.approx(0.5)


class TestNDVITimeSeries:
    """Tests for NDVI time series computation."""

    def test_basic_series(self):
        """Should compute NDVI for each timestep."""
        T, H, W = 5, 20, 20
        red_stack = np.random.rand(T, H, W).astype(np.float32) * 0.1 + 0.15
        nir_stack = red_stack * 2  # Higher NIR = positive NDVI
        dates = [f"2023-{m:02d}-01" for m in range(1, 6)]

        series = compute_ndvi_time_series(red_stack, nir_stack, dates)

        assert len(series) == 5
        for point in series:
            assert isinstance(point.ndvi_mean, float)
            assert point.valid_pct > 0

    def test_trending_ndvi(self):
        """Should capture NDVI trend (increasing over time)."""
        T, H, W = 4, 20, 20
        red_stack = np.random.rand(T, H, W).astype(np.float32) * 0.1 + 0.15
        nir_stack = np.zeros_like(red_stack)
        # Increasing NIR over time → increasing NDVI
        for t in range(T):
            nir_stack[t] = red_stack[t] * (1.5 + t * 0.3)

        dates = ["2021-07-01", "2022-07-01", "2023-07-01", "2024-07-01"]
        series = compute_ndvi_time_series(red_stack, nir_stack, dates)

        # NDVI should generally increase
        means = [p.ndvi_mean for p in series]
        assert means[-1] > means[0], "NDVI should trend upward"


class TestVisualProducts:
    """Tests for visual product rendering."""

    def test_true_color_shape(self):
        """True color should produce (H, W, 3) uint8."""
        r = np.random.rand(50, 50).astype(np.float32) * 1000
        g = np.random.rand(50, 50).astype(np.float32) * 1000
        b = np.random.rand(50, 50).astype(np.float32) * 1000
        product = render_true_color(r, g, b)
        assert product.data.shape == (50, 50, 3)
        assert product.data.dtype == np.uint8

    def test_ndvi_colormap(self):
        """NDVI render should have red-green colormap."""
        ndvi = np.array([[-0.1, 0.0], [0.5, 0.8]])
        product = render_ndvi(ndvi)
        assert product.data.shape == (2, 2, 3)
        assert product.value_range is not None
        # Low NDVI should be reddish (high R, low G)
        assert product.data[0, 0, 0] > product.data[0, 0, 1]
        # High NDVI should be greenish (high G, low R)
        assert product.data[1, 1, 1] > product.data[1, 1, 0]

    def test_change_mask_transparency(self):
        """Change mask should be transparent for stable pixels."""
        delta = np.zeros((10, 10), dtype=np.float32)
        change_mask = np.zeros((10, 10), dtype=bool)
        direction = np.zeros((10, 10), dtype=np.uint8)

        product = render_change_mask(delta, change_mask, direction)
        assert product.data.shape == (10, 10, 4)  # RGBA
        # Stable pixels should have very low alpha
        assert product.data[0, 0, 3] < 50

    def test_difference_diverging(self):
        """Difference should use diverging colormap."""
        delta = np.array([[-0.5, 0.0], [0.0, 0.5]])
        product = render_difference(delta)
        assert product.data.shape == (2, 2, 3)
        # Negative should be bluish
        assert product.data[0, 0, 2] > product.data[0, 0, 0]
        # Positive should be reddish
        assert product.data[1, 1, 0] > product.data[1, 1, 2]
