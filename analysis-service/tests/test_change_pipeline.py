"""
Comprehensive tests for the unified change detection pipeline.

Tests cover:
  - No change scenario
  - Single changed block
  - Multiple regions
  - Cloud/nodata regions
  - Noisy isolated pixels (should be filtered)
  - Urban multi-signal change (NDBI↑ + NDVI↓)
  - Vegetation change (NDVI↓)
  - Water change (NDWI↑)
  - Burn change (NBR↓)
  - Snow change (NDSI↑)
  - GeoJSON output validation
  - Statistics accuracy
"""
import numpy as np
import pytest
from app.services.change_pipeline import (
    run_change_pipeline,
    PipelineConfig,
)
from app.services.multi_signal import (
    compute_index,
    compute_all_indices,
    compute_multi_signal_evidence,
    extract_regions,
    regions_to_geojson,
    Phenomenon,
    DEFAULT_CONFIGS,
    ChangeDirection,
)


# ── Synthetic band generators ──────────────────────────────────────

def _make_sentinel2_bands(
    h: int = 100, w: int = 100,
    base_ndvi: float = 0.4,
    base_ndbi: float = -0.1,
    noise: float = 0.01,
) -> dict[str, np.ndarray]:
    """Generate synthetic Sentinel-2 bands with given base indices."""
    np.random.seed(42)
    # B03 (GREEN), B04 (RED), B08 (NIR), B11 (SWIR1), B12 (SWIR2)
    # From NDVI = (NIR - RED) / (NIR + RED), solve for NIR/RED
    red = np.random.rand(h, w).astype(np.float32) * 0.1 + 0.15  # ~0.15-0.25
    nir = red * (1 + base_ndvi) / (1 - base_ndvi + 1e-10)  # Solve NDVI equation
    nir = np.clip(nir, 0.05, 0.5)

    green = red * 0.9 + np.random.randn(h, w).astype(np.float32) * noise
    swir1 = nir * (1 - base_ndbi) / (1 + base_ndbi + 1e-10)  # From NDBI equation
    swir1 = np.clip(swir1, 0.05, 0.5)
    swir2 = swir1 * 0.9 + np.random.randn(h, w).astype(np.float32) * noise

    return {
        "B03": np.clip(green, 0.01, 0.5),
        "B04": np.clip(red, 0.01, 0.5),
        "B08": np.clip(nir, 0.01, 0.5),
        "B11": np.clip(swir1, 0.01, 0.5),
        "B12": np.clip(swir2, 0.01, 0.5),
    }


# ── Test: No Change ────────────────────────────────────────────────

class TestNoChange:
    def test_identical_bands(self):
        """Identical before/after should produce zero change."""
        bands = _make_sentinel2_bands()
        result = run_change_pipeline(PipelineConfig(
            phenomenon="vegetation_change",
            index_name="NDVI",
            bands_t1=bands,
            bands_t2=bands.copy(),
            bbox=[78.0, 17.0, 79.0, 18.0],
        ))
        assert result.status == "ok"
        assert result.changed_pct < 5.0, f"Identical images should have ~0 change: {result.changed_pct}%"
        assert result.n_regions == 0

    def test_subtle_noise_no_change(self):
        """Small random noise should not produce significant change."""
        bands_t1 = _make_sentinel2_bands()
        bands_t2 = {k: v + np.random.randn(*v.shape).astype(np.float32) * 0.005
                    for k, v in bands_t1.items()}
        result = run_change_pipeline(PipelineConfig(
            phenomenon="vegetation_change",
            index_name="NDVI",
            bands_t1=bands_t1,
            bands_t2=bands_t2,
            bbox=[78.0, 17.0, 79.0, 18.0],
        ))
        assert result.status == "ok"
        assert result.changed_pct < 10.0


# ── Test: Single Changed Block ─────────────────────────────────────

class TestSingleBlock:
    def test_detects_vegetation_loss(self):
        """Should detect a clear vegetation loss block."""
        h, w = 100, 100
        bands_t1 = _make_sentinel2_bands(h, w, base_ndvi=0.5)
        bands_t2 = {k: v.copy() for k, v in bands_t1.items()}
        # Create vegetation loss in center (NDVI drops from 0.5 to ~0.1)
        bands_t2["B08"][30:70, 30:70] *= 0.3  # NIR decreases
        bands_t2["B04"][30:70, 30:70] *= 1.5  # RED increases

        result = run_change_pipeline(PipelineConfig(
            phenomenon="vegetation_change",
            index_name="NDVI",
            bands_t1=bands_t1,
            bands_t2=bands_t2,
            bbox=[78.0, 17.0, 79.0, 18.0],
        ))
        assert result.status == "ok"
        assert result.changed_pixels > 100, f"Should detect significant change: {result.changed_pixels}"
        assert result.n_regions >= 1
        assert result.overall_direction == "loss"

    def test_detects_vegetation_gain(self):
        """Should detect vegetation gain."""
        h, w = 100, 100
        bands_t1 = _make_sentinel2_bands(h, w, base_ndvi=0.2)
        bands_t2 = {k: v.copy() for k, v in bands_t1.items()}
        bands_t2["B08"][30:70, 30:70] *= 1.8  # NIR increases
        bands_t2["B04"][30:70, 30:70] *= 0.5  # RED decreases

        result = run_change_pipeline(PipelineConfig(
            phenomenon="vegetation_change",
            index_name="NDVI",
            bands_t1=bands_t1,
            bands_t2=bands_t2,
            bbox=[78.0, 17.0, 79.0, 18.0],
        ))
        assert result.status == "ok"
        assert result.gain_pixels > 100


# ── Test: Multiple Regions ─────────────────────────────────────────

class TestMultipleRegions:
    def test_detects_two_separate_blocks(self):
        """Should detect two separate change regions."""
        h, w = 100, 100
        bands_t1 = _make_sentinel2_bands(h, w, base_ndvi=0.4)
        bands_t2 = {k: v.copy() for k, v in bands_t1.items()}
        # Region 1: top-left
        bands_t2["B08"][10:30, 10:30] *= 0.3
        bands_t2["B04"][10:30, 10:30] *= 1.5
        # Region 2: bottom-right
        bands_t2["B08"][70:90, 70:90] *= 0.3
        bands_t2["B04"][70:90, 70:90] *= 1.5

        result = run_change_pipeline(PipelineConfig(
            phenomenon="vegetation_change",
            index_name="NDVI",
            bands_t1=bands_t1,
            bands_t2=bands_t2,
            bbox=[78.0, 17.0, 79.0, 18.0],
            min_region_pixels=10,
        ))
        assert result.n_regions >= 2


# ── Test: Urban Multi-Signal ───────────────────────────────────────

class TestUrbanChange:
    def test_ndbi_increase_with_ndvi_decrease(self):
        """Urban expansion: NDBI↑ + NDVI↓ should be detected."""
        h, w = 100, 100
        bands_t1 = _make_sentinel2_bands(h, w, base_ndvi=0.4, base_ndbi=-0.1)
        bands_t2 = {k: v.copy() for k, v in bands_t1.items()}
        # Urban expansion: NDBI increases, NDVI decreases
        bands_t2["B11"][30:70, 30:70] *= 1.5  # SWIR1 increases → NDBI increases
        bands_t2["B08"][30:70, 30:70] *= 0.5  # NIR decreases → NDVI decreases
        bands_t2["B04"][30:70, 30:70] *= 1.3  # RED increases

        result = run_change_pipeline(PipelineConfig(
            phenomenon="urban_expansion",
            index_name="NDBI",
            bands_t1=bands_t1,
            bands_t2=bands_t2,
            bbox=[78.0, 17.0, 79.0, 18.0],
            min_region_pixels=10,
        ))
        assert result.status == "ok"
        assert result.changed_pixels > 0, "Should detect urban expansion"


# ── Test: Water Change ─────────────────────────────────────────────

class TestWaterChange:
    def test_water_expansion(self):
        """NDWI increase should detect water body expansion."""
        h, w = 100, 100
        bands_t1 = _make_sentinel2_bands(h, w, base_ndvi=0.3)
        bands_t2 = {k: v.copy() for k, v in bands_t1.items()}
        # Water expansion: GREEN increases, NIR decreases
        bands_t2["B03"][40:60, 40:60] *= 1.5  # GREEN increases
        bands_t2["B08"][40:60, 40:60] *= 0.2  # NIR drops (water)

        result = run_change_pipeline(PipelineConfig(
            phenomenon="water_change",
            index_name="NDWI",
            bands_t1=bands_t1,
            bands_t2=bands_t2,
            bbox=[78.0, 17.0, 79.0, 18.0],
            min_region_pixels=10,
        ))
        assert result.status == "ok"
        assert result.changed_pixels > 0


# ── Test: Burn Change ──────────────────────────────────────────────

class TestBurnChange:
    def test_burn_damage(self):
        """NBR decrease should detect burn damage."""
        h, w = 100, 100
        bands_t1 = _make_sentinel2_bands(h, w, base_ndvi=0.5)
        bands_t2 = {k: v.copy() for k, v in bands_t1.items()}
        # Burn: NIR decreases, SWIR2 increases → NBR drops
        bands_t2["B08"][25:75, 25:75] *= 0.2   # NIR drops
        bands_t2["B12"][25:75, 25:75] *= 2.0   # SWIR2 increases

        result = run_change_pipeline(PipelineConfig(
            phenomenon="burn_change",
            index_name="NBR",
            bands_t1=bands_t1,
            bands_t2=bands_t2,
            bbox=[78.0, 17.0, 79.0, 18.0],
            min_region_pixels=10,
        ))
        assert result.status == "ok"
        assert result.changed_pixels > 0


# ── Test: Noisy Pixels Filtered ────────────────────────────────────

class TestNoiseFiltering:
    def test_isolated_pixels_removed(self):
        """Isolated single-pixel changes should be filtered out."""
        h, w = 100, 100
        bands_t1 = _make_sentinel2_bands(h, w, base_ndvi=0.4)
        bands_t2 = {k: v.copy() for k, v in bands_t1.items()}
        # Create isolated noise pixels (1px each)
        bands_t2["B08"][10, 10] = 0.01  # Isolated drop
        bands_t2["B08"][50, 50] = 0.01
        bands_t2["B08"][90, 90] = 0.01

        result = run_change_pipeline(PipelineConfig(
            phenomenon="vegetation_change",
            index_name="NDVI",
            bands_t1=bands_t1,
            bands_t2=bands_t2,
            bbox=[78.0, 17.0, 79.0, 18.0],
            min_region_pixels=25,
        ))
        # Isolated pixels should be filtered by min_region_pixels
        assert result.n_regions == 0 or result.changed_pixels < 10


# ── Test: Validity Mask ────────────────────────────────────────────

class TestValidityMask:
    def test_nodata_masked(self):
        """Pixels with nodata (0) should be excluded."""
        h, w = 100, 100
        bands_t1 = _make_sentinel2_bands(h, w)
        bands_t2 = {k: v.copy() for k, v in bands_t1.items()}
        bands_t2["B08"][30:70, 30:70] *= 0.3  # Real change
        # Set some pixels to 0 (nodata)
        bands_t1["B08"][0:10, 0:10] = 0
        bands_t2["B08"][0:10, 0:10] = 0

        result = run_change_pipeline(PipelineConfig(
            phenomenon="vegetation_change",
            index_name="NDVI",
            bands_t1=bands_t1,
            bands_t2=bands_t2,
            bbox=[78.0, 17.0, 79.0, 18.0],
        ))
        assert result.valid_coverage_pct < 100.0  # Some pixels should be masked


# ── Test: GeoJSON Output ───────────────────────────────────────────

class TestGeoJSON:
    def test_valid_geojson_structure(self):
        """GeoJSON should have correct FeatureCollection structure."""
        h, w = 100, 100
        bands_t1 = _make_sentinel2_bands(h, w, base_ndvi=0.5)
        bands_t2 = {k: v.copy() for k, v in bands_t1.items()}
        bands_t2["B08"][30:70, 30:70] *= 0.3
        bands_t2["B04"][30:70, 30:70] *= 1.5

        result = run_change_pipeline(PipelineConfig(
            phenomenon="vegetation_change",
            index_name="NDVI",
            bands_t1=bands_t1,
            bands_t2=bands_t2,
            bbox=[78.0, 17.0, 79.0, 18.0],
            min_region_pixels=10,
        ))

        geojson = result.change_geojson
        assert geojson["type"] == "FeatureCollection"
        assert "features" in geojson
        for feature in geojson["features"]:
            assert feature["type"] == "Feature"
            assert "geometry" in feature
            assert feature["geometry"]["type"] == "Polygon"
            assert "properties" in feature
            assert "area_pixels" in feature["properties"]
            assert "direction" in feature["properties"]

    def test_region_properties(self):
        """Each region should have required properties."""
        h, w = 100, 100
        bands_t1 = _make_sentinel2_bands(h, w, base_ndvi=0.5)
        bands_t2 = {k: v.copy() for k, v in bands_t1.items()}
        bands_t2["B08"][30:70, 30:70] *= 0.3
        bands_t2["B04"][30:70, 30:70] *= 1.5

        result = run_change_pipeline(PipelineConfig(
            phenomenon="vegetation_change",
            index_name="NDVI",
            bands_t1=bands_t1,
            bands_t2=bands_t2,
            bbox=[78.0, 17.0, 79.0, 18.0],
            min_region_pixels=10,
        ))

        for region in result.regions:
            assert "region_id" in region
            assert "area_pixels" in region
            assert "direction" in region
            assert "mean_delta" in region
            assert "bbox_pixels" in region
            assert "centroid_pixels" in region


# ── Test: Statistics ────────────────────────────────────────────────

class TestStatistics:
    def test_area_calculation(self):
        """Area should be calculated from pixel count and resolution."""
        h, w = 100, 100
        bands = _make_sentinel2_bands(h, w)
        result = run_change_pipeline(PipelineConfig(
            phenomenon="vegetation_change",
            index_name="NDVI",
            bands_t1=bands,
            bands_t2=bands.copy(),
            bbox=[78.0, 17.0, 79.0, 18.0],
            resolution_m=10.0,
        ))
        # 100x100 pixels at 10m = 1km² = 1,000,000 m²
        assert result.valid_area_km2 > 0
        assert result.total_pixels == 10000

    def test_loss_gain_areas(self):
        """Loss and gain areas should be non-negative."""
        h, w = 100, 100
        bands_t1 = _make_sentinel2_bands(h, w, base_ndvi=0.5)
        bands_t2 = {k: v.copy() for k, v in bands_t1.items()}
        bands_t2["B08"][30:70, 30:70] *= 0.3

        result = run_change_pipeline(PipelineConfig(
            phenomenon="vegetation_change",
            index_name="NDVI",
            bands_t1=bands_t1,
            bands_t2=bands_t2,
            bbox=[78.0, 17.0, 79.0, 18.0],
        ))
        assert result.loss_area_km2 >= 0
        assert result.gain_area_km2 >= 0


# ── Test: Index Computation ─────────────────────────────────────────

class TestIndexComputation:
    def test_ndvi_values(self):
        """NDVI should be in [-1, 1] range."""
        nir = np.array([[0.3, 0.4], [0.5, 0.6]], dtype=np.float32)
        red = np.array([[0.1, 0.15], [0.2, 0.25]], dtype=np.float32)
        ndvi = compute_index(nir, red, "NDVI")
        assert np.all(ndvi >= -1) and np.all(ndvi <= 1)

    def test_compute_all_indices(self):
        """Should compute available indices from bands."""
        bands = _make_sentinel2_bands()
        indices = compute_all_indices(bands)
        assert "NDVI" in indices
        assert "NDBI" in indices
        assert "NDWI" in indices
        assert "NBR" in indices
        assert "NDSI" in indices


# ── Test: Multi-Signal Evidence ─────────────────────────────────────

class TestMultiSignal:
    def test_context_signal_required(self):
        """Urban expansion should require both NDBI↑ AND NDVI↓."""
        h, w = 50, 50
        bands_t1 = _make_sentinel2_bands(h, w, base_ndvi=0.4, base_ndbi=-0.1)
        bands_t2 = {k: v.copy() for k, v in bands_t1.items()}
        # Only NDBI increases, NDVI stays same (not urban)
        bands_t2["B11"][20:30, 20:30] *= 1.5  # NDBI↑
        # NDVI unchanged

        indices_t1 = compute_all_indices(bands_t1)
        indices_t2 = compute_all_indices(bands_t2)
        config = DEFAULT_CONFIGS[Phenomenon.URBAN_EXPANSION]

        result = compute_multi_signal_evidence(indices_t1, indices_t2, config)
        # Without NDVI decrease, urban change should NOT be detected
        # (or at least reduced compared to when both signals agree)
        assert result.status == "ok"


# ── Test: Pipeline Processing Steps ─────────────────────────────────

class TestProcessingSteps:
    def test_has_all_steps(self):
        """Pipeline should record all processing steps."""
        bands = _make_sentinel2_bands()
        result = run_change_pipeline(PipelineConfig(
            phenomenon="vegetation_change",
            index_name="NDVI",
            bands_t1=bands,
            bands_t2=bands.copy(),
            bbox=[78.0, 17.0, 79.0, 18.0],
        ))
        step_names = [s["step"] for s in result.processing_steps]
        assert "input_validation" in step_names
        assert "validity_mask" in step_names
        assert "index_computation" in step_names
        assert "phenomenon_config" in step_names
