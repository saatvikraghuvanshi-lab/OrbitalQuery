"""Raster analysis service — memory-optimized for Render free tier (512MB).

Uses aggressive GDAL settings and small windows to stay within memory limits.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

# Aggressive GDAL memory limits for Render free tier (512MB)
os.environ.setdefault("GDAL_CACHEMAX", "32")
os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", "tif")
os.environ.setdefault("GDAL_HTTP_MAX_RETRY", "2")
os.environ.setdefault("GDAL_HTTP_TIMEOUT", "30")
os.environ.setdefault("GDAL_HTTP_MULTIPLEX", "YES")
os.environ.setdefault("GDAL_HTTPMerge_CONSECUTIVE_RANGES", "YES")

logger = logging.getLogger(__name__)


def read_raster_window(
    href: str,
    bbox: list[float],
    bands: Optional[list[str]] = None,
    max_dim: int = 1024,
) -> dict[str, Any]:
    """
    Read a small raster window for a given bounding box.

    Uses aggressive memory limits to stay under 512MB on Render free tier.
    max_dim=1024 → 1024² float32 = 4MB per band (safe).

    Returns dict with:
        - data: numpy array (bands, height, width)
        - band_names: list of band names
        - profile: rasterio profile
        - window_shape: [bands, height, width]
        - transform: affine transform
        - crs: coordinate reference system
    """
    import numpy as np
    import rasterio
    from rasterio.windows import from_bounds as window_from_bounds

    logger.info("Opening raster: %s (max_dim=%d)", href[:120], max_dim)

    with rasterio.Env(
        GDAL_CACHEMAX="32",
        GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
        GDAL_HTTP_TIMEOUT="30",
        GDAL_HTTP_MAX_RETRY="2",
    ):
        with rasterio.open(href) as src:
            logger.info(
                "Raster info: %d bands, size=%dx%d, crs=%s",
                src.count, src.width, src.height, src.crs,
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
                except Exception as e:
                    logger.warning("CRS transform failed, using raw bbox: %s", e)

            # Create window — aggressive cap for 512MB RAM
            window = None
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

                # Cap to max_dim to prevent OOM
                if window.width > max_dim or window.height > max_dim:
                    scale = min(max_dim / window.width, max_dim / window.height)
                    new_w = max(1, int(window.width * scale))
                    new_h = max(1, int(window.height * scale))
                    logger.warning(
                        "Window capped from %.0fx%.0f to %dx%d",
                        window.width, window.height, new_w, new_h,
                    )
                    window = window_from_bounds(
                        bbox_native[0], bbox_native[1],
                        bbox_native[2], bbox_native[3],
                        transform=src.transform,
                        width=new_w,
                        height=new_h,
                    )
            except Exception as e:
                logger.warning("Could not create window: %s", e)
                window = None

            # Determine which bands to read (single band at a time to save memory)
            if bands and src.count >= 1:
                band_names = bands
                band_indices = []
                for b in bands:
                    try:
                        band_indices.append(int(b) if b.isdigit() else 1)
                    except (ValueError, rasterio.errors.BandNotFoundError):
                        band_indices.append(1)
            else:
                band_count = min(src.count, 2)  # Read max 2 bands
                band_indices = list(range(1, band_count + 1))
                band_names = [f"band_{i}" for i in band_indices]

            # Read bands one at a time to minimize memory
            band_arrays = []
            for idx in band_indices:
                if window is not None:
                    data = src.read(indexes=[idx], window=window)
                else:
                    data = src.read(indexes=[idx])
                band_arrays.append(data[0])  # shape: (height, width)

            # Stack into (bands, height, width)
            import numpy as np
            data = np.stack(band_arrays, axis=0) if len(band_arrays) > 1 else band_arrays[0][np.newaxis, ...]

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
    data: Any,
    band_names: list[str],
) -> list:
    """Compute statistics for each band."""
    import numpy as np
    from app.models.requests import BandStats

    stats_list = []
    nodata_value = -9999

    for i, name in enumerate(band_names):
        if data.ndim == 3:
            band_data = data[i].astype(np.float64)
        else:
            band_data = data.astype(np.float64)

        valid = band_data[(band_data != 0) & (band_data > nodata_value)]
        nodata_count = int(np.sum((band_data == 0) | (band_data <= nodata_value)))

        if len(valid) == 0:
            stats_list.append(BandStats(
                band=name, dtype=str(data.dtype),
                shape=list(band_data.shape),
                min=0.0, max=0.0, mean=0.0, std=0.0,
                nodata_count=nodata_count,
            ))
        else:
            stats_list.append(BandStats(
                band=name, dtype=str(data.dtype),
                shape=list(band_data.shape),
                min=float(np.min(valid)), max=float(np.max(valid)),
                mean=float(np.mean(valid)), std=float(np.std(valid)),
                nodata_count=nodata_count,
            ))

    return stats_list


def estimate_resolution_meters(profile: dict, crs: str) -> Optional[float]:
    """Estimate spatial resolution in meters from the raster profile."""
    try:
        transform = profile.get("transform")
        if transform is None:
            return None
        pixel_size_x = abs(transform.a)
        pixel_size_y = abs(transform.e)
        if "EPSG:4326" in str(crs):
            return pixel_size_x * 111_000
        return (pixel_size_x + pixel_size_y) / 2
    except Exception:
        return None


def is_rasterio_compatible(href: str) -> bool:
    """Check if a URL can be opened by rasterio."""
    import rasterio
    try:
        with rasterio.open(href) as src:
            return src.count > 0
    except Exception:
        return False
