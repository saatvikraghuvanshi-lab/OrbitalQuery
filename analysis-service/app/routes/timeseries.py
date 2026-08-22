"""Temporal timeseries endpoint — datacube construction."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from app.config import ALLOWED_COLLECTIONS
from app.models.requests import TimeseriesRequest, TimeseriesResponse
from app.services.temporal_engine import run_timeseries_analysis

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
    # Validate collection
    if request.collection not in ALLOWED_COLLECTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Collection '{request.collection}' not supported. Allowed: {ALLOWED_COLLECTIONS}",
        )

    # Validate date range
    if request.start_date > request.end_date:
        raise HTTPException(
            status_code=400,
            detail="start_date must be before end_date",
        )

    try:
        result = run_timeseries_analysis(
            collection=request.collection,
            bbox=request.bbox,
            start_date=request.start_date,
            end_date=request.end_date,
            max_cloud_cover=request.max_cloud_cover,
            max_scenes=request.max_scenes,
            bands=request.bands,
        )
    except Exception as e:
        logger.error("Timeseries analysis failed: %s", e)
        raise HTTPException(
            status_code=502,
            detail=f"Temporal analysis failed: {str(e)}",
        )

    return result
