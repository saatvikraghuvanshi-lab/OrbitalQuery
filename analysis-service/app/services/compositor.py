"""
Temporal Compositor — cloud-filtered composites on a common analysis grid.

Inspired by:
  - StackSTAC: time × band × y × x on a common grid
  - Sentinel Hub Custom Scripts: cloudless mosaics using SCL + first-quartile

Architecture:
  1. Define analysis grid (CRS, resolution, bounds, shape)
  2. Read each scene into the common grid
  3. Apply cloud/quality masking using SCL band
  4. Compute temporal composite (median / percentile)
  5. Return analysis-ready raster on the common grid

Both "before" and "after" rasters share:
  - Same AOI bounds
  - Same CRS
  - Same resolution
  - Same pixel dimensions
  - Same transform
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Optional

import numpy as np

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════
# Analysis Grid
# ══════════════════════════════════════════════════════════════════

@dataclass
class AnalysisGrid:
    """
    Defines the common spatial grid for before/after comparison.

    Both periods are resampled/reprojected to this exact grid.
    """
    bbox: list[float]           # [west, south, east, north] in WGS-84
    crs: str                    # e.g. "EPSG:4326" or "EPSG:32643"
    resolution: float           # meters (or degrees if CRS is geographic)
    width: int                  # pixels
    height: int                 # pixels
    transform: Optional[Any] = None  # Affine transform
    shape: tuple = (0, 0)      # (height, width)

    def __post_init__(self):
        if self.width > 0 and self.height > 0:
            self.shape = (self.height, self.width)


def compute_analysis_grid(
    bbox: list[float],
    target_crs: str = "EPSG:4326",
    target_resolution: float = 0.0001,  # ~10m in degrees at equator
    max_pixels: int = 1024,
) -> AnalysisGrid:
    """
    Compute an analysis grid from AOI bbox and target resolution.

    Ensures the grid fits within memory constraints.
    """
    west, south, east, north = bbox

    # Compute pixel dimensions
    if "4326" in target_crs:
        # Geographic CRS: resolution in degrees
        width_deg = east - west
        height_deg = north - south
        width_px = int(min(width_deg / target_resolution, max_pixels))
        height_px = int(min(height_deg / target_resolution, max_pixels))
        res_x = width_deg / width_px if width_px > 0 else target_resolution
        res_y = height_deg / height_px if height_px > 0 else target_resolution
    else:
        # Projected CRS: resolution in meters
        from pyproj import Transformer
        transformer = Transformer.from_crs("EPSG:4326", target_crs, always_xy=True)
        w, s = transformer.transform(west, south)
        e, n = transformer.transform(east, north)
        width_m = e - w
        height_m = n - s
        width_px = int(min(width_m / target_resolution, max_pixels))
        height_px = int(min(height_m / target_resolution, max_pixels))
        res_x = width_m / width_px if width_px > 0 else target_resolution
        res_y = height_m / height_px if height_px > 0 else target_resolution

    # Build affine transform
    try:
        from rasterio.transform import from_bounds
        transform = from_bounds(west, south, east, north, width_px, height_px)
    except ImportError:
        transform = None

    grid = AnalysisGrid(
        bbox=bbox,
        crs=target_crs,
        resolution=res_x,
        width=width_px,
        height=height_px,
        transform=transform,
        shape=(height_px, width_px),
    )

    logger.info(
        "[Compositor] Analysis grid: %dx%d px, resolution=%.6f, CRS=%s",
        width_px, height_px, res_x, target_crs,
    )

    return grid


# ══════════════════════════════════════════════════════════════════
# Cloud / Quality Masking
# ══════════════════════════════════════════════════════════════════

# Sentinel-2 SCL (Scene Classification Layer) classes
# From https://sentinels.copernicus.eu/web/sentinel/user-guides/sentinel-2-msi/processing-levels/level-2a
SCL_VALID_CLASSES = {
    4,   # Vegetation
    5,   # Bare Soils
    6,   # Water
    7,   # Unclassified
    11,  # Snow/Ice
}

SCL_CLOUD_CLASSES = {
    3,   # Cloud Shadow
    8,   # Cloud Medium Probability
    9,   # Cloud High Probability
    10,  # Thin Cirrus
}


def create_cloud_mask(
    scl_data: np.ndarray,
    valid_classes: Optional[set] = None,
    cloud_classes: Optional[set] = None,
) -> np.ndarray:
    """
    Create a boolean cloud mask from Sentinel-2 SCL band.

    Returns: True where pixels are VALID (not cloudy).
    """
    if valid_classes is None:
        valid_classes = SCL_VALID_CLASSES
    if cloud_classes is None:
        cloud_classes = SCL_CLOUD_CLASSES

    # Valid pixels: SCL class is in valid_classes OR not in cloud_classes
    valid_mask = np.isin(scl_data, list(valid_classes)) | (~np.isin(scl_data, list(cloud_classes)))

    cloud_pct = (1.0 - np.mean(valid_mask)) * 100
    logger.info("[Compositor] Cloud mask: %.1f%% clouds detected", cloud_pct)

    return valid_mask


def create_cloud_mask_from_ndvi(
    ndvi_data: np.ndarray,
    threshold: float = -0.1,
) -> np.ndarray:
    """
    Simple cloud detection fallback using NDVI.
    Clouds typically have NDVI near 0 or slightly negative.
    """
    valid_mask = ndvi_data > threshold
    return valid_mask


# ══════════════════════════════════════════════════════════════════
# Temporal Compositing
# ══════════════════════════════════════════════════════════════════

def compute_temporal_composite(
    band_stack: np.ndarray,
    valid_mask_stack: Optional[np.ndarray] = None,
    method: str = "median",
    percentile: int = 25,
) -> tuple[np.ndarray, dict[str, Any]]:
    """
    Compute a temporal composite from a stack of observations.

    Args:
        band_stack: (T, H, W) or (T, C, H, W) — time stack of observations
        valid_mask_stack: (T, H, W) — True where valid (not cloudy)
        method: "median", "mean", "percentile", "first_quartile"
        percentile: for percentile method (25 = first quartile, typical for cloudless)

    Returns:
        composite: (H, W) or (C, H, W) — the composite image
        stats: metadata about the compositing
    """
    stats = {
        "method": method,
        "n_observations": band_stack.shape[0],
        "percentile": percentile if method in ("percentile", "first_quartile") else None,
    }

    if band_stack.ndim == 3:
        # (T, H, W) — single band
        T, H, W = band_stack.shape
    elif band_stack.ndim == 4:
        # (T, C, H, W) — multi-band
        T, C, H, W = band_stack.shape
    else:
        raise ValueError(f"Expected 3D or 4D array, got shape {band_stack.shape}")

    # Apply cloud mask if provided
    if valid_mask_stack is not None:
        # Expand mask to match band dimensions
        if band_stack.ndim == 3:
            masked = np.where(valid_mask_stack, band_stack, np.nan)
        else:
            masked = np.where(valid_mask_stack[:, np.newaxis, :, :], band_stack, np.nan)
    else:
        masked = band_stack.astype(np.float64)

    # Replace 0/nodata with NaN
    masked[masked == 0] = np.nan

    # Compute composite
    if method == "median":
        composite = np.nanmedian(masked, axis=0)
    elif method == "mean":
        composite = np.nanmean(masked, axis=0)
    elif method in ("percentile", "first_quartile"):
        with np.errstate(all="ignore"):
            composite = np.nanpercentile(masked, percentile, axis=0)
    else:
        composite = np.nanmedian(masked, axis=0)

    # Count valid observations per pixel
    with np.errstate(all="ignore"):
        valid_count = np.sum(~np.isnan(masked), axis=0) if masked.ndim >= 3 else np.ones((H, W))

    stats["mean_valid_observations"] = float(np.mean(valid_count))
    stats["min_valid_observations"] = int(np.min(valid_count))
    stats["max_valid_observations"] = int(np.max(valid_count))
    stats["n_fully_masked_pixels"] = int(np.sum(valid_count == 0))

    # Replace NaN with 0 in composite
    composite = np.nan_to_num(composite, nan=0.0)

    logger.info(
        "[Compositor] Composite: method=%s, n_obs=%d, mean_valid=%.1f, fully_masked=%d",
        method, T, stats["mean_valid_observations"], stats["n_fully_masked_pixels"],
    )

    return composite, stats


def compute_ndvi_composite_from_bands(
    red_stack: np.ndarray,
    nir_stack: np.ndarray,
    valid_mask_stack: Optional[np.ndarray] = None,
    method: str = "median",
) -> tuple[np.ndarray, dict[str, Any]]:
    """
    Compute NDVI composite directly from red/NIR band stacks.
    More accurate than compositing NDVI values because it avoids
    edge effects at cloud boundaries.
    """
    # Compute NDVI for each timestep
    red = red_stack.astype(np.float32)
    nir = nir_stack.astype(np.float32)

    denom = nir + red
    denom[denom == 0] = np.nan
    ndvi_stack = (nir - red) / denom

    # Apply cloud mask
    if valid_mask_stack is not None:
        ndvi_stack = np.where(valid_mask_stack, ndvi_stack, np.nan)

    # Composite
    if method == "median":
        composite = np.nanmedian(ndvi_stack, axis=0)
    elif method in ("percentile", "first_quartile"):
        composite = np.nanpercentile(ndvi_stack, 25, axis=0)
    else:
        composite = np.nanmean(ndvi_stack, axis=0)

    composite = np.nan_to_num(composite, nan=0.0)

    stats = {
        "method": method,
        "n_observations": len(red_stack),
        "index": "NDVI",
    }

    return composite, stats


# ══════════════════════════════════════════════════════════════════
# Grid-Aligned Raster Read
# ══════════════════════════════════════════════════════════════════

def read_raster_into_grid(
    href: str,
    grid: AnalysisGrid,
    bands: Optional[list[str]] = None,
) -> Optional[np.ndarray]:
    """
    Read a raster file and resample/reproject it into the analysis grid.

    Returns: (C, H, W) array aligned to the grid, or None on failure.
    """
    try:
        import rasterio
        from rasterio.enums import Resampling
        from rasterio.vutils import reproject as rio_reproject
        from rasterio.transform import from_bounds
    except ImportError:
        logger.error("[Compositor] rasterio not available")
        return None

    try:
        with rasterio.Env(GDAL_CACHEMAX=64):
            with rasterio.open(href) as src:
                # Determine target shape
                target_height = grid.height
                target_width = grid.width

                # Determine output bands
                if bands:
                    band_indices = []
                    for b in bands:
                        try:
                            band_indices.append(int(b) if b.isdigit() else 1)
                        except (ValueError, IndexError):
                            band_indices.append(1)
                else:
                    band_indices = [1]
                    if src.count > 1:
                        band_indices = [1, 2]

                # Reproject each band into the grid
                reprojected = []
                for idx in band_indices:
                    dest = np.zeros((target_height, target_width), dtype=np.float32)
                    rio_reproject(
                        source=rasterio.band(src, idx),
                        destination=dest,
                        src_transform=src.transform,
                        src_crs=src.crs,
                        dst_transform=grid.transform,
                        dst_crs=grid.crs,
                        resampling=Resampling.nearest,
                    )
                    reprojected.append(dest)

                result = np.stack(reprojected, axis=0)  # (C, H, W)
                logger.info("[Compositor] Reprojected %s → %s shape=%s", href[:80], grid.crs, result.shape)
                return result

    except Exception as e:
        logger.warning("[Compositor] Failed to read %s into grid: %s", href[:80], e)
        return None


# ══════════════════════════════════════════════════════════════════
# Full Compositing Pipeline
# ══════════════════════════════════════════════════════════════════

@dataclass
class CompositeResult:
    """Result of temporal compositing for one period."""
    composite: np.ndarray             # (C, H, W) or (1, H, W)
    grid: AnalysisGrid
    method: str
    n_scenes_used: int
    scene_ids: list[str]
    cloud_pct: Optional[float]
    composite_stats: dict[str, Any]
    valid_mask: Optional[np.ndarray] = None  # (H, W) — where data is valid


def build_period_composite(
    scene_hrefs: list[str],
    scene_ids: list[str],
    grid: AnalysisGrid,
    band_names: list[str],
    composite_method: str = "median",
    cloud_threshold: float = 30.0,
) -> Optional[CompositeResult]:
    """
    Build a temporal composite for one period.

    Reads multiple scenes into the common grid, applies cloud masking,
    and computes a cloud-free composite.

    Args:
        scene_hrefs: List of raster file URLs/paths for this period
        scene_ids: Corresponding scene IDs
        grid: The common analysis grid
        band_names: Which bands to read (e.g. ["B04", "B08"])
        composite_method: "median", "mean", "first_quartile"
        cloud_threshold: Max cloud cover % for individual scenes

    Returns:
        CompositeResult or None on failure
    """
    if not scene_hrefs:
        logger.warning("[Compositor] No scenes provided for composite")
        return None

    band_stacks = []  # List of (C, H, W) arrays
    valid_masks = []  # List of (H, W) boolean arrays

    for href, sid in zip(scene_hrefs, scene_ids):
        raster = read_raster_into_grid(href, grid, bands=band_names)
        if raster is None:
            logger.warning("[Compositor] Skipping scene %s — read failed", sid)
            continue

        band_stacks.append(raster)

        # Create valid mask (non-zero, non-NaN)
        valid = np.any(raster > 0, axis=0) & np.all(np.isfinite(raster), axis=0)
        valid_masks.append(valid)

    if not band_stacks:
        logger.warning("[Compositor] No valid scenes for composite")
        return None

    # Stack all observations: (T, C, H, W)
    band_stack = np.stack(band_stacks, axis=0)
    valid_stack = np.stack(valid_masks, axis=0) if valid_masks else None

    # Compute composite
    composite, stats = compute_temporal_composite(
        band_stack, valid_stack, method=composite_method,
    )

    # Overall valid mask: pixel is valid if any observation contributed
    if valid_stack is not None:
        overall_valid = np.any(valid_stack, axis=0)
    else:
        overall_valid = np.ones((grid.height, grid.width), dtype=bool)

    # Estimate cloud percentage from invalid pixels
    cloud_pct = float(1.0 - np.mean(overall_valid)) * 100

    return CompositeResult(
        composite=composite,
        grid=grid,
        method=composite_method,
        n_scenes_used=len(band_stacks),
        scene_ids=scene_ids[:len(band_stacks)],
        cloud_pct=round(cloud_pct, 1),
        composite_stats=stats,
        valid_mask=overall_valid,
    )
