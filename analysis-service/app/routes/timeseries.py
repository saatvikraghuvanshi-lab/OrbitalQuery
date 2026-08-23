"""Temporal timeseries endpoint — datacube construction."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from app.config import ALLOWED_COLLECTIONS
from app.models.requests import TimeseriesRequest, TimeseriesResponse
from app.services.temporal_engine import run_timeseries_analysis
from app.security import validate_bbox, validate_date_range, validate_scene_count, validate_bands

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analysis", tags=["timeseries"])


@router.post("/timeseries", response_model=TimeseriesResponse)
async def timeseries(request: TimeseriesRequest):
    """
    Construct a lazy temporal datacube for the given AOI and date range.

    Pipeline:
    1. Discover STAC scenes
    2. Filter by coverage, bands, cloud cover
    3. Rank by composite score
    4. Remove duplicates
    5. Sort temporally
    6. Select top N
    7. Build lazy datacube via stackstac

    Returns metadata only — no data is loaded into RAM.
    The datacube is lazy and chunked for Dask-backed processing.
    """
    # Security: Validate all inputs
    validate_bbox(request.bbox)
    validate_date_range(str(request.start_date), str(request.end_date))
    validated_limit = validate_scene_count(request.max_scenes)
    validated_bands = validate_bands(request.bands)

    # Validate collection
    if request.collection not in ALLOWED_COLLECTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Collection '{request.collection}' not supported. Allowed: {ALLOWED_COLLECTIONS}",
        )

    try:
        result = run_timeseries_analysis(
            collection=request.collection,
            bbox=request.bbox,
            start_date=request.start_date,
            end_date=request.end_date,
            max_cloud_cover=request.max_cloud_cover,
            max_scenes=validated_limit,
            bands=validated_bands,
        )
    except Exception as e:
        from app.security import sanitize_error_message
        logger.error("Timeseries analysis failed: %s", sanitize_error_message(e))
        raise HTTPException(
            status_code=502,
            detail="Temporal analysis failed",
        )

    return result
