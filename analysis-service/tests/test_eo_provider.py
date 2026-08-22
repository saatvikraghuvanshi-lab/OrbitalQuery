"""
Tests for Stage 12 — EO Provider Abstraction.

Tests:
- MockProvider search, get_item, get_assets, get_capabilities, get_metadata
- Provider registry (register, get, list, default)
- stac_service backward compatibility (delegates to provider)
- Edge cases (empty results, unreachable, unknown provider)
"""

from __future__ import annotations

import pytest
from typing import Any

from app.services.eo_provider import (
    EOProvider,
    PlanetaryComputerProvider,
    MockProvider,
    ProviderCapabilities,
    SearchResult,
    ItemDetail,
    register_provider,
    get_provider,
    get_default_provider,
    list_providers,
    _providers,
    _default_provider_name,
)


# ══════════════════════════════════════════════════════════════════
# Fixtures
# ══════════════════════════════════════════════════════════════════

@pytest.fixture
def sample_items():
    """Sample STAC items for testing."""
    return [
        {
            "id": "S2A_MSIL2A_20240301_N0510_R022_T43QFA_20240301T123456",
            "collection": "sentinel-2-l2a",
            "bbox": [75.7, 26.8, 75.9, 27.0],
            "geometry": {"type": "Polygon", "coordinates": [[[75.7, 26.8], [75.9, 26.8], [75.9, 27.0], [75.7, 27.0], [75.7, 26.8]]]},
            "properties": {
                "datetime": "2024-03-01T12:00:00Z",
                "eo:cloud_cover": 5.2,
                "platform": "sentinel-2a",
                "instruments": ["msi"],
            },
            "assets": {
                "B04": {"href": "https://example.com/B04.tif", "type": "image/tiff"},
                "B08": {"href": "https://example.com/B08.tif", "type": "image/tiff"},
                "visual": {"href": "https://example.com/visual.jpg", "type": "image/jpeg"},
            },
        },
        {
            "id": "S2A_MSIL2A_20240315_N0510_R022_T43QFA_20240315T123456",
            "collection": "sentinel-2-l2a",
            "bbox": [75.7, 26.8, 75.9, 27.0],
            "geometry": {"type": "Polygon", "coordinates": [[[75.7, 26.8], [75.9, 26.8], [75.9, 27.0], [75.7, 27.0], [75.7, 26.8]]]},
            "properties": {
                "datetime": "2024-03-15T12:00:00Z",
                "eo:cloud_cover": 42.0,
                "platform": "sentinel-2a",
                "instruments": ["msi"],
            },
            "assets": {
                "B04": {"href": "https://example.com/B04_2.tif", "type": "image/tiff"},
                "B08": {"href": "https://example.com/B08_2.tif", "type": "image/tiff"},
            },
        },
        {
            "id": "LC08_L2_001020_20240310",
            "collection": "landsat-c2-l2",
            "bbox": [75.5, 26.5, 76.0, 27.0],
            "geometry": {"type": "Polygon", "coordinates": []},
            "properties": {
                "datetime": "2024-03-10T06:00:00Z",
                "eo:cloud_cover": 12.0,
                "platform": "landsat-8",
                "instruments": ["oli"],
            },
            "assets": {
                "B4": {"href": "https://example.com/L8_B4.tif", "type": "image/tiff"},
            },
        },
    ]


@pytest.fixture
def mock_provider(sample_items):
    """Create a MockProvider with sample data."""
    return MockProvider(items=sample_items)


# ══════════════════════════════════════════════════════════════════
# SECTION 1: MockProvider functionality
# ══════════════════════════════════════════════════════════════════

class TestMockProvider:
    def test_get_name(self, mock_provider):
        assert mock_provider.get_name() == "mock_provider"

    def test_search_returns_items(self, mock_provider):
        result = mock_provider.search(collection="sentinel-2-l2a", limit=10)
        assert len(result.items) == 2
        assert result.total == 2
        assert result.provider == "mock_provider"

    def test_search_filters_by_collection(self, mock_provider):
        result = mock_provider.search(collection="landsat-c2-l2")
        assert len(result.items) == 1
        assert result.items[0]["id"] == "LC08_L2_001020_20240310"

    def test_search_filters_by_cloud_cover(self, mock_provider):
        result = mock_provider.search(
            collection="sentinel-2-l2a", max_cloud_cover=20
        )
        # Only the 5.2% cloud scene passes (< 20)
        assert len(result.items) == 1
        assert result.items[0]["properties"]["eo:cloud_cover"] == 5.2

    def test_search_applies_limit(self, mock_provider):
        result = mock_provider.search(collection="sentinel-2-l2a", limit=1)
        assert len(result.items) == 1

    def test_search_records_calls(self, mock_provider):
        mock_provider.search(collection="sentinel-2-l2a", bbox=[75, 26, 76, 27])
        mock_provider.search(collection="landsat-c2-l2")
        assert len(mock_provider.search_calls) == 2
        assert mock_provider.search_calls[0]["bbox"] == [75, 26, 76, 27]

    def test_search_empty_collection(self, mock_provider):
        result = mock_provider.search(collection="nonexistent")
        assert result.items == []
        assert result.total == 0

    def test_get_item_found(self, mock_provider):
        item = mock_provider.get_item("sentinel-2-l2a", mock_provider._items[0]["id"])
        assert item is not None
        assert item.item_id == mock_provider._items[0]["id"]
        assert item.collection == "sentinel-2-l2a"

    def test_get_item_not_found(self, mock_provider):
        item = mock_provider.get_item("sentinel-2-l2a", "nonexistent")
        assert item is None

    def test_get_assets(self, mock_provider):
        assets = mock_provider.get_assets(mock_provider._items[0])
        assert "B04" in assets
        assert "B08" in assets

    def test_get_assets_empty(self, mock_provider):
        assets = mock_provider.get_assets({})
        assert assets == {}

    def test_get_asset_href(self, mock_provider):
        href = mock_provider.get_asset_href({"href": "https://example.com/B04.tif"})
        assert href == "https://example.com/B04.tif"

    def test_get_capabilities(self, mock_provider):
        caps = mock_provider.get_capabilities()
        assert caps.name == "mock_provider"
        assert caps.supports_stac is True
        assert caps.supports_cloud_hosted is False

    def test_get_metadata(self, mock_provider):
        meta = mock_provider.get_metadata(mock_provider._items[0])
        assert meta["item_id"] == mock_provider._items[0]["id"]
        assert meta["cloud_cover"] == 5.2
        assert meta["platform"] == "sentinel-2a"

    def test_is_reachable(self, mock_provider):
        assert mock_provider.is_reachable() is True

    def test_unreachable_provider(self):
        provider = MockProvider(reachable=False)
        assert provider.is_reachable() is False

    def test_implements_interface(self, mock_provider):
        assert isinstance(mock_provider, EOProvider)


# ══════════════════════════════════════════════════════════════════
# SECTION 2: Data types
# ══════════════════════════════════════════════════════════════════

class TestDataTypes:
    def test_search_result(self):
        sr = SearchResult(
            items=[], total=0, provider="test", collection="c", search_params={}
        )
        assert sr.items == []
        assert sr.provider == "test"

    def test_item_detail(self):
        id = ItemDetail(
            item_id="x", collection="c", bbox=[0, 0, 1, 1],
            geometry={}, properties={}, assets={}, provider="test"
        )
        assert id.item_id == "x"
        assert id.signed is False

    def test_provider_capabilities(self):
        caps = ProviderCapabilities(name="test", collections=["a", "b"])
        assert caps.supports_stac is True
        assert len(caps.collections) == 2


# ══════════════════════════════════════════════════════════════════
# SECTION 3: Provider Registry
# ══════════════════════════════════════════════════════════════════

class TestProviderRegistry:
    def setup_method(self):
        """Clear registry before each test."""
        _providers.clear()

    def test_register_and_get(self):
        provider = MockProvider(name="test_reg")
        register_provider(provider, default=True)
        got = get_provider("test_reg")
        assert got.get_name() == "test_reg"

    def test_get_default(self):
        provider = MockProvider(name="test_default")
        register_provider(provider, default=True)
        got = get_default_provider()
        assert got.get_name() == "test_default"

    def test_get_unknown_raises(self):
        with pytest.raises(KeyError, match="not registered"):
            get_provider("nonexistent")

    def test_list_providers(self):
        register_provider(MockProvider(name="p1"))
        register_provider(MockProvider(name="p2"), default=True)
        result = list_providers()
        assert len(result) == 2
        names = [p["name"] for p in result]
        assert "p1" in names
        assert "p2" in names

    def test_default_flag(self):
        register_provider(MockProvider(name="a"))
        register_provider(MockProvider(name="b"), default=True)
        result = list_providers()
        b = [p for p in result if p["name"] == "b"][0]
        assert b["is_default"] is True
        a = [p for p in result if p["name"] == "a"][0]
        assert a["is_default"] is False

    def test_override_default(self):
        register_provider(MockProvider(name="first"), default=True)
        register_provider(MockProvider(name="second"), default=True)
        got = get_default_provider()
        assert got.get_name() == "second"


# ══════════════════════════════════════════════════════════════════
# SECTION 4: stac_service backward compatibility
# ══════════════════════════════════════════════════════════════════

class TestStacServiceCompat:
    def setup_method(self):
        _providers.clear()

    def test_search_stac_delegates(self, sample_items):
        provider = MockProvider(items=sample_items)
        register_provider(provider, default=True)

        from app.services.stac_service import search_stac
        result = search_stac(
            collection="sentinel-2-l2a",
            bbox=[75.7, 26.8, 75.9, 27.0],
            max_cloud_cover=20,
            limit=5,
        )
        assert len(result["items"]) == 1
        assert result["total"] == 1
        assert len(provider.search_calls) == 1

    def test_get_item_assets_delegates(self, sample_items):
        provider = MockProvider(items=sample_items)
        register_provider(provider, default=True)

        from app.services.stac_service import get_item_assets
        assets = get_item_assets(sample_items[0])
        assert "B04" in assets

    def test_check_stac_api_reachable(self, sample_items):
        provider = MockProvider(items=sample_items)
        register_provider(provider, default=True)

        from app.services.stac_service import check_stac_api_reachable
        assert check_stac_api_reachable() is True

    def test_check_stac_api_unreachable(self):
        provider = MockProvider(reachable=False)
        register_provider(provider, default=True)

        from app.services.stac_service import check_stac_api_reachable
        assert check_stac_api_reachable() is False

    def test_select_best_asset_unchanged(self, sample_items):
        from app.services.stac_service import select_best_asset
        assets = sample_items[0]["assets"]
        key, asset = select_best_asset(assets, preferred_bands=["B08"])
        assert key == "B08"

    def test_select_best_asset_preview_mode(self, sample_items):
        from app.services.stac_service import select_best_asset
        assets = sample_items[0]["assets"]
        key, asset = select_best_asset(assets, mode="preview")
        assert key == "visual"


# ══════════════════════════════════════════════════════════════════
# SECTION 5: Provider is真正的 ABC
# ══════════════════════════════════════════════════════════════════

class TestProviderABC:
    def test_cannot_instantiate_directly(self):
        with pytest.raises(TypeError):
            EOProvider()

    def test_mock_provider_is_subclass(self):
        assert issubclass(MockProvider, EOProvider)

    def test_planetary_provider_is_subclass(self):
        assert issubclass(PlanetaryComputerProvider, EOProvider)
