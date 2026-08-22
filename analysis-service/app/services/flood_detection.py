"""
Deterministic flood detection from SAR backscatter.

Algorithm: Threshold-based change detection on VV/VH backscatter.
Flooded areas cause a significant decrease in SAR backscatter because
water surfaces reflect radar energy away from the sensor (specular reflection).

No ML. Pure physics-based detection with documented thresholds.

References:
- Twele et al. (2016), "Sentinel-1-based flood mapping"
- Martinis et al. (2015), "Automatic near real-time flood detection"
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Optional

import numpy as np
from scipy import ndimage

logger = logging.getLogger(__name__)


# ── Configurable thresholds ──────────────────────────────────────

# VV backscatter decrease threshold (dB) indicating flood
# Typical flood signature: -3 to -15 dB decrease in VV
VV_DECREASE_THRESHOLD_DB = 3.0

# VH backscatter decrease threshold (dB)
VH_DECREASE_THRESHOLD_DB = 2.5

# Minimum flood region size (pixels) — removes speckle noise
MIN_FLOOD_REGION_SIZE = 10

# Maximum flood extent as percentage of AOI — sanity check
MAX_FLOOD_PCT = 95.0

# Water body reference backscatter (dB) — for water body masking
WATER_BACKSCATTER_VV_DB = -18.0  # typical open water VV
WATER_BACKSCATTER_VH_DB = -25.0  # typical open water VH


@dataclass
class FloodResult:
    """Result of flood detection analysis."""

    status: str
    method: str
    flood_mask: np.ndarray  # Binary: 1=flood, 0=no flood
    flood_extent_pct: float  # Percentage of AOI flooded
    flood_area_sq_meters: float  # Absolute flood area
    total_area_sq_meters: float  # Total AOI area
    num_flood_regions: int
    largest_flood_region_sq_meters: float
    statistics: dict[str, Any]
    parameters: dict[str, Any]
    processing_steps: list[dict[str, str]]
    confidence: str  # high, medium, low
    limitations: list[str]

    def to_dict(self, exclude_mask: bool = True) -> dict[str, Any]:
        """Serialize result. Excludes large numpy arrays by default."""
        d = {
            "status": self.status,
            "method": self.method,
            "flood_extent_pct": round(self.flood_extent_pct, 2),
            "flood_area_sq_meters": round(self.flood_area_sq_meters, 2),
            "total_area_sq_meters": round(self.total_area_sq_meters, 2),
            "num_flood_regions": self.num_flood_regions,
            "largest_flood_region_sq_meters": round(self.largest_flood_region_sq_meters, 2),
            "statistics": self.statistics,
            "parameters": self.parameters,
            "processing_steps": self.processing_steps,
            "confidence": self.confidence,
            "limitations": self.limitations,
        }
        if not exclude_mask:
            d["flood_mask"] = self.flood_mask.tolist()
        return d


# ── Core algorithms ──────────────────────────────────────────────


def compute_backscatter_diff(
    pre_db: np.ndarray,
    post_db: np.ndarray,
) -> np.ndarray:
    """
    Compute backscatter difference (pre - post) in dB.

    Positive values indicate backscatter DECREASE → potential flood.
    """
    if pre_db.shape != post_db.shape:
        raise ValueError(f"Shape mismatch: pre={pre_db.shape}, post={post_db.shape}")

    return pre_db - post_db


def threshold_flood(
    diff_db: np.ndarray,
    threshold_db: float = VV_DECREASE_THRESHOLD_DB,
    direction: str = "decrease",
) -> np.ndarray:
    """
    Apply threshold to backscatter difference to detect flood.

    For flood detection, we look for DECREASE in backscatter (positive diff).
    """
    if direction == "decrease":
        return (diff_db >= threshold_db).astype(np.uint8)
    elif direction == "increase":
        return (diff_db <= -threshold_db).astype(np.uint8)
    else:
        return (np.abs(diff_db) >= threshold_db).astype(np.uint8)


def remove_small_regions(
    mask: np.ndarray,
    min_size: int = MIN_FLOOD_REGION_SIZE,
) -> np.ndarray:
    """Remove connected regions smaller than min_size pixels."""
    labeled, num_features = ndimage.label(mask)
    cleaned = np.zeros_like(mask)
    for i in range(1, num_features + 1):
        region = (labeled == i)
        if np.sum(region) >= min_size:
            cleaned[region] = 1
    return cleaned


def compute_connected_components(mask: np.ndarray) -> tuple[np.ndarray, int]:
    """Label connected flood regions."""
    labeled, num_features = ndimage.label(mask)
    return labeled, num_features


def compute_region_areas(
    labeled: np.ndarray,
    num_regions: int,
    pixel_area_sq_m: float,
) -> list[dict[str, Any]]:
    """Compute area for each flood region."""
    regions = []
    for i in range(1, num_regions + 1):
        region_mask = (labeled == i)
        area_pixels = int(np.sum(region_mask))
        regions.append({
            "region_id": i,
            "area_pixels": area_pixels,
            "area_sq_meters": round(area_pixels * pixel_area_sq_m, 2),
        })
    # Sort by area descending
    regions.sort(key=lambda r: r["area_pixels"], reverse=True)
    return regions


# ── Main flood detection pipeline ────────────────────────────────


def detect_flood(
    pre_vv_db: np.ndarray,
    post_vv_db: np.ndarray,
    pre_vh_db: Optional[np.ndarray] = None,
    post_vh_db: Optional[np.ndarray] = None,
    aoi_bbox: Optional[list[float]] = None,
    vv_threshold: float = VV_DECREASE_THRESHOLD_DB,
    vh_threshold: float = VH_DECREASE_THRESHOLD_DB,
    min_region_size: int = MIN_FLOOD_REGION_SIZE,
    resolution_meters: float = 10.0,
    use_vh_fallback: bool = True,
) -> FloodResult:
    """
    Detect flood extent from pre/post SAR backscatter.

    Args:
        pre_vv_db: Pre-event VV backscatter (dB), 2D array
        post_vv_db: Post-event VV backscatter (dB), 2D array
        pre_vh_db: Pre-event VH backscatter (dB), optional
        post_vh_db: Post-event VH backscatter (dB), optional
        aoi_bbox: [west, south, east, north]
        vv_threshold: VV decrease threshold in dB
        vh_threshold: VH decrease threshold in dB
        min_region_size: Minimum region size in pixels
        resolution_meters: Spatial resolution
        use_vh_fallback: Use VH when VV has low confidence

    Returns:
        FloodResult with mask, statistics, and metadata.
    """
    steps = []
    steps.append({"step": "init", "detail": f"Pre-event shape: {pre_vv_db.shape}, Post-event shape: {post_vv_db.shape}"})

    # Validate inputs
    if pre_vv_db.shape != post_vv_db.shape:
        raise ValueError(f"Shape mismatch: pre={pre_vv_db.shape}, post={post_vv_db.shape}")

    if pre_vv_db.ndim != 2:
        raise ValueError(f"Expected 2D arrays, got {pre_vv_db.ndim}D")

    # Step 1: VV-based flood detection
    vv_diff = compute_backscatter_diff(pre_vv_db, post_vv_db)
    steps.append({"step": "vv_diff", "detail": f"VV difference range: [{np.nanmin(vv_diff):.2f}, {np.nanmax(vv_diff):.2f}] dB"})

    vv_flood = threshold_flood(vv_diff, vv_threshold, "decrease")
    vv_flood_pct = float(np.sum(vv_flood) / vv_flood.size * 100)
    steps.append({"step": "vv_threshold", "detail": f"VV threshold: {vv_threshold} dB → {vv_flood_pct:.1f}% pixels above threshold"})

    # Step 2: VH-based flood detection (if available)
    vh_flood = None
    if pre_vh_db is not None and post_vh_db is not None and use_vh_fallback:
        if pre_vh_db.shape == post_vh_db.shape:
            vh_diff = compute_backscatter_diff(pre_vh_db, post_vh_db)
            vh_flood = threshold_flood(vh_diff, vh_threshold, "decrease")
            vh_flood_pct = float(np.sum(vh_flood) / vh_flood.size * 100)
            steps.append({"step": "vh_threshold", "detail": f"VH threshold: {vh_threshold} dB → {vh_flood_pct:.1f}% pixels above threshold"})

    # Step 3: Combine VV + VH (consensus voting)
    if vh_flood is not None:
        # Union: pixel is flood if EITHER VV or VH detects it
        combined = np.maximum(vv_flood, vh_flood)
        steps.append({"step": "combine_vv_vh", "detail": f"VV+VH consensus: union of VV and VH detections"})
    else:
        combined = vv_flood
        steps.append({"step": "vv_only", "detail": "Using VV only (VH not available)"})

    # Step 4: Remove small noisy regions
    pre_cleaned = remove_small_regions(combined, min_region_size)
    removed_pixels = int(np.sum(combined) - np.sum(pre_cleaned))
    steps.append({"step": "remove_noise", "detail": f"Removed {removed_pixels} pixels in regions < {min_region_size} px"})

    # Step 5: Connected component analysis
    labeled, num_regions = compute_connected_components(pre_cleaned)
    steps.append({"step": "connected_components", "detail": f"Found {num_regions} distinct flood regions"})

    # Step 6: Compute areas
    pixel_area = resolution_meters ** 2
    total_pixels = pre_cleaned.size
    flood_pixels = int(np.sum(pre_cleaned))
    total_area = total_pixels * pixel_area
    flood_area = flood_pixels * pixel_area
    flood_pct = (flood_pixels / total_pixels * 100) if total_pixels > 0 else 0

    regions = compute_region_areas(labeled, num_regions, pixel_area) if num_regions > 0 else []
    largest_region_area = regions[0]["area_sq_meters"] if regions else 0

    steps.append({"step": "area_stats", "detail": f"Flood area: {flood_area:.0f} m² ({flood_pct:.1f}% of AOI)"})

    # Step 7: Confidence assessment
    confidence = "high"
    limitations = []

    if flood_pct > MAX_FLOOD_PCT:
        confidence = "low"
        limitations.append(f"Flood extent ({flood_pct:.1f}%) exceeds sanity threshold ({MAX_FLOOD_PCT}%)")
    elif flood_pct < 1.0:
        confidence = "medium"
        limitations.append("Very small flood extent may be noise")

    if pre_vh_db is None or post_vh_db is None:
        confidence = "medium"
        limitations.append("VH polarization not used — single-polarization detection")

    # Step 8: Compute backscatter statistics
    pre_valid = pre_vv_db[~np.isnan(pre_vv_db)]
    post_valid = post_vv_db[~np.isnan(post_vv_db)]

    statistics = {
        "pre_event_vv": {
            "mean": float(np.mean(pre_valid)) if len(pre_valid) > 0 else 0,
            "std": float(np.std(pre_valid)) if len(pre_valid) > 0 else 0,
            "min": float(np.min(pre_valid)) if len(pre_valid) > 0 else 0,
            "max": float(np.max(pre_valid)) if len(pre_valid) > 0 else 0,
        },
        "post_event_vv": {
            "mean": float(np.mean(post_valid)) if len(post_valid) > 0 else 0,
            "std": float(np.std(post_valid)) if len(post_valid) > 0 else 0,
            "min": float(np.min(post_valid)) if len(post_valid) > 0 else 0,
            "max": float(np.max(post_valid)) if len(post_valid) > 0 else 0,
        },
        "vv_diff_mean": float(np.mean(vv_diff[~np.isnan(vv_diff)])) if len(vv_diff[~np.isnan(vv_diff)]) > 0 else 0,
        "flood_pixel_count": flood_pixels,
        "total_pixel_count": total_pixels,
        "flooded_in_aoi_pct": round(flood_pct, 2),
    }

    # Add flood-region-level statistics
    if regions:
        statistics["region_areas"] = [r["area_sq_meters"] for r in regions[:10]]  # Top 10

    parameters = {
        "vv_threshold_db": vv_threshold,
        "vh_threshold_db": vh_threshold,
        "min_region_size": min_region_size,
        "resolution_meters": resolution_meters,
        "use_vh": pre_vh_db is not None and post_vh_db is not None,
    }

    return FloodResult(
        status="ok",
        method="sar_backscatter_threshold",
        flood_mask=pre_cleaned,
        flood_extent_pct=round(flood_pct, 2),
        flood_area_sq_meters=round(flood_area, 2),
        total_area_sq_meters=round(total_area, 2),
        num_flood_regions=num_regions,
        largest_flood_region_sq_meters=round(largest_region_area, 2),
        statistics=statistics,
        parameters=parameters,
        processing_steps=steps,
        confidence=confidence,
        limitations=limitations,
    )
