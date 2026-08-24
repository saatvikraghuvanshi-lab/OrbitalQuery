"""STAC search endpoint."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from app.config import ALLOWED_COLLECTIONS, DEFAULT_MAX_CLOUD_COVER
from app.models.requests import STACSearchRequest, STACSearchResponse
from app.services.stac_service import search_stac
from app.services.eo_provider import get_provider, get_default_provider
from app.security import validate_bbox, validate_geojson, validate_date_range, validate_scene_count, validate_url_safe

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/stac", tags=["stac"])


@router.post("/search", response_model=STACSearchResponse)
async def stac_search(request: STACSearchRequest):
    """
    Search the STAC catalog for matching scenes.

    Accepts bbox or GeoJSON geometry, date range, collection,
    cloud cover filter, and result limit.

    Returns signed STAC item metadata ready for raster access.
    """
    # ── Security: Validate inputs ────────────────────────────────
    if request.collection not in ALLOWED_COLLECTIONS:
        logger.warning(
            "Collection '%s' not in known list — forwarding to provider anyway",
            request.collection,
        )

    # Validate scene count
    validated_limit = validate_scene_count(request.limit)

    # Build geometry with security validation
    bbox = request.bbox
    if bbox is None and request.geometry:
        validate_geojson(request.geometry.model_dump())
        if request.geometry.bbox:
            bbox = request.geometry.bbox
        elif request.geometry.type == "Polygon":
            coords = request.geometry.coordinates[0]
            lons = [c[0] for c in coords]
            lats = [c[1] for c in coords]
            bbox = [min(lons), min(lats), max(lons), max(lats)]

    if bbox is None:
        raise HTTPException(
            status_code=400,
            detail="Either bbox or geometry must be provided",
        )

    # Security: Validate bbox size and bounds
    validate_bbox(bbox)

    # Security: Validate date range
    if request.start_date and request.end_date:
        validate_date_range(request.start_date.isoformat(), request.end_date.isoformat())

    # Build datetime
    datetime_str = request.datetime
    if datetime_str is None:
        if request.start_date and request.end_date:
            datetime_str = (
                f"{request.start_date.isoformat()}/{request.end_date.isoformat()}"
            )
        elif request.start_date:
            datetime_str = f"{request.start_date.isoformat()}/.."
        elif request.end_date:
            datetime_str = f"../{request.end_date.isoformat()}"

    # Select provider (use specified or default)
    provider_name = getattr(request, "provider", None)
    try:
        provider = get_provider(provider_name) if provider_name else get_default_provider()
    except KeyError:
        raise HTTPException(
            status_code=400,
            detail=f"Provider '{provider_name}' not registered",
        )

    try:
        result = provider.search(
            collection=request.collection,
            bbox=bbox,
            datetime=datetime_str,
            max_cloud_cover=request.max_cloud_cover,
            limit=validated_limit,
        )
    except Exception as e:
        from app.security import sanitize_error_message
        logger.error("STAC search failed via %s: %s", provider.get_name(), sanitize_error_message(e))
        raise HTTPException(
            status_code=502,
            detail="STAC API search failed",
        )

    return STACSearchResponse(
        collection=request.collection,
        total_matches=result.total,
        returned=len(result.items),
        items=result.items,
    )
