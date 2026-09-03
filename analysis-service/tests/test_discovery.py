"""
Tests for EO Discovery Engine — coverage, ranking, scene selection.
"""
import pytest
from datetime import datetime
from app.services.discovery import (
    NormalizedScene,
    scene_from_stac_item,
    compute_aoi_coverage,
    compute_union_coverage,
    find_uncovered_portions,
    rank_scenes,
    select_best_scene_for_period,
    select_scene_set_for_period,
    build_discovery_summary,
    RankingWeights,
)


def _make_scene(
    scene_id: str,
    bbox: list[float],
    cloud_cover: float = 10.0,
    platform: str = "sentinel-2a",
    datetime_str: str = "2023-06-15T00:00:00Z",
    bands: list[str] = None,
) -> NormalizedScene:
    """Helper to create a test scene."""
    dt_obj = None
    if datetime_str:
        try:
            dt_obj = datetime.fromisoformat(datetime_str.replace("Z", "+00:00"))
        except ValueError:
            pass

    return NormalizedScene(
        scene_id=scene_id,
        collection="sentinel-2-l2a",
        provider="test",
        datetime=datetime_str,
        datetime_obj=dt_obj,
        bbox=bbox,
        cloud_cover=cloud_cover,
        platform=platform,
        bands_available=bands or ["B02", "B03", "B04", "B08"],
    )


class TestCoverageCalculation:
    """Tests for geometric coverage calculation."""

    def test_full_coverage(self):
        """Scene covering entire AOI should give 100%."""
        aoi = [78.0, 17.0, 79.0, 18.0]
        scene_bbox = [77.5, 16.5, 79.5, 18.5]  # Larger than AOI
        coverage = compute_aoi_coverage(scene_bbox, aoi)
        assert coverage == 1.0

    def test_partial_coverage(self):
        """Scene covering half the AOI should give ~50%."""
        aoi = [78.0, 17.0, 79.0, 18.0]
        scene_bbox = [78.0, 17.0, 79.0, 17.5]  # Covers southern half
        coverage = compute_aoi_coverage(scene_bbox, aoi)
        assert 0.45 < coverage < 0.55

    def test_no_coverage(self):
        """Non-overlapping scene should give 0%."""
        aoi = [78.0, 17.0, 79.0, 18.0]
        scene_bbox = [80.0, 19.0, 81.0, 20.0]
        coverage = compute_aoi_coverage(scene_bbox, aoi)
        assert coverage == 0.0

    def test_empty_bbox(self):
        """Empty bbox should give 0%."""
        coverage = compute_aoi_coverage([0, 0, 0, 0], [78.0, 17.0, 79.0, 18.0])
        assert coverage == 0.0

    def test_union_coverage(self):
        """Union of two half-coverage scenes should give ~100%."""
        aoi = [78.0, 17.0, 79.0, 18.0]
        scene1 = _make_scene("s1", [78.0, 17.0, 79.0, 17.5])
        scene2 = _make_scene("s2", [78.0, 17.5, 79.0, 18.0])
        coverage = compute_union_coverage([scene1, scene2], aoi)
        assert coverage > 0.9


class TestUncoveredPortions:
    """Tests for identifying uncovered AOI regions."""

    def test_fully_covered(self):
        """Fully covered AOI should have no uncovered portions."""
        aoi = [78.0, 17.0, 79.0, 18.0]
        scene = _make_scene("s1", [77.5, 16.5, 79.5, 18.5])
        uncovered = find_uncovered_portions([scene], aoi)
        assert len(uncovered) == 0

    def test_no_scenes(self):
        """No scenes should mean entire AOI is uncovered."""
        aoi = [78.0, 17.0, 79.0, 18.0]
        uncovered = find_uncovered_portions([], aoi)
        assert len(uncovered) == 1
        assert uncovered[0] == aoi


class TestSceneRanking:
    """Tests for multi-criteria scene ranking."""

    def test_ranking_order(self):
        """Better scenes should rank higher."""
        aoi = [78.0, 17.0, 79.0, 18.0]

        good_scene = _make_scene("good", [77.5, 16.5, 79.5, 18.5], cloud_cover=2.0)
        bad_scene = _make_scene("bad", [78.0, 17.0, 78.5, 17.5], cloud_cover=50.0)

        ranked = rank_scenes([bad_scene, good_scene], aoi)
        assert ranked[0].scene_id == "good"
        assert ranked[0].rank_score > ranked[1].rank_score

    def test_cloud_cover_penalty(self):
        """Higher cloud cover should penalize ranking."""
        aoi = [78.0, 17.0, 79.0, 18.0]

        clear = _make_scene("clear", [77.5, 16.5, 79.5, 18.5], cloud_cover=5.0)
        cloudy = _make_scene("cloudy", [77.5, 16.5, 79.5, 18.5], cloud_cover=40.0)

        ranked = rank_scenes([cloudy, clear], aoi)
        assert ranked[0].scene_id == "clear"

    def test_coverage_matters(self):
        """Higher AOI coverage should improve ranking."""
        aoi = [78.0, 17.0, 79.0, 18.0]

        full_cover = _make_scene("full", [77.5, 16.5, 79.5, 18.5], cloud_cover=10.0)
        partial_cover = _make_scene("partial", [78.0, 17.0, 78.5, 17.5], cloud_cover=10.0)

        ranked = rank_scenes([partial_cover, full_cover], aoi)
        assert ranked[0].scene_id == "full"

    def test_temporal_fit(self):
        """Scene closer to target date should rank higher."""
        aoi = [78.0, 17.0, 79.0, 18.0]

        close = _make_scene("close", [77.5, 16.5, 79.5, 18.5],
                            cloud_cover=10.0, datetime_str="2023-06-15T00:00:00Z")
        far = _make_scene("far", [77.5, 16.5, 79.5, 18.5],
                          cloud_cover=10.0, datetime_str="2022-01-01T00:00:00Z")

        ranked = rank_scenes([far, close], aoi, target_date="2023-06-01T00:00:00Z")
        assert ranked[0].scene_id == "close"

    def test_rank_breakdown(self):
        """Each scene should have a rank breakdown."""
        aoi = [78.0, 17.0, 79.0, 18.0]
        scene = _make_scene("s1", [77.5, 16.5, 79.5, 18.5], cloud_cover=5.0)

        ranked = rank_scenes([scene], aoi)
        assert "aoi_coverage" in ranked[0].rank_breakdown
        assert "cloud_quality" in ranked[0].rank_breakdown
        assert "temporal_fit" in ranked[0].rank_breakdown

    def test_empty_input(self):
        """Empty scene list should return empty."""
        ranked = rank_scenes([], [78.0, 17.0, 79.0, 18.0])
        assert ranked == []


class TestSceneSelection:
    """Tests for period-aware scene selection."""

    def test_select_best_single(self):
        """Should select the best scene within a period."""
        aoi = [78.0, 17.0, 79.0, 18.0]
        scenes = [
            _make_scene("s1", [77.5, 16.5, 79.5, 18.5], cloud_cover=5.0,
                       datetime_str="2023-06-15T00:00:00Z"),
            _make_scene("s2", [77.5, 16.5, 79.5, 18.5], cloud_cover=40.0,
                       datetime_str="2023-07-01T00:00:00Z"),
        ]

        best = select_best_scene_for_period(
            scenes, aoi, "2023-06-01", "2023-08-01",
        )
        assert best is not None
        assert best.scene_id == "s1"

    def test_excludes_cloudy(self):
        """Should exclude scenes above cloud threshold."""
        aoi = [78.0, 17.0, 79.0, 18.0]
        scenes = [
            _make_scene("cloudy", [77.5, 16.5, 79.5, 18.5], cloud_cover=60.0,
                       datetime_str="2023-06-15T00:00:00Z"),
        ]

        best = select_best_scene_for_period(
            scenes, aoi, "2023-06-01", "2023-08-01",
            max_cloud_cover=30.0,
        )
        assert best is None

    def test_select_multi_scene_set(self):
        """Should select multiple scenes when single scene has low coverage."""
        aoi = [78.0, 17.0, 79.0, 18.0]
        scenes = [
            _make_scene("s1", [78.0, 17.0, 78.5, 17.5], cloud_cover=5.0,
                       datetime_str="2023-06-15T00:00:00Z"),
            _make_scene("s2", [78.5, 17.5, 79.0, 18.0], cloud_cover=8.0,
                       datetime_str="2023-06-20T00:00:00Z"),
            _make_scene("s3", [77.5, 16.5, 79.5, 18.5], cloud_cover=5.0,
                       datetime_str="2023-06-18T00:00:00Z"),
        ]

        selected = select_scene_set_for_period(
            scenes, aoi, "2023-06-01", "2023-08-01",
            min_coverage_pct=80.0,
        )
        assert len(selected) >= 1


class TestDiscoverySummary:
    """Tests for discovery summary generation."""

    def test_summary_fields(self):
        """Summary should contain all required fields."""
        scenes = [_make_scene("s1", [77.5, 16.5, 79.5, 18.5], cloud_cover=5.0)]
        aoi = [78.0, 17.0, 79.0, 18.0]

        summary = build_discovery_summary(scenes, [], aoi, "sentinel-2-l2a", "test")

        assert summary.collection == "sentinel-2-l2a"
        assert summary.total_scenes_found == 1
        assert summary.best_cloud_cover == 5.0
        assert summary.composite_status in ("single_scene", "partial_coverage", "multi_scene_composite")


class TestSceneFromStacItem:
    """Tests for STAC item → NormalizedScene conversion."""

    def test_basic_conversion(self):
        """Should convert a basic STAC item."""
        item = {
            "id": "S2A_20230615",
            "collection": "sentinel-2-l2a",
            "bbox": [78.0, 17.0, 79.0, 18.0],
            "geometry": {"type": "Polygon", "coordinates": []},
            "properties": {
                "datetime": "2023-06-15T00:00:00Z",
                "eo:cloud_cover": 5.2,
                "platform": "sentinel-2a",
            },
            "assets": {
                "B04": {"href": "https://example.com/B04.tif"},
                "B08": {"href": "https://example.com/B08.tif"},
            },
        }

        scene = scene_from_stac_item(item, "planetary_computer")
        assert scene.scene_id == "S2A_20230615"
        assert scene.cloud_cover == 5.2
        assert "B04" in scene.bands_available
        assert scene.provider == "planetary_computer"

    def test_missing_fields(self):
        """Should handle missing fields gracefully."""
        item = {"id": "test"}
        scene = scene_from_stac_item(item)
        assert scene.scene_id == "test"
        assert scene.cloud_cover is None
        assert scene.datetime_obj is None


class TestNormalizedSceneDict:
    """Tests for NormalizedScene serialization."""

    def test_to_dict(self):
        """Should serialize to dict correctly."""
        scene = _make_scene("s1", [78.0, 17.0, 79.0, 18.0], cloud_cover=5.0)
        d = scene.to_dict()
        assert d["scene_id"] == "s1"
        assert d["cloud_cover"] == 5.0
        assert isinstance(d["bands_available"], list)
