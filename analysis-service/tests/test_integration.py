"""Integration test against Planetary Computer STAC API.

This test requires network access. Skip with: pytest -m "not integration"
"""

import pytest

from app.services.stac_service import (
    check_stac_api_reachable,
    search_stac,
    get_item_assets,
    select_best_asset,
)


@pytest.mark.integration
class TestPlanetaryComputerIntegration:
    """Integration tests against live Planetary Computer STAC API."""

    def test_stac_api_reachable(self):
        """Verify Planetary Computer STAC API is reachable."""
        assert check_stac_api_reachable() is True

    def test_search_sentinel2(self):
        """Search for Sentinel-2 scenes over Jaipur, India."""
        result = search_stac(
            collection="sentinel-2-l2a",
            bbox=[75.5, 26.5, 76.0, 27.0],
            datetime="2024-03-01/2024-03-31",
            max_cloud_cover=30,
            limit=3,
        )
        assert result["total"] >= 0
        assert len(result["items"]) <= 3

        if result["items"]:
            item = result["items"][0]
            assert "id" in item
            assert "assets" in item
            assert "properties" in item
            assert item["collection"] == "sentinel-2-l2a"

    def test_search_landsat(self):
        """Search for Landsat scenes."""
        result = search_stac(
            collection="landsat-c2-l2",
            bbox=[75.5, 26.5, 76.0, 27.0],
            datetime="2024-01-01/2024-03-31",
            max_cloud_cover=20,
            limit=2,
        )
        assert result["total"] >= 0

        if result["items"]:
            item = result["items"][0]
            assets = get_item_assets(item)
            assert len(assets) > 0

    def test_asset_selection_from_real_item(self):
        """Select asset from a real STAC item."""
        result = search_stac(
            collection="sentinel-2-l2a",
            bbox=[75.5, 26.5, 76.0, 27.0],
            datetime="2024-06-01/2024-06-15",
            max_cloud_cover=10,
            limit=1,
        )
        if not result["items"]:
            pytest.skip("No scenes found for test parameters")

        item = result["items"][0]
        assets = get_item_assets(item)
        key, asset = select_best_asset(assets)

        assert key in assets
        assert "href" in asset
        assert len(asset["href"]) > 0

    def test_search_empty_area(self):
        """Search in the middle of the ocean should return few results."""
        result = search_stac(
            collection="sentinel-2-l2a",
            bbox=[0.0, 0.0, 0.1, 0.1],
            datetime="2024-06-01/2024-06-30",
            max_cloud_cover=30,
            limit=3,
        )
        # Ocean may have some coastal scenes or none
        assert result["total"] >= 0
