"""Unit tests for the temporal engine services."""

import hashlib
from datetime import date, datetime

import pytest

from app.services.temporal_engine import (
    RejectionRecord,
    SceneCandidate,
    build_analysis_id,
    filter_scenes,
    rank_scenes,
    remove_duplicates,
    sort_temporally,
)


# ── Test data helpers ──────────────────────────────────────────────

def make_item(
    item_id: str,
    dt: str = "2024-03-15T10:00:00Z",
    cloud_cover: float = 10.0,
    bbox: list = None,
    assets: dict = None,
) -> dict:
    """Create a minimal STAC item dict for testing."""
    if bbox is None:
        bbox = [75.5, 26.5, 76.0, 27.0]
    if assets is None:
        assets = {"B04": {"href": "https://example.com/B04.tif"}}

    return {
        "id": item_id,
        "collection": "sentinel-2-l2a",
        "bbox": bbox,
        "geometry": {
            "type": "Polygon",
            "coordinates": [
                [
                    [bbox[0], bbox[1]],
                    [bbox[2], bbox[1]],
                    [bbox[2], bbox[3]],
                    [bbox[0], bbox[3]],
                    [bbox[0], bbox[1]],
                ]
            ],
        },
        "properties": {
            "datetime": dt,
            "eo:cloud_cover": cloud_cover,
        },
        "assets": assets,
    }


def make_candidate(
    item_id: str = "test-001",
    dt: str = "2024-03-15T10:00:00Z",
    cloud_cover: float = 10.0,
    bbox: list = None,
    coverage_pct: float = 80.0,
    score: float = 0.0,
) -> SceneCandidate:
    """Create a SceneCandidate for testing."""
    if bbox is None:
        bbox = [75.5, 26.5, 76.0, 27.0]
    return SceneCandidate(
        item_id=item_id,
        item_dict={},
        datetime_str=dt,
        cloud_cover=cloud_cover,
        bbox=bbox,
        geometry={},
        assets=["B04", "B03", "B02"],
        coverage_pct=coverage_pct,
        score=score,
    )


# ── Filter tests ───────────────────────────────────────────────────

class TestFilterScenes:
    """Test scene filtering logic."""

    def test_valid_item_passes(self):
        items = [make_item("item-001")]
        bbox = [75.5, 26.5, 76.0, 27.0]
        candidates, rejected = filter_scenes(items, bbox)
        assert len(candidates) == 1
        assert len(rejected) == 0

    def test_no_datetime_rejected(self):
        items = [make_item("item-001", dt=None)]
        items[0]["properties"]["datetime"] = None
        bbox = [75.5, 26.5, 76.0, 27.0]
        candidates, rejected = filter_scenes(items, bbox)
        assert len(candidates) == 0
        assert any(r.reason == "no_datetime" for r in rejected)

    def test_no_raster_assets_rejected(self):
        items = [make_item("item-001", assets={"visual": {"href": "x.jpg"}})]
        bbox = [75.5, 26.5, 76.0, 27.0]
        candidates, rejected = filter_scenes(items, bbox)
        assert len(candidates) == 0
        assert any(r.reason == "no_raster_assets" for r in rejected)

    def test_missing_required_bands_rejected(self):
        items = [make_item("item-001")]
        bbox = [75.5, 26.5, 76.0, 27.0]
        candidates, rejected = filter_scenes(items, bbox, required_bands=["B12"])
        assert len(candidates) == 0
        assert any(r.reason == "missing_bands" for r in rejected)

    def test_required_bands_present_passes(self):
        items = [make_item("item-001", assets={"B04": {}, "B08": {}})]
        bbox = [75.5, 26.5, 76.0, 27.0]
        candidates, rejected = filter_scenes(items, bbox, required_bands=["B04", "B08"])
        assert len(candidates) == 1

    def test_low_coverage_rejected(self):
        # Item bbox barely overlaps AOI
        items = [make_item("item-001", bbox=[77.0, 28.0, 78.0, 29.0])]
        bbox = [75.5, 26.5, 76.0, 27.0]
        candidates, rejected = filter_scenes(items, bbox)
        assert len(candidates) == 0
        assert any(r.reason == "insufficient_coverage" for r in rejected)


# ── Rank tests ─────────────────────────────────────────────────────

class TestRankScenes:
    """Test scene ranking logic."""

    def test_empty_list(self):
        assert rank_scenes([]) == []

    def test_single_scene(self):
        candidates = [make_candidate("a", cloud_cover=5.0)]
        ranked = rank_scenes(candidates)
        assert len(ranked) == 1
        assert ranked[0].score > 0

    def test_lower_cloud_ranks_higher(self):
        c1 = make_candidate("a", dt="2024-03-15T10:00:00Z", cloud_cover=5.0)
        c2 = make_candidate("b", dt="2024-03-15T10:00:00Z", cloud_cover=50.0)
        ranked = rank_scenes([c1, c2])
        assert ranked[0].cloud_cover < ranked[1].cloud_cover

    def test_higher_coverage_ranks_higher(self):
        c1 = make_candidate("a", dt="2024-03-15T10:00:00Z", coverage_pct=95.0)
        c2 = make_candidate("b", dt="2024-03-15T10:00:00Z", coverage_pct=50.0)
        ranked = rank_scenes([c1, c2])
        assert ranked[0].coverage_pct > ranked[1].coverage_pct

    def test_all_scores_positive(self):
        candidates = [
            make_candidate("a", cloud_cover=20.0, coverage_pct=70.0),
            make_candidate("b", cloud_cover=5.0, coverage_pct=90.0),
            make_candidate("c", cloud_cover=40.0, coverage_pct=60.0),
        ]
        ranked = rank_scenes(candidates)
        for c in ranked:
            assert c.score > 0


# ── Duplicate removal tests ────────────────────────────────────────

class TestRemoveDuplicates:
    """Test deduplication logic."""

    def test_no_duplicates(self):
        candidates = [
            make_candidate("a", dt="2024-03-15T10:00:00Z"),
            make_candidate("b", dt="2024-03-16T10:00:00Z"),
        ]
        deduped = remove_duplicates(candidates)
        assert len(deduped) == 2

    def test_same_date_same_bbox_deduped(self):
        candidates = [
            make_candidate("a", dt="2024-03-15T10:00:00Z", score=0.5),
            make_candidate("b", dt="2024-03-15T10:00:00Z", score=0.8),
        ]
        deduped = remove_duplicates(candidates)
        assert len(deduped) == 1
        assert deduped[0].item_id == "b"  # Higher score kept

    def test_same_date_different_bbox_not_deduped(self):
        candidates = [
            make_candidate("a", dt="2024-03-15T10:00:00Z", bbox=[75.5, 26.5, 76.0, 27.0]),
            make_candidate("b", dt="2024-03-15T10:00:00Z", bbox=[74.0, 25.0, 75.0, 26.0]),
        ]
        deduped = remove_duplicates(candidates)
        assert len(deduped) == 2


# ── Temporal sort tests ────────────────────────────────────────────

class TestSortTemporally:
    """Test temporal sorting."""

    def test_sorts_ascending(self):
        candidates = [
            make_candidate("c", dt="2024-03-20T10:00:00Z"),
            make_candidate("a", dt="2024-03-10T10:00:00Z"),
            make_candidate("b", dt="2024-03-15T10:00:00Z"),
        ]
        sorted_list = sort_temporally(candidates)
        dates = [c.datetime_str for c in sorted_list]
        assert dates == sorted(dates)

    def test_empty_list(self):
        assert sort_temporally([]) == []


# ── Analysis ID tests ──────────────────────────────────────────────

class TestAnalysisId:
    """Test deterministic analysis ID generation."""

    def test_same_input_same_id(self):
        id1 = build_analysis_id("sentinel-2-l2a", [75.5, 26.5, 76.0, 27.0],
                                date(2024, 1, 1), date(2024, 6, 30))
        id2 = build_analysis_id("sentinel-2-l2a", [75.5, 26.5, 76.0, 27.0],
                                date(2024, 1, 1), date(2024, 6, 30))
        assert id1 == id2

    def test_different_input_different_id(self):
        id1 = build_analysis_id("sentinel-2-l2a", [75.5, 26.5, 76.0, 27.0],
                                date(2024, 1, 1), date(2024, 6, 30))
        id2 = build_analysis_id("landsat-c2-l2", [75.5, 26.5, 76.0, 27.0],
                                date(2024, 1, 1), date(2024, 6, 30))
        assert id1 != id2

    def test_id_is_16_chars(self):
        id = build_analysis_id("sentinel-2-l2a", [75.5, 26.5, 76.0, 27.0],
                               date(2024, 1, 1), date(2024, 6, 30))
        assert len(id) == 16
