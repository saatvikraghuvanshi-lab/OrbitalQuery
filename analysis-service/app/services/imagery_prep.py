"""
Imagery Preparation — cloud-aware compositing, seasonal windows, outlier detection.

Inspired by Sentinel Hub Custom Scripts:
  - Cloudless mosaics using SCL + first-quartile
  - Seasonal comparability for temporal analysis
  - Outlier detection for cloud/shadow/snow/haze

Memory-safe for Render free tier (512MB):
  - Lazy imports
  - Small array operations
  - Explicit cleanup

Does NOT make Sentinel Hub a dependency.
Ports algorithmic logic into existing Rasterio/NumPy pipeline.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Optional

import numpy as np

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════
# Sentinel-2 SCL Classification
# ══════════════════════════════════════════════════════════════════

# SCL class definitions from Sentinel-2 L2A documentation
SCL_CLASSES = {
    0: {"name": "no_data", "valid": False, "cloud": False},
    1: {"name": "saturated_defective", "valid": False, "cloud": False},
    2: {"name": "dark_area_pixels", "valid": True, "cloud": False},
    3: {"name": "cloud_shadow", "valid": False, "cloud": True},
    4: {"name": "vegetation", "valid": True, "cloud": False},
    5: {"name": "bare_soils", "valid": True, "cloud": False},
    6: {"name": "water", "valid": True, "cloud": False},
    7: {"name": "unclassified", "valid": True, "cloud": False},
    8: {"name": "cloud_medium_prob", "valid": False, "cloud": True},
    9: {"name": "cloud_high_prob", "valid": False, "cloud": True},
    10: {"name": "thin_cirrus", "valid": False, "cloud": True},
    11: {"name": "snow_ice", "valid": True, "cloud": False},
}


def create_scl_valid_mask(scl: np.ndarray) -> tuple[np.ndarray, dict[str, int]]:
    """
    Create a validity mask from Sentinel-2 Scene Classification Layer.

    Returns:
        valid_mask: True where pixel is valid (not cloud/shadow/nodata)
        class_counts: Count of pixels per SCL class
    """
    valid = np.zeros(scl.shape, dtype=bool)
    class_counts = {}

    for cls_id, cls_info in SCL_CLASSES.items():
        count = int(np.sum(scl == cls_id))
        class_counts[cls_info["name"]] = count
        if cls_info["valid"]:
            valid |= (scl == cls_id)

    cloud_pct = sum(class_counts.get(k, 0) for k in
                    ["cloud_shadow", "cloud_medium_prob", "cloud_high_prob", "thin_cirrus"])
    total = scl.size
    cloud_pct = (cloud_pct / total * 100) if total > 0 else 0

    logger.info("[ImageryPrep] SCL: %.1f%% clouds/shadows, %d classes",
                cloud_pct, len(class_counts))

    return valid, class_counts


# ══════════════════════════════════════════════════════════════════
# Outlier Detection
# ══════════════════════════════════════════════════════════════════

@dataclass
class OutlierResult:
    """Result of outlier detection on a single observation."""
    outlier_mask: np.ndarray       # True where outlier detected
    n_outliers: int
    outlier_pct: float
    outlier_types: dict[str, int]  # Count by type (cloud, shadow, snow, haze, anomaly)
    valid_mask: np.ndarray         # Final validity after outlier removal


def detect_outliers(
    ndvi: np.ndarray,
    scl: Optional[np.ndarray] = None,
    cloud_threshold_pct: float = 30.0,
) -> OutlierResult:
    """
    Detect outlier observations in a single Sentinel-2 scene.

    Detects:
    - Cloud/shadow pixels (via SCL if available)
    - Anomalously low NDVI (potential cloud/haze)
    - Anomalous standard deviation in local window (texture anomaly)

    Args:
        ndvi: NDVI array (H, W)
        scl: Optional SCL band (H, W)
        cloud_threshold_pct: Max % of outliers before flagging scene

    Returns:
        OutlierResult with masks and statistics
    """
    h, w = ndvi.shape
    outlier_mask = np.zeros((h, w), dtype=bool)
    outlier_types = {"cloud": 0, "shadow": 0, "snow": 0, "haze": 0, "anomaly": 0}

    # 1. SCL-based detection
    if scl is not None:
        for cls_id, cls_info in SCL_CLASSES.items():
            if not cls_info["valid"]:
                pixels = (scl == cls_id)
                n = int(np.sum(pixels))
                outlier_mask |= pixels
                if "cloud" in cls_info["name"] or cls_info["name"] == "thin_cirrus":
                    outlier_types["cloud"] += n
                elif "shadow" in cls_info["name"]:
                    outlier_types["shadow"] += n
                elif "snow" in cls_info["name"] or "ice" in cls_info["name"]:
                    outlier_types["snow"] += n
                elif "saturated" in cls_info["name"] or "defective" in cls_info["name"]:
                    outlier_types["anomaly"] += n
    else:
        # 2. NDVI-based heuristic detection (when no SCL available)
        # Clouds typically have NDVI near 0 or slightly negative
        cloud_like = (ndvi < -0.05) & np.isfinite(ndvi)
        n_cloud = int(np.sum(cloud_like))
        outlier_mask |= cloud_like
        outlier_types["haze"] += n_cloud

    # 3. Local texture anomaly detection
    # Compute local standard deviation — outliers have anomalous texture
    try:
        from scipy.ndimage import uniform_filter
        local_mean = uniform_filter(np.nan_to_num(ndvi, nan=0.0), size=5)
        local_sq_mean = uniform_filter(np.nan_to_num(ndvi ** 2, nan=0.0), size=5)
        local_std = np.sqrt(np.maximum(local_sq_mean - local_mean ** 2, 0))

        # Anomalous texture: very high local std (e.g. mixed cloud/land boundary)
        texture_outlier = local_std > 0.3
        n_texture = int(np.sum(texture_outlier & ~outlier_mask))
        outlier_mask |= texture_outlier
        outlier_types["anomaly"] += n_texture
    except ImportError:
        pass

    n_outliers = int(np.sum(outlier_mask))
    outlier_pct = (n_outliers / (h * w) * 100) if (h * w) > 0 else 0

    # Final validity mask
    valid_mask = ~outlier_mask & np.isfinite(ndvi)

    return OutlierResult(
        outlier_mask=outlier_mask,
        n_outliers=n_outliers,
        outlier_pct=round(outlier_pct, 1),
        outlier_types=outlier_types,
        valid_mask=valid_mask,
    )


# ══════════════════════════════════════════════════════════════════
# Seasonal Window Selection
# ══════════════════════════════════════════════════════════════════

def compute_seasonal_window(
    year: int,
    hemisphere: str = "north",
    season: str = "growing",
) -> tuple[str, str]:
    """
    Compute a seasonal date window for comparable temporal analysis.

    Avoids comparing monsoon vs dry-season scenes.
    Uses standard ecological growing/dormant seasons.

    Args:
        year: Year
        hemisphere: "north" or "south"
        season: "growing" (green vegetation peak) or "dormant" (minimum vegetation)

    Returns:
        (start_date, end_date) as ISO strings
    """
    if hemisphere == "north":
        if season == "growing":
            # Peak vegetation: June-August (Northern Hemisphere summer)
            return (f"{year}-06-01", f"{year}-08-31")
        else:
            # Dormant: December-February
            return (f"{year}-12-01", f"{year + 1}-02-28")
    else:
        if season == "growing":
            # Peak vegetation: December-February (Southern Hemisphere summer)
            return (f"{year}-12-01", f"{year + 1}-02-28")
        else:
            # Dormant: June-August
            return (f"{year}-06-01", f"{year}-08-31")


def select_comparable_periods(
    year1: int,
    year2: int,
    hemisphere: str = "north",
    season: str = "growing",
) -> tuple[tuple[str, str], tuple[str, str]]:
    """
    Select comparable seasonal windows for year-to-year analysis.

    Returns two date ranges that represent the same season in different years.
    """
    period1 = compute_seasonal_window(year1, hemisphere, season)
    period2 = compute_seasonal_window(year2, hemisphere, season)

    logger.info(
        "[ImageryPrep] Comparable periods: %s–%s vs %s–%s (hemisphere=%s, season=%s)",
        period1[0], period1[1], period2[0], period2[1], hemisphere, season,
    )

    return period1, period2


# ══════════════════════════════════════════════════════════════════
# Cloud-Aware Temporal Composite
# ══════════════════════════════════════════════════════════════════

@dataclass
class CompositeConfig:
    """Configuration for cloud-aware temporal compositing."""
    method: str = "first_quartile"  # "median", "mean", "first_quartile"
    cloud_method: str = "scl"       # "scl" or "ndvi_threshold"
    ndvi_cloud_threshold: float = -0.05
    min_valid_observations: int = 1
    max_cloud_pct: float = 50.0     # Reject scenes with > this % cloud


def cloud_aware_composite(
    band_stack: np.ndarray,
    scl_stack: Optional[np.ndarray] = None,
    config: Optional[CompositeConfig] = None,
) -> tuple[np.ndarray, dict[str, Any]]:
    """
    Compute a cloud-aware temporal composite from a stack of observations.

    Inspired by Sentinel Hub's cloudless mosaic approach:
      - Use SCL to mask clouds/shadows
      - Apply first-quartile or median across valid observations
      - Track observation quality

    Args:
        band_stack: (T, H, W) or (T, C, H, W) — temporal stack
        scl_stack: (T, H, W) — optional SCL bands per timestep
        config: Composite configuration

    Returns:
        composite: (H, W) or (C, H, W) — cloud-free composite
        stats: Metadata about the compositing
    """
    if config is None:
        config = CompositeConfig()

    T = band_stack.shape[0]
    stats = {
        "method": config.method,
        "n_observations": T,
        "cloud_method": config.cloud_method,
        "mean_valid_pct": 0.0,
        "n_fully_masked": 0,
    }

    # Create validity masks for each timestep
    valid_masks = []
    for t in range(T):
        if config.cloud_method == "scl" and scl_stack is not None:
            valid, class_counts = create_scl_valid_mask(scl_stack[t])
        else:
            # NDVI-based: valid = not cloud-like
            if band_stack.ndim == 3:
                # Single band — assume it's an index
                valid = band_stack[t] > config.ndvi_cloud_threshold
            else:
                valid = np.ones(band_stack.shape[2:], dtype=bool)

        # Check per-scene cloud percentage
        scene_cloud_pct = (1.0 - np.mean(valid)) * 100
        if scene_cloud_pct > config.max_cloud_pct:
            valid[:] = False  # Reject entire scene
            logger.debug("[ImageryPrep] Rejected scene %d: %.1f%% cloud", t, scene_cloud_pct)

        valid_masks.append(valid)

    # Stack validity masks
    valid_stack = np.stack(valid_masks, axis=0)

    # Apply masking
    if band_stack.ndim == 3:
        masked = np.where(valid_stack, band_stack.astype(np.float32), np.nan)
    else:
        masked = np.where(valid_stack[:, np.newaxis, :, :], band_stack.astype(np.float32), np.nan)

    # Compute composite
    if config.method == "median":
        composite = np.nanmedian(masked, axis=0)
    elif config.method in ("first_quartile", "percentile"):
        composite = np.nanpercentile(masked, 25, axis=0)
    elif config.method == "mean":
        composite = np.nanmean(masked, axis=0)
    else:
        composite = np.nanmedian(masked, axis=0)

    # Fill NaN with 0
    composite = np.nan_to_num(composite, nan=0.0)

    # Compute statistics
    valid_per_pixel = np.sum(~np.isnan(masked), axis=0) if masked.ndim >= 3 else np.ones(composite.shape)
    stats["mean_valid_pct"] = round(float(np.mean(valid_per_pixel > 0)) * 100, 1)
    stats["mean_valid_observations"] = round(float(np.mean(valid_per_pixel)), 1)
    stats["n_fully_masked"] = int(np.sum(valid_per_pixel == 0))

    logger.info(
        "[ImageryPrep] Composite: method=%s, n_obs=%d, valid=%.1f%%, fully_masked=%d",
        config.method, T, stats["mean_valid_pct"], stats["n_fully_masked"],
    )

    return composite, stats


# ══════════════════════════════════════════════════════════════════
# NDVI Time Series
# ══════════════════════════════════════════════════════════════════

@dataclass
class TimeSeriesPoint:
    """A single point in an NDVI time series."""
    datetime: str
    ndvi_mean: float
    ndvi_std: float
    valid_pct: float
    scene_id: Optional[str] = None
    cloud_cover: Optional[float] = None


def compute_ndvi_time_series(
    red_stack: np.ndarray,
    nir_stack: np.ndarray,
    dates: list[str],
    scene_ids: Optional[list[str]] = None,
    cloud_covers: Optional[list[float]] = None,
) -> list[TimeSeriesPoint]:
    """
    Compute NDVI time series from red/NIR band stacks.

    For each timestep:
      - Compute NDVI
      - Apply cloud masking
      - Compute mean, std, valid percentage

    Used when query implies: trend, over time, seasonal change, monitoring.
    """
    T = red_stack.shape[0]
    series = []

    for t in range(T):
        red = red_stack[t].astype(np.float32)
        nir = nir_stack[t].astype(np.float32)

        # Compute NDVI
        denom = nir + red
        valid = np.abs(denom) > 1e-10
        ndvi = np.full_like(denom, np.nan, dtype=np.float32)
        ndvi[valid] = (nir[valid] - red[valid]) / denom[valid]

        # Filter outliers
        valid_ndvi = ndvi[np.isfinite(ndvi)]
        if len(valid_ndvi) > 0:
            # Remove extreme outliers (> 3 std from mean)
            mean = np.mean(valid_ndvi)
            std = np.std(valid_ndvi)
            inlier_mask = np.abs(valid_ndvi - mean) < 3 * std
            valid_ndvi = valid_ndvi[inlier_mask]

        ndvi_mean = float(np.mean(valid_ndvi)) if len(valid_ndvi) > 0 else 0.0
        ndvi_std = float(np.std(valid_ndvi)) if len(valid_ndvi) > 0 else 0.0
        valid_pct = float(np.sum(np.isfinite(ndvi)) / ndvi.size * 100) if ndvi.size > 0 else 0.0

        series.append(TimeSeriesPoint(
            datetime=dates[t] if t < len(dates) else f"step_{t}",
            ndvi_mean=round(ndvi_mean, 4),
            ndvi_std=round(ndvi_std, 4),
            valid_pct=round(valid_pct, 1),
            scene_id=scene_ids[t] if scene_ids and t < len(scene_ids) else None,
            cloud_cover=cloud_covers[t] if cloud_covers and t < len(cloud_covers) else None,
        ))

    logger.info("[ImageryPrep] NDVI time series: %d points, mean range=[%.3f, %.3f]",
                len(series),
                min(p.ndvi_mean for p in series) if series else 0,
                max(p.ndvi_mean for p in series) if series else 0)

    return series


# ══════════════════════════════════════════════════════════════════
# Visual Products
# ══════════════════════════════════════════════════════════════════

@dataclass
class VisualProduct:
    """A rendered visual product for display."""
    name: str
    description: str
    data: np.ndarray          # (H, W, 3) uint8 RGB
    value_range: Optional[tuple[float, float]] = None  # Min/max for continuous data
    legend: Optional[dict] = None


def render_true_color(
    red: np.ndarray, green: np.ndarray, blue: np.ndarray,
    percentile_stretch: tuple[float, float] = (2, 98),
) -> VisualProduct:
    """Render true color (B04, B03, B02) with percentile stretching."""
    r = _stretch_band(red, percentile_stretch)
    g = _stretch_band(green, percentile_stretch)
    b = _stretch_band(blue, percentile_stretch)
    rgb = np.stack([r, g, b], axis=-1).astype(np.uint8)
    return VisualProduct(name="True Color", description="Natural color (B04-B03-B02)", data=rgb)


def render_false_color(
    nir: np.ndarray, red: np.ndarray, green: np.ndarray,
    percentile_stretch: tuple[float, float] = (2, 98),
) -> VisualProduct:
    """Render false color (B08-B04-B03) — vegetation appears red."""
    r = _stretch_band(nir, percentile_stretch)
    g = _stretch_band(red, percentile_stretch)
    b = _stretch_band(green, percentile_stretch)
    rgb = np.stack([r, g, b], axis=-1).astype(np.uint8)
    return VisualProduct(name="False Color (Vegetation)", description="NIR-RED-GREEN — vegetation appears red", data=rgb)


def render_ndvi(ndvi: np.ndarray) -> VisualProduct:
    """Render NDVI with standard diverging colormap (red-yellow-green)."""
    valid = ndvi[np.isfinite(ndvi)]
    vmin, vmax = (-0.2, 0.8) if len(valid) == 0 else (np.percentile(valid, 2), np.percentile(valid, 98))

    normalized = np.clip((ndvi - vmin) / (vmax - vmin + 1e-10), 0, 1)

    # Red → Yellow → Green colormap
    rgb = np.zeros((*ndvi.shape, 3), dtype=np.uint8)
    # Red channel: high for low NDVI
    rgb[:, :, 0] = (np.clip(1.0 - normalized, 0, 1) * 255).astype(np.uint8)
    # Green channel: high for high NDVI
    rgb[:, :, 1] = (np.clip(normalized, 0, 1) * 255).astype(np.uint8)
    # Blue channel: low for all
    rgb[:, :, 2] = 0

    return VisualProduct(
        name="NDVI", description="Normalized Difference Vegetation Index",
        data=rgb, value_range=(round(float(vmin), 2), round(float(vmax), 2)),
        legend={"low": "Bare soil / Water", "mid": "Sparse vegetation", "high": "Dense vegetation"},
    )


def render_ndwi(ndwi: np.ndarray) -> VisualProduct:
    """Render NDWI with blue-white colormap (water=blue, land=white)."""
    valid = ndwi[np.isfinite(ndwi)]
    vmin, vmax = (-0.3, 0.5) if len(valid) == 0 else (np.percentile(valid, 2), np.percentile(valid, 98))
    normalized = np.clip((ndwi - vmin) / (vmax - vmin + 1e-10), 0, 1)

    rgb = np.zeros((*ndwi.shape, 3), dtype=np.uint8)
    rgb[:, :, 0] = ((1.0 - normalized) * 200).astype(np.uint8)
    rgb[:, :, 1] = ((1.0 - normalized) * 200).astype(np.uint8)
    rgb[:, :, 2] = (normalized * 255).astype(np.uint8)

    return VisualProduct(
        name="NDWI", description="Normalized Difference Water Index",
        data=rgb, value_range=(round(float(vmin), 2), round(float(vmax), 2)),
        legend={"low": "Land / Vegetation", "high": "Water"},
    )


def render_change_mask(
    delta_normalized: np.ndarray,
    change_mask: np.ndarray,
    direction_mask: np.ndarray,
) -> VisualProduct:
    """
    Render change mask as transparent overlay.

    - Stable: transparent
    - Loss: red
    - Gain: green
    """
    h, w = delta_normalized.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)

    # Loss pixels (direction == 1)
    loss = direction_mask == 1
    rgba[loss] = [220, 60, 60, 180]  # Red, semi-transparent

    # Gain pixels (direction == 2)
    gain = direction_mask == 2
    rgba[gain] = [34, 180, 90, 180]  # Green, semi-transparent

    # Stable: very dark, nearly invisible
    stable = change_mask == 0
    rgba[stable] = [15, 22, 18, 30]

    return VisualProduct(
        name="Change Mask", description="Localized change regions (red=loss, green=gain)",
        data=rgba,
        legend={"red": "Change (loss)", "green": "Change (gain)", "transparent": "Stable / No data"},
    )


def render_difference(delta: np.ndarray) -> VisualProduct:
    """Render continuous difference as diverging blue-red colormap."""
    valid = delta[np.isfinite(delta)]
    if len(valid) > 0:
        abs_max = np.percentile(np.abs(valid), 95)
    else:
        abs_max = 1.0

    normalized = np.clip(delta / (abs_max + 1e-10), -1, 1)

    rgb = np.zeros((*delta.shape, 3), dtype=np.uint8)
    # Red channel: positive delta
    rgb[:, :, 0] = (np.clip(normalized, 0, 1) * 255).astype(np.uint8)
    # Blue channel: negative delta
    rgb[:, :, 2] = (np.clip(-normalized, 0, 1) * 255).astype(np.uint8)
    # Green: zero delta shows gray
    gray = (np.clip(1.0 - np.abs(normalized), 0, 1) * 128).astype(np.uint8)
    rgb[:, :, 1] = gray

    return VisualProduct(
        name="Difference", description="Diverging difference map (red=increase, blue=decrease)",
        data=rgb, value_range=(round(float(-abs_max), 4), round(float(abs_max), 4)),
        legend={"blue": "Decrease", "gray": "No change", "red": "Increase"},
    )


def _stretch_band(
    band: np.ndarray,
    percentiles: tuple[float, float] = (2, 98),
) -> np.ndarray:
    """Stretch a band to 0-255 using percentile clipping."""
    valid = band[np.isfinite(band)]
    if len(valid) == 0:
        return np.zeros_like(band, dtype=np.uint8)

    p_low = np.percentile(valid, percentiles[0])
    p_high = np.percentile(valid, percentiles[1])

    if p_high - p_low < 1e-10:
        return np.zeros_like(band, dtype=np.uint8)

    stretched = np.clip((band - p_low) / (p_high - p_low) * 255, 0, 255)
    stretched[~np.isfinite(band)] = 0
    return stretched.astype(np.uint8)
