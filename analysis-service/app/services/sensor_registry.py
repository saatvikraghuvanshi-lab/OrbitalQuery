"""
Sensor capability registry for OrbitalQuery.

Defines capabilities, band mappings, and metadata for each supported sensor.
Extensible — add new sensors by adding to the registry.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Optional

logger = logging.getLogger(__name__)


@dataclass
class SensorCapability:
    """Capabilities of a single sensor."""

    name: str
    collection_id: str
    full_name: str
    provider: str
    is_optical: bool
    is_sar: bool
    is_multispectral: bool
    spatial_resolution_m: float
    temporal_resolution_days: int
    swath_width_km: float
    polarizations: list[str] = field(default_factory=list)
    bands: dict[str, dict[str, Any]] = field(default_factory=dict)
    spectral_indices: list[str] = field(default_factory=list)
    orbit_types: list[str] = field(default_factory=list)
    acquisition_modes: list[str] = field(default_factory=list)
    has_cloud_cover: bool = True
    has_dem: bool = False
    stac_extensions: list[str] = field(default_factory=list)
    notes: str = ""


# ── Sensor definitions ───────────────────────────────────────────

SENSOR_REGISTRY: dict[str, SensorCapability] = {
    "sentinel-2-l2a": SensorCapability(
        name="sentinel-2-l2a",
        collection_id="sentinel-2-l2a",
        full_name="Sentinel-2 Level-2A (Surface Reflectance)",
        provider="Copernicus/ESA",
        is_optical=True,
        is_sar=False,
        is_multispectral=True,
        spatial_resolution_m=10.0,
        temporal_resolution_days=5,
        swath_width_km=290,
        bands={
            "B01": {"name": "Coastal Aerosol", "wavelength_nm": 443, "resolution_m": 60, "category": "atmospheric"},
            "B02": {"name": "Blue", "wavelength_nm": 490, "resolution_m": 10, "category": "visible"},
            "B03": {"name": "Green", "wavelength_nm": 560, "resolution_m": 10, "category": "visible"},
            "B04": {"name": "Red", "wavelength_nm": 665, "resolution_m": 10, "category": "visible"},
            "B05": {"name": "Red Edge 1", "wavelength_nm": 705, "resolution_m": 20, "category": "red_edge"},
            "B06": {"name": "Red Edge 2", "wavelength_nm": 740, "resolution_m": 20, "category": "red_edge"},
            "B07": {"name": "Red Edge 3", "wavelength_nm": 783, "resolution_m": 20, "category": "red_edge"},
            "B08": {"name": "NIR", "wavelength_nm": 842, "resolution_m": 10, "category": "infrared"},
            "B8A": {"name": "NIR Narrow", "wavelength_nm": 865, "resolution_m": 20, "category": "infrared"},
            "B09": {"name": "Water Vapour", "wavelength_nm": 945, "resolution_m": 60, "category": "atmospheric"},
            "B11": {"name": "SWIR 1", "wavelength_nm": 1610, "resolution_m": 20, "category": "swir"},
            "B12": {"name": "SWIR 2", "wavelength_nm": 2190, "resolution_m": 20, "category": "swir"},
            "SCL": {"name": "Scene Classification", "wavelength_nm": 0, "resolution_m": 20, "category": "classification"},
        },
        spectral_indices=["NDVI", "NDWI", "NDBI", "NBR", "NDSI"],
        orbit_types=["sun-synchronous"],
        has_cloud_cover=True,
        stac_extensions=["eo", "sat", "processing"],
        notes="13 bands, 5-day revisit, free on Planetary Computer",
    ),

    "landsat-c2-l2": SensorCapability(
        name="landsat-c2-l2",
        collection_id="landsat-c2-l2",
        full_name="Landsat Collection 2 Level-2 (Surface Reflectance)",
        provider="USGS/NASA",
        is_optical=True,
        is_sar=False,
        is_multispectral=True,
        spatial_resolution_m=30.0,
        temporal_resolution_days=16,
        swath_width_km=185,
        bands={
            "B1": {"name": "Blue", "wavelength_nm": 482, "resolution_m": 30, "category": "visible"},
            "B2": {"name": "Green", "wavelength_nm": 561, "resolution_m": 30, "category": "visible"},
            "B3": {"name": "Red", "wavelength_nm": 655, "resolution_m": 30, "category": "visible"},
            "B4": {"name": "NIR", "wavelength_nm": 865, "resolution_m": 30, "category": "infrared"},
            "B5": {"name": "SWIR 1", "wavelength_nm": 1609, "resolution_m": 30, "category": "swir"},
            "B6": {"name": "SWIR 2", "wavelength_nm": 2201, "resolution_m": 30, "category": "swir"},
            "B7": {"name": "Cirrus", "wavelength_nm": 1373, "resolution_m": 30, "category": "atmospheric"},
        },
        spectral_indices=["NDVI", "NDWI", "NDBI", "NBR", "NDSI"],
        orbit_types=["sun-synchronous"],
        has_cloud_cover=True,
        stac_extensions=["eo", "sat", "processing"],
        notes="7 bands, 16-day revisit, 30m resolution, long archive since 1972",
    ),

    "sentinel-1-grd": SensorCapability(
        name="sentinel-1-grd",
        collection_id="sentinel-1-grd",
        full_name="Sentinel-1 Ground Range Detected (SAR)",
        provider="Copernicus/ESA",
        is_optical=False,
        is_sar=True,
        is_multispectral=False,
        spatial_resolution_m=10.0,
        temporal_resolution_days=6,
        swath_width_km=250,
        polarizations=["VV", "VH", "VV+VH"],
        bands={
            "vv": {"name": "VV Polarization", "resolution_m": 10, "category": "sar"},
            "vh": {"name": "VH Polarization", "resolution_m": 10, "category": "sar"},
        },
        spectral_indices=[],
        orbit_types=["sun-synchronous"],
        acquisition_modes=["IW", "EW", "SM"],
        has_cloud_cover=False,
        stac_extensions=["sar", "sat"],
        notes="C-band SAR, all-weather, penetration through clouds, useful for flood analysis",
    ),

    "naip": SensorCapability(
        name="naip",
        collection_id="naip",
        full_name="National Agriculture Imagery Program",
        provider="USDA",
        is_optical=True,
        is_sar=False,
        is_multispectral=True,
        spatial_resolution_m=0.6,
        temporal_resolution_days=365,
        swath_width_km=100,
        bands={
            "red": {"name": "Red", "resolution_m": 0.6, "category": "visible"},
            "green": {"name": "Green", "resolution_m": 0.6, "category": "visible"},
            "blue": {"name": "Blue", "resolution_m": 0.6, "category": "visible"},
            "nir": {"name": "NIR", "resolution_m": 0.6, "category": "infrared"},
        },
        spectral_indices=["NDVI"],
        orbit_types=["airborne"],
        has_cloud_cover=True,
        notes="0.6m resolution, US only, annual coverage",
    ),
}


# ── Registry accessors ───────────────────────────────────────────


def get_sensor(name: str) -> Optional[SensorCapability]:
    """Get a sensor by collection ID."""
    return SENSOR_REGISTRY.get(name)


def get_all_sensors() -> list[dict[str, Any]]:
    """List all registered sensors with capabilities."""
    result = []
    for name, cap in SENSOR_REGISTRY.items():
        result.append({
            "name": cap.name,
            "collection_id": cap.collection_id,
            "full_name": cap.full_name,
            "provider": cap.provider,
            "is_optical": cap.is_optical,
            "is_sar": cap.is_sar,
            "is_multispectral": cap.is_multispectral,
            "spatial_resolution_m": cap.spatial_resolution_m,
            "temporal_resolution_days": cap.temporal_resolution_days,
            "swath_width_km": cap.swath_width_km,
            "polarizations": cap.polarizations,
            "bands_count": len(cap.bands),
            "spectral_indices": cap.spectral_indices,
            "acquisition_modes": cap.acquisition_modes,
            "has_cloud_cover": cap.has_cloud_cover,
            "notes": cap.notes,
        })
    return result


def get_optical_sensors() -> list[str]:
    """List optical sensor collection IDs."""
    return [name for name, cap in SENSOR_REGISTRY.items() if cap.is_optical]


def get_sar_sensors() -> list[str]:
    """List SAR sensor collection IDs."""
    return [name for name, cap in SENSOR_REGISTRY.items() if cap.is_sar]


def get_sensor_bands(collection: str) -> dict[str, dict[str, Any]]:
    """Get band definitions for a sensor."""
    cap = get_sensor(collection)
    if cap is None:
        return {}
    return cap.bands


def get_sensors_for_index(index_name: str) -> list[str]:
    """Find which sensors support a given spectral index."""
    result = []
    for name, cap in SENSOR_REGISTRY.items():
        if index_name.upper() in cap.spectral_indices:
            result.append(name)
    return result


def recommend_sensor(
    is_optical_needed: bool = True,
    is_sar_needed: bool = False,
    max_resolution: Optional[float] = None,
    min_resolution: Optional[float] = None,
    max_revisit_days: Optional[int] = None,
    needs_cloud_cover: Optional[bool] = None,
) -> list[str]:
    """
    Recommend sensors based on analysis requirements.

    Returns list of matching sensor names, ordered by suitability.
    """
    candidates = []
    for name, cap in SENSOR_REGISTRY.items():
        # Filter by type
        if is_optical_needed and not cap.is_optical:
            continue
        if is_sar_needed and not cap.is_sar:
            continue
        if not is_optical_needed and not is_sar_needed:
            pass  # accept all

        # Filter by resolution
        if max_resolution and cap.spatial_resolution_m > max_resolution:
            continue
        if min_resolution and cap.spatial_resolution_m < min_resolution:
            continue

        # Filter by revisit time
        if max_revisit_days and cap.temporal_resolution_days > max_revisit_days:
            continue

        # Filter by cloud cover capability
        if needs_cloud_cover is True and not cap.has_cloud_cover:
            continue

        candidates.append((name, cap))

    # Sort: prefer higher revisit frequency and better resolution
    candidates.sort(key=lambda x: (x[1].temporal_resolution_days, x[1].spatial_resolution_m))

    return [name for name, _ in candidates]
