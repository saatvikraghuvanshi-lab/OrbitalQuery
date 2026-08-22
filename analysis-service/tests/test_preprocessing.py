"""Unit tests for the preprocessing engine."""

from datetime import date

import numpy as np
import pytest

from app.services.preprocessing import (
    ScenePreprocessResult,
    check_comparability,
    check_temporal_window,
    filter_by_cloud_cover,
    normalize_bands,
    preprocess_scene,
)


# ── Test data helpers ──────────────────────────────────────────────

def make_stac_item(
    item_id: str = "test-001",
    collection: str = "sentinel-2-l2a",
    bbox: list = None,
    cloud_cover: float = 10.0,
    bands: list = None,
    proj_epsg: int = 32643,
    gsd: float = 10.0,
) -> dict:
    """Create a minimal STAC item dict for testing."""
    if bbox is None:
        bbox = [75.5, 26.5, 76.0, 27.0]
    if bands is None:
        bands = ["B02", "B03", "B04", "B08"]

    assets = {b: {"href": f"https://example.com/{b}.tif", "type": "image/tiff"} for b in bands}

    return {
        "id": item_id,
        "collection": collection,
        "bbox": bbox,
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[bbox[0], bbox[1]], [bbox[2], bbox[1]],
                             [bbox[2], bbox[3]], [bbox[0], bbox[3]],
                             [bbox[0], bbox[1]]]],
        },
        "properties": {
            "datetime": "2024-03-15T10:00:00Z",
            "eo:cloud_cover": cloud_cover,
            "proj:epsg": proj_epsg,
            "gsd": gsd,
        },
        "assets": assets,
    }


def make_scene_result(
    item_id: str = "scene-001",
    crs: str = "EPSG:32643",
    resolution: float = 10.0,
    bands: list = None,
    coverage: float = 80.0,
    cloud_cover: float = 5.0,
    date_str: str = "2024-03-15T10:00:00Z",
    suitable: bool = True,
) -> ScenePreprocessResult:
    """Create a ScenePreprocessResult for testing."""
    if bands is None:
        bands = ["B04", "B03", "B02"]
    return ScenePreprocessResult(
        item_id=item_id,
        collection="sentinel-2-l2a",
        acquisition_date=date_str,
        cloud_cover=cloud_cover,
        crs=crs,
        resolution_meters=resolution,
        bbox=[75.5, 26.5, 76.0, 27.0],
        spatial_coverage_pct=coverage,
        bands_processed=bands,
        nodata_count=0,
        total_pixels=1000,
        preprocessing_steps=[],
        warnings=[],
        suitable=suitable,
        rejection_reasons=[],
    )


# ── Cloud filter tests ─────────────────────────────────────────────

class TestCloudFilter:
    """Test cloud cover filtering."""

    def test_below_threshold_passes(self):
        ok, reason = filter_by_cloud_cover(10.0, 30.0)
        assert ok is True
        assert "10.0%" in reason

    def test_at_threshold_passes(self):
        ok, _ = filter_by_cloud_cover(30.0, 30.0)
        assert ok is True

    def test_above_threshold_fails(self):
        ok, reason = filter_by_cloud_cover(50.0, 30.0)
        assert ok is False
        assert "50.0%" in reason

    def test_zero_cloud_cover(self):
        ok, _ = filter_by_cloud_cover(0.0, 30.0)
        assert ok is True

    def test_zero_threshold(self):
        ok, reason = filter_by_cloud_cover(0.1, 0.0)
        assert ok is False


# ── Band normalization tests ────────────────────────────────────────

class TestBandNormalization:
    """Test band normalization."""

    def test_valid_bands(self):
        data = np.zeros((3, 100, 100))
        result, bands, warnings = normalize_bands(data, "sentinel-2-l2a", ["B04", "B03", "B02"])
        assert bands == ["B04", "B03", "B02"]
        assert len(warnings) == 0

    def test_missing_band_warns(self):
        data = np.zeros((3, 100, 100))
        result, bands, warnings = normalize_bands(data, "sentinel-2-l2a", ["B04", "B99"])
        assert "B99" in str(warnings)
        assert "B04" in bands

    def test_landsat_bands(self):
        data = np.zeros((3, 100, 100))
        result, bands, warnings = normalize_bands(data, "landsat-c2-l2", ["B4", "B3", "B2"])
        assert "B4" in bands


# ── Temporal window tests ──────────────────────────────────────────

class TestTemporalWindow:
    """Test temporal window matching."""

    def test_single_scene(self):
        stats, warnings = check_temporal_window(["2024-03-15T10:00:00Z"])
        assert stats["consistent"] is True
        assert len(warnings) == 0

    def test_close_dates(self):
        dates = [
            "2024-03-15T10:00:00Z",
            "2024-03-25T10:00:00Z",
            "2024-04-04T10:00:00Z",
        ]
        stats, warnings = check_temporal_window(dates, max_gap_days=15)
        assert stats["max_gap"] == 10
        assert stats["consistent"] is True
        assert len(warnings) == 0

    def test_large_gap_warns(self):
        dates = [
            "2024-01-01T10:00:00Z",
            "2024-06-01T10:00:00Z",
        ]
        stats, warnings = check_temporal_window(dates, max_gap_days=30)
        assert stats["max_gap"] > 30
        assert any("Large temporal gap" in w for w in warnings)

    def test_empty_list(self):
        stats, warnings = check_temporal_window([])
        assert stats["consistent"] is True


# ── Comparability check tests ───────────────────────────────────────

class TestComparabilityCheck:
    """Test scene comparability checks."""

    def test_comparable_scenes(self):
        scenes = [
            make_scene_result(crs="EPSG:32643", resolution=10.0, bands=["B04", "B03"]),
            make_scene_result(item_id="scene-002", crs="EPSG:32643", resolution=10.0,
                            bands=["B04", "B03"], date_str="2024-03-25T10:00:00Z"),
        ]
        check = check_comparability(scenes)
        assert check.comparable is True
        assert check.crs_consistent is True
        assert check.resolution_consistent is True
        assert check.band_consistent is True

    def test_crs_mismatch(self):
        scenes = [
            make_scene_result(crs="EPSG:32643"),
            make_scene_result(item_id="s2", crs="EPSG:32644"),
        ]
        check = check_comparability(scenes)
        assert check.comparable is False
        assert check.crs_consistent is False
        assert any("CRS mismatch" in r for r in check.reasons)

    def test_resolution_mismatch(self):
        scenes = [
            make_scene_result(resolution=10.0),
            make_scene_result(item_id="s2", resolution=30.0),
        ]
        check = check_comparability(scenes)
        assert check.comparable is False
        assert check.resolution_consistent is False
        assert any("Resolution mismatch" in r for r in check.reasons)

    def test_band_mismatch(self):
        scenes = [
            make_scene_result(bands=["B04", "B03"]),
            make_scene_result(item_id="s2", bands=["B04", "B08"]),
        ]
        check = check_comparability(scenes)
        assert check.comparable is False
        assert check.band_consistent is False
        assert any("Bands differ" in r for r in check.reasons)

    def test_insufficient_coverage(self):
        scenes = [
            make_scene_result(coverage=80.0),
            make_scene_result(item_id="s2", coverage=30.0),
        ]
        check = check_comparability(scenes, min_coverage_pct=50.0)
        assert check.comparable is False
        assert check.coverage_sufficient is False
        assert any("Insufficient coverage" in r for r in check.reasons)

    def test_high_cloud_cover(self):
        scenes = [
            make_scene_result(cloud_cover=5.0),
            make_scene_result(item_id="s2", cloud_cover=60.0),
        ]
        check = check_comparability(scenes)
        assert check.comparable is False
        assert any("High cloud cover" in r for r in check.reasons)

    def test_unsuitable_scene_rejected(self):
        scenes = [
            make_scene_result(suitable=True),
            make_scene_result(item_id="s2", suitable=False),
        ]
        check = check_comparability(scenes)
        assert check.comparable is False
        assert any("unsuitable" in r for r in check.reasons)

    def test_empty_scenes(self):
        check = check_comparability([])
        assert check.comparable is False


# ── Preprocess scene tests ─────────────────────────────────────────

class TestPreprocessScene:
    """Test single scene preprocessing."""

    def test_clean_scene_passes(self):
        item = make_stac_item(cloud_cover=5.0, bbox=[75.0, 26.0, 77.0, 28.0])
        result = preprocess_scene(
            item_dict=item,
            bbox=[75.5, 26.5, 76.0, 27.0],
            target_bands=["B04", "B03", "B02"],
            target_crs="EPSG:32643",
            target_resolution=10.0,
            max_cloud_cover=30.0,
        )
        assert result.suitable is True
        assert len(result.rejection_reasons) == 0
        assert len(result.preprocessing_steps) > 0

    def test_high_cloud_rejected(self):
        item = make_stac_item(cloud_cover=80.0)
        result = preprocess_scene(
            item_dict=item,
            bbox=[75.5, 26.5, 76.0, 27.0],
            target_bands=["B04"],
            target_crs="EPSG:32643",
            target_resolution=10.0,
            max_cloud_cover=30.0,
        )
        assert result.suitable is False
        assert any("Cloud cover" in r for r in result.rejection_reasons)

    def test_missing_bands_warns(self):
        item = make_stac_item(bands=["B02", "B03"])  # No B04
        result = preprocess_scene(
            item_dict=item,
            bbox=[75.5, 26.5, 76.0, 27.0],
            target_bands=["B04", "B03"],
            target_crs="EPSG:32643",
            target_resolution=10.0,
            max_cloud_cover=30.0,
        )
        assert any("Missing bands" in w for w in result.warnings)
        assert "B03" in result.bands_processed
        assert "B04" not in result.bands_processed

    def test_crs_normalize_logged(self):
        item = make_stac_item(proj_epsg=4326)
        result = preprocess_scene(
            item_dict=item,
            bbox=[75.5, 26.5, 76.0, 27.0],
            target_bands=["B04"],
            target_crs="EPSG:32643",
            target_resolution=10.0,
            max_cloud_cover=30.0,
        )
        crs_steps = [s for s in result.preprocessing_steps if s["step"] == "crs_normalize"]
        assert len(crs_steps) == 1
        assert "32643" in crs_steps[0]["detail"]

    def test_resolution_logged(self):
        item = make_stac_item(gsd=20.0)
        result = preprocess_scene(
            item_dict=item,
            bbox=[75.5, 26.5, 76.0, 27.0],
            target_bands=["B04"],
            target_crs="EPSG:32643",
            target_resolution=10.0,
            max_cloud_cover=30.0,
        )
        res_steps = [s for s in result.preprocessing_steps if s["step"] == "resolution_normalize"]
        assert len(res_steps) == 1
        assert "20" in res_steps[0]["detail"]
        assert "10" in res_steps[0]["detail"]

    def test_low_coverage_rejected(self):
        item = make_stac_item(bbox=[78.0, 29.0, 79.0, 30.0])  # Far from AOI
        result = preprocess_scene(
            item_dict=item,
            bbox=[75.5, 26.5, 76.0, 27.0],
            target_bands=["B04"],
            target_crs="EPSG:32643",
            target_resolution=10.0,
            max_cloud_cover=30.0,
        )
        assert result.suitable is False
        assert any("coverage" in r.lower() for r in result.rejection_reasons)


# ── Invalid AOI tests ───────────────────────────────────────────────

class TestInvalidAOI:
    """Test preprocessing with invalid AOI parameters."""

    def test_aoi_just_covers_bbox(self):
        item = make_stac_item(bbox=[75.0, 26.0, 77.0, 28.0])
        result = preprocess_scene(
            item_dict=item,
            bbox=[75.5, 26.5, 76.0, 27.0],
            target_bands=["B04"],
            target_crs="EPSG:32643",
            target_resolution=10.0,
            max_cloud_cover=30.0,
        )
        assert result.suitable is True
        assert result.spatial_coverage_pct > 0
