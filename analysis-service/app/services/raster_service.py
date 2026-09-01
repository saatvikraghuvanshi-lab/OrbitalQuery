"""Raster analysis service — memory-optimized for Render free tier (512MB).

Uses aggressive GDAL settings and small windows to stay within memory limits.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

# NOTE: GDAL env vars are set INSIDE rasterio.Env() blocks, not at module level.
# Setting GDAL_CACHEMAX="64" (string) at module level causes
# TypeError: an integer is required when GDAL reads the env var before rasterio.Env().

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
        GDAL_CACHEMAX=64,
        GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
        GDAL_HTTP_TIMEOUT="30",
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

            # Create window — cap for 512MB RAM
            window = None
            try:
                # Compute pixel coordinates from bbox + transform
                inv_transform = ~src.transform
                col_off, row_off = inv_transform * (bbox_native[0], bbox_native[3])
                col_off2, row_off2 = inv_transform * (bbox_native[2], bbox_native[1])
                
                # Ensure integer pixel coords
                col_off = int(max(0, col_off))
                row_off = int(max(0, row_off))
                win_width = int(min(col_off2 - col_off, src.width - col_off))
                win_height = int(min(row_off2 - row_off, src.height - row_off))
                
                if win_width <= 0 or win_height <= 0:
                    logger.warning("Window too small or outside raster, reading full extent")
                else:
                    # Cap to max_dim
                    if win_width > max_dim or win_height > max_dim:
                        scale = min(max_dim / win_width, max_dim / win_height)
                        win_width = int(win_width * scale)
                        win_height = int(win_height * scale)
                    
                    window = rasterio.windows.Window(col_off, row_off, win_width, win_height)
                    logger.info("Window: col=%d, row=%d, w=%d, h=%d", col_off, row_off, win_width, win_height)
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
            if window is not None:
                transform = src.window_transform(window)
            else:
                transform = src.transform

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
