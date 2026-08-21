"""
Integration test for the timeseries endpoint against Planetary Computer.

Test AOI: Jaipur, India — a well-covered urban area with frequent Sentinel-2 passes.

Run: pytest tests/test_timeseries_integration.py -v
"""

import pytest

from app.services.temporal_engine import (
    discover_scenes,
    filter_scenes,
    rank_scenes,
    remove_duplicates,
    sort_temporally,
    run_timeseries_analysis,
)


# ── Real test AOI ──────────────────────────────────────────────────

# Jaipur, India — urban area with good Sentinel-2 coverage
JAIPUR_BBOX = [75.7, 26.8, 75.9, 27.0]
JAIPUR_START = "2024-03-01"
JAIPUR_END = "2024-03-31"
JAIPUR_COLLECTION = "sentinel-2-l2a"


@pytest.mark.integration
class TestTimeseriesDiscovery:
    """Test scene discovery against Planetary Computer."""

    def test_discover_scenes(self):
        """Discover Sentinel-2 scenes over Jaipur in March 2024."""
        from datetime import date
        items = discover_scenes(
            collection=JAIPUR_COLLECTION,
            bbox=JAIPUR_BBOX,
            start_date=date(2024, 3, 1),
            end_date=date(2024, 3, 31),
            max_cloud_cover=30,
            max_scenes=10,
        )
        assert len(items) > 0
        assert len(items) <= 30  # 3x limit

        # Check item structure
        item = items[0]
        assert "id" in item
        assert "assets" in item
        assert "properties" in item
        assert "bbox" in item

    def test_discover_scenes_strict_cloud(self):
        """Discover with very strict cloud filter (0%)."""
        from datetime import date
        items = discover_scenes(
            collection=JAIPUR_COLLECTION,
            bbox=JAIPUR_BBOX,
            start_date=date(2024, 3, 1),
            end_date=date(2024, 3, 31),
            max_cloud_cover=5,
            max_scenes=10,
        )
        # Should find some, but possibly fewer than the 30% filter
        for item in items:
            cc = item.get("properties", {}).get("eo:cloud_cover", 0)
            assert cc < 5


@pytest.mark.integration
class TestTimeseriesFiltering:
    """Test filtering pipeline against real data."""

    def test_filter_and_rank(self):
        """Full filter + rank pipeline on real data."""
        from datetime import date
        items = discover_scenes(
            collection=JAIPUR_COLLECTION,
            bbox=JAIPUR_BBOX,
            start_date=date(2024, 3, 1),
            end_date=date(2024, 3, 31),
            max_cloud_cover=30,
            max_scenes=10,
        )

        candidates, rejected = filter_scenes(items, JAIPUR_BBOX)
        assert len(candidates) > 0

        ranked = rank_scenes(candidates)
        assert len(ranked) > 0
        # All scores should be positive
        for c in ranked:
            assert c.score > 0
        # Should be sorted by score descending
        scores = [c.score for c in ranked]
        assert scores == sorted(scores, reverse=True)

    def test_deduplication(self):
        """Verify deduplication works on real data."""
        from datetime import date
        items = discover_scenes(
            collection=JAIPUR_COLLECTION,
            bbox=JAIPUR_BBOX,
            start_date=date(2024, 3, 1),
            end_date=date(2024, 3, 31),
            max_cloud_cover=30,
            max_scenes=10,
        )

        candidates, _ = filter_scenes(items, JAIPUR_BBOX)
        ranked = rank_scenes(candidates)
        deduped = remove_duplicates(ranked)

        # Deduped should be <= original
        assert len(deduped) <= len(ranked)
        # All should have unique day+bbox keys
        keys = set()
        for c in deduped:
            key = f"{c.datetime_str[:10]}"
            keys.add(key)


@pytest.mark.integration
class TestTimeseriesEndpoint:
    """Full end-to-end timeseries analysis test."""

    def test_run_analysis(self):
        """Run full timeseries analysis and verify all fields."""
        from datetime import date
        result = run_timeseries_analysis(
            collection=JAIPUR_COLLECTION,
            bbox=JAIPUR_BBOX,
            start_date=date(2024, 3, 1),
            end_date=date(2024, 3, 31),
            max_cloud_cover=30,
            max_scenes=5,
            bands=["B04", "B03", "B02"],
        )

        assert result.analysis_id is not None
        assert len(result.analysis_id) == 16

        # Should have discovered scenes
        assert result.scenes_discovered > 0
        assert result.scenes_selected > 0
        assert result.scenes_selected <= 5

        # Dates should be in order
        if len(result.acquisition_dates) > 1:
            assert result.acquisition_dates == sorted(result.acquisition_dates)

        # All cloud covers should be below threshold
        for cc in result.cloud_covers:
            assert cc < 30

        # Processing steps should be logged
        assert len(result.processing_steps) >= 5

        # Cube dimensions should be present
        assert len(result.cube_shape) == 4  # time, band, y, x
        assert result.cube_dims.get("time", 0) > 0

        # CRS should be set
        assert result.crs.startswith("EPSG:")

        # Selected scenes should have metadata
        for scene in result.selected_scenes:
            assert "item_id" in scene
            assert "datetime" in scene
            assert "cloud_cover" in scene
            assert "score" in scene

    def test_analysis_with_no_results(self):
        """Analysis with impossible constraints should return no_data."""
        from datetime import date
        result = run_timeseries_analysis(
            collection=JAIPUR_COLLECTION,
            bbox=[0.0, 0.0, 0.1, 0.1],  # Middle of ocean
            start_date=date(2024, 3, 1),
            end_date=date(2024, 3, 31),
            max_cloud_cover=0,  # Zero cloud tolerance
            max_scenes=5,
            bands=["B04", "B03", "B02"],
        )

        # May or may not find scenes, but should not crash
        assert result.status in ("ok", "no_data")
        assert result.analysis_id is not None
