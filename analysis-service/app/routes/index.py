"""Spectral index endpoint — compute indices from band data."""

from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import ALLOWED_COLLECTIONS
from app.services.spectral_indices import (
    INDEX_DEFINITIONS,
    SENSOR_BANDS,
    get_available_indices,
    get_supported_sensors,
    validate_index_request,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analysis", tags=["spectral"])


# ── Request/Response models ─────────────────────────────────────────

class IndexRequest(BaseModel):
    """Request body for spectral index computation."""

    index_name: str = Field(
        ...,
        description="Index to compute (NDVI, NDWI, NDBI, NBR, NDSI)",
        examples=["NDVI"],
    )
    sensor: str = Field(
        ...,
        description="Sensor collection ID (sentinel-2-l2a, landsat-c2-l2)",
        examples=["sentinel-2-l2a"],
    )
    scene_id: Optional[str] = Field(
        None,
        description="STAC item ID to fetch bands from (future use)",
    )
    # Band data can be provided directly as base64 or URLs (future use)
    # For now, we validate the request and return the index definition


class IndexResponse(BaseModel):
    """Response for spectral index request."""

    status: str
    index_name: str
    formula: str
    description: str
    sensor: str
    bands_used: dict[str, str]
    supported_sensors: list[str]
    validation: list[str]
    message: str


class IndicesListResponse(BaseModel):
    """Response listing all available indices."""

    status: str
    indices: list[dict[str, Any]]
    supported_sensors: list[str]


# ── Endpoints ───────────────────────────────────────────────────────

@router.get("/indices", response_model=IndicesListResponse)
async def list_indices():
    """List all available spectral indices and supported sensors."""
    return IndicesListResponse(
        status="ok",
        indices=get_available_indices(),
        supported_sensors=get_supported_sensors(),
    )


@router.post("/index", response_model=IndexResponse)
async def compute_index(request: IndexRequest):
    """
    Validate and prepare a spectral index computation.

    Returns the index definition, formula, band mapping,
    and validation results. The actual computation requires
    raster band data which will be added in a future stage.
    """
    index_name = request.index_name.upper()
    sensor = request.sensor

    # Check index exists
    if index_name not in INDEX_DEFINITIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown index: {request.index_name}. Available: {list(INDEX_DEFINITIONS.keys())}",
        )

    index_def = INDEX_DEFINITIONS[index_name]

    # Validate the request (use a dummy band list — real validation needs raster data)
    errors = validate_index_request(
        index_name=index_name,
        sensor=sensor,
        available_bands=list(SENSOR_BANDS.get(sensor, {}).keys()),
    )

    # Get supported sensors for this index
    from app.services.spectral_indices import INDEX_BAND_MAP
    supported = sorted(set(k[0] for k in INDEX_BAND_MAP if k[1] == index_name))

    # Build band mapping
    from app.services.spectral_indices import INDEX_BAND_MAP
    band_map = INDEX_BAND_MAP.get((sensor, index_name), {})

    return IndexResponse(
        status="ok" if not errors else "validation_error",
        index_name=index_def.name,
        formula=index_def.formula,
        description=index_def.description,
        sensor=sensor,
        bands_used=band_map,
        supported_sensors=supported,
        validation=errors,
        message=(
            f"Index {index_name} validated for {sensor}. "
            f"Formula: {index_def.formula}. "
            f"Ready for computation when band data is provided."
        ),
    )
