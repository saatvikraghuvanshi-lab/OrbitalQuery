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
# Item Normalization
# ══════════════════════════════════════════════════════════════════

def normalize_stac_item(item: dict[str, Any], provider: str = "unknown") -> dict[str, Any]:
    """
    Normalize a STAC-like item from any provider to a common format.

    Ensures these fields are always present:
    - id: string
    - collection: string
    - bbox: list[float] (4 elements)
    - geometry: dict (GeoJSON)
    - properties.datetime: ISO string
    - properties.eo:cloud_cover: float or None
    - properties.platform: string
    - assets: dict
    - provider: string (which provider returned this)
    """
    props = item.get("properties", {})
    assets = item.get("assets", {})

    # Normalize datetime
    dt = props.get("datetime", "")
    if not dt:
        dt = props.get("time_start", props.get("acquisition_date", ""))

    # Normalize cloud cover
    cloud = props.get("eo:cloud_cover", props.get("cloud_cover", None))

    # Normalize platform
    platform = props.get("platform", "unknown")

    # Normalize bbox
    bbox = item.get("bbox", [])
    if not bbox or len(bbox) != 4:
        bbox = [0, 0, 0, 0]

    # Normalize geometry
    geometry = item.get("geometry", {})
    if not geometry or "type" not in geometry:
        geometry = {
            "type": "Polygon",
            "coordinates": [[
                [bbox[0], bbox[1]], [bbox[2], bbox[1]],
                [bbox[2], bbox[3]], [bbox[0], bbox[3]],
                [bbox[0], bbox[1]],
            ]]
        }

    # Normalize assets — ensure href is always accessible
    norm_assets = {}
    for key, asset in assets.items():
        if isinstance(asset, dict):
            norm_assets[key] = {
                "href": asset.get("href", ""),
                "type": asset.get("type", "application/octet-stream"),
                "title": asset.get("title", key),
            }

    # Build normalized item
    return {
        "id": item.get("id", "unknown"),
        "collection": item.get("collection", "unknown"),
        "bbox": bbox,
        "geometry": geometry,
        "properties": {
            "datetime": dt,
            "eo:cloud_cover": cloud,
            "platform": platform,
            "instruments": props.get("instruments", []),
            "title": props.get("title", item.get("id", "unknown")),
        },
        "assets": norm_assets,
        "provider": provider,
        "links": item.get("links", []),
    }


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
# Copernicus Data Space Ecosystem Provider
# ══════════════════════════════════════════════════════════════════

# CDSE STAC collection IDs use a different naming convention than Planetary Computer.
# This map translates common names → CDSE collection IDs.
CDSE_COLLECTION_MAP: dict[str, str] = {
    # CDSE STAC endpoint uses CCM collection names
    # For Sentinel-2 data, use Planetary Computer or AWS Earth Search
    "sentinel-2-l2a": "ccm-optical",
    "sentinel-2-l1c": "ccm-optical",
    "sentinel-1-grd": "ccm-sar",
}

# CDSE uses different asset key naming.
CDSE_ASSET_MAP: dict[str, dict[str, str]] = {
    "SENTINEL-2": {
        "B01": "B01", "B02": "B02", "B03": "B03", "B04": "B04",
        "B05": "B05", "B06": "B06", "B07": "B07", "B08": "B08",
        "B8A": "B8A", "B09": "B09", "B11": "B11", "B12": "B12",
        "SCL": "SCL", "AOT": "AOT", "WVP": "WVP",
    },
    "SENTINEL-1": {
        "vv": "VV", "vh": "VH",
    },
}


class CopernicusProvider(EOProvider):
    """
    Copernicus Data Space Ecosystem (CDSE) STAC API provider.

    Uses the current documented STAC endpoint:
    https://stac.dataspace.copernicus.eu/v1/

    DO NOT use deprecated SciHub/Open Access Hub interfaces.

    Handles:
    - STAC search via pystac-client
    - Collection ID translation (CDSE uses different names)
    - Asset key normalization
    - Metadata extraction from CDSE-specific properties
    """

    def __init__(self, api_url: Optional[str] = None, token: Optional[str] = None):
        self._api_url = api_url or "https://stac.dataspace.copernicus.eu/v1/"
        self._token = token  # Optional Bearer token for authenticated access
        self._client = None

    def _get_client(self):
        """Lazy-init STAC client."""
        if self._client is None:
            from pystac_client import Client
            headers = {}
            if self._token:
                headers["Authorization"] = f"Bearer {self._token}"
            self._client = Client.open(
                self._api_url,
                headers=headers if headers else None,
            )
            logger.info("[Copernicus] Connected to %s", self._api_url)
        return self._client

    def _map_collection(self, collection: str) -> str:
        """Translate OrbitalQuery collection name → CDSE collection ID."""
        return CDSE_COLLECTION_MAP.get(collection, collection)

    def _normalize_assets(
        self, assets: dict[str, dict], collection: str
    ) -> dict[str, dict]:
        """
        Normalize CDSE asset keys to match OrbitalQuery conventions.

        CDSE may use different key names (e.g. uppercase VH vs lowercase vh).
        We normalize to lowercase keys for consistency with the analysis engine.
        """
        normalized = {}
        asset_map = CDSE_ASSET_MAP.get(collection, {})

        for key, asset in assets.items():
            # Try to find a normalized name
            normalized_key = key
            for our_name, cdse_name in asset_map.items():
                if key.upper() == cdse_name.upper():
                    normalized_key = our_name
                    break

            normalized[normalized_key] = asset

        return normalized

    def get_name(self) -> str:
        return "copernicus_cdse"

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
        cdse_collection = self._map_collection(collection)

        search_kwargs: dict[str, Any] = {
            "collections": [cdse_collection],
            "max_items": limit,
        }
        if bbox:
            search_kwargs["bbox"] = bbox
        if datetime:
            search_kwargs["datetime"] = datetime
        if max_cloud_cover is not None:
            # CDSE STAC supports query extension for cloud cover
            search_kwargs["query"] = query or {}
            search_kwargs["query"]["eo:cloud_cover"] = {"lt": max_cloud_cover}
        if query:
            if "query" in search_kwargs:
                search_kwargs["query"].update(query)
            else:
                search_kwargs["query"] = query

        logger.info(
            "[Copernicus] search: collection=%s (cdse=%s) params=%s",
            collection, cdse_collection,
            {k: v for k, v in search_kwargs.items()},
        )

        search_results = client.search(**search_kwargs)
        total = search_results.matched()
        items = list(search_results.items())

        # Normalize items to OrbitalQuery schema
        normalized_items = []
        for item in items:
            d = item.to_dict() if hasattr(item, "to_dict") else item
            # Normalize collection name back to OrbitalQuery convention
            d["collection"] = collection
            # Normalize assets
            d["assets"] = self._normalize_assets(d.get("assets", {}), cdse_collection)
            normalized_items.append(d)

        return SearchResult(
            items=normalized_items,
            total=total or len(normalized_items),
            provider="copernicus_cdse",
            collection=collection,
            search_params=search_kwargs,
        )

    def get_item(self, collection: str, item_id: str) -> Optional[ItemDetail]:
        client = self._get_client()
        cdse_collection = self._map_collection(collection)
        try:
            item = client.get_collection(cdse_collection).get_item(item_id)
            if item is None:
                return None
            d = item.to_dict() if hasattr(item, "to_dict") else item
            d["collection"] = collection
            d["assets"] = self._normalize_assets(d.get("assets", {}), cdse_collection)
            return ItemDetail(
                item_id=d.get("id", item_id),
                collection=collection,
                bbox=d.get("bbox", []),
                geometry=d.get("geometry", {}),
                properties=d.get("properties", {}),
                assets=d.get("assets", {}),
                provider="copernicus_cdse",
                signed=False,
            )
        except Exception as e:
            logger.error("[Copernicus] get_item failed: %s", e)
            return None

    def get_assets(self, item: dict[str, Any]) -> dict[str, dict[str, Any]]:
        return item.get("assets", {})

    def get_asset_href(self, asset: dict[str, Any]) -> str:
        return asset.get("href", "")

    def get_capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(
            name="copernicus_cdse",
            supports_stac=True,
            supports_cloud_hosted=True,
            supports_signed_urls=False,
            collections=[
                "ccm-optical", "ccm-sar",
                # Sentinel data available via OData API, not STAC:
                # "sentinel-2-l2a", "sentinel-1-grd"
            ],
            max_bbox_area_deg2=100.0,
            notes=(
                "Copernicus Data Space Ecosystem. "
                "STAC endpoint has CCM collections only. "
                "Sentinel-2/1 data available via OData catalogue API. "
                "For Sentinel data, prefer Planetary Computer or AWS Earth Search."
            ),
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
            logger.info("[Copernicus] reachable, %d collections", len(collections))
            return True
        except Exception as e:
            logger.error("[Copernicus] unreachable: %s", e)
            return False


# ══════════════════════════════════════════════════════════════════
# Bhoonidhi / ISRO Provider
# ══════════════════════════════════════════════════════════════════

# Bhoonidhi collection IDs use ISRO naming conventions.
# This map translates common OrbitalQuery names → Bhoonidhi collection IDs.
BHOONIDHI_COLLECTION_MAP: dict[str, str] = {
    "sentinel-1-grd": "Sentinel-1A_SAR-IW_GRD",
    "sentinel-1-slc": "Sentinel-1A_SAR-IW_SLC",
    # Indian satellite collections
    "resourcesat-2-awifs": "ResourceSat-2_AWIFS_L2",
    "resourcesat-2-liss3": "ResourceSat-2_LISS3_L2",
    "resourcesat-2-liss4": "ResourceSat-2_LISS4-MX70_L2",
    "eos-04-sar": "EOS-04_SAR-MRS_L2A",
    "eos-06-ocm": "EOS-06_OCM-LAC_L1C",
    "nisar": "NISAR_SSAR_GCOV",
    "cartosat": "CartoSat-1_PAN_CartoDEM_30m",
    "novasar": "Novasar-1_AIS",
}

# Reverse map for normalizing Bhoonidhi collection → OrbitalQuery name
BHOONIDHI_REVERSE_MAP: dict[str, str] = {v: k for k, v in BHOONIDHI_COLLECTION_MAP.items()}

# OrbitalQuery collection → Bhoonidhi collection (for search)
# Most common: sentinel-2 is NOT on Bhoonidhi, but S1 and ISRO satellites are
ORBITAL_TO_BHOONIDHI: dict[str, str] = {
    "sentinel-2-l2a": None,  # Not available on Bhoonidhi
    "sentinel-1-grd": "Sentinel-1A_SAR-IW_GRD",
    "sentinel-1-slc": "Sentinel-1A_SAR-IW_SLC",
}


class BhoonidhiProvider(EOProvider):
    """
    ISRO Bhoonidhi STAC API provider.

    Uses the official Bhoonidhi API:
    - Auth: POST https://bhoonidhi-api.nrsc.gov.in/auth/token (JWT)
    - Search: POST https://bhoonidhi-api.nrsc.gov.in/data/search (STAC-compatible)
    - Download: GET https://bhoonidhi-api.nrsc.gov.in/download?id=<id>&collection=<col>

    Environment variables required:
    - BHOONIDHI_USER: Bhoonidhi userId
    - BHOONIDHI_PASS: Bhoonidhi password

    Rate limits (from official docs):
    - Auth: 20 requests/hour/IP
    - Search: 3 requests/second/IP
    - Download: 3 concurrent per user/IP
    """

    AUTH_URL = "https://bhoonidhi-api.nrsc.gov.in/auth/token"
    SEARCH_URL = "https://bhoonidhi-api.nrsc.gov.in/data/search"
    COLLECTIONS_URL = "https://bhoonidhi-api.nrsc.gov.in/data/collections"
    DOWNLOAD_URL = "https://bhoonidhi-api.nrsc.gov.in/download"

    def __init__(
        self,
        user_id: Optional[str] = None,
        password: Optional[str] = None,
    ):
        import os
        self._user_id = user_id or os.environ.get("BHOONIDHI_USER", "")
        self._password = password or os.environ.get("BHOONIDHI_PASS", "")
        self._access_token: Optional[str] = None
        self._refresh_token: Optional[str] = None
        self._token_expiry: float = 0  # timestamp when token expires
        self._http = None  # lazy httpx client

    def _get_http(self):
        """Lazy-init httpx client."""
        if self._http is None:
            import httpx
            self._http = httpx.Client(timeout=30.0)
        return self._http

    def _authenticate(self) -> bool:
        """
        Authenticate and get JWT access token.

        Token validity: ~1200 seconds (20 minutes).
        We cache and refresh as needed.
        """
        import time

        # Check if current token is still valid (with 60s buffer)
        if self._access_token and time.time() < self._token_expiry - 60:
            return True

        # Try refresh first
        if self._refresh_token:
            try:
                return self._do_token_request({
                    "userId": self._user_id,
                    "refresh_token": self._refresh_token,
                    "grant_type": "refresh_token",
                })
            except Exception as e:
                logger.warning("[Bhoonidhi] Refresh failed, trying password auth: %s", e)

        # Full password authentication
        if not self._user_id or not self._password:
            logger.error("[Bhoonidhi] No credentials — set BHOONIDHI_USER and BHOONIDHI_PASS")
            return False

        try:
            return self._do_token_request({
                "userId": self._user_id,
                "password": self._password,
                "grant_type": "password",
            })
        except Exception as e:
            logger.error("[Bhoonidhi] Auth failed: %s", e)
            return False

    def _do_token_request(self, payload: dict) -> bool:
        """Send token request and store credentials."""
        import time
        http = self._get_http()
        resp = http.post(self.AUTH_URL, json=payload)
        resp.raise_for_status()
        data = resp.json()

        self._access_token = data.get("access_token")
        self._refresh_token = data.get("refresh_token")
        expires_in = data.get("expires_in", 1200)
        self._token_expiry = time.time() + expires_in

        logger.info(
            "[Bhoonidhi] Authenticated, token expires in %ds",
            expires_in,
        )
        return bool(self._access_token)

    def _auth_headers(self) -> dict:
        """Return Authorization header with current token."""
        if not self._authenticate():
            raise RuntimeError("Bhoonidhi authentication failed — check BHOONIDHI_USER/BHOONIDHI_PASS")
        return {"Authorization": f"Bearer {self._access_token}"}

    def _map_collection(self, collection: str) -> str:
        """Translate OrbitalQuery collection name → Bhoonidhi collection ID."""
        mapped = ORBITAL_TO_BHOONIDHI.get(collection)
        if mapped:
            return mapped
        # Try direct Bhoonidhi collection ID (user might pass it directly)
        if collection in BHOONIDHI_COLLECTION_MAP.values():
            return collection
        return collection  # pass through, let the API decide

    def get_name(self) -> str:
        return "bhoonidhi"

    def search(
        self,
        collection: str,
        bbox: Optional[list[float]] = None,
        datetime: Optional[str] = None,
        max_cloud_cover: Optional[int] = None,
        limit: int = 10,
        query: Optional[dict[str, Any]] = None,
    ) -> SearchResult:
        http = self._get_http()
        headers = self._auth_headers()
        bhoonidhi_collection = self._map_collection(collection)

        # Bhoonidhi uses STAC-compatible POST search
        search_body: dict[str, Any] = {
            "collections": [bhoonidhi_collection],
            "limit": min(limit, 500),
        }

        if bbox:
            search_body["bbox"] = [float(b) for b in bbox]  # Bhoonidhi expects numeric array

        if datetime:
            search_body["datetime"] = datetime

        # NOTE: Bhoonidhi API does not support CQL2 filter syntax.
        # Cloud cover filtering is done client-side after results are returned.

        logger.info(
            "[Bhoonidhi] search: collection=%s (bhoonidhi=%s) params=%s",
            collection, bhoonidhi_collection,
            {k: v for k, v in search_body.items()},
        )

        resp = http.post(self.SEARCH_URL, json=search_body, headers=headers)
        resp.raise_for_status()
        data = resp.json()

        # Bhoonidhi returns STAC FeatureCollection
        features = data.get("features", [])
        context = data.get("context", {})
        total = context.get("returned", len(features))

        # Normalize items to OrbitalQuery convention
        normalized_items = []
        for feature in features:
            d = feature.copy()
            # Normalize collection back to OrbitalQuery name
            d["collection"] = collection
            # Ensure standard STAC structure
            if "properties" not in d:
                d["properties"] = {}
            normalized_items.append(d)

        return SearchResult(
            items=normalized_items,
            total=total,
            provider="bhoonidhi",
            collection=collection,
            search_params=search_body,
        )

    def get_item(self, collection: str, item_id: str) -> Optional[ItemDetail]:
        http = self._get_http()
        headers = self._auth_headers()
        bhoonidhi_collection = self._map_collection(collection)

        try:
            url = f"{self.COLLECTIONS_URL}/{bhoonidhi_collection}/items/{item_id}"
            resp = http.get(url, headers=headers)
            resp.raise_for_status()
            d = resp.json()

            # Normalize
            d["collection"] = collection
            if "properties" not in d:
                d["properties"] = {}

            return ItemDetail(
                item_id=d.get("id", item_id),
                collection=collection,
                bbox=d.get("bbox", []),
                geometry=d.get("geometry", {}),
                properties=d.get("properties", {}),
                assets=d.get("assets", {}),
                provider="bhoonidhi",
                signed=False,
            )
        except Exception as e:
            logger.error("[Bhoonidhi] get_item failed: %s", e)
            return None

    def get_assets(self, item: dict[str, Any]) -> dict[str, dict[str, Any]]:
        return item.get("assets", {})

    def get_asset_href(self, asset: dict[str, Any]) -> str:
        """
        Get download URL for a Bhoonidhi asset.

        Bhoonidhi uses a different download endpoint:
        GET /download?id=<item_id>&collection=<collection>

        The asset href from STAC may point to the download endpoint.
        We return it as-is since it's already a valid URL.
        """
        href = asset.get("href", "")
        # If href is empty, construct the download URL
        if not href:
            item_id = asset.get("id", "")
            collection = asset.get("collection", "")
            if item_id and collection:
                return f"{self.DOWNLOAD_URL}?id={item_id}&collection={collection}"
        return href

    def get_capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(
            name="bhoonidhi",
            supports_stac=True,
            supports_cloud_hosted=True,  # Products marked Online=Y
            supports_signed_urls=False,  # Uses JWT auth, not signed URLs
            collections=[
                "sentinel-1-grd", "sentinel-1-slc",
                "resourcesat-2-awifs", "resourcesat-2-liss3",
                "resourcesat-2-liss4", "eos-04-sar",
                "eos-06-ocm", "nisar", "cartosat", "novasar",
            ],
            max_bbox_area_deg2=100.0,
            notes=(
                "ISRO Bhoonidhi platform. Requires BHOONIDHI_USER/BHOONIDHI_PASS. "
                "Rate limits: 3 search/sec, 20 auth/hr. "
                "Unique collections: ResourceSat, EOS-04 SAR, EOS-06 OCM, NISAR, CartoSat. "
                "NOT available: Sentinel-2 (use Planetary Computer instead)."
            ),
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
            "online": props.get("Online", ""),
            "provider": "bhoonidhi",
        }

    def is_reachable(self) -> bool:
        """
        Check if Bhoonidhi API is reachable.

        Tries to authenticate (requires valid credentials).
        Returns False if no credentials configured.
        """
        if not self._user_id or not self._password:
            logger.warning("[Bhoonidhi] No credentials configured (BHOONIDHI_USER/BHOONIDHI_PASS)")
            return False
        try:
            return self._authenticate()
        except Exception as e:
            logger.error("[Bhoonidhi] unreachable: %s", e)
            return False

    def logout(self) -> bool:
        """Revoke the current session."""
        if not self._refresh_token:
            return True
        try:
            http = self._get_http()
            resp = http.post(
                "https://bhoonidhi-api.nrsc.gov.in/auth/logout",
                headers={"Authorization": f"Bearer {self._refresh_token}"},
            )
            resp.raise_for_status()
            self._access_token = None
            self._refresh_token = None
            self._token_expiry = 0
            logger.info("[Bhoonidhi] Logged out")
            return True
        except Exception as e:
            logger.error("[Bhoonidhi] Logout failed: %s", e)
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
# AWS Earth Search Provider
# ══════════════════════════════════════════════════════════════════

# AWS Earth Search collections mapped to OrbitalQuery names
AWS_COLLECTION_MAP: dict[str, str] = {
    "sentinel-2-l2a": "sentinel-2-l2a",
    "sentinel-2-l1c": "sentinel-2-l1c",
    "sentinel-1-grd": "sentinel-1-grd",
    "landsat-c2-l2": "landsat-c2-l2",
    "naip": "naip",
}


class AWSEarthSearchProvider(EOProvider):
    """
    AWS Earth Search STAC API provider.

    Free, no authentication required.
    Hosts Sentinel-2, Landsat, Sentinel-1, NAIP and more.
    Asset URLs are directly accessible (cloud-hosted on AWS S3).

    Endpoint: https://earth-search.aws.element84.com/v1
    """

    STAC_API = "https://earth-search.aws.element84.com/v1"

    def __init__(self, api_url: Optional[str] = None):
        self._api_url = api_url or self.STAC_API
        self._client = None

    def _get_client(self):
        """Lazy-init STAC client."""
        if self._client is None:
            from pystac_client import Client
            self._client = Client.open(self._api_url)
            logger.info("[AWSEarthSearch] Connected to %s", self._api_url)
        return self._client

    def _map_collection(self, collection: str) -> str:
        """Translate OrbitalQuery collection name → AWS collection ID."""
        return AWS_COLLECTION_MAP.get(collection, collection)

    def get_name(self) -> str:
        return "aws_earth_search"

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
        aws_collection = self._map_collection(collection)

        search_kwargs: dict[str, Any] = {
            "collections": [aws_collection],
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

        logger.info(
            "[AWSEarthSearch] search: collection=%s params=%s",
            aws_collection,
            {k: v for k, v in search_kwargs.items()},
        )

        search_results = client.search(**search_kwargs)
        total = search_results.matched()
        items = [item.to_dict() for item in search_results.items()]

        # Normalize collection back to OrbitalQuery name
        for item in items:
            item["collection"] = collection

        return SearchResult(
            items=items,
            total=total or len(items),
            provider="aws_earth_search",
            collection=collection,
            search_params=search_kwargs,
        )

    def get_item(self, collection: str, item_id: str) -> Optional[ItemDetail]:
        client = self._get_client()
        aws_collection = self._map_collection(collection)
        try:
            collection_obj = client.get_collection(aws_collection)
            item = collection_obj.get_item(item_id)
            if item is None:
                return None
            d = item.to_dict()
            d["collection"] = collection
            return ItemDetail(
                item_id=d.get("id", item_id),
                collection=collection,
                bbox=d.get("bbox", []),
                geometry=d.get("geometry", {}),
                properties=d.get("properties", {}),
                assets=d.get("assets", {}),
                provider="aws_earth_search",
                signed=False,
            )
        except Exception as e:
            logger.error("[AWSEarthSearch] get_item failed: %s", e)
            return None

    def get_assets(self, item: dict[str, Any]) -> dict[str, dict[str, Any]]:
        return item.get("assets", {})

    def get_asset_href(self, asset: dict[str, Any]) -> str:
        return asset.get("href", "")

    def get_capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(
            name="aws_earth_search",
            supports_stac=True,
            supports_cloud_hosted=True,
            supports_signed_urls=False,
            collections=[
                "sentinel-2-l2a", "sentinel-2-l1c",
                "sentinel-1-grd", "landsat-c2-l2",
                "naip",
            ],
            max_bbox_area_deg2=100.0,
            notes=(
                "AWS Earth Search — free, no auth required. "
                "Asset URLs are directly accessible on AWS S3. "
                "Good fallback when other providers are unavailable."
            ),
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
        }

    def is_reachable(self) -> bool:
        try:
            client = self._get_client()
            collections = list(client.get_collections())
            logger.info("[AWSEarthSearch] reachable, %d collections", len(collections))
            return True
        except Exception as e:
            logger.error("[AWSEarthSearch] unreachable: %s", e)
            return False


# ══════════════════════════════════════════════════════════════════
# NASA CMR Provider
# ══════════════════════════════════════════════════════════════════

# NASA CMR collection concept IDs for key datasets
NASA_CMR_COLLECTIONS: dict[str, dict[str, str]] = {
    # MODIS Vegetation
    "modis-terra-ndvi-16day-250m": {
        "concept_id": "C1748066515-LPCLOUD",
        "title": "MODIS/Terra Vegetation Indices 16-Day L3 Global 250m",
        "platform": "Terra",
        "instrument": "MODIS",
        "gsd": 250,
    },
    # VIIRS Active Fire
    "viirs-active-fire-375m": {
        "concept_id": "C3264430167-LANCEMODIS",
        "title": "VIIRS (NOAA-20) Active Fire 375m NRT",
        "platform": "NOAA-20",
        "instrument": "VIIRS",
        "gsd": 375,
    },
    # MODIS Snow Cover
    "modis-terra-snow-500m-daily": {
        "concept_id": "C2565093311-NSIDC_CPRD",
        "title": "MODIS/Terra Snow Cover Daily L3 Global 500m",
        "platform": "Terra",
        "instrument": "MODIS",
        "gsd": 500,
    },
    # Landsat HLS
    "landsat-hls": {
        "concept_id": "C2021957657-LPCLOUD",
        "title": "HLS Landsat Surface Reflectance",
        "platform": "Landsat",
        "instrument": "OLI",
        "gsd": 30,
    },
}


class NASACMRProvider(EOProvider):
    """
    NASA Common Metadata Repository provider.

    Uses the CMR search API (not STAC) for MODIS, VIIRS, and Landsat HLS data.
    No authentication required for search.

    Endpoint: https://cmr.earthdata.nasa.gov/search
    """

    CMR_BASE = "https://cmr.earthdata.nasa.gov/search"

    def __init__(self):
        self._http = None

    def _get_http(self):
        if self._http is None:
            import httpx
            self._http = httpx.Client(timeout=30.0)
        return self._http

    def _map_collection(self, collection: str) -> Optional[dict[str, str]]:
        """Map OrbitalQuery collection name to NASA CMR concept ID."""
        return NASA_CMR_COLLECTIONS.get(collection)

    def get_name(self) -> str:
        return "nasa_cmr"

    def search(
        self,
        collection: str,
        bbox: Optional[list[float]] = None,
        datetime: Optional[str] = None,
        max_cloud_cover: Optional[int] = None,
        limit: int = 10,
        query: Optional[dict[str, Any]] = None,
    ) -> SearchResult:
        http = self._get_http()
        cmr_info = self._map_collection(collection)

        if not cmr_info:
            logger.warning("[NASACMR] Unknown collection: %s", collection)
            return SearchResult(items=[], total=0, provider="nasa_cmr", collection=collection, search_params={})

        concept_id = cmr_info["concept_id"]

        # Build CMR granule search params
        params: dict[str, Any] = {
            "collection_concept_id": concept_id,
            "page_size": min(limit, 2000),
            "sort_key": "-start_date",
        }

        if bbox and len(bbox) == 4:
            params["bounding_box"] = f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}"

        if datetime:
            # CMR uses ISO format: start,end
            parts = datetime.split("/")
            if len(parts) == 2:
                start = parts[0].rstrip("Z") if parts[0] != ".." else "1900-01-01T00:00:00Z"
                end = parts[1].rstrip("Z") if parts[1] != ".." else "2100-01-01T00:00:00Z"
                params["temporal"] = f"{start},{end}"

        logger.info("[NASACMR] search: collection=%s concept_id=%s params=%s", collection, concept_id, params)

        resp = http.get(f"{self.CMR_BASE}/granules.json", params=params)
        resp.raise_for_status()
        data = resp.json()

        entries = data.get("feed", {}).get("entry", [])

        # Convert CMR granules to STAC-like items
        items = []
        for entry in entries:
            # Extract bounding box from CMR boxes field
            cmr_bbox = None
            boxes = entry.get("boxes", [])
            if boxes:
                # CMR boxes are "south west north east" strings
                try:
                    parts = boxes[0].split()
                    if len(parts) == 4:
                        cmr_bbox = [float(parts[1]), float(parts[0]), float(parts[3]), float(parts[2])]
                except (ValueError, IndexError):
                    pass

            # Extract links
            links = entry.get("links", [])
            assets = {}
            for link in links:
                rel = link.get("rel", "")
                href = link.get("href", "")
                title = link.get("title", "data")
                if href and "https" in href:
                    key = title.replace(" ", "_").lower() if title else rel or "data"
                    assets[key] = {"href": href, "title": title, "type": link.get("type", "application/octet-stream")}

            # Build STAC-like item
            item = {
                "id": entry.get("id", entry.get("producer_granule_id", "unknown")),
                "collection": collection,
                "bbox": cmr_bbox,
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [cmr_bbox[0], cmr_bbox[1]],
                        [cmr_bbox[2], cmr_bbox[1]],
                        [cmr_bbox[2], cmr_bbox[3]],
                        [cmr_bbox[0], cmr_bbox[3]],
                        [cmr_bbox[0], cmr_bbox[1]],
                    ]] if cmr_bbox else [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]
                },
                "properties": {
                    "datetime": entry.get("time_start", entry.get("temporal", {}).get("range_datetime", {}).get("begin_datetime", "")),
                    "title": entry.get("title", ""),
                    "platform": cmr_info["platform"].lower(),
                    "instruments": [cmr_info["instrument"].lower()],
                    "eo:gsd": cmr_info["gsd"],
                },
                "assets": assets,
                "links": links,
                "provider": "nasa_cmr",
            }
            items.append(item)

        return SearchResult(
            items=items,
            total=data.get("feed", {}).get("hits", len(items)),
            provider="nasa_cmr",
            collection=collection,
            search_params=params,
        )

    def get_item(self, collection: str, item_id: str) -> Optional[ItemDetail]:
        # CMR doesn't have a direct single-item endpoint via granules.json
        # Would need to search by ID — skip for now
        return None

    def get_assets(self, item: dict[str, Any]) -> dict[str, dict[str, Any]]:
        return item.get("assets", {})

    def get_asset_href(self, asset: dict[str, Any]) -> str:
        return asset.get("href", "")

    def get_capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(
            name="nasa_cmr",
            supports_stac=False,
            supports_cloud_hosted=True,
            supports_signed_urls=False,
            collections=list(NASA_CMR_COLLECTIONS.keys()),
            max_bbox_area_deg2=100.0,
            notes=(
                "NASA Common Metadata Repository. No auth for search. "
                "Provides MODIS, VIIRS, and Landsat HLS data. "
                "Uses CMR API (not STAC). Useful for fire, snow, vegetation monitoring."
            ),
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
        }

    def is_reachable(self) -> bool:
        try:
            http = self._get_http()
            resp = http.get(f"{self.CMR_BASE}/collections.json", params={"page_size": 1})
            ok = resp.status_code == 200
            if ok:
                logger.info("[NASACMR] reachable")
            return ok
        except Exception as e:
            logger.error("[NASACMR] unreachable: %s", e)
            return False


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
