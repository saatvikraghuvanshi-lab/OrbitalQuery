"""
Modular spectral index engine.

Registry architecture for computing spectral indices from satellite imagery.
Each index is sensor-aware, formula-documented, and handles nodata/division-by-zero.

Supported indices: NDVI, NDWI, NDBI, NBR, NDSI
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

import numpy as np

logger = logging.getLogger(__name__)


# ── Data classes ────────────────────────────────────────────────────

@dataclass
class IndexDefinition:
    """Definition of a spectral index."""

    name: str
    short_name: str
    formula: str
    description: str
    bands_required: list[str]
    valid_range: tuple[float, float]  # Expected output range
    categories: list[str]  # e.g. ["vegetation"]


@dataclass
class BandMapping:
    """Sensor-specific band mapping for an index."""

    sensor: str
    index_name: str
    band_a: str  # Numerator band
    band_b: str  # Denominator band
    band_c: Optional[str] = None  # Additional band if needed


@dataclass
class IndexResult:
    """Result of computing a spectral index."""

    index_name: str
    short_name: str
    formula: str
    sensor: str
    bands_used: dict[str, str]  # logical → physical band name
    date: Optional[str]
    crs: str
    resolution_meters: float
    shape: list[int]
    dtype: str
    stats: dict[str, float]
    valid_pixels: int
    total_pixels: int
    nodata_pixels: int
    nan_count: int
    infinite_count: int


# ── Sensor band maps ────────────────────────────────────────────────

SENSOR_BANDS: dict[str, dict[str, str]] = {
    "sentinel-2-l2a": {
        "B01": "Coastal aerosol (443nm)",
        "B02": "Blue (490nm)",
        "B03": "Green (560nm)",
        "B04": "Red (665nm)",
        "B05": "Red Edge 1 (705nm)",
        "B06": "Red Edge 2 (740nm)",
        "B07": "Red Edge 3 (783nm)",
        "B08": "NIR (842nm)",
        "B8A": "NIR narrow (865nm)",
        "B09": "Water vapour (945nm)",
        "B11": "SWIR 1 (1610nm)",
        "B12": "SWIR 2 (2190nm)",
        "SCL": "Scene Classification Layer",
    },
    "landsat-c2-l2": {
        "B1": "Blue (482nm)",
        "B2": "Green (561nm)",
        "B3": "Red (655nm)",
        "B4": "NIR (865nm)",
        "B5": "SWIR 1 (1609nm)",
        "B6": "SWIR 2 (2201nm)",
        "B7": "Cirrus (1373nm)",
    },
}


# ── Index definitions ───────────────────────────────────────────────

INDEX_DEFINITIONS: dict[str, IndexDefinition] = {
    "NDVI": IndexDefinition(
        name="Normalized Difference Vegetation Index",
        short_name="NDVI",
        formula="(NIR - RED) / (NIR + RED)",
        description="Measures vegetation greenness and health. High values indicate dense, healthy vegetation.",
        bands_required=["NIR", "RED"],
        valid_range=(-1.0, 1.0),
        categories=["vegetation"],
    ),
    "NDWI": IndexDefinition(
        name="Normalized Difference Water Index",
        short_name="NDWI",
        formula="(GREEN - NIR) / (GREEN + NIR)",
        description="Detects open water bodies. High values indicate water.",
        bands_required=["GREEN", "NIR"],
        valid_range=(-1.0, 1.0),
        categories=["water"],
    ),
    "NDBI": IndexDefinition(
        name="Normalized Difference Built-up Index",
        short_name="NDBI",
        formula="(SWIR - NIR) / (SWIR + NIR)",
        description="Detects built-up/urban areas. High values indicate impervious surfaces.",
        bands_required=["SWIR", "NIR"],
        valid_range=(-1.0, 1.0),
        categories=["urban"],
    ),
    "NBR": IndexDefinition(
        name="Normalized Burn Ratio",
        short_name="NBR",
        formula="(NIR - SWIR2) / (NIR + SWIR2)",
        description="Identifies burned areas and fire severity. Low values indicate recently burned vegetation.",
        bands_required=["NIR", "SWIR2"],
        valid_range=(-1.0, 1.0),
        categories=["fire"],
    ),
    "NDSI": IndexDefinition(
        name="Normalized Difference Snow Index",
        short_name="NDSI",
        formula="(GREEN - SWIR1) / (GREEN + SWIR1)",
        description="Detects snow cover. High values indicate snow/ice.",
        bands_required=["GREEN", "SWIR1"],
        valid_range=(-1.0, 1.0),
        categories=["snow"],
    ),
}


# ── Sensor-specific band mappings for each index ────────────────────

# Maps (sensor, index) → { logical_band → physical_band }
INDEX_BAND_MAP: dict[tuple[str, str], dict[str, str]] = {
    # Sentinel-2
    ("sentinel-2-l2a", "NDVI"): {"NIR": "B08", "RED": "B04"},
    ("sentinel-2-l2a", "NDWI"): {"GREEN": "B03", "NIR": "B08"},
    ("sentinel-2-l2a", "NDBI"): {"SWIR": "B11", "NIR": "B08"},
    ("sentinel-2-l2a", "NBR"): {"NIR": "B08", "SWIR2": "B12"},
    ("sentinel-2-l2a", "NDSI"): {"GREEN": "B03", "SWIR1": "B11"},
    # Landsat 8/9
    ("landsat-c2-l2", "NDVI"): {"NIR": "B4", "RED": "B3"},
    ("landsat-c2-l2", "NDWI"): {"GREEN": "B2", "NIR": "B4"},
    ("landsat-c2-l2", "NDBI"): {"SWIR": "B5", "NIR": "B4"},
    ("landsat-c2-l2", "NBR"): {"NIR": "B4", "SWIR2": "B6"},
    ("landsat-c2-l2", "NDSI"): {"GREEN": "B2", "SWIR1": "B5"},
}


# ── Core computation ────────────────────────────────────────────────

def _safe_divide(
    numerator: np.ndarray,
    denominator: np.ndarray,
    nodata_mask: Optional[np.ndarray] = None,
) -> np.ndarray:
    """
    Safe division with division-by-zero handling.

    Returns NaN where denominator is zero or nodata.
    """
    result = np.full_like(numerator, np.nan, dtype=np.float32)

    # Mask: valid where denominator != 0 AND not nodata
    valid = denominator != 0
    if nodata_mask is not None:
        valid = valid & ~nodata_mask

    result[valid] = numerator[valid] / denominator[valid]

    return result


def compute_index(
    band_a: np.ndarray,
    band_b: np.ndarray,
    index_def: IndexDefinition,
    nodata_a: Optional[np.ndarray] = None,
    nodata_b: Optional[np.ndarray] = None,
) -> np.ndarray:
    """
    Compute a spectral index from two bands.

    Formula: (A - B) / (A + B)

    Handles:
    - nodata propagation: NaN where either band is nodata
    - division by zero: NaN where A + B == 0
    """
    # Combine nodata masks
    combined_nodata = None
    if nodata_a is not None or nodata_b is not None:
        combined_nodata = np.zeros_like(band_a, dtype=bool)
        if nodata_a is not None:
            combined_nodata |= nodata_a
        if nodata_b is not None:
            combined_nodata |= nodata_b

    # Convert to float32 for computation
    a = band_a.astype(np.float32)
    b = band_b.astype(np.float32)

    # Set nodata to NaN
    if combined_nodata is not None:
        a[combined_nodata] = np.nan
        b[combined_nodata] = np.nan

    numerator = a - b
    denominator = a + b

    result = _safe_divide(numerator, denominator, combined_nodata)

    return result


def compute_index_from_bands(
    bands: dict[str, np.ndarray],
    index_name: str,
    sensor: str,
    nodata_masks: Optional[dict[str, np.ndarray]] = None,
    date: Optional[str] = None,
    crs: str = "unknown",
    resolution_meters: float = 0.0,
) -> tuple[np.ndarray, IndexResult]:
    """
    Compute a spectral index using sensor-specific band mapping.

    Returns the index array and detailed result metadata.
    """
    # Look up index definition
    index_def = INDEX_DEFINITIONS.get(index_name.upper())
    if not index_def:
        raise ValueError(f"Unknown index: {index_name}. Available: {list(INDEX_DEFINITIONS.keys())}")

    # Look up band mapping
    band_key = (sensor, index_name.upper())
    band_map = INDEX_BAND_MAP.get(band_key)
    if not band_map:
        raise ValueError(
            f"No band mapping for {index_name} on {sensor}. "
            f"Available sensors: {sorted(set(k[0] for k in INDEX_BAND_MAP.keys()))}"
        )

    # Get physical band names
    required_logical = index_def.bands_required
    physical_bands = {}
    for logical in required_logical:
        physical = band_map.get(logical)
        if physical is None:
            raise ValueError(f"Band mapping missing for {logical} in {index_name}/{sensor}")
        physical_bands[logical] = physical

    # Extract band arrays
    band_a_name = physical_bands[required_logical[0]]
    band_b_name = physical_bands[required_logical[1]]

    if band_a_name not in bands:
        raise ValueError(f"Band {band_a_name} not provided. Available: {list(bands.keys())}")
    if band_b_name not in bands:
        raise ValueError(f"Band {band_b_name} not provided. Available: {list(bands.keys())}")

    band_a = bands[band_a_name]
    band_b = bands[band_b_name]

    # Get nodata masks
    nodata_a = nodata_masks.get(band_a_name) if nodata_masks else None
    nodata_b = nodata_masks.get(band_b_name) if nodata_masks else None

    # Compute
    logger.info(
        "Computing %s: (%s - %s) / (%s + %s) | sensor=%s",
        index_name, band_a_name, band_b_name, band_a_name, band_b_name, sensor,
    )

    result_array = compute_index(band_a, band_b, index_def, nodata_a, nodata_b)

    # Compute statistics
    valid_mask = ~np.isnan(result_array) & ~np.isinf(result_array)
    total_pixels = result_array.size
    valid_pixels = int(np.sum(valid_mask))
    nan_pixels = int(np.sum(np.isnan(result_array)))
    inf_pixels = int(np.sum(np.isinf(result_array)))

    if valid_pixels > 0:
        valid_data = result_array[valid_mask]
        stats = {
            "min": float(np.min(valid_data)),
            "max": float(np.max(valid_data)),
            "mean": float(np.mean(valid_data)),
            "std": float(np.std(valid_data)),
            "median": float(np.median(valid_data)),
            "p5": float(np.percentile(valid_data, 5)),
            "p95": float(np.percentile(valid_data, 95)),
        }
    else:
        stats = {"min": 0, "max": 0, "mean": 0, "std": 0, "median": 0, "p5": 0, "p95": 0}

    # Build result
    result_meta = IndexResult(
        index_name=index_def.name,
        short_name=index_def.short_name,
        formula=index_def.formula,
        sensor=sensor,
        bands_used={logical: physical_bands[logical] for logical in required_logical},
        date=date,
        crs=crs,
        resolution_meters=resolution_meters,
        shape=list(result_array.shape),
        dtype=str(result_array.dtype),
        stats=stats,
        valid_pixels=valid_pixels,
        total_pixels=total_pixels,
        nodata_pixels=total_pixels - valid_pixels,
        nan_count=nan_pixels,
        infinite_count=inf_pixels,
    )

    return result_array, result_meta


# ── Registry accessor ───────────────────────────────────────────────

def get_available_indices() -> list[dict[str, Any]]:
    """List all available indices with their definitions."""
    result = []
    for name, defn in INDEX_DEFINITIONS.items():
        # Find which sensors support this index
        sensors = sorted(set(k[0] for k in INDEX_BAND_MAP if k[1] == name))
        result.append({
            "name": defn.name,
            "short_name": defn.short_name,
            "formula": defn.formula,
            "description": defn.description,
            "bands_required": defn.bands_required,
            "valid_range": list(defn.valid_range),
            "categories": defn.categories,
            "supported_sensors": sensors,
        })
    return result


def get_supported_sensors() -> list[str]:
    """List all sensors with band mappings."""
    return sorted(set(k[0] for k in INDEX_BAND_MAP.keys()))


def validate_index_request(
    index_name: str,
    sensor: str,
    available_bands: list[str],
) -> list[str]:
    """
    Validate that an index request can be fulfilled.

    Returns list of errors (empty = valid).
    """
    errors = []

    # Check index exists
    if index_name.upper() not in INDEX_DEFINITIONS:
        errors.append(f"Unknown index: {index_name}. Available: {list(INDEX_DEFINITIONS.keys())}")
        return errors

    # Check sensor mapping exists
    band_key = (sensor, index_name.upper())
    if band_key not in INDEX_BAND_MAP:
        errors.append(f"No mapping for {index_name} on {sensor}")
        return errors

    # Check required bands are available
    index_def = INDEX_DEFINITIONS[index_name.upper()]
    band_map = INDEX_BAND_MAP[band_key]

    for logical in index_def.bands_required:
        physical = band_map.get(logical)
        if physical is None:
            errors.append(f"Missing mapping for logical band {logical}")
        elif physical not in available_bands:
            errors.append(f"Required band {physical} (for {logical}) not available")

    return errors
