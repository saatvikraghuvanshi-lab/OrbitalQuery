"""Preprocessing endpoint — scene preprocessing and comparability checks."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from app.config import ALLOWED_COLLECTIONS
from app.models.requests import PreprocessRequest, PreprocessResponse
from app.services.preprocessing import preprocess_scenes
from app.services.stac_service import search_stac

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analysis", tags=["preprocessing"])


@router.post("/preprocess", response_model=PreprocessResponse)
async def preprocess(request: PreprocessRequest):
    """
    Preprocess scenes for analysis-ready, comparable data.

    Pipeline:
    1. Search STAC for candidate scenes
    2. For each scene: check cloud cover, coverage, bands, CRS, resolution
    3. Report preprocessing steps for each scene
    4. Check comparability across all suitable scenes
    5. Return detailed report

    Does NOT load raster data. Returns metadata-only preprocessing report.
    """
    # Validate collection
    if request.collection not in ALLOWED_COLLECTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Collection '{request.collection}' not supported. Allowed: {ALLOWED_COLLECTIONS}",
        )

    if request.start_date > request.end_date:
        raise HTTPException(status_code=400, detail="start_date must be before end_date")

    # Step 1: Search STAC for candidate scenes
    datetime_str = f"{request.start_date.isoformat()}/{request.end_date.isoformat()}"

    try:
        result = search_stac(
            collection=request.collection,
            bbox=request.bbox,
            datetime=datetime_str,
            max_cloud_cover=request.max_cloud_cover,
            limit=request.max_scenes,
        )
    except Exception as e:
        logger.error("STAC search failed: %s", e)
        raise HTTPException(status_code=502, detail=f"STAC search failed: {e}")

    items = result.get("items", [])

    if not items:
        raise HTTPException(
            status_code=404,
            detail="No scenes found matching the search criteria",
        )

    # Step 2-5: Preprocess and check comparability
    try:
        report = preprocess_scenes(
            items=items,
            bbox=request.bbox,
            target_bands=request.bands,
            target_crs=request.target_crs,
            target_resolution=request.target_resolution,
            max_cloud_cover=request.max_cloud_cover,
            collection=request.collection,
            max_temporal_gap_days=request.max_temporal_gap_days,
            min_coverage_pct=request.min_coverage_pct,
        )
    except Exception as e:
        logger.error("Preprocessing failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Preprocessing failed: {e}")

    return report
