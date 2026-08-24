"""
Query-to-plan endpoint.

POST /analysis/query/plan — convert NL query to validated analysis plan
GET  /analysis/query/phenomena — list supported phenomena
GET  /analysis/query/locations — list known locations
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.query_to_plan import (
    build_analysis_plan,
    KNOWN_LOCATIONS,
)
from app.services.capability_registry import (
    list_phenomena,
    list_analysis_types,
    PHENOMENON_REGISTRY,
)
from app.security import validate_query_safe

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analysis/query", tags=["query"])


# ── Request / Response models ────────────────────────────────────

class QueryPlanRequest(BaseModel):
    """Request body for query-to-plan conversion."""
    query: str = Field(
        ...,
        min_length=3,
        max_length=500,
        description="Natural language analysis query",
        examples=["How much of Jaipur became urbanized between 2018 and 2025?"],
    )
    # Optional overrides
    phenomenon: Optional[str] = Field(None, description="Override detected phenomenon")
    aoi: Optional[str] = Field(None, description="Override area of interest name")
    bbox: Optional[list[float]] = Field(None, min_length=4, max_length=4, description="Override bounding box")
    start_date: Optional[str] = Field(None, description="Override start date (YYYY-MM-DD)")
    end_date: Optional[str] = Field(None, description="Override end date (YYYY-MM-DD)")
    sensor: Optional[str] = Field(None, description="Override preferred sensor")
    analysis_type: Optional[str] = Field(None, description="Override analysis type")
    bands: Optional[list[str]] = Field(None, description="Override band selection")
    cloud_threshold: Optional[int] = Field(None, ge=0, le=100, description="Override cloud threshold")


class QueryPlanResponse(BaseModel):
    """Response for query-to-plan conversion."""
    request_id: str
    status: str  # "ok", "error", "unsupported"
    plan: Optional[dict[str, Any]] = None
    message: Optional[str] = None
    errors: Optional[list[str]] = None
    suggestions: Optional[list[str]] = None
    known_locations: Optional[list[str]] = None


# ── Routes ───────────────────────────────────────────────────────

@router.post("/plan", response_model=QueryPlanResponse)
async def convert_query_to_plan(req: QueryPlanRequest) -> QueryPlanResponse:
    """
    Convert a natural language query to a validated analysis plan.

    The system:
    1. Detects the analysis phenomenon from keywords
    2. Extracts area of interest from known locations
    3. Extracts date range from the query
    4. Selects appropriate sensor, bands, and analysis type
    5. Validates everything against the capability registry
    6. Returns a structured, executable analysis plan
    """
    request_id = str(uuid.uuid4())

    # Security: validate query for injection + length
    sanitized_query = validate_query_safe(req.query)

    logger.info(
        "[query/plan] requestId=%s query='%s'",
        request_id, sanitized_query[:80],
    )

    # Build overrides dict
    overrides = {}
    if req.phenomenon:
        overrides["phenomenon"] = req.phenomenon
    if req.aoi:
        overrides["aoi"] = req.aoi
    if req.bbox:
        overrides["bbox"] = req.bbox
    if req.start_date:
        overrides["start_date"] = req.start_date
    if req.end_date:
        overrides["end_date"] = req.end_date
    if req.sensor:
        overrides["sensor"] = req.sensor
    if req.analysis_type:
        overrides["analysis_type"] = req.analysis_type
    if req.bands:
        overrides["bands"] = req.bands
    if req.cloud_threshold is not None:
        overrides["cloud_threshold"] = req.cloud_threshold

    result = build_analysis_plan(req.query, overrides or None)

    return QueryPlanResponse(
        request_id=request_id,
        status=result["status"],
        plan=result.get("plan"),
        message=result.get("message"),
        errors=result.get("errors"),
        suggestions=result.get("suggestions"),
        known_locations=result.get("known_locations"),
    )


@router.get("/phenomena")
async def get_phenomena():
    """List all supported analysis phenomena."""
    return {
        "status": "ok",
        "count": len(PHENOMENON_REGISTRY),
        "phenomena": list_phenomena(),
    }


@router.get("/analysis-types")
async def get_analysis_types():
    """List all supported analysis types."""
    return {
        "status": "ok",
        "count": len(list_analysis_types()),
        "analysis_types": list_analysis_types(),
    }


@router.get("/locations")
async def get_locations():
    """List all known locations with bounding boxes."""
    locations = []
    for name, info in KNOWN_LOCATIONS.items():
        locations.append({
            "name": name,
            "bbox": info["bbox"],
            "country": info["country"],
            "region": info["region"],
        })
    return {
        "status": "ok",
        "count": len(locations),
        "locations": locations,
    }
