"""Unit tests for the Multi-Scene Selector.

Tests:
  1. Hyderabad-sized AOI using one/few scenes
  2. Large AOI requiring multiple scenes
  3. AOI with partial scene coverage
  4. Same-sensor before/after pair
  5. Cross-sensor availability where compatible analysis should be rejected
  6. No usable imagery
"""

import pytest
from datetime import datetime

from app.services.scene_selector import (
    select_scenes_for_period,
    check_periods_compatible,
    _bbox_overlap_ratio,
    _bbox_area,
    _estimate_collective_coverage,
    _get_sensor_family,
)


# ── Test data helpers ──────────────────────────────────────────────

def make_scene(
    item_id: str,
    bbox: list[float],
    collection: str = "sentinel-2-l2a",
    dt: str = "2024-03-15T10:00:00Z",
    cloud_cover: float = 10.0,
    platform: str = "Sentinel-2A",
) -> dict:
    """Create a minimal STAC item dict for testing."""
    return {
        "id": item_id,
        "collection": collection,
        "bbox": bbox,
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [bbox[0], bbox[1]], [bbox[2], bbox[1]],
                [bbox[2], bbox[3]], [bbox[0], bbox[3]],
                [bbox[0], bbox[1]],
            ]],
        },
        "properties": {
            "datetime": dt,
            "eo:cloud_cover": cloud_cover,
            "platform": platform,
            "eo:gsd": 10.0,
        },
        "assets": {"B08": {"href": "https://example.com/B08.tif"}},
    }


# ── Bbox math tests ───────────────────────────────────────────────

class TestBboxOverlap:
    def test_full_overlap(self):
        aoi = [75.7, 26.8, 75.9, 27.0]
        scene = [75.0, 26.0, 76.5, 28.0]
        assert _bbox_overlap_ratio(scene, aoi) == pytest.approx(1.0, abs=0.01)

    def test_half_overlap(self):
        aoi = [0, 0, 10, 10]
        scene = [0, 0, 5, 10]
        assert _bbox_overlap_ratio(scene, aoi) == pytest.approx(0.5, abs=0.01)

    def test_no_overlap(self):
        aoi = [0, 0, 1, 1]
        scene = [5, 5, 6, 6]
        assert _bbox_overlap_ratio(scene, aoi) == 0

    def test_partial_overlap(self):
        aoi = [0, 0, 10, 10]
        scene = [5, 5, 15, 15]
        ratio = _bbox_overlap_ratio(scene, aoi)
        assert 0.2 < ratio < 0.3


class TestCollectiveCoverage:
    def test_empty_scenes(self):
        assert _estimate_collective_coverage([0, 0, 10, 10], []) == 0

    def test_full_coverage_single_scene(self):
        aoi = [0, 0, 10, 10]
        scenes = [[-1, -1, 11, 11]]
        assert _estimate_collective_coverage(aoi, scenes) > 0.95

    def test_collective_coverage_two_halves(self):
        aoi = [0, 0, 10, 10]
        scenes = [[0, 0, 5, 10], [5, 0, 10, 10]]
        assert _estimate_collective_coverage(aoi, scenes, grid_res=20) > 0.9


# ── Sensor family tests ────────────────────────────────────────────

class TestSensorFamily:
    def test_sentinel2_family(self):
        assert _get_sensor_family("sentinel-2-l2a") == "sentinel-2"

    def test_landsat_family(self):
        assert _get_sensor_family("landsat-c2-l2") == "landsat"

    def test_unknown_collection(self):
        assert _get_sensor_family("some-other-collection") == "some-other-collection"


# ── Scene selection tests ──────────────────────────────────────────

class TestSceneSelection:
    """Test the core scene selection algorithm."""

    def test_hyderabad_single_scene_covers_aoi(self):
        """Hyderabad-sized AOI — one scene should be sufficient."""
        aoi = [78.3, 17.3, 78.6, 17.55]  # ~33km × 28km
        scenes = [
            make_scene("S2A_001", bbox=[78.0, 17.0, 79.0, 18.0]),
            make_scene("S2A_002", bbox=[79.0, 17.0, 80.0, 18.0]),
        ]

        result = select_scenes_for_period(
            aoi_bbox=aoi,
            scenes=scenes,
            period_label="test",
            target_date=datetime(2024, 3, 15),
        )

        assert result.total_scenes >= 1
        assert result.coverage_ratio > 0.9
        assert result.is_complete
        assert not result.is_mosaic  # single scene sufficient
        assert result.sensor == "sentinel-2"

    def test_large_aoi_requires_multiple_scenes(self):
        """Large AOI (Assam-sized) should require multiple scenes."""
        aoi = [89.5, 24.0, 96.0, 28.0]  # ~600km × 440km
        scenes = [
            make_scene("S2A_001", bbox=[89.0, 24.0, 91.0, 26.0]),
            make_scene("S2A_002", bbox=[91.0, 24.0, 93.0, 26.0]),
            make_scene("S2A_003", bbox=[93.0, 24.0, 95.0, 26.0]),
            make_scene("S2A_004", bbox=[95.0, 24.0, 97.0, 26.0]),
            make_scene("S2A_005", bbox=[89.0, 26.0, 91.0, 28.0]),
            make_scene("S2A_006", bbox=[91.0, 26.0, 93.0, 28.0]),
            make_scene("S2A_007", bbox=[93.0, 26.0, 95.0, 28.0]),
            make_scene("S2A_008", bbox=[95.0, 26.0, 97.0, 28.0]),
        ]

        result = select_scenes_for_period(
            aoi_bbox=aoi,
            scenes=scenes,
            period_label="test",
        )

        assert result.total_scenes > 1
        assert result.is_mosaic
        assert result.coverage_ratio > 0.8

    def test_partial_coverage_reported(self):
        """AOI with only partial scene coverage should report it."""
        aoi = [0, 0, 10, 10]
        scenes = [
            make_scene("S2A_001", bbox=[0, 0, 3, 10]),  # only left third
        ]

        result = select_scenes_for_period(
            aoi_bbox=aoi,
            scenes=scenes,
            period_label="test",
        )

        assert result.total_scenes == 1
        assert result.coverage_ratio < 0.5
        assert not result.is_complete

    def test_cloud_filter_removes_heavy_cloud_scenes(self):
        """Scenes with excessive cloud cover should be filtered."""
        aoi = [75.7, 26.8, 75.9, 27.0]
        scenes = [
            make_scene("S2A_clear", bbox=[75.0, 26.0, 76.5, 28.0], cloud_cover=5.0),
            make_scene("S2A_cloudy", bbox=[75.0, 26.0, 76.5, 28.0], cloud_cover=85.0),
        ]

        result = select_scenes_for_period(
            aoi_bbox=aoi,
            scenes=scenes,
            period_label="test",
            max_cloud_cover=30,
        )

        selected_ids = [s.item_id for s in result.scenes]
        assert "S2A_clear" in selected_ids
        assert "S2A_cloudy" not in selected_ids

    def test_no_usable_scenes(self):
        """Empty scene list should return errors."""
        result = select_scenes_for_period(
            aoi_bbox=[75.7, 26.8, 75.9, 27.0],
            scenes=[],
            period_label="test",
        )

        assert result.total_scenes == 0
        assert len(result.errors) > 0
        assert result.coverage_ratio == 0

    def test_scenes_outside_aoi_ignored(self):
        """Scenes that don't overlap the AOI should get zero score."""
        aoi = [75.7, 26.8, 75.9, 27.0]
        scenes = [
            make_scene("S2A_far", bbox=[80.0, 28.0, 81.0, 29.0]),  # far away
        ]

        result = select_scenes_for_period(
            aoi_bbox=aoi,
            scenes=scenes,
            period_label="test",
        )

        assert result.total_scenes == 0

    def test_dates_sorted_ascending(self):
        """Acquisition dates should be returned in ascending order."""
        aoi = [75.7, 26.8, 75.9, 27.0]
        scenes = [
            make_scene("S2A_002", bbox=[75.0, 26.0, 76.5, 28.0], dt="2024-06-15T10:00:00Z"),
            make_scene("S2A_001", bbox=[75.0, 26.0, 76.5, 28.0], dt="2024-03-15T10:00:00Z"),
        ]

        result = select_scenes_for_period(
            aoi_bbox=aoi,
            scenes=scenes,
            period_label="test",
        )

        assert result.acquisition_dates == sorted(result.acquisition_dates)

    def test_max_scene_limit_enforced(self):
        """Should not select more than MAX_SCENES_PER_PERIOD scenes."""
        aoi = [0, 0, 100, 100]  # huge AOI
        scenes = [
            make_scene(f"S2A_{i:03d}", bbox=[i * 10, 0, (i + 1) * 10, 100])
            for i in range(20)
        ]

        result = select_scenes_for_period(
            aoi_bbox=aoi,
            scenes=scenes,
            period_label="test",
        )

        assert result.total_scenes <= 6  # MAX_SCENES_PER_PERIOD


# ── Sensor compatibility tests ─────────────────────────────────────

class TestSensorCompatibility:
    def test_same_sensor_compatible(self):
        """Same sensor family should be compatible."""
        from app.services.scene_selector import SceneSelectionResult

        p1 = SceneSelectionResult(
            period_label="p1", scenes=[], sensor="sentinel-2",
            collection="sentinel-2-l2a", total_scenes=1,
            coverage_ratio=1.0, is_complete=True, is_mosaic=False,
            acquisition_dates=["2024-03-15"], total_cloud_cover=5.0,
            resolution_m=10.0,
        )
        p2 = SceneSelectionResult(
            period_label="p2", scenes=[], sensor="sentinel-2",
            collection="sentinel-2-l2a", total_scenes=1,
            coverage_ratio=1.0, is_complete=True, is_mosaic=False,
            acquisition_dates=["2024-09-15"], total_cloud_cover=8.0,
            resolution_m=10.0,
        )

        compatible, warnings = check_periods_compatible(p1, p2)
        assert compatible
        assert len(warnings) == 0

    def test_cross_sensor_not_compatible(self):
        """Cross-sensor pair should NOT be compatible."""
        from app.services.scene_selector import SceneSelectionResult

        p1 = SceneSelectionResult(
            period_label="p1", scenes=[], sensor="sentinel-2",
            collection="sentinel-2-l2a", total_scenes=1,
            coverage_ratio=1.0, is_complete=True, is_mosaic=False,
            acquisition_dates=["2024-03-15"], total_cloud_cover=5.0,
            resolution_m=10.0,
        )
        p2 = SceneSelectionResult(
            period_label="p2", scenes=[], sensor="landsat",
            collection="landsat-c2-l2", total_scenes=1,
            coverage_ratio=1.0, is_complete=True, is_mosaic=False,
            acquisition_dates=["2024-09-15"], total_cloud_cover=10.0,
            resolution_m=30.0,
        )

        compatible, warnings = check_periods_compatible(p1, p2)
        assert not compatible
        assert len(warnings) > 0
        assert "Cross-sensor" in warnings[0]

    def test_empty_periods_not_compatible(self):
        """Periods with no scenes should not be compatible."""
        from app.services.scene_selector import SceneSelectionResult

        p1 = SceneSelectionResult(
            period_label="p1", scenes=[], sensor="",
            collection="", total_scenes=0,
            coverage_ratio=0, is_complete=False, is_mosaic=False,
            acquisition_dates=[], total_cloud_cover=None,
            resolution_m=None, errors=["No scenes"],
        )

        compatible, warnings = check_periods_compatible(p1, p1)
        assert not compatible
