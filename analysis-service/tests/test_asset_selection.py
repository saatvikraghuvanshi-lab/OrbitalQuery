"""Unit tests for STAC asset selection logic."""

import pytest

from app.services.stac_service import select_best_asset, get_asset_href


class TestAssetSelection:
    """Test asset selection from STAC item assets."""

    def test_select_visual_asset_in_preview_mode(self):
        """Should prefer 'visual' asset in preview mode."""
        assets = {
            "B02": {"href": "https://example.com/B02.tif"},
            "B03": {"href": "https://example.com/B03.tif"},
            "B04": {"href": "https://example.com/B04.tif"},
            "visual": {"href": "https://example.com/visual.tif"},
        }
        key, asset = select_best_asset(assets, mode="preview")
        assert key == "visual"
        assert asset["href"] == "https://example.com/visual.tif"

    def test_select_raster_band_in_analysis_mode(self):
        """Should prefer raster band in analysis mode."""
        assets = {
            "B02": {"href": "https://example.com/B02.tif"},
            "B04": {"href": "https://example.com/B04.tif"},
            "visual": {"href": "https://example.com/visual.tif"},
        }
        key, asset = select_best_asset(assets, mode="analysis")
        assert key == "B04"
        assert "B04" in asset["href"]

    def test_select_rendered_preview_in_preview_mode(self):
        """Should prefer 'rendered_preview' in preview mode."""
        assets = {
            "B02": {"href": "https://example.com/B02.tif"},
            "rendered_preview": {"href": "https://example.com/rendered.jpg"},
        }
        key, asset = select_best_asset(assets, mode="preview")
        assert key == "rendered_preview"

    def test_select_raster_band_no_visual(self):
        """Should select raster band even without visual asset."""
        assets = {
            "B02": {"href": "https://example.com/B02.tif"},
            "B08": {"href": "https://example.com/B08.tif"},
        }
        key, asset = select_best_asset(assets, mode="analysis")
        assert key == "B08"

    def test_select_preferred_band(self):
        """Should select a specific band when preferred_bands is given."""
        assets = {
            "B02": {"href": "https://example.com/B02.tif"},
            "B04": {"href": "https://example.com/B04.tif"},
            "B08": {"href": "https://example.com/B08.tif"},
        }
        key, asset = select_best_asset(assets, preferred_bands=["B08"])
        assert key == "B08"

    def test_preferred_band_not_found_fallback(self):
        """When preferred band not in assets, fall back to priority list."""
        assets = {
            "B02": {"href": "https://example.com/B02.tif"},
            "B04": {"href": "https://example.com/B04.tif"},
        }
        key, asset = select_best_asset(assets, preferred_bands=["B12"], mode="analysis")
        # Should fall back to B04 (analysis priority)
        assert key == "B04"

    def test_fallback_to_first_asset(self):
        """With no preferred band and no visual assets, use first."""
        assets = {
            "SAR": {"href": "https://example.com/sar.tif"},
            "metadata": {"href": "https://example.com/meta.json"},
        }
        key, asset = select_best_asset(assets)
        assert key in assets

    def test_empty_assets_raises(self):
        """Empty assets dict should raise ValueError."""
        with pytest.raises(ValueError, match="No assets"):
            select_best_asset({})

    def test_single_asset(self):
        """Only one asset — should return it."""
        assets = {"quicklook": {"href": "https://example.com/thumb.jpg"}}
        key, asset = select_best_asset(assets)
        assert key == "quicklook"


class TestAssetHref:
    """Test href extraction from assets."""

    def test_basic_href(self):
        asset = {"href": "https://example.com/file.tif"}
        assert get_asset_href(asset) == "https://example.com/file.tif"

    def test_missing_href(self):
        asset = {"type": "image/tiff"}
        assert get_asset_href(asset) == ""

    def test_signed_href(self):
        """Planetary Computer may add signed URL."""
        asset = {
            "href": "https://example.com/file.tif?token=abc",
            "type": "image/tiff",
        }
        href = get_asset_href(asset)
        assert "token=abc" in href
