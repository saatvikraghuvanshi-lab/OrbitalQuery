"""STAC search endpoint."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from app.config import ALLOWED_COLLECTIONS, DEFAULT_MAX_CLOUD_COVER
from app.models.requests import STACSearchRequest, STACSearchResponse
from app.services.stac_service import search_stac

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
    # Validate collection
    if request.collection not in ALLOWED_COLLECTIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Collection '{request.collection}' is not supported. "
                f"Allowed: {ALLOWED_COLLECTIONS}"
            ),
        )

    # Build geometry
    bbox = request.bbox
    if bbox is None and request.geometry:
        # Convert GeoJSON to bbox
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

    try:
        result = search_stac(
            collection=request.collection,
            bbox=bbox,
            datetime=datetime_str,
            max_cloud_cover=request.max_cloud_cover,
            limit=request.limit,
        )
    except Exception as e:
        logger.error("STAC search failed: %s", e)
        raise HTTPException(
            status_code=502,
            detail=f"STAC API search failed: {str(e)}",
        )

    return STACSearchResponse(
        collection=request.collection,
        total_matches=result["total"],
        returned=len(result["items"]),
        items=result["items"],
    )
