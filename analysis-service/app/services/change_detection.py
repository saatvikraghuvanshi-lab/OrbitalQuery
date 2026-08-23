"""
Deterministic temporal change detection engine.

Difference-based index change detection. Every step is deterministic
and reproducible from: scene IDs + processing parameters + algorithm.

No ML. No "AI detected" language. Pure math on spectral indices.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Optional

import numpy as np
from scipy import ndimage

logger = logging.getLogger(__name__)


# ── Data classes ────────────────────────────────────────────────────

@dataclass
class ChangeRegion:
    """A single vectorized change region."""

    region_id: int
    area_pixels: int
    area_sq_meters: float
    bbox: list[float]  # [min_row, min_col, max_row, max_col] in pixel coords
    centroid: list[float]  # [row, col] in pixel coords
    mean_delta: float
    max_delta: float
    min_delta: float


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

    # Maps (as metadata — actual arrays not serialized)
    baseline_shape: list[int]
    comparison_shape: list[int]
    difference_shape: list[int]
    mask_shape: list[int]

    # Statistics
    total_pixels: int
    changed_pixels: int
    unchanged_pixels: int
    changed_pct: float
    total_area_sq_meters: float
    changed_area_sq_meters: float

    # Index statistics
    baseline_stats: dict[str, float]
    comparison_stats: dict[str, float]
    difference_stats: dict[str, float]

    # Change regions
    num_regions: int
    regions: list[dict[str, Any]]
    largest_region: Optional[dict[str, Any]]

    # Processing metadata
    processing_steps: list[dict[str, str]]
    reproducibility: dict[str, Any]


# ── Core algorithms ─────────────────────────────────────────────────

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


def remove_small_regions(
    mask: np.ndarray,
    min_size: int,
) -> np.ndarray:
    """
    Remove connected regions smaller than min_size pixels.

    Uses morphological opening followed by connected component labeling.
    """
    if min_size <= 1:
        return mask

    # Label connected components
    labeled, num_features = ndimage.label(mask)

    # Find region sizes
    sizes = ndimage.sum(mask, labeled, range(1, num_features + 1))

    # Create cleaned mask
    cleaned = np.zeros_like(mask, dtype=bool)
    for i, size in enumerate(sizes):
        if size >= min_size:
            cleaned[labeled == (i + 1)] = True

    return cleaned


def find_connected_components(
    mask: np.ndarray,
) -> tuple[np.ndarray, int]:
    """
    Label connected components in binary mask.

    Returns labeled array and number of regions.
    """
    labeled, num_features = ndimage.label(mask)
    return labeled, num_features


def compute_region_stats(
    mask: np.ndarray,
    labeled: np.ndarray,
    diff: np.ndarray,
    num_regions: int,
    resolution_meters: float,
) -> list[ChangeRegion]:
    """
    Compute statistics for each connected change region.
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
        bbox = [int(rows.min()), int(cols.min()), int(rows.max()), int(cols.max())]
        centroid = [float(rows.mean()), float(cols.mean())]

        area_pixels = int(np.sum(region_mask))
        area_sq_meters = area_pixels * (resolution_meters ** 2)

        regions.append(ChangeRegion(
            region_id=i,
            area_pixels=area_pixels,
            area_sq_meters=area_sq_meters,
            bbox=bbox,
            centroid=centroid,
            mean_delta=float(np.mean(valid_diff)),
            max_delta=float(np.max(valid_diff)),
            min_delta=float(np.min(valid_diff)),
        ))

    # Sort by area descending
    regions.sort(key=lambda r: r.area_pixels, reverse=True)

    return regions


def vectorize_regions(
    labeled: np.ndarray,
    num_regions: int,
    resolution_meters: float,
    origin_x: float = 0.0,
    origin_y: float = 0.0,
) -> list[dict[str, Any]]:
    """
    Convert labeled regions to GeoJSON-like polygon coordinates.

    Each region becomes a simplified bounding box polygon.
    """
    polygons = []

    for i in range(1, num_regions + 1):
        region_mask = labeled == i
        rows, cols = np.where(region_mask)

        if len(rows) == 0:
            continue

        # Bounding box polygon in pixel coordinates
        min_row, max_row = int(rows.min()), int(rows.max())
        min_col, max_col = int(cols.min()), int(cols.max())

        # Convert to geographic coordinates
        coords = [
            [
                [origin_x + min_col * resolution_meters, origin_y + min_row * resolution_meters],
                [origin_x + (max_col + 1) * resolution_meters, origin_y + min_row * resolution_meters],
                [origin_x + (max_col + 1) * resolution_meters, origin_y + (max_row + 1) * resolution_meters],
                [origin_x + min_col * resolution_meters, origin_y + (max_row + 1) * resolution_meters],
                [origin_x + min_col * resolution_meters, origin_y + min_row * resolution_meters],
            ]
        ]

        polygons.append({
            "type": "Polygon",
            "coordinates": coords,
            "properties": {
                "region_id": i,
                "area_pixels": int(np.sum(region_mask)),
            },
        })

    return polygons


# ── Statistics ──────────────────────────────────────────────────────

def compute_array_stats(arr: np.ndarray) -> dict[str, float]:
    """Compute statistics for a numpy array, excluding NaN."""
    valid = arr[~np.isnan(arr)]
    if len(valid) == 0:
        return {"min": 0, "max": 0, "mean": 0, "std": 0, "median": 0}

    return {
        "min": float(np.min(valid)),
        "max": float(np.max(valid)),
        "mean": float(np.mean(valid)),
        "std": float(np.std(valid)),
        "median": float(np.median(valid)),
    }


# ── Main pipeline ───────────────────────────────────────────────────

def run_change_detection(
    baseline: np.ndarray,
    comparison: np.ndarray,
    index_name: str,
    aoi_bbox: list[float],
    threshold: float,
    min_region_size: int,
    direction: str = "absolute",
    baseline_date: str = "unknown",
    comparison_date: str = "unknown",
    crs: str = "unknown",
    resolution_meters: float = 10.0,
) -> ChangeDetectionResult:
    """
    Full change detection pipeline.

    Deterministic and reproducible from inputs + parameters.
    """
    processing_steps: list[dict[str, str]] = []

    # ── Step 1: Validate shapes ────────────────────────────────
    if baseline.shape != comparison.shape:
        raise ValueError(
            f"Shape mismatch: baseline={baseline.shape}, comparison={comparison.shape}. "
            "Scenes must be co-registered to the same grid."
        )

    processing_steps.append({
        "step": "validate_shapes",
        "detail": f"Both arrays: {baseline.shape}",
    })

    # ── Step 2: Compute difference ─────────────────────────────
    diff = compute_difference(baseline, comparison)
    processing_steps.append({
        "step": "compute_difference",
        "detail": "diff = comparison - baseline",
    })

    # ── Step 3: Apply threshold ────────────────────────────────
    mask = apply_threshold(diff, threshold, direction)
    processing_steps.append({
        "step": "apply_threshold",
        "detail": f"direction={direction}, threshold={threshold}",
    })

    # ── Step 4: Remove small regions ───────────────────────────
    cleaned_mask = remove_small_regions(mask, min_region_size)
    removed_pixels = int(np.sum(mask) - np.sum(cleaned_mask))
    processing_steps.append({
        "step": "remove_small_regions",
        "detail": f"min_size={min_region_size}, removed {removed_pixels} pixels",
    })

    # ── Step 5: Connected components ───────────────────────────
    labeled, num_regions = find_connected_components(cleaned_mask)
    processing_steps.append({
        "step": "connected_components",
        "detail": f"Found {num_regions} regions",
    })

    # ── Step 6: Region statistics ──────────────────────────────
    regions = compute_region_stats(cleaned_mask, labeled, diff, num_regions, resolution_meters)

    regions_dicts = []
    for r in regions:
        regions_dicts.append({
            "region_id": r.region_id,
            "area_pixels": r.area_pixels,
            "area_sq_meters": r.area_sq_meters,
            "bbox": r.bbox,
            "centroid": r.centroid,
            "mean_delta": round(r.mean_delta, 4),
            "max_delta": round(r.max_delta, 4),
            "min_delta": round(r.min_delta, 4),
        })

    largest_region = regions_dicts[0] if regions_dicts else None

    processing_steps.append({
        "step": "region_statistics",
        "detail": f"Computed stats for {len(regions)} regions",
    })

    # ── Step 7: Area calculations ──────────────────────────────
    total_pixels = baseline.size
    changed_pixels = int(np.sum(cleaned_mask))
    total_area = total_pixels * (resolution_meters ** 2)
    changed_area = changed_pixels * (resolution_meters ** 2)
    changed_pct = (changed_pixels / total_pixels * 100) if total_pixels > 0 else 0.0

    processing_steps.append({
        "step": "area_calculation",
        "detail": f"Changed: {changed_pixels}/{total_pixels} pixels ({changed_pct:.2f}%)",
    })

    # ── Step 8: Array statistics ───────────────────────────────
    baseline_stats = compute_array_stats(baseline)
    comparison_stats = compute_array_stats(comparison)
    difference_stats = compute_array_stats(diff)

    # ── Build result ───────────────────────────────────────────
    return ChangeDetectionResult(
        status="ok",
        algorithm="difference_threshold",
        parameters={
            "index_name": index_name,
            "threshold": threshold,
            "min_region_size": min_region_size,
            "direction": direction,
        },
        baseline_date=baseline_date,
        comparison_date=comparison_date,
        index_name=index_name,
        aoi_bbox=aoi_bbox,
        crs=crs,
        resolution_meters=resolution_meters,
        baseline_shape=list(baseline.shape),
        comparison_shape=list(comparison.shape),
        difference_shape=list(diff.shape),
        mask_shape=list(cleaned_mask.shape),
        total_pixels=total_pixels,
        changed_pixels=changed_pixels,
        unchanged_pixels=total_pixels - changed_pixels,
        changed_pct=round(changed_pct, 4),
        total_area_sq_meters=total_area,
        changed_area_sq_meters=changed_area,
        baseline_stats=baseline_stats,
        comparison_stats=comparison_stats,
        difference_stats=difference_stats,
        num_regions=num_regions,
        regions=regions_dicts,
        largest_region=largest_region,
        processing_steps=processing_steps,
        reproducibility={
            "algorithm": "difference_threshold",
            "inputs": {
                "baseline_date": baseline_date,
                "comparison_date": comparison_date,
                "index_name": index_name,
                "aoi_bbox": aoi_bbox,
            },
            "parameters": {
                "threshold": threshold,
                "min_region_size": min_region_size,
                "direction": direction,
                "resolution_meters": resolution_meters,
            },
            "deterministic": True,
            "note": "Results are fully reproducible from scene IDs + parameters + algorithm. No ML involved.",
        },
    )
