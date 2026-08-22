"""Sensor registry and Sentinel-1 endpoints."""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.sensor_registry import (
    get_all_sensors,
    get_sensor,
    get_sensor_bands,
    get_sar_sensors,
    get_optical_sensors,
    get_sensors_for_index,
    recommend_sensor,
)
from app.services.sentinel1 import (
    search_sentinel1,
    select_s1_asset,
    get_s1_scene_info,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analysis", tags=["sensors"])


# ── GET /analysis/sensors ────────────────────────────────────────


@router.get("/sensors")
async def list_sensors():
    """List all registered sensors with capabilities."""
    sensors = get_all_sensors()
    return {
        "status": "ok",
        "count": len(sensors),
        "sensors": sensors,
        "optical_sensors": get_optical_sensors(),
        "sar_sensors": get_sar_sensors(),
    }


@router.get("/sensors/{sensor_name}")
async def get_sensor_detail(sensor_name: str):
    """Get detailed info for a specific sensor."""
    cap = get_sensor(sensor_name)
    if not cap:
        raise HTTPException(status_code=404, detail=f"Sensor '{sensor_name}' not found")
    return {
        "status": "ok",
        "name": cap.name,
        "full_name": cap.full_name,
        "provider": cap.provider,
        "is_optical": cap.is_optical,
        "is_sar": cap.is_sar,
        "is_multispectral": cap.is_multispectral,
        "spatial_resolution_m": cap.spatial_resolution_m,
        "temporal_resolution_days": cap.temporal_resolution_days,
        "swath_width_km": cap.swath_width_km,
        "polarizations": cap.polarizations,
        "bands": cap.bands,
        "spectral_indices": cap.spectral_indices,
        "orbit_types": cap.orbit_types,
        "acquisition_modes": cap.acquisition_modes,
        "has_cloud_cover": cap.has_cloud_cover,
        "has_dem": cap.has_dem,
        "stac_extensions": cap.stac_extensions,
        "notes": cap.notes,
    }


@router.get("/sensors/{sensor_name}/bands")
async def get_sensor_bands_detail(sensor_name: str):
    """Get band definitions for a sensor."""
    bands = get_sensor_bands(sensor_name)
    if not bands:
        raise HTTPException(status_code=404, detail=f"Sensor '{sensor_name}' not found or no bands")
    return {
        "status": "ok",
        "sensor": sensor_name,
        "bands_count": len(bands),
        "bands": bands,
    }


@router.get("/sensors/index/{index_name}")
async def get_sensors_for_spectral_index(index_name: str):
    """Find which sensors support a given spectral index."""
    sensors = get_sensors_for_index(index_name)
    return {
        "status": "ok",
        "index_name": index_name,
        "supported_sensors": sensors,
        "count": len(sensors),
    }


@router.post("/sensors/recommend")
async def recommend_sensor_endpoint(
    is_optical_needed: bool = True,
    is_sar_needed: bool = False,
    max_resolution: Optional[float] = None,
    max_revisit_days: Optional[int] = None,
):
    """Recommend sensors based on analysis requirements."""
    sensors = recommend_sensor(
        is_optical_needed=is_optical_needed,
        is_sar_needed=is_sar_needed,
        max_resolution=max_resolution,
        max_revisit_days=max_revisit_days,
    )
    return {
        "status": "ok",
        "recommendations": sensors,
        "count": len(sensors),
    }


# ── Sentinel-1 endpoints ─────────────────────────────────────────


class Sentinel1SearchRequest(BaseModel):
    """Request body for Sentinel-1 STAC search."""

    bbox: list[float] = Field(..., min_length=4, max_length=4)
    start_date: str = Field(..., description="YYYY-MM-DD")
    end_date: str = Field(..., description="YYYY-MM-DD")
    limit: int = Field(10, ge=1, le=50)
    orbit_direction: Optional[str] = Field(None, description="ascending or descending")
    polarization: Optional[str] = Field(None, description="VV, VH, etc.")
    acquisition_mode: Optional[str] = Field(None, description="IW, EW, SM")


@router.post("/sentinel1/search")
async def sentinel1_search(request: Sentinel1SearchRequest):
    """Search for Sentinel-1 GRD scenes."""
    result = search_sentinel1(
        bbox=request.bbox,
        start_date=request.start_date,
        end_date=request.end_date,
        limit=request.limit,
        orbit_direction=request.orbit_direction,
        polarization=request.polarization,
        acquisition_mode=request.acquisition_mode,
    )

    return {
        "status": result.status,
        "collection": result.collection,
        "total_matches": result.total_matches,
        "returned": result.returned,
        "polarizations_found": result.polarizations_found,
        "orbit_directions_found": result.orbit_directions_found,
        "date_range": result.date_range,
        "scenes": [s.to_dict() for s in result.scenes],
        "processing_steps": result.processing_steps,
    }


@router.get("/sentinel1/info")
async def sentinel1_info():
    """Get Sentinel-1 sensor information and analysis guidance."""
    cap = get_sensor("sentinel-1-grd")
    if not cap:
        raise HTTPException(status_code=500, detail="Sentinel-1 not in registry")
    return {
        "status": "ok",
        "sensor": {
            "name": cap.name,
            "full_name": cap.full_name,
            "provider": cap.provider,
            "spatial_resolution_m": cap.spatial_resolution_m,
            "temporal_resolution_days": cap.temporal_resolution_days,
            "polarizations": cap.polarizations,
            "acquisition_modes": cap.acquisition_modes,
        },
        "analysis_notes": {
            "cloud_cover": "N/A — SAR penetrates clouds",
            "best_for": [
                "Flood detection and monitoring",
                "Surface water mapping",
                "Ground deformation (InSAR)",
                "Ice and glacier monitoring",
                "Ship detection",
                "Deforestation under cloud cover",
            ],
            "polarization_guide": {
                "VV": "Surface water detection, smooth surfaces, urban areas",
                "VH": "Vegetation structure, soil moisture, flood under canopy",
                "VV+VH": "Full analysis with both polarizations",
            },
            "orbital_info": {
                "ascending": "Satellite moving south to north (sunrise pass)",
                "descending": "Satellite moving north to south (sunset pass)",
            },
        },
    }
