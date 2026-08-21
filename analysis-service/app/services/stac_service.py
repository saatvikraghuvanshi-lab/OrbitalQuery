"""STAC search service using pystac-client + planetary-computer."""

from __future__ import annotations

import logging
from typing import Any, Optional

import planetary_computer as pc
from pystac_client import Client

from app.config import STAC_API_URL

logger = logging.getLogger(__name__)

# Singleton STAC client (lazy-init)
_client: Optional[Client] = None


def get_stac_client() -> Client:
    """Get or create the STAC API client."""
    global _client
    if _client is None:
        _client = Client.open(STAC_API_URL, modifier=pc.sign_inplace)
        logger.info("Connected to STAC API: %s", STAC_API_URL)
    return _client


def search_stac(
    collection: str,
    bbox: Optional[list[float]] = None,
    datetime: Optional[str] = None,
    max_cloud_cover: Optional[int] = None,
    limit: int = 10,
    query: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    Search STAC API for items matching the given parameters.

    Returns a dict with 'items' (list of signed STAC items) and 'total'.
    """
    client = get_stac_client()

    # Build query parameters
    search_kwargs: dict[str, Any] = {
        "collections": [collection],
        "max_items": limit,
    }

    if bbox:
        search_kwargs["bbox"] = bbox

    if datetime:
        search_kwargs["datetime"] = datetime

    # Add cloud cover filter via query extension
    if max_cloud_cover is not None:
        search_kwargs["query"] = query or {}
        search_kwargs["query"]["eo:cloud_cover"] = {
            "lt": max_cloud_cover
        }

    if query:
        if "query" in search_kwargs:
            search_kwargs["query"].update(query)
        else:
            search_kwargs["query"] = query

    logger.info("STAC search: %s", {k: v for k, v in search_kwargs.items()})

    search_results = client.search(**search_kwargs)

    total = search_results.matched()
    items = list(search_results.items())

    # Sign items with Planetary Computer
    signed_items = [pc.sign(item).to_dict() for item in items]

    return {
        "items": signed_items,
        "total": total or len(signed_items),
    }


def get_item_assets(item_dict: dict[str, Any]) -> dict[str, dict]:
    """Extract assets from a STAC item dict."""
    return item_dict.get("assets", {})


# Asset types that are NOT rasterio-compatible (JPEG/PNG renders)
NON_RASTER_ASSETS = {
    "visual", "rendered_preview", "thumbnail", "preview",
    "quicklook", "tilejson",
}

# Raster band names (GeoTIFF, windowed-read compatible)
RASTER_BANDS = {
    "B01", "B02", "B03", "B04", "B05", "B06", "B07", "B08",
    "B8A", "B09", "B11", "B12", "AOT", "SCL", "WVP",
    "red", "green", "blue", "nir", "swir16", "swir22",
}


def select_best_asset(
    assets: dict[str, dict],
    preferred_bands: Optional[list[str]] = None,
    mode: str = "analysis",
) -> tuple[str, dict]:
    """
    Select the best asset for raster access.

    mode='analysis': prefer GeoTIFF raster bands for windowed reads.
    mode='preview': prefer visual/rendered thumbnails.

    Priority (analysis mode):
    1. If preferred_bands given, find matching asset
    2. Look for known raster band assets (B04, B08, etc.)
    3. Fall back to first non-thumbnail asset
    4. Fall back to any asset

    Returns (asset_key, asset_dict).
    """
    if preferred_bands:
        for band in preferred_bands:
            if band in assets:
                return band, assets[band]

    if mode == "analysis":
        # Prefer actual raster bands for windowed reads
        for key in ["B04", "B08", "B03", "B02", "B05", "B11", "B12"]:
            if key in assets:
                return key, assets[key]

        # Any non-thumbnail asset
        for key, asset in assets.items():
            if key.lower() not in NON_RASTER_ASSETS:
                return key, asset

    elif mode == "preview":
        # Prefer visual/preview thumbnails
        for key in ["visual", "rendered_preview", "thumbnail", "preview"]:
            if key in assets:
                return key, assets[key]

    # Fall back to first asset
    if assets:
        first_key = next(iter(assets))
        return first_key, assets[first_key]

    raise ValueError("No assets found in STAC item")


def get_asset_href(asset: dict[str, Any]) -> str:
    """Get the href from a STAC asset, preferring signed href."""
    # Planetary Computer adds a signed href
    return asset.get("href", "")


def check_stac_api_reachable() -> bool:
    """Check if the STAC API is reachable."""
    try:
        client = get_stac_client()
        # Simple check — get collections
        collections = list(client.get_collections())
        logger.info("STAC API reachable, %d collections found", len(collections))
        return True
    except Exception as e:
        logger.error("STAC API unreachable: %s", e)
        return False
