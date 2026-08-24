"""Flood Impact Intelligence endpoint."""

from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.flood_analysis import run_flood_assessment
from app.security import validate_bbox, validate_array_payload, validate_query_safe

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analysis", tags=["flood"])


class FloodAssessmentRequest(BaseModel):
    """Request body for flood impact assessment."""

    query: str = Field(..., min_length=5, description="Natural language flood query")
    aoi_bbox: list[float] = Field(
        ..., min_length=4, max_length=4, description="[west, south, east, north]"
    )
    event_date: Optional[str] = Field(None, description="Event date YYYY-MM-DD")
    max_cloud_cover: int = Field(30, ge=0, le=100)
    vv_threshold: float = Field(3.0, gt=0, description="VV backscatter decrease threshold (dB)")
    resolution_meters: float = Field(10.0, gt=0)
    # Optional pre/post backscatter arrays for direct flood detection
    pre_vv_db: Optional[list[list[float]]] = Field(None, description="Pre-event VV backscatter (dB)")
    post_vv_db: Optional[list[list[float]]] = Field(None, description="Post-event VV backscatter (dB)")
    pre_vh_db: Optional[list[list[float]]] = Field(None, description="Pre-event VH backscatter (dB)")
    post_vh_db: Optional[list[list[float]]] = Field(None, description="Post-event VH backscatter (dB)")


class FloodAssessmentResponse(BaseModel):
    """Response for flood impact assessment."""

    analysis_id: str
    query: str
    analysis_plan: dict[str, Any]
    aoi_bbox: list[float]
    event_date: Optional[str]
    selected_scenes: list[dict[str, Any]]
    processing_steps: list[dict[str, str]]
    method: str
    statistics: dict[str, Any]
    change_map_summary: dict[str, Any]
    confidence: str
    limitations: list[str]
    evidence: dict[str, Any]
    status: str


@router.post("/flood/assess", response_model=FloodAssessmentResponse)
async def flood_assess(request: FloodAssessmentRequest):
    """
    Assess flood impact using SAR imagery.

    Accepts a natural language query and AOI, discovers Sentinel-1 scenes,
    and optionally runs flood detection if backscatter arrays are provided.
    """
    import numpy as np
    from app.security import sanitize_error_message

    # Security: validate query and bbox
    validate_query_safe(request.query)
    validate_bbox(request.aoi_bbox)

    # Security: validate array payloads to prevent memory exhaustion
    validate_array_payload(request.pre_vv_db)
    validate_array_payload(request.post_vv_db)
    validate_array_payload(request.pre_vh_db)
    validate_array_payload(request.post_vh_db)

    # Convert optional lists to numpy arrays
    pre_vv_db = np.array(request.pre_vv_db, dtype=np.float32) if request.pre_vv_db else None
    post_vv_db = np.array(request.post_vv_db, dtype=np.float32) if request.post_vv_db else None
    pre_vh_db = np.array(request.pre_vh_db, dtype=np.float32) if request.pre_vh_db else None
    post_vh_db = np.array(request.post_vh_db, dtype=np.float32) if request.post_vh_db else None

    try:
        result = run_flood_assessment(
            query=request.query,
            aoi_bbox=request.aoi_bbox,
            event_date=request.event_date,
            max_cloud_cover=request.max_cloud_cover,
            vv_threshold=request.vv_threshold,
            pre_vv_db=pre_vv_db,
            post_vv_db=post_vv_db,
            pre_vh_db=pre_vh_db,
            post_vh_db=post_vh_db,
            resolution_meters=request.resolution_meters,
        )
    except Exception as e:
        logger.error("Flood assessment failed: %s", sanitize_error_message(e))
        raise HTTPException(status_code=500, detail="Assessment failed")

    return FloodAssessmentResponse(**result.to_dict())
