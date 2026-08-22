"""Raster analysis service using rasterio for windowed reads."""

from __future__ import annotations

import logging
from typing import Any, Optional

import numpy as np
import rasterio
from rasterio.transform import from_bounds
from rasterio.windows import from_bounds as window_from_bounds

from app.models.requests import BandStats

logger = logging.getLogger(__name__)


def read_raster_window(
    href: str,
    bbox: list[float],
    bands: Optional[list[str]] = None,
) -> dict[str, Any]:
    """
    Read a raster window for a given bounding box.

    Uses windowed reading to avoid loading entire scenes.
    Only reads from assets that are rasterio-compatible.

    Returns dict with:
        - data: numpy array (bands, height, width)
        - band_names: list of band names
        - profile: rasterio profile
        - window_shape: [bands, height, width]
        - transform: affine transform
        - crs: coordinate reference system
    """
    logger.info("Opening raster: %s with bbox %s", href, bbox)

    with rasterio.open(href) as src:
        logger.info(
            "Raster info: %d bands, size=%dx%d, crs=%s, dtype=%s",
            src.count,
            src.width,
            src.height,
            src.crs,
            src.dtypes,
        )

        # Transform bbox from WGS-84 to raster CRS if needed
        bbox_native = bbox
        src_crs_str = str(src.crs)
        if "EPSG:4326" not in src_crs_str and src.crs is not None:
            try:
                from pyproj import Transformer
                transformer = Transformer.from_crs(
                    "EPSG:4326", src.crs, always_xy=True
                )
                west, south = transformer.transform(bbox[0], bbox[1])
                east, north = transformer.transform(bbox[2], bbox[3])
                bbox_native = [west, south, east, north]
                logger.info(
                    "Transformed bbox from WGS-84 to %s: %s",
                    src.crs,
                    bbox_native,
                )
            except Exception as e:
                logger.warning("CRS transform failed, using raw bbox: %s", e)

        # Create window from bbox in the raster's native CRS
        try:
            window = window_from_bounds(
                bbox_native[0], bbox_native[1],
                bbox_native[2], bbox_native[3],
                transform=src.transform,
            )
            logger.info(
                "Window: col_off=%.1f, row_off=%.1f, width=%.1f, height=%.1f",
                window.col_off, window.row_off, window.width, window.height,
            )
        except Exception as e:
            logger.warning(
                "Could not create window from bbox: %s. Reading full extent.", e
            )
            window = None

        # Determine which bands to read
        band_indices = None
        band_names = []

        if bands and src.count >= 1:
            # Map band names to indices if possible
            band_indices = []
            for b in bands:
                try:
                    idx = int(b) if b.isdigit() else src.statistics(1) and 1  # fallback
                    band_indices.append(idx)
                except (ValueError, rasterio.errors.BandNotFoundError):
                    band_indices.append(1)
            band_names = bands
        else:
            # Read all bands (or RGB if too many)
            if src.count <= 10:
                band_indices = list(range(1, src.count + 1))
                band_names = [f"band_{i}" for i in band_indices]
            else:
                # Read first 3 bands (likely RGB)
                band_indices = [1, 2, 3]
                band_names = ["red", "green", "blue"]

        # Read the window
        if window is not None:
            data = src.read(indexes=band_indices, window=window)
        else:
            data = src.read(indexes=band_indices)

        profile = src.profile.copy()
        transform = src.transform if window is None else src.window_transform(window)

        logger.info("Read data shape: %s, dtype: %s", data.shape, data.dtype)

        return {
            "data": data,
            "band_names": band_names,
            "profile": profile,
            "window_shape": list(data.shape),
            "transform": transform,
            "crs": str(src.crs),
            "dtype": str(data.dtype),
        }


def compute_band_stats(
    data: np.ndarray,
    band_names: list[str],
) -> list[BandStats]:
    """
    Compute statistics for each band.

    Returns list of BandStats with min, max, mean, std, nodata count.
    """
    stats_list = []
    nodata_value = -9999  # default nodata sentinel

    for i, name in enumerate(band_names):
        if data.ndim == 3:
            band_data = data[i].astype(np.float64)
        else:
            band_data = data.astype(np.float64)

        # Mask nodata and zero values
        valid = band_data[(band_data != 0) & (band_data > nodata_value)]

        nodata_count = int(np.sum((band_data == 0) | (band_data <= nodata_value)))

        if len(valid) == 0:
            stats_list.append(
                BandStats(
                    band=name,
                    dtype=str(data.dtype),
                    shape=list(band_data.shape),
                    min=0.0,
                    max=0.0,
                    mean=0.0,
                    std=0.0,
                    nodata_count=nodata_count,
                )
            )
        else:
            stats_list.append(
                BandStats(
                    band=name,
                    dtype=str(data.dtype),
                    shape=list(band_data.shape),
                    min=float(np.min(valid)),
                    max=float(np.max(valid)),
                    mean=float(np.mean(valid)),
                    std=float(np.std(valid)),
                    nodata_count=nodata_count,
                )
            )

    return stats_list


def estimate_resolution_meters(profile: dict, crs: str) -> Optional[float]:
    """
    Estimate spatial resolution in meters from the raster profile.

    Uses the affine transform pixel size.
    """
    try:
        transform = profile.get("transform")
        if transform is None:
            return None

        # Pixel size in CRS units
        pixel_size_x = abs(transform.a)
        pixel_size_y = abs(transform.e)

        # For geographic CRS (degrees), approximate meters
        if "EPSG:4326" in str(crs) or crs == "CRS.from_epsg(4326)":
            # 1 degree ≈ 111 km at equator
            return pixel_size_x * 111_000

        # For projected CRS (meters), return directly
        return (pixel_size_x + pixel_size_y) / 2

    except Exception:
        return None


def is_rasterio_compatible(href: str) -> bool:
    """Check if a URL can be opened by rasterio (vs being a JPEG/PNG thumbnail)."""
    try:
        with rasterio.open(href) as src:
            return src.count > 0
    except Exception:
        return False
