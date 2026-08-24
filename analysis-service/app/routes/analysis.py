"""Analysis preview endpoint — search + windowed raster read."""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException

from app.config import ALLOWED_COLLECTIONS
from app.models.requests import (
    AnalysisPreviewRequest,
    AnalysisPreviewResponse,
    SceneInfo,
)
from app.services.raster_service import (
    compute_band_stats,
    estimate_resolution_meters,
    read_raster_window,
)
from app.services.stac_service import (
    get_asset_href,
    get_item_assets,
    select_best_asset,
    search_stac,
)
from app.security import validate_bbox, validate_date_range, validate_bands, validate_url_safe, sanitize_error_message, sanitize_stac_href

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analysis", tags=["analysis"])


@router.post("/preview", response_model=AnalysisPreviewResponse)
async def analysis_preview(request: AnalysisPreviewRequest):
    """
    Preview analysis: search for a scene, then read a raster window.

    1. Searches STAC for matching scenes
    2. Selects the best asset from the top result
    3. Reads a windowed raster for the given AOI
    4. Returns metadata + band statistics

    Does NOT download entire scenes — uses windowed/cloud access.
    """
    # Security: Validate all inputs
    validate_bbox(request.bbox)
    validate_date_range(request.start_date.isoformat(), request.end_date.isoformat())
    validated_bands = validate_bands(request.bands)

    # Validate collection
    if request.collection not in ALLOWED_COLLECTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Collection '{request.collection}' not supported. Allowed: {ALLOWED_COLLECTIONS}",
        )

    # Build datetime
    datetime_str = (
        f"{request.start_date.isoformat()}/{request.end_date.isoformat()}"
    )

    # ── Step 1: STAC search ──────────────────────────────────────
    try:
        result = search_stac(
            collection=request.collection,
            bbox=request.bbox,
            datetime=datetime_str,
            max_cloud_cover=request.max_cloud_cover,
            limit=request.limit,
        )
    except Exception as e:
        logger.error("STAC search failed: %s", e)
        raise HTTPException(status_code=502, detail=f"STAC search failed: {e}")

    if not result["items"]:
        raise HTTPException(
            status_code=404,
            detail="No scenes found matching the search criteria",
        )

    item = result["items"][0]

    # ── Step 2: Extract scene metadata ───────────────────────────
    properties = item.get("properties", {})
    item_bbox = item.get("bbox", request.bbox)
    assets = get_item_assets(item)

    # ── Step 3: Select asset (analysis mode = prefer GeoTIFF bands) ─
    try:
        asset_key, asset = select_best_asset(assets, request.bands, mode="analysis")
        href = get_asset_href(asset)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Security: validate URL against SSRF
    validate_url_safe(href)

    logger.info("Selected asset '%s'", asset_key)

    # ── Step 4: Read raster window ───────────────────────────────
    try:
        read_result = read_raster_window(
            href=href,
            bbox=request.bbox,
            bands=request.bands,
        )
    except Exception as e:
        logger.error("Raster read failed: %s", e)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to read raster: {e}. "
            "The asset may not support windowed reads.",
        )

    # ── Step 5: Compute statistics ───────────────────────────────
    stats = compute_band_stats(read_result["data"], read_result["band_names"])

    resolution = estimate_resolution_meters(
        read_result["profile"], read_result["crs"]
    )

    # ── Step 6: Build response ───────────────────────────────────
    # Security: strip signing tokens from href before returning
    clean_href = sanitize_stac_href(href)
    scene = SceneInfo(
        item_id=item.get("id", "unknown"),
        collection=item.get("collection", request.collection),
        datetime=properties.get("datetime", "unknown"),
        cloud_cover=properties.get("eo:cloud_cover"),
        bbox=item_bbox if item_bbox else request.bbox,
        assets_available=list(assets.keys()),
        asset_used=asset_key,
        signed_href=clean_href[:200] + "..." if len(clean_href) > 200 else clean_href,
    )

    return AnalysisPreviewResponse(
        aoi_bbox=request.bbox,
        scene=scene,
        window_shape=read_result["window_shape"],
        bands_loaded=read_result["band_names"],
        band_stats=stats,
        resolution_meters=resolution,
        crs=read_result["crs"],
        read_method="windowed",
    )
