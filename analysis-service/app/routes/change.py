"""Change detection endpoint."""

from __future__ import annotations

import logging

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.change_detection import run_change_detection

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analysis", tags=["change"])


class ChangeDetectRequest(BaseModel):
    """Request body for change detection."""

    baseline: list[list[float]] = Field(
        ...,
        description="2D array of index values for baseline (T1)",
    )
    comparison: list[list[float]] = Field(
        ...,
        description="2D array of index values for comparison (T2)",
    )
    index_name: str = Field(
        ...,
        description="Index used (e.g. NDVI, NDWI)",
    )
    aoi_bbox: list[float] = Field(
        ...,
        min_length=4,
        max_length=4,
        description="[west, south, east, north]",
    )
    threshold: float = Field(
        0.2,
        gt=0,
        description="Change threshold (e.g. 0.2 for NDVI)",
    )
    min_region_size: int = Field(
        5,
        ge=1,
        description="Minimum region size in pixels",
    )
    direction: str = Field(
        "absolute",
        description="Threshold direction: absolute, increase, decrease",
    )
    baseline_date: str = "unknown"
    comparison_date: str = "unknown"
    crs: str = "unknown"
    resolution_meters: float = 10.0


class ChangeDetectResponse(BaseModel):
    """Response for change detection."""

    status: str
    algorithm: str
    parameters: dict
    baseline_date: str
    comparison_date: str
    index_name: str
    aoi_bbox: list[float]
    crs: str
    resolution_meters: float
    total_pixels: int
    changed_pixels: int
    unchanged_pixels: int
    changed_pct: float
    total_area_sq_meters: float
    changed_area_sq_meters: float
    baseline_stats: dict
    comparison_stats: dict
    difference_stats: dict
    num_regions: int
    regions: list[dict]
    largest_region: dict | None
    processing_steps: list[dict]
    reproducibility: dict


@router.post("/change-detect", response_model=ChangeDetectResponse)
async def change_detect(request: ChangeDetectRequest):
    """
    Deterministic change detection between two scenes.

    Algorithm: difference-based thresholding.
    Reproducible from: scene IDs + processing parameters + algorithm.
    """
    # Convert lists to numpy arrays
    baseline = np.array(request.baseline, dtype=np.float32)
    comparison = np.array(request.comparison, dtype=np.float32)

    if baseline.ndim != 2 or comparison.ndim != 2:
        raise HTTPException(status_code=400, detail="Inputs must be 2D arrays")

    if baseline.shape != comparison.shape:
        raise HTTPException(
            status_code=400,
            detail=f"Shape mismatch: baseline={list(baseline.shape)}, comparison={list(comparison.shape)}",
        )

    if request.direction not in ("absolute", "increase", "decrease"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid direction: {request.direction}. Use: absolute, increase, decrease",
        )

    try:
        result = run_change_detection(
            baseline=baseline,
            comparison=comparison,
            index_name=request.index_name,
            aoi_bbox=request.aoi_bbox,
            threshold=request.threshold,
            min_region_size=request.min_region_size,
            direction=request.direction,
            baseline_date=request.baseline_date,
            comparison_date=request.comparison_date,
            crs=request.crs,
            resolution_meters=request.resolution_meters,
        )
    except Exception as e:
        logger.error("Change detection failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Change detection failed: {e}")

    return ChangeDetectResponse(
        status=result.status,
        algorithm=result.algorithm,
        parameters=result.parameters,
        baseline_date=result.baseline_date,
        comparison_date=result.comparison_date,
        index_name=result.index_name,
        aoi_bbox=result.aoi_bbox,
        crs=result.crs,
        resolution_meters=result.resolution_meters,
        total_pixels=result.total_pixels,
        changed_pixels=result.changed_pixels,
        unchanged_pixels=result.unchanged_pixels,
        changed_pct=result.changed_pct,
        total_area_sq_meters=result.total_area_sq_meters,
        changed_area_sq_meters=result.changed_area_sq_meters,
        baseline_stats=result.baseline_stats,
        comparison_stats=result.comparison_stats,
        difference_stats=result.difference_stats,
        num_regions=result.num_regions,
        regions=result.regions,
        largest_region=result.largest_region,
        processing_steps=result.processing_steps,
        reproducibility=result.reproducibility,
    )
