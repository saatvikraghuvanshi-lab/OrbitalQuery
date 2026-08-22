"""
EO Provider Abstraction Layer.

Defines a common interface for accessing Earth Observation data from
multiple providers (Planetary Computer, Copernicus CDSE, Bhoonidhi/ISRO, etc.).

Architecture:
  EOProvider (interface)
    ├── PlanetaryComputerProvider (implemented)
    ├── CopernicusProvider (placeholder)
    ├── BhoonidhiProvider (placeholder)
    └── MockProvider (testing)

The analysis engine operates against the common EOProvider interface.
Provider-specific authentication, URL signing, and API behavior remain
inside each provider implementation.

CRITICAL RULE:
  The analysis engine must NEVER import planetary_computer, pystac_client,
  or any provider-specific library directly. All access goes through
  the provider interface.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════
# Common data types
# ══════════════════════════════════════════════════════════════════

@dataclass
class ProviderCapabilities:
    """What a provider supports."""

    name: str
    supports_stac: bool = True
    supports_cloud_hosted: bool = True
    supports_signed_urls: bool = True
    collections: list[str] = field(default_factory=list)
    max_bbox_area_deg2: float = 100.0
    notes: str = ""


@dataclass
class SearchResult:
    """Standardized search result across providers."""

    items: list[dict[str, Any]]
    total: int
    provider: str
    collection: str
    search_params: dict[str, Any]


@dataclass
class ItemDetail:
    """Standardized item detail across providers."""

    item_id: str
    collection: str
    bbox: list[float]
    geometry: dict[str, Any]
    properties: dict[str, Any]
    assets: dict[str, dict[str, Any]]
    provider: str
    signed: bool = False


# ══════════════════════════════════════════════════════════════════
# Abstract Provider Interface
# ══════════════════════════════════════════════════════════════════

class EOProvider(ABC):
    """
    Abstract base class for Earth Observation data providers.

    Every provider must implement these methods so the analysis engine
    can access EO data without knowing the underlying API details.
    """

    @abstractmethod
    def get_name(self) -> str:
        """Return the provider name (e.g. 'planetary_computer')."""
        ...

    @abstractmethod
    def search(
        self,
        collection: str,
        bbox: Optional[list[float]] = None,
        datetime: Optional[str] = None,
        max_cloud_cover: Optional[int] = None,
        limit: int = 10,
        query: Optional[dict[str, Any]] = None,
    ) -> SearchResult:
        """
        Search for STAC items matching the given parameters.

        Args:
            collection: STAC collection ID
            bbox: [west, south, east, north]
            datetime: ISO 8601 interval (e.g. '2024-01-01/2024-06-30')
            max_cloud_cover: Maximum cloud cover percentage
            limit: Maximum number of results
            query: Additional STAC query extension filters

        Returns:
            SearchResult with signed items
        """
        ...

    @abstractmethod
    def get_item(self, collection: str, item_id: str) -> Optional[ItemDetail]:
        """
        Get a single STAC item by ID.

        Returns None if not found.
        """
        ...

    @abstractmethod
    def get_assets(self, item: dict[str, Any]) -> dict[str, dict[str, Any]]:
        """
        Extract and return assets from a STAC item dict.

        Assets should be signed if the provider supports it.
        """
        ...

    @abstractmethod
    def get_asset_href(self, asset: dict[str, Any]) -> str:
        """
        Get the accessible href from a STAC asset.

        Handles signing, proxying, or URL transformation as needed.
        """
        ...

    @abstractmethod
    def get_capabilities(self) -> ProviderCapabilities:
        """Return what this provider supports."""
        ...

    @abstractmethod
    def get_metadata(self, item: dict[str, Any]) -> dict[str, Any]:
        """
        Extract standardized metadata from a STAC item.

        Returns a dict with common fields:
        - item_id, collection, datetime, cloud_cover, bbox, platform, etc.
        """
        ...

    @abstractmethod
    def is_reachable(self) -> bool:
        """Check if the provider API is reachable."""
        ...


# ══════════════════════════════════════════════════════════════════
# Planetary Computer Provider
# ══════════════════════════════════════════════════════════════════

class PlanetaryComputerProvider(EOProvider):
    """
    Microsoft Planetary Computer STAC API provider.

    Handles:
    - STAC search via pystac-client
    - URL signing via planetary-computer
    - Asset selection and metadata extraction
    """

    def __init__(self, api_url: Optional[str] = None):
        self._api_url = api_url or "https://planetarycomputer.microsoft.com/api/stac/v1"
        self._client = None

    def _get_client(self):
        """Lazy-init STAC client."""
        if self._client is None:
            import planetary_computer as pc
            from pystac_client import Client
            self._client = Client.open(self._api_url, modifier=pc.sign_inplace)
            logger.info("[PlanetaryComputer] Connected to %s", self._api_url)
        return self._client

    def get_name(self) -> str:
        return "planetary_computer"

    def search(
        self,
        collection: str,
        bbox: Optional[list[float]] = None,
        datetime: Optional[str] = None,
        max_cloud_cover: Optional[int] = None,
        limit: int = 10,
        query: Optional[dict[str, Any]] = None,
    ) -> SearchResult:
        client = self._get_client()

        search_kwargs: dict[str, Any] = {
            "collections": [collection],
            "max_items": limit,
        }
        if bbox:
            search_kwargs["bbox"] = bbox
        if datetime:
            search_kwargs["datetime"] = datetime
        if max_cloud_cover is not None:
            search_kwargs["query"] = query or {}
            search_kwargs["query"]["eo:cloud_cover"] = {"lt": max_cloud_cover}
        if query:
            if "query" in search_kwargs:
                search_kwargs["query"].update(query)
            else:
                search_kwargs["query"] = query

        logger.info("[PlanetaryComputer] search: %s", {k: v for k, v in search_kwargs.items()})

        search_results = client.search(**search_kwargs)
        total = search_results.matched()
        items = list(search_results.items())

        import planetary_computer as pc
        signed_items = [pc.sign(item).to_dict() for item in items]

        return SearchResult(
            items=signed_items,
            total=total or len(signed_items),
            provider="planetary_computer",
            collection=collection,
            search_params=search_kwargs,
        )

    def get_item(self, collection: str, item_id: str) -> Optional[ItemDetail]:
        client = self._get_client()
        try:
            item = client.get_collection(collection).get_item(item_id)
            if item is None:
                return None
            import planetary_computer as pc
            signed = pc.sign(item)
            d = signed.to_dict()
            return ItemDetail(
                item_id=d.get("id", item_id),
                collection=d.get("collection", collection),
                bbox=d.get("bbox", []),
                geometry=d.get("geometry", {}),
                properties=d.get("properties", {}),
                assets=d.get("assets", {}),
                provider="planetary_computer",
                signed=True,
            )
        except Exception as e:
            logger.error("[PlanetaryComputer] get_item failed: %s", e)
            return None

    def get_assets(self, item: dict[str, Any]) -> dict[str, dict[str, Any]]:
        return item.get("assets", {})

    def get_asset_href(self, asset: dict[str, Any]) -> str:
        return asset.get("href", "")

    def get_capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(
            name="planetary_computer",
            supports_stac=True,
            supports_cloud_hosted=True,
            supports_signed_urls=True,
            collections=[
                "sentinel-2-l2a", "landsat-c2-l2", "sentinel-1-grd",
                "naip", "io-lulc-annual-v02",
            ],
            max_bbox_area_deg2=100.0,
            notes="Free tier, no auth required for search. Asset signing via planetary-computer.",
        )

    def get_metadata(self, item: dict[str, Any]) -> dict[str, Any]:
        props = item.get("properties", {})
        return {
            "item_id": item.get("id", ""),
            "collection": item.get("collection", ""),
            "datetime": props.get("datetime", ""),
            "cloud_cover": props.get("eo:cloud_cover"),
            "bbox": item.get("bbox", []),
            "platform": props.get("platform", ""),
            "instruments": props.get("instruments", []),
            "created": props.get("created", ""),
            "updated": props.get("updated", ""),
        }

    def is_reachable(self) -> bool:
        try:
            client = self._get_client()
            collections = list(client.get_collections())
            logger.info("[PlanetaryComputer] reachable, %d collections", len(collections))
            return True
        except Exception as e:
            logger.error("[PlanetaryComputer] unreachable: %s", e)
            return False


# ══════════════════════════════════════════════════════════════════
# Mock Provider (for testing)
# ══════════════════════════════════════════════════════════════════

class MockProvider(EOProvider):
    """
    Mock EO provider for unit testing.

    Returns deterministic results without network access.
    Configurable via the `items` parameter.
    """

    def __init__(
        self,
        items: Optional[list[dict[str, Any]]] = None,
        reachable: bool = True,
        name: str = "mock_provider",
    ):
        self._items = items or []
        self._reachable = reachable
        self._name = name
        self._search_calls: list[dict[str, Any]] = []

    @property
    def search_calls(self) -> list[dict[str, Any]]:
        """Return all search calls made (for assertion in tests)."""
        return self._search_calls

    def get_name(self) -> str:
        return self._name

    def search(
        self,
        collection: str,
        bbox: Optional[list[float]] = None,
        datetime: Optional[str] = None,
        max_cloud_cover: Optional[int] = None,
        limit: int = 10,
        query: Optional[dict[str, Any]] = None,
    ) -> SearchResult:
        self._search_calls.append({
            "collection": collection,
            "bbox": bbox,
            "datetime": datetime,
            "max_cloud_cover": max_cloud_cover,
            "limit": limit,
            "query": query,
        })

        # Filter items by collection
        filtered = [i for i in self._items if i.get("collection") == collection]

        # Filter by cloud cover if specified
        if max_cloud_cover is not None:
            filtered = [
                i for i in filtered
                if (i.get("properties", {}).get("eo:cloud_cover", 0) or 0) < max_cloud_cover
            ]

        # Apply limit
        result_items = filtered[:limit]

        return SearchResult(
            items=result_items,
            total=len(filtered),
            provider=self._name,
            collection=collection,
            search_params={
                "collection": collection, "bbox": bbox,
                "datetime": datetime, "max_cloud_cover": max_cloud_cover,
                "limit": limit,
            },
        )

    def get_item(self, collection: str, item_id: str) -> Optional[ItemDetail]:
        for item in self._items:
            if item.get("id") == item_id and item.get("collection") == collection:
                return ItemDetail(
                    item_id=item.get("id", ""),
                    collection=item.get("collection", ""),
                    bbox=item.get("bbox", []),
                    geometry=item.get("geometry", {}),
                    properties=item.get("properties", {}),
                    assets=item.get("assets", {}),
                    provider=self._name,
                    signed=False,
                )
        return None

    def get_assets(self, item: dict[str, Any]) -> dict[str, dict[str, Any]]:
        return item.get("assets", {})

    def get_asset_href(self, asset: dict[str, Any]) -> str:
        return asset.get("href", "")

    def get_capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(
            name=self._name,
            supports_stac=True,
            supports_cloud_hosted=False,
            supports_signed_urls=False,
            collections=["sentinel-2-l2a"],
            notes="Mock provider for testing",
        )

    def get_metadata(self, item: dict[str, Any]) -> dict[str, Any]:
        props = item.get("properties", {})
        return {
            "item_id": item.get("id", ""),
            "collection": item.get("collection", ""),
            "datetime": props.get("datetime", ""),
            "cloud_cover": props.get("eo:cloud_cover"),
            "bbox": item.get("bbox", []),
            "platform": props.get("platform", ""),
        }

    def is_reachable(self) -> bool:
        return self._reachable


# ══════════════════════════════════════════════════════════════════
# Provider Registry & Factory
# ══════════════════════════════════════════════════════════════════

_providers: dict[str, EOProvider] = {}
_default_provider_name: str = "planetary_computer"


def register_provider(provider: EOProvider, default: bool = False) -> None:
    """Register an EO provider."""
    name = provider.get_name()
    _providers[name] = provider
    if default:
        global _default_provider_name
        _default_provider_name = name
    logger.info("[provider-registry] Registered: %s (default=%s)", name, default)


def get_provider(name: Optional[str] = None) -> EOProvider:
    """
    Get a registered provider by name, or the default provider.

    Raises KeyError if the named provider is not registered.
    """
    target = name or _default_provider_name
    if target not in _providers:
        available = sorted(_providers.keys())
        raise KeyError(
            f"Provider '{target}' not registered. Available: {available}"
        )
    return _providers[target]


def get_default_provider() -> EOProvider:
    """Get the default provider."""
    return get_provider(_default_provider_name)


def list_providers() -> list[dict[str, Any]]:
    """List all registered providers with their capabilities."""
    result = []
    for name, provider in _providers.items():
        caps = provider.get_capabilities()
        result.append({
            "name": name,
            "is_default": name == _default_provider_name,
            "supports_stac": caps.supports_stac,
            "supports_cloud_hosted": caps.supports_cloud_hosted,
            "supports_signed_urls": caps.supports_signed_urls,
            "collections": caps.collections,
            "notes": caps.notes,
        })
    return result


def init_default_provider(api_url: Optional[str] = None) -> EOProvider:
    """
    Initialize and register the default Planetary Computer provider.

    Call this once at application startup.
    """
    provider = PlanetaryComputerProvider(api_url=api_url)
    register_provider(provider, default=True)
    return provider
