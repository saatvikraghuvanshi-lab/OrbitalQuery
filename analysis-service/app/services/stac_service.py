"""
STAC search service — delegates to EOProvider interface.

All existing function signatures are preserved for backward compatibility.
Internally delegates to the registered EOProvider (default: Planetary Computer).

This ensures the analysis engine does not depend directly on any
provider-specific library. Provider logic lives in eo_provider.py.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from app.services.eo_provider import (
    EOProvider,
    get_default_provider,
    get_provider,
)

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════
# Backward-compatible API (delegates to provider)
# ══════════════════════════════════════════════════════════════════

def get_stac_client():
    """
    Get the underlying STAC client from the default provider.

    NOTE: This leaks the provider-specific client. New code should use
    the EOProvider interface directly. Kept for backward compatibility
    with preprocessing, sentinel1, and temporal_engine modules.
    """
    provider = get_default_provider()
    if hasattr(provider, '_get_client'):
        return provider._get_client()
    raise NotImplementedError(
        f"Provider '{provider.get_name()}' does not expose a raw STAC client. "
        "Use the EOProvider.search() interface instead."
    )


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

    Delegates to the registered EOProvider.

    Returns a dict with 'items' (list of signed STAC items) and 'total'.
    """
    provider = get_default_provider()
    result = provider.search(
        collection=collection,
        bbox=bbox,
        datetime=datetime,
        max_cloud_cover=max_cloud_cover,
        limit=limit,
        query=query,
    )
    return {
        "items": result.items,
        "total": result.total,
    }


def get_item_assets(item_dict: dict[str, Any]) -> dict[str, dict]:
    """Extract assets from a STAC item dict."""
    provider = get_default_provider()
    return provider.get_assets(item_dict)


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

    Returns (asset_key, asset_dict).
    """
    if preferred_bands:
        for band in preferred_bands:
            if band in assets:
                return band, assets[band]

    if mode == "analysis":
        for key in ["B04", "B08", "B03", "B02", "B05", "B11", "B12"]:
            if key in assets:
                return key, assets[key]
        for key, asset in assets.items():
            if key.lower() not in NON_RASTER_ASSETS:
                return key, asset

    elif mode == "preview":
        for key in ["visual", "rendered_preview", "thumbnail", "preview"]:
            if key in assets:
                return key, assets[key]

    if assets:
        first_key = next(iter(assets))
        return first_key, assets[first_key]

    raise ValueError("No assets found in STAC item")


def get_asset_href(asset: dict[str, Any]) -> str:
    """Get the href from a STAC asset, preferring signed href."""
    provider = get_default_provider()
    return provider.get_asset_href(asset)


def check_stac_api_reachable() -> bool:
    """Check if the STAC API is reachable via the default provider."""
    try:
        provider = get_default_provider()
        return provider.is_reachable()
    except Exception as e:
        logger.error("Provider unreachable: %s", e)
        return False
