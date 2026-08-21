"""Pydantic models for API request and response validation."""

from __future__ import annotations

from datetime import date
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.config import (
    DEFAULT_COLLECTION,
    DEFAULT_LIMIT,
    DEFAULT_MAX_CLOUD_COVER,
    MAX_AREA_DEGREES_SQ,
    MAX_DATE,
    MIN_DATE,
)


# ── Geometry models ──────────────────────────────────────────────

class BBox(BaseModel):
    """Bounding box: [west, south, east, north]."""

    values: list[float] = Field(
        ...,
        min_length=4,
        max_length=4,
        description="[west, south, east, north] in WGS-84",
        examples=[[75.5, 26.5, 76.0, 27.0]],
    )

    @field_validator("values")
    @classmethod
    def validate_bbox_range(cls, v: list[float]) -> list[float]:
        if v[0] >= v[2]:
            raise ValueError("west must be less than east")
        if v[1] >= v[3]:
            raise ValueError("south must be less than north")
        if v[0] < -180 or v[2] > 180:
            raise ValueError("longitude must be in [-180, 180]")
        if v[1] < -90 or v[3] > 90:
            raise ValueError("latitude must be in [-90, 90]")
        area = (v[2] - v[0]) * (v[3] - v[1])
        if area > MAX_AREA_DEGREES_SQ:
            raise ValueError(
                f"AOI area ({area:.1f} deg²) exceeds max ({MAX_AREA_DEGREES_SQ} deg²)"
            )
        return v


class GeoJSONAOI(BaseModel):
    """GeoJSON geometry for AOI specification."""

    type: Literal["Point", "Polygon", "MultiPolygon"]
    coordinates: Any
    bbox: Optional[list[float]] = Field(None, min_length=4, max_length=4)


# ── STAC Search ──────────────────────────────────────────────────

class STACSearchRequest(BaseModel):
    """Request body for STAC search."""

    bbox: Optional[list[float]] = Field(
        None,
        min_length=4,
        max_length=4,
        description="[west, south, east, north]",
        examples=[[75.5, 26.5, 76.0, 27.0]],
    )
    geometry: Optional[GeoJSONAOI] = Field(
        None,
        description="GeoJSON geometry (alternative to bbox)",
    )
    datetime: Optional[str] = Field(
        None,
        description="ISO 8601 interval, e.g. '2024-01-01/2024-06-30'",
        examples=["2024-01-01/2024-06-30"],
    )
    start_date: Optional[date] = Field(None, description="Start date (inclusive)")
    end_date: Optional[date] = Field(None, description="End date (inclusive)")
    collection: str = Field(
        DEFAULT_COLLECTION,
        description="STAC collection ID",
        examples=["sentinel-2-l2a"],
    )
    max_cloud_cover: int = Field(
        DEFAULT_MAX_CLOUD_COVER,
        ge=0,
        le=100,
        description="Maximum cloud cover percentage",
    )
    limit: int = Field(
        DEFAULT_LIMIT,
        ge=1,
        le=50,
        description="Maximum number of results",
    )

    @field_validator("datetime")
    @classmethod
    def build_datetime(cls, v: Optional[str], info) -> Optional[str]:
        """Build datetime from start/end dates if not provided directly."""
        if v is not None:
            return v
        sd = info.data.get("start_date")
        ed = info.data.get("end_date")
        if sd and ed:
            return f"{sd.isoformat()}/{ed.isoformat()}"
        if sd:
            return f"{sd.isoformat()}/.."
        if ed:
            return f"../{ed.isoformat()}"
        return None


class STACSearchResponse(BaseModel):
    """Response for STAC search."""

    status: str = "ok"
    collection: str
    total_matches: int
    returned: int
    items: list[dict[str, Any]]


# ── Analysis Preview ─────────────────────────────────────────────

class AnalysisPreviewRequest(BaseModel):
    """Request body for analysis preview."""

    bbox: list[float] = Field(
        ...,
        min_length=4,
        max_length=4,
        description="[west, south, east, north] in WGS-84",
    )
    start_date: date
    end_date: date
    collection: str = DEFAULT_COLLECTION
    max_cloud_cover: int = Field(DEFAULT_MAX_CLOUD_COVER, ge=0, le=100)
    limit: int = Field(1, ge=1, le=10, description="Number of scenes to preview")
    bands: Optional[list[str]] = Field(
        None,
        description="Specific bands to read (e.g. ['B04', 'B08']). Defaults to RGB.",
    )

    @field_validator("bbox")
    @classmethod
    def validate_bbox(cls, v: list[float]) -> list[float]:
        if v[0] >= v[2]:
            raise ValueError("west must be less than east")
        if v[1] >= v[3]:
            raise ValueError("south must be less than north")
        return v


class BandStats(BaseModel):
    """Statistics for a single band."""

    band: str
    dtype: str
    shape: list[int]
    min: float
    max: float
    mean: float
    std: float
    nodata_count: int


class SceneInfo(BaseModel):
    """Metadata about a scene used in the analysis."""

    item_id: str
    collection: str
    datetime: str
    cloud_cover: Optional[float] = None
    bbox: list[float]
    assets_available: list[str]
    asset_used: str
    signed_href: str


class AnalysisPreviewResponse(BaseModel):
    """Response for analysis preview."""

    status: str = "ok"
    aoi_bbox: list[float]
    scene: SceneInfo
    window_shape: list[int]
    bands_loaded: list[str]
    band_stats: list[BandStats]
    resolution_meters: Optional[float] = None
    crs: str
    read_method: str


# ── Health ───────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    """Health check response."""

    status: str = "ok"
    service: str = "orbitalquery-analysis"
    version: str = "0.1.0"
    stac_api: str
    stac_api_reachable: Optional[bool] = None
    python_version: str
    packages: dict[str, str]


# ── Timeseries ──────────────────────────────────────────────────

DEFAULT_BANDS = ["B04", "B03", "B02"]
MAX_SCENES_DEFAULT = 20


class TimeseriesRequest(BaseModel):
    """Request body for temporal datacube construction."""

    bbox: list[float] = Field(
        ...,
        min_length=4,
        max_length=4,
        description="[west, south, east, north] in WGS-84",
        examples=[[75.7, 26.8, 75.9, 27.0]],
    )
    start_date: date
    end_date: date
    collection: str = DEFAULT_COLLECTION
    max_cloud_cover: int = Field(DEFAULT_MAX_CLOUD_COVER, ge=0, le=100)
    max_scenes: int = Field(
        MAX_SCENES_DEFAULT,
        ge=1,
        le=50,
        description="Maximum number of scenes to include in the cube",
    )
    bands: list[str] = Field(
        default=DEFAULT_BANDS,
        min_length=1,
        max_length=20,
        description="Bands to include (e.g. ['B04', 'B08', 'B11'])",
    )
    target_crs: Optional[str] = Field(
        None,
        description="Target CRS (e.g. 'EPSG:32643'). Auto-detected if omitted.",
    )
    target_resolution: Optional[float] = Field(
        None,
        gt=0,
        description="Target resolution in meters. Auto-detected if omitted.",
    )

    @field_validator("bbox")
    @classmethod
    def validate_bbox(cls, v: list[float]) -> list[float]:
        if v[0] >= v[2]:
            raise ValueError("west must be less than east")
        if v[1] >= v[3]:
            raise ValueError("south must be less than north")
        if v[0] < -180 or v[2] > 180:
            raise ValueError("longitude must be in [-180, 180]")
        if v[1] < -90 or v[3] > 90:
            raise ValueError("latitude must be in [-90, 90]")
        area = (v[2] - v[0]) * (v[3] - v[1])
        if area > MAX_AREA_DEGREES_SQ:
            raise ValueError(f"AOI area ({area:.1f} deg²) exceeds max")
        return v


class TimeseriesResponse(BaseModel):
    """Response for temporal datacube construction."""

    status: str
    analysis_id: str
    collection: str
    aoi_bbox: list[float]
    date_range: list[str]
    bands: list[str]
    crs: str
    resolution_meters: Optional[float]
    cube_shape: list[int]
    cube_dims: dict[str, int]
    scenes_discovered: int
    scenes_rejected: int
    scenes_selected: int
    selected_scenes: list[dict[str, Any]]
    acquisition_dates: list[str]
    cloud_covers: list[float]
    processing_steps: list[dict[str, str]]
    diagnostics: dict[str, Any]
    rejection_reasons: list[dict[str, str]]


# ── Errors ───────────────────────────────────────────────────────

class ErrorResponse(BaseModel):
    """Standard error response."""

    status: str = "error"
    detail: str
    code: Optional[str] = None
