"""
Robust Temporal Change Detection Engine.

Implements a full change-detection pipeline:

  BEFORE / AFTER SCENES
  → common projection/grid
  → exact AOI alignment
  → nodata mask
  → cloud/shadow mask where usable
  → temporal/index computation
  → difference raster
  → adaptive/phenomenon-specific threshold
  → morphological cleanup
  → connected components
  → minimum region filtering
  → localized change regions
  → GeoJSON + statistics + visualization

All thresholds are configurable heuristic prototype thresholds, not
scientific ground truth.

No ML. No "AI detected" language. Pure math on spectral indices.
"""

from __future__ import annotations

import logging
import math
import struct
import zlib
from dataclasses import dataclass, field
from typing import Any, Optional

import numpy as np
from scipy import ndimage

logger = logging.getLogger(__name__)


# ── Core algorithms ──────────────────────────────────────────────────

def compute_difference(
    baseline: np.ndarray,
    comparison: np.ndarray,
) -> np.ndarray:
    """
    Compute element-wise difference: comparison - baseline.

    Positive values = increase in index (e.g. more vegetation)
    Negative values = decrease in index (e.g. vegetation loss)
    NaN propagation: if either pixel is NaN, result is NaN.
    """
    baseline_f = baseline.astype(np.float32)
    comparison_f = comparison.astype(np.float32)

    diff = comparison_f - baseline_f

    # Propagate NaN
    nan_mask = np.isnan(baseline_f) | np.isnan(comparison_f)
    diff[nan_mask] = np.nan

    return diff


def apply_threshold(
    diff: np.ndarray,
    threshold: float,
    direction: str = "absolute",
) -> np.ndarray:
    """
    Apply threshold to difference map.

    direction:
    - 'absolute': |diff| > threshold (any change)
    - 'increase': diff > threshold
    - 'decrease': diff < -threshold

    Returns binary mask: True = change detected.
    """
    valid = ~np.isnan(diff)

    if direction == "increase":
        change = valid & (diff > threshold)
    elif direction == "decrease":
        change = valid & (diff < -threshold)
    else:  # absolute
        change = valid & (np.abs(diff) > threshold)

    return change.astype(bool)


# ── Phenomenon-aware thresholds ──────────────────────────────────────

# These are heuristic prototype thresholds, NOT scientific ground truth.
# Each phenomenon has: base_threshold, min_region_pixels, direction, optional multi-signal
PHENOMENON_CONFIG: dict[str, dict[str, Any]] = {
    "urban_expansion": {
        "index": "NDBI",
        "threshold": 0.12,
        "min_region_pixels": 25,
        "direction": "increase",
        "multi_signal": True,  # use NDBI + NDVI
        "ndvi_decrease_threshold": 0.10,
        "description": "Candidate built-up change regions (NDBI increase + optional NDVI decrease)",
    },
    "vegetation_change": {
        "index": "NDVI",
        "threshold": 0.15,
        "min_region_pixels": 30,
        "direction": "absolute",
        "multi_signal": False,
        "description": "Spectral vegetation change regions",
    },
    "deforestation": {
        "index": "NDVI",
        "threshold": 0.15,
        "min_region_pixels": 30,
        "direction": "decrease",
        "multi_signal": False,
        "description": "Candidate vegetation loss regions",
    },
    "flood_impact": {
        "index": "NDWI",
        "threshold": 0.12,
        "min_region_pixels": 20,
        "direction": "increase",
        "multi_signal": False,
        "description": "Candidate water extent change regions",
    },
    "water_change": {
        "index": "NDWI",
        "threshold": 0.12,
        "min_region_pixels": 20,
        "direction": "absolute",
        "multi_signal": False,
        "description": "Water body change regions",
    },
    "burn_severity": {
        "index": "NBR",
        "threshold": 0.15,
        "min_region_pixels": 25,
        "direction": "decrease",
        "multi_signal": False,
        "description": "Candidate burn scar regions (dNBR)",
    },
    "snow_cover": {
        "index": "NDSI",
        "threshold": 0.12,
        "min_region_pixels": 20,
        "direction": "absolute",
        "multi_signal": False,
        "description": "Snow/ice cover change regions",
    },
    "glacier_retreat": {
        "index": "NDSI",
        "threshold": 0.10,
        "min_region_pixels": 25,
        "direction": "decrease",
        "multi_signal": False,
        "description": "Candidate glacier retreat regions",
    },
    "coastal_erosion": {
        "index": "NDWI",
        "threshold": 0.12,
        "min_region_pixels": 20,
        "direction": "absolute",
        "multi_signal": False,
        "description": "Coastline change regions",
    },
    "soil_moisture": {
        "index": "NDVI",
        "threshold": 0.10,
        "min_region_pixels": 25,
        "direction": "absolute",
        "multi_signal": False,
        "description": "Soil moisture proxy change regions",
    },
    "land_cover_change": {
        "index": "NDVI",
        "threshold": 0.12,
        "min_region_pixels": 25,
        "direction": "absolute",
        "multi_signal": False,
        "description": "Land cover change regions",
    },
}

DEFAULT_CONFIG = {
    "index": "NDVI",
    "threshold": 0.15,
    "min_region_pixels": 30,
    "direction": "absolute",
    "multi_signal": False,
    "description": "Spectral change regions",
}


# ── Data classes ────────────────────────────────────────────────────

@dataclass
class ChangeRegion:
    """A single vectorized change region."""

    region_id: int
    area_pixels: int
    area_sq_meters: float
    bbox: list[float]  # [min_row, min_col, max_row, max_col] pixel coords
    centroid: list[float]  # [row, col] pixel coords
    mean_delta: float
    max_delta: float
    min_delta: float
    direction: str  # "increase", "decrease", or "mixed"
    polygon_coords: list[list[list[float]]]  # GeoJSON polygon coords


@dataclass
class ChangeDetectionResult:
    """Complete result of change detection analysis."""

    status: str
    algorithm: str
    parameters: dict[str, Any]

    # Input metadata
    baseline_date: str
    comparison_date: str
    index_name: str
    aoi_bbox: list[float]
    crs: str
    resolution_meters: float

    # Maps
    baseline_shape: list[int]
    comparison_shape: list[int]
    difference_shape: list[int]
    mask_shape: list[int]

    # Statistics (valid pixels only)
    total_pixels: int  # total valid comparable pixels
    changed_pixels: int
    unchanged_pixels: int
    changed_pct: float
    total_area_sq_meters: float
    changed_area_sq_meters: float
    valid_area_sq_meters: float

    # Index statistics
    baseline_stats: dict[str, float]
    comparison_stats: dict[str, float]
    difference_stats: dict[str, float]

    # Change regions
    num_regions: int
    regions: list[dict[str, Any]]
    largest_region: Optional[dict[str, Any]]

    # GeoJSON
    change_geojson: Optional[dict[str, Any]]

    # Visualization
    change_visualization_png: Optional[str]  # hex-encoded PNG

    # Processing metadata
    processing_steps: list[dict[str, str]]
    reproducibility: dict[str, Any]

    # Quality metadata
    valid_pixel_ratio: float  # fraction of total pixels that were valid
    nodata_pixels: int
    cloud_masked_pixels: int


# ── Alignment ────────────────────────────────────────────────────────

def align_rasters(
    baseline: np.ndarray,
    comparison: np.ndarray,
    baseline_transform: Any = None,
    comparison_transform: Any = None,
    target_shape: Optional[tuple[int, int]] = None,
) -> tuple[np.ndarray, np.ndarray, dict[str, Any]]:
    """
    Align two rasters to a common grid.

    If shapes already match, returns as-is.
    If shapes differ, crops/resamples both to the minimum common shape.

    Returns:
        (aligned_baseline, aligned_comparison, alignment_info)
    """
    info = {
        "baseline_original_shape": list(baseline.shape),
        "comparison_original_shape": list(comparison.shape),
        "aligned": False,
        "method": "none",
    }

    if baseline.shape == comparison.shape:
        info["aligned_shape"] = list(baseline.shape)
        return baseline, comparison, info

    # Crop to minimum common dimensions
    if target_shape:
        h, w = target_shape
    else:
        h = min(baseline.shape[0], comparison.shape[0])
        w = min(baseline.shape[1], comparison.shape[1])

    aligned_b = baseline[:h, :w]
    aligned_c = comparison[:h, :w]

    info["aligned"] = True
    info["method"] = "crop_to_common"
    info["aligned_shape"] = [h, w]

    return aligned_b, aligned_c, info


# ── Valid-pixel masking ──────────────────────────────────────────────

def compute_valid_mask(
    baseline: np.ndarray,
    comparison: np.ndarray,
    nodata_baseline: Optional[np.ndarray] = None,
    nodata_comparison: Optional[np.ndarray] = None,
    cloud_baseline: Optional[np.ndarray] = None,
    cloud_comparison: Optional[np.ndarray] = None,
) -> tuple[np.ndarray, dict[str, int]]:
    """
    Compute a valid-pixel mask excluding nodata, clouds, and NaN.

    A pixel is valid only if it is:
    - not NaN in either baseline or comparison
    - not nodata in either baseline or comparison
    - not cloud/shadow in either baseline or comparison

    Returns:
        (valid_mask, counts)
    """
    h, w = baseline.shape
    valid = np.ones((h, w), dtype=bool)

    # Exclude NaN
    valid &= ~np.isnan(baseline) & ~np.isnan(comparison)

    # Exclude nodata
    nodata_count = 0
    if nodata_baseline is not None:
        nodata_count += int(np.sum(nodata_baseline))
        valid &= ~nodata_baseline
    if nodata_comparison is not None:
        nodata_count += int(np.sum(nodata_comparison))
        valid &= ~nodata_comparison

    # Exclude clouds
    cloud_count = 0
    if cloud_baseline is not None:
        cloud_count += int(np.sum(cloud_baseline))
        valid &= ~cloud_baseline
    if cloud_comparison is not None:
        cloud_count += int(np.sum(cloud_comparison))
        valid &= ~cloud_comparison

    total_pixels = h * w
    valid_count = int(np.sum(valid))

    counts = {
        "total_pixels": total_pixels,
        "valid_pixels": valid_count,
        "nodata_pixels": nodata_count,
        "cloud_masked_pixels": cloud_count,
        "nan_pixels": total_pixels - valid_count - nodata_count - cloud_count,
    }

    return valid, counts


# ── Morphological cleanup ────────────────────────────────────────────

def morphological_cleanup(
    mask: np.ndarray,
    min_region_size: int,
    opening_iterations: int = 1,
) -> tuple[np.ndarray, int]:
    """
    Apply morphological opening + minimum region filtering.

    1. Binary opening (removes isolated single-pixel noise)
    2. Connected component labeling
    3. Remove regions smaller than min_region_size

    Returns:
        (cleaned_mask, num_regions)
    """
    struct = ndimage.generate_binary_structure(2, 1)  # 4-connectivity

    # Step 1: Morphological opening
    if opening_iterations > 0:
        opened = ndimage.binary_opening(mask, structure=struct, iterations=opening_iterations)
    else:
        opened = mask.copy()

    # Step 2: Connected components
    labeled, num_raw = ndimage.label(opened)

    if num_raw == 0:
        return np.zeros_like(mask, dtype=bool), 0

    # Step 3: Remove small regions
    sizes = ndimage.sum(opened, labeled, range(1, num_raw + 1))
    cleaned = np.zeros_like(mask, dtype=bool)
    kept = 0
    for i, size in enumerate(sizes):
        if size >= min_region_size:
            cleaned[labeled == (i + 1)] = True
            kept += 1

    # Relabel
    final_labeled, final_num = ndimage.label(cleaned)

    return cleaned, final_num


# ── Region extraction ────────────────────────────────────────────────

def extract_regions(
    labeled: np.ndarray,
    diff: np.ndarray,
    valid_mask: np.ndarray,
    num_regions: int,
    resolution_meters: float,
    transform: Any = None,
    crs: str = "EPSG:4326",
) -> list[ChangeRegion]:
    """
    Extract detailed statistics for each connected change region.

    For each region:
    - bounding box
    - centroid (pixel + geographic)
    - area (pixels + sq meters)
    - mean/max/min delta
    - direction classification
    - polygon coordinates (bounding box polygon)
    """
    regions = []

    for i in range(1, num_regions + 1):
        region_mask = labeled == i
        region_diff = diff[region_mask]

        # Valid (non-NaN) pixels in this region
        valid_diff = region_diff[~np.isnan(region_diff)]
        if len(valid_diff) == 0:
            continue

        # Bounding box
        rows, cols = np.where(region_mask)
        min_row, max_row = int(rows.min()), int(rows.max())
        min_col, max_col = int(cols.min()), int(cols.max())
        bbox = [min_row, min_col, max_row, max_col]
        centroid_row = float(rows.mean())
        centroid_col = float(cols.mean())

        # Area
        area_pixels = int(np.sum(region_mask))
        area_sq_meters = area_pixels * (resolution_meters ** 2)

        # Statistics
        mean_delta = float(np.mean(valid_diff))
        max_delta = float(np.max(valid_diff))
        min_delta = float(np.min(valid_diff))

        # Direction classification
        positive_count = int(np.sum(valid_diff > 0))
        negative_count = int(np.sum(valid_diff < 0))
        if positive_count > negative_count * 1.5:
            direction = "increase"
        elif negative_count > positive_count * 1.5:
            direction = "decrease"
        else:
            direction = "mixed"

        # Polygon coordinates (bounding box in geographic coords)
        polygon_coords = _pixel_bbox_to_polygon(
            min_row, min_col, max_row, max_col,
            transform, resolution_meters,
        )

        regions.append(ChangeRegion(
            region_id=i,
            area_pixels=area_pixels,
            area_sq_meters=area_sq_meters,
            bbox=bbox,
            centroid=[centroid_row, centroid_col],
            mean_delta=mean_delta,
            max_delta=max_delta,
            min_delta=min_delta,
            direction=direction,
            polygon_coords=polygon_coords,
        ))

    # Sort by area descending
    regions.sort(key=lambda r: r.area_pixels, reverse=True)

    # Re-number after sorting
    for idx, r in enumerate(regions):
        r.region_id = idx + 1

    return regions


def _pixel_bbox_to_polygon(
    min_row: int,
    min_col: int,
    max_row: int,
    max_col: int,
    transform: Any,
    resolution_meters: float,
) -> list[list[list[float]]]:
    """
    Convert pixel bounding box to geographic polygon coordinates.

    If a rasterio transform is available, use it.
    Otherwise, fall back to resolution-based estimation.
    """
    if transform is not None:
        try:
            # Use rasterio transform to convert pixel → geographic
            from rasterio.transform import xy

            # Get corners of the bounding box
            top_left = xy(transform, min_row, min_col)
            top_right = xy(transform, min_row, max_col + 1)
            bottom_right = xy(transform, max_row + 1, max_col + 1)
            bottom_left = xy(transform, max_row + 1, min_col)

            return [[
                list(top_left),
                list(top_right),
                list(bottom_right),
                list(bottom_left),
                list(top_left),
            ]]
        except Exception:
            pass

    # Fallback: resolution-based (no geographic coords available)
    x_min = min_col * resolution_meters
    x_max = (max_col + 1) * resolution_meters
    y_min = min_row * resolution_meters
    y_max = (max_row + 1) * resolution_meters

    return [[
        [x_min, y_min],
        [x_max, y_min],
        [x_max, y_max],
        [x_min, y_max],
        [x_min, y_min],
    ]]


# ── GeoJSON generation ──────────────────────────────────────────────

def build_geojson(
    regions: list[ChangeRegion],
    aoi_bbox: list[float],
    index_name: str,
    algorithm: str,
) -> dict[str, Any]:
    """
    Build a GeoJSON FeatureCollection from detected change regions.

    Each region becomes a Feature with a Polygon geometry and
    properties containing the region's statistics.
    """
    features = []

    for region in regions:
        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": region.polygon_coords,
            },
            "properties": {
                "region_id": region.region_id,
                "area_pixels": region.area_pixels,
                "area_sq_meters": round(region.area_sq_meters, 2),
                "mean_delta": round(region.mean_delta, 4),
                "max_delta": round(region.max_delta, 4),
                "min_delta": round(region.min_delta, 4),
                "direction": region.direction,
                "index_name": index_name,
                "algorithm": algorithm,
            },
        }
        features.append(feature)

    return {
        "type": "FeatureCollection",
        "features": features,
        "properties": {
            "aoi_bbox": aoi_bbox,
            "num_regions": len(regions),
            "index_name": index_name,
            "algorithm": algorithm,
        },
    }


# ── Visualization ────────────────────────────────────────────────────

def generate_change_visualization(
    labeled: np.ndarray,
    diff: np.ndarray,
    valid_mask: np.ndarray,
    num_regions: int,
    change_increase: Optional[np.ndarray] = None,
    change_decrease: Optional[np.ndarray] = None,
) -> str:
    """
    Generate a change visualization PNG as a hex string.

    Colors:
    - No change / nodata / cloud: transparent (RGBA 0,0,0,0)
    - Increase (green channel): RGB 0, 220, 100
    - Decrease (red channel): RGB 220, 60, 60
    - Mixed: RGB 200, 180, 60

    The PNG is aligned to the AOI and only shows actual changed pixels.
    """
    h, w = labeled.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)

    if num_regions == 0:
        # No change — fully transparent
        return _encode_rgba_png(rgba)

    # Color increase regions green
    for i in range(1, num_regions + 1):
        region_mask = labeled == i
        rows, cols = np.where(region_mask)
        if len(rows) == 0:
            continue

        region_diff = diff[region_mask]
        valid_diff = region_diff[~np.isnan(region_diff)]
        if len(valid_diff) == 0:
            continue

        positive = int(np.sum(valid_diff > 0))
        negative = int(np.sum(valid_diff < 0))

        if positive > negative * 1.5:
            # Increase: green
            rgba[rows, cols] = [0, 220, 100, 180]
        elif negative > positive * 1.5:
            # Decrease: red
            rgba[rows, cols] = [220, 60, 60, 180]
        else:
            # Mixed: amber
            rgba[rows, cols] = [200, 180, 60, 160]

    return _encode_rgba_png(rgba)


def _encode_rgba_png(rgba_array: np.ndarray) -> str:
    """Encode a (H, W, 4) uint8 RGBA array as a hex-encoded PNG."""
    h, w = rgba_array.shape[:2]

    sig = b'\x89PNG\r\n\x1a\n'

    # IHDR
    ihdr_data = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)
    ihdr = _make_png_chunk(b'IHDR', ihdr_data)

    # IDAT
    raw_rows = []
    for row in rgba_array:
        raw_rows.append(b'\x00' + row.tobytes())
    raw = b''.join(raw_rows)
    compressed = zlib.compress(raw, 6)
    idat = _make_png_chunk(b'IDAT', compressed)

    # IEND
    iend = _make_png_chunk(b'IEND', b'')

    return (sig + ihdr + idat + iend).hex()


def _make_png_chunk(chunk_type: bytes, data: bytes) -> bytes:
    """Create a PNG chunk: length + type + data + CRC."""
    chunk = chunk_type + data
    crc = zlib.crc32(chunk) & 0xFFFFFFFF
    return struct.pack('>I', len(data)) + chunk + struct.pack('>I', crc)


# ── Statistics ──────────────────────────────────────────────────────

def compute_array_stats(arr: np.ndarray, valid_mask: Optional[np.ndarray] = None) -> dict[str, float]:
    """Compute statistics for a numpy array, using only valid pixels."""
    if valid_mask is not None:
        valid_arr = arr[valid_mask & ~np.isnan(arr)]
    else:
        valid_arr = arr[~np.isnan(arr)]

    if len(valid_arr) == 0:
        return {"min": 0, "max": 0, "mean": 0, "std": 0, "median": 0}

    return {
        "min": float(np.min(valid_arr)),
        "max": float(np.max(valid_arr)),
        "mean": float(np.mean(valid_arr)),
        "std": float(np.std(valid_arr)),
        "median": float(np.median(valid_arr)),
    }


# ── Main pipeline ───────────────────────────────────────────────────

def run_change_detection(
    baseline: np.ndarray,
    comparison: np.ndarray,
    index_name: str,
    aoi_bbox: list[float],
    threshold: Optional[float] = None,
    min_region_size: Optional[int] = None,
    direction: Optional[str] = None,
    baseline_date: str = "unknown",
    comparison_date: str = "unknown",
    crs: str = "EPSG:4326",
    resolution_meters: float = 10.0,
    phenomenon: Optional[str] = None,
    nodata_baseline: Optional[np.ndarray] = None,
    nodata_comparison: Optional[np.ndarray] = None,
    cloud_baseline: Optional[np.ndarray] = None,
    cloud_comparison: Optional[np.ndarray] = None,
    baseline_transform: Any = None,
    comparison_transform: Any = None,
    # Multi-signal support
    ndvi_baseline: Optional[np.ndarray] = None,
    ndvi_comparison: Optional[np.ndarray] = None,
) -> ChangeDetectionResult:
    """
    Full change detection pipeline.

    Steps:
    1. Validate inputs
    2. Align rasters to common grid
    3. Compute valid-pixel mask (exclude nodata/cloud/NaN)
    4. Compute difference raster
    5. Apply phenomenon-aware threshold
    6. Multi-signal combination (if applicable)
    7. Morphological cleanup
    8. Connected component labeling
    9. Extract region statistics + GeoJSON
    10. Generate visualization
    11. Compute area statistics using valid pixels only

    All steps are deterministic and reproducible.
    """
    processing_steps: list[dict[str, str]] = []

    # ── Step 0: Load phenomenon config ──────────────────────────
    config = PHENOMENON_CONFIG.get(phenomenon, DEFAULT_CONFIG) if phenomenon else DEFAULT_CONFIG
    effective_threshold = threshold if threshold is not None else config["threshold"]
    effective_min_size = min_region_size if min_region_size is not None else config["min_region_pixels"]
    effective_direction = direction if direction is not None else config["direction"]

    processing_steps.append({
        "step": "load_config",
        "detail": (
            f"phenomenon={phenomenon}, index={index_name}, "
            f"threshold={effective_threshold}, direction={effective_direction}, "
            f"min_region={effective_min_size}"
        ),
    })

    # ── Step 1: Validate inputs ─────────────────────────────────
    if baseline.ndim != 2 or comparison.ndim != 2:
        raise ValueError(
            f"Expected 2D arrays, got baseline={baseline.shape}, comparison={comparison.shape}"
        )

    processing_steps.append({
        "step": "validate_inputs",
        "detail": f"baseline={baseline.shape}, comparison={comparison.shape}",
    })

    # ── Step 2: Align rasters ───────────────────────────────────
    aligned_b, aligned_c, alignment_info = align_rasters(
        baseline, comparison, baseline_transform, comparison_transform,
    )

    # Also align masks if provided
    if nodata_baseline is not None and nodata_baseline.shape != aligned_b.shape:
        nodata_baseline = nodata_baseline[:aligned_b.shape[0], :aligned_b.shape[1]]
    if nodata_comparison is not None and nodata_comparison.shape != aligned_c.shape:
        nodata_comparison = nodata_comparison[:aligned_c.shape[0], :aligned_c.shape[1]]
    if cloud_baseline is not None and cloud_baseline.shape != aligned_b.shape:
        cloud_baseline = cloud_baseline[:aligned_b.shape[0], :aligned_b.shape[1]]
    if cloud_comparison is not None and cloud_comparison.shape != aligned_c.shape:
        cloud_comparison = cloud_comparison[:aligned_c.shape[0], :aligned_c.shape[1]]

    # Align secondary indices if provided
    if ndvi_baseline is not None and ndvi_baseline.shape != aligned_b.shape:
        ndvi_baseline = ndvi_baseline[:aligned_b.shape[0], :aligned_b.shape[1]]
    if ndvi_comparison is not None and ndvi_comparison.shape != aligned_c.shape:
        ndvi_comparison = ndvi_comparison[:aligned_c.shape[0], :aligned_c.shape[1]]

    processing_steps.append({
        "step": "align_rasters",
        "detail": f"method={alignment_info['method']}, shape={alignment_info.get('aligned_shape')}",
    })

    # ── Step 3: Compute valid-pixel mask ────────────────────────
    valid_mask, pixel_counts = compute_valid_mask(
        aligned_b, aligned_c,
        nodata_baseline=nodata_baseline,
        nodata_comparison=nodata_comparison,
        cloud_baseline=cloud_baseline,
        cloud_comparison=cloud_comparison,
    )

    valid_ratio = pixel_counts["valid_pixels"] / max(pixel_counts["total_pixels"], 1)

    processing_steps.append({
        "step": "valid_pixel_mask",
        "detail": (
            f"valid={pixel_counts['valid_pixels']}/{pixel_counts['total_pixels']} "
            f"({valid_ratio:.1%}), nodata={pixel_counts['nodata_pixels']}, "
            f"cloud={pixel_counts['cloud_masked_pixels']}"
        ),
    })

    # ── Step 4: Compute difference ──────────────────────────────
    diff = compute_difference(aligned_b, aligned_c)

    # Apply valid mask to difference
    diff[~valid_mask] = np.nan

    processing_steps.append({
        "step": "compute_difference",
        "detail": "diff = comparison - baseline (valid pixels only)",
    })

    # ── Step 5: Apply threshold ─────────────────────────────────
    raw_change_mask = apply_threshold(diff, effective_threshold, effective_direction)

    processing_steps.append({
        "step": "apply_threshold",
        "detail": f"direction={effective_direction}, threshold={effective_threshold}",
    })

    # ── Step 6: Multi-signal combination (urban expansion) ──────
    if config.get("multi_signal") and ndvi_baseline is not None and ndvi_comparison is not None:
        ndvi_diff = ndvi_comparison - ndvi_baseline
        ndvi_decrease = valid_mask & (ndvi_diff < -config.get("ndvi_decrease_threshold", 0.10))

        # Combine: NDBI increase AND (optional) NDVI decrease
        combined = raw_change_mask.copy()
        # Keep pixels where NDBI increased
        # Additionally mark pixels where both NDBI increased and NDVI decreased
        # as higher confidence
        dual_signal = raw_change_mask & (ndvi_diff < 0)  # NDBI up, NDVI down
        combined = raw_change_mask | dual_signal

        processing_steps.append({
            "step": "multi_signal",
            "detail": (
                f"Combined NDBI increase with NDVI decrease signal. "
                f"Dual-signal pixels: {int(np.sum(dual_signal))}"
            ),
        })
        raw_change_mask = combined

    # ── Step 7: Morphological cleanup ───────────────────────────
    cleaned_mask, num_regions = morphological_cleanup(
        raw_change_mask, effective_min_size,
    )

    processing_steps.append({
        "step": "morphological_cleanup",
        "detail": (
            f"opening_iterations=1, min_region_size={effective_min_size}, "
            f"raw_change={int(np.sum(raw_change_mask))} → "
            f"cleaned={int(np.sum(cleaned_mask))} pixels, "
            f"{num_regions} regions"
        ),
    })

    # ── Step 8: Connected components + region extraction ────────
    labeled, _ = ndimage.label(cleaned_mask)

    regions = extract_regions(
        labeled, diff, valid_mask, num_regions,
        resolution_meters, baseline_transform, crs,
    )

    regions_dicts = []
    for r in regions:
        regions_dicts.append({
            "region_id": r.region_id,
            "area_pixels": r.area_pixels,
            "area_sq_meters": round(r.area_sq_meters, 2),
            "bbox": r.bbox,
            "centroid": [round(r.centroid[0], 2), round(r.centroid[1], 2)],
            "mean_delta": round(r.mean_delta, 4),
            "max_delta": round(r.max_delta, 4),
            "min_delta": round(r.min_delta, 4),
            "direction": r.direction,
        })

    largest_region = regions_dicts[0] if regions_dicts else None

    processing_steps.append({
        "step": "extract_regions",
        "detail": f"Extracted {len(regions)} regions with statistics",
    })

    # ── Step 9: GeoJSON ─────────────────────────────────────────
    change_geojson = build_geojson(
        regions, aoi_bbox, index_name, config.get("algorithm", "difference_threshold"),
    )

    processing_steps.append({
        "step": "build_geojson",
        "detail": f"GeoJSON FeatureCollection with {len(regions)} features",
    })

    # ── Step 10: Visualization ──────────────────────────────────
    visualization_png = generate_change_visualization(
        labeled, diff, valid_mask, num_regions,
    )

    processing_steps.append({
        "step": "generate_visualization",
        "detail": f"RGBA PNG ({labeled.shape[0]}x{labeled.shape[1]})",
    })

    # ── Step 11: Area calculations (valid pixels only) ──────────
    total_valid_pixels = pixel_counts["valid_pixels"]
    changed_pixels = int(np.sum(cleaned_mask))
    unchanged_pixels = total_valid_pixels - changed_pixels
    total_area = total_valid_pixels * (resolution_meters ** 2)
    changed_area = changed_pixels * (resolution_meters ** 2)
    valid_area = total_valid_pixels * (resolution_meters ** 2)
    changed_pct = (changed_pixels / total_valid_pixels * 100) if total_valid_pixels > 0 else 0.0

    processing_steps.append({
        "step": "area_calculation",
        "detail": (
            f"changed={changed_pixels}/{total_valid_pixels} valid pixels "
            f"({changed_pct:.2f}%), {changed_area:.0f} m²"
        ),
    })

    # ── Step 12: Array statistics ───────────────────────────────
    baseline_stats = compute_array_stats(aligned_b, valid_mask)
    comparison_stats = compute_array_stats(aligned_c, valid_mask)
    difference_stats = compute_array_stats(diff, valid_mask)

    # ── Build result ────────────────────────────────────────────
    return ChangeDetectionResult(
        status="ok",
        algorithm="phenomenon_aware_difference",
        parameters={
            "index_name": index_name,
            "threshold": effective_threshold,
            "min_region_size": effective_min_size,
            "direction": effective_direction,
            "phenomenon": phenomenon,
            "multi_signal": config.get("multi_signal", False),
        },
        baseline_date=baseline_date,
        comparison_date=comparison_date,
        index_name=index_name,
        aoi_bbox=aoi_bbox,
        crs=crs,
        resolution_meters=resolution_meters,
        baseline_shape=list(aligned_b.shape),
        comparison_shape=list(aligned_c.shape),
        difference_shape=list(diff.shape),
        mask_shape=list(cleaned_mask.shape),
        total_pixels=total_valid_pixels,
        changed_pixels=changed_pixels,
        unchanged_pixels=unchanged_pixels,
        changed_pct=round(changed_pct, 4),
        total_area_sq_meters=round(total_area, 2),
        changed_area_sq_meters=round(changed_area, 2),
        valid_area_sq_meters=round(valid_area, 2),
        baseline_stats=baseline_stats,
        comparison_stats=comparison_stats,
        difference_stats=difference_stats,
        num_regions=num_regions,
        regions=regions_dicts,
        largest_region=largest_region,
        change_geojson=change_geojson,
        change_visualization_png=visualization_png,
        processing_steps=processing_steps,
        reproducibility={
            "algorithm": "phenomenon_aware_difference",
            "inputs": {
                "baseline_date": baseline_date,
                "comparison_date": comparison_date,
                "index_name": index_name,
                "aoi_bbox": aoi_bbox,
                "phenomenon": phenomenon,
            },
            "parameters": {
                "threshold": effective_threshold,
                "min_region_size": effective_min_size,
                "direction": effective_direction,
                "resolution_meters": resolution_meters,
            },
            "deterministic": True,
            "note": "Results are fully reproducible from inputs + parameters + algorithm.",
        },
        valid_pixel_ratio=round(valid_ratio, 4),
        nodata_pixels=pixel_counts["nodata_pixels"],
        cloud_masked_pixels=pixel_counts["cloud_masked_pixels"],
    )
