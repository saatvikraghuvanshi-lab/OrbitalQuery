"""
Scene Mosaicker — combine multiple scenes into one analysis-ready composite.

Uses windowed raster reads (rasterio) to stay within Render's 512MB memory limit.

Architecture:
  For each required band:
    1. Read the band from each scene (windowed to the AOI).
    2. Stack into a 3D array (scenes, height, width).
    3. Apply a simple compositing rule: take the valid pixel with the
       lowest cloud proximity or median value.
    4. Return one (height, width) array per band.

Memory budget:
  At 10m Sentinel-2 resolution, a typical city AOI (0.25° × 0.25°)
  is ~2800 × 2800 pixels = ~31MB per band as float32.
  With 2-3 bands needed for an index, that's ~93MB — safe for 512MB.

  Larger AOIs or more scenes will use smaller windows (max_dim).
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import numpy as np

logger = logging.getLogger(__name__)


def mosaic_bands(
    scene_hrefs: list[str],
    band_names: list[str],
    bbox: list[float],
    max_dim: int = 1024,
) -> dict[str, Any]:
    """
    Mosaic multiple scenes into one composite for the given AOI.

    For each band, reads from all scenes and composites using a valid-pixel
    selection strategy.

    Args:
        scene_hrefs: List of raster URLs (one per scene) for the FIRST required band.
                     Additional scenes will be read with the same band index.
        band_names: Logical band names (e.g. ["B08", "B04"])
        bbox: AOI bounding box [west, south, east, north]
        max_dim: Maximum pixel dimension per scene read (memory limit)

    Returns:
        dict with:
            - data: np.ndarray (n_bands, height, width) — the mosaicked composite
            - band_names: list of band names
            - transform: affine transform
            - crs: coordinate reference system
            - profile: rasterio profile
            - scene_count: number of scenes used
            - nodata_mask: boolean mask of nodata pixels
    """
    if not scene_hrefs:
        raise ValueError("No scene hrefs provided for mosaicking")

    if len(scene_hrefs) == 1:
        # Single scene — just read it directly
        return _read_single_scene(scene_hrefs[0], band_names, bbox, max_dim)

    logger.info(
        "Mosaicking %d scenes for bands %s over bbox %s",
        len(scene_hrefs), band_names, bbox,
    )

    # Read band data from each scene
    all_band_data: dict[int, list[tuple[np.ndarray, np.ndarray]]] = {}
    # Maps band_index → list of (array, nodata_mask) per scene

    for i, href in enumerate(scene_hrefs):
        logger.info("Reading scene %d/%d: %s", i + 1, len(scene_hrefs), href[:120])
        try:
            scene_data = _read_scene_bands(href, band_names, bbox, max_dim)
            for band_idx, (arr, mask) in enumerate(scene_data):
                if band_idx not in all_band_data:
                    all_band_data[band_idx] = []
                all_band_data[band_idx].append((arr, mask))
        except Exception as e:
            logger.warning("Failed to read scene %d (%s): %s", i, href[:80], e)
            continue

    if not all_band_data:
        raise RuntimeError("All scene reads failed — cannot create mosaic")

    # Composite each band
    composite_bands = []
    composite_masks = []

    for band_idx in sorted(all_band_data.keys()):
        band_scenes = all_band_data[band_idx]
        composite, nodata_mask = _composite_band(band_scenes)
        composite_bands.append(composite)
        composite_masks.append(nodata_mask)

    # Stack into (bands, height, width)
    data = np.stack(composite_bands, axis=0)

    # Combine nodata masks
    combined_nodata = composite_masks[0] if composite_masks else np.zeros(data.shape[1:], dtype=bool)
    for mask in composite_masks[1:]:
        combined_nodata = combined_nodata | mask

    # Get profile from first successful read
    profile = _get_profile(scene_hrefs[0], bbox, data.shape, band_names)

    logger.info(
        "Mosaic complete: shape=%s, scenes_used=%d, nodata_pct=%.1f%%",
        data.shape, len(scene_hrefs), combined_nodata.sum() / combined_nodata.size * 100,
    )

    return {
        "data": data,
        "band_names": band_names,
        "transform": profile.get("transform"),
        "crs": profile.get("crs", "EPSG:4326"),
        "profile": profile,
        "scene_count": len(scene_hrefs),
        "nodata_mask": combined_nodata,
    }


def _read_single_scene(
    href: str,
    band_names: list[str],
    bbox: list[float],
    max_dim: int,
) -> dict[str, Any]:
    """Read a single scene (no mosaicking needed)."""
    import rasterio
    from rasterio.windows import from_bounds as window_from_bounds
    import os

    # Clear poisoned env vars
    for key in ['GDAL_CACHEMAX', 'GDAL_DISABLE_READDIR_ON_OPEN',
                'CPL_VSIL_CURL_ALLOWED_EXTENSIONS', 'GDAL_HTTP_TIMEOUT',
                'GDAL_HTTP_MAX_RETRY']:
        if key in os.environ:
            del os.environ[key]

    with rasterio.Env(
        GDAL_CACHEMAX=64,
        GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
        GDAL_HTTP_TIMEOUT="30",
    ):
        with rasterio.open(href) as src:
            window, transform = _compute_window(src, bbox, max_dim)
            band_arrays = []
            nodata_masks = []

            for bname in band_names:
                band_idx = _resolve_band_index(src, bname)
                data = src.read(indexes=[band_idx], window=window)
                band_arrays.append(data[0])

                nodata_val = src.nodata
                if nodata_val is not None:
                    nodata_masks.append(data[0] == nodata_val)
                else:
                    nodata_masks.append(data[0] <= 0)

            data = np.stack(band_arrays, axis=0)
            combined_nodata = nodata_masks[0]
            for m in nodata_masks[1:]:
                combined_nodata = combined_nodata | m

            profile = src.profile.copy()
            profile.update(
                width=band_arrays[0].shape[1],
                height=band_arrays[0].shape[0],
                transform=transform,
                count=len(band_names),
            )

            return {
                "data": data,
                "band_names": band_names,
                "transform": transform,
                "crs": str(src.crs),
                "profile": profile,
                "scene_count": 1,
                "nodata_mask": combined_nodata,
            }


def _read_scene_bands(
    href: str,
    band_names: list[str],
    bbox: list[float],
    max_dim: int,
) -> list[tuple[np.ndarray, np.ndarray]]:
    """
    Read bands from a single scene, windowed to the AOI.

    Returns list of (band_array, nodata_mask) tuples.
    """
    import rasterio
    import os

    # Clear poisoned env vars
    for key in ['GDAL_CACHEMAX', 'GDAL_DISABLE_READDIR_ON_OPEN',
                'CPL_VSIL_CURL_ALLOWED_EXTENSIONS', 'GDAL_HTTP_TIMEOUT',
                'GDAL_HTTP_MAX_RETRY']:
        if key in os.environ:
            del os.environ[key]

    results = []

    with rasterio.Env(
        GDAL_CACHEMAX=64,
        GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
        GDAL_HTTP_TIMEOUT="30",
    ):
        with rasterio.open(href) as src:
            window, _ = _compute_window(src, bbox, max_dim)

            for bname in band_names:
                band_idx = _resolve_band_index(src, bname)
                data = src.read(indexes=[band_idx], window=window)
                arr = data[0].astype(np.float32)

                nodata_val = src.nodata
                if nodata_val is not None:
                    mask = arr == nodata_val
                else:
                    mask = arr <= 0

                results.append((arr, mask))

    return results


def _resolve_band_index(src: Any, band_name: str) -> int:
    """
    Resolve a band name to a rasterio band index.

    Tries exact match on description, then falls back to numeric index.
    """
    # Try to find by description
    for i in range(1, src.count + 1):
        desc = src.descriptions[i - 1] if src.descriptions else None
        if desc and band_name.upper() in desc.upper():
            return i

    # Try numeric
    if band_name.isdigit():
        idx = int(band_name)
        if 1 <= idx <= src.count:
            return idx

    # Try common mappings
    S2_MAP = {"B01": 1, "B02": 2, "B03": 3, "B04": 4, "B05": 5,
              "B06": 6, "B07": 7, "B08": 8, "B8A": 9, "B11": 11, "B12": 12}
    if band_name in S2_MAP and S2_MAP[band_name] <= src.count:
        return S2_MAP[band_name]

    # Default to first band
    logger.warning("Could not resolve band '%s', defaulting to band 1", band_name)
    return 1


def _compute_window(
    src: Any,
    bbox: list[float],
    max_dim: int,
) -> tuple:
    """Compute the rasterio window for the given bbox."""
    from rasterio.transform import array_bounds

    # Transform bbox from WGS-84 to raster CRS if needed
    bbox_native = bbox
    if src.crs and "EPSG:4326" not in str(src.crs):
        try:
            from pyproj import Transformer
            transformer = Transformer.from_crs("EPSG:4326", src.crs, always_xy=True)
            west, south = transformer.transform(bbox[0], bbox[1])
            east, north = transformer.transform(bbox[2], bbox[3])
            bbox_native = [west, south, east, north]
        except Exception as e:
            logger.warning("CRS transform failed: %s", e)

    # Compute pixel coordinates
    inv_transform = ~src.transform
    col_off, row_off = inv_transform * (bbox_native[0], bbox_native[3])
    col_off2, row_off2 = inv_transform * (bbox_native[2], bbox_native[1])

    col_off = int(max(0, col_off))
    row_off = int(max(0, row_off))
    win_width = int(min(abs(col_off2 - col_off), src.width - col_off))
    win_height = int(min(abs(row_off2 - row_off), src.height - row_off))

    if win_width <= 0 or win_height <= 0:
        logger.warning("Window outside raster, using full extent")
        import rasterio.windows
        return rasterio.windows.Window(0, 0, min(src.width, max_dim), min(src.height, max_dim)), src.transform

    # Cap to max_dim
    if win_width > max_dim or win_height > max_dim:
        scale = min(max_dim / win_width, max_dim / win_height)
        win_width = int(win_width * scale)
        win_height = int(win_height * scale)

    import rasterio.windows
    window = rasterio.windows.Window(col_off, row_off, win_width, win_height)
    transform = src.window_transform(window)

    return window, transform


def _composite_band(
    scenes: list[tuple[np.ndarray, np.ndarray]],
) -> tuple[np.ndarray, np.ndarray]:
    """
    Composite multiple scenes of the same band into one output.

    Strategy: for each pixel, take the value from the scene where the
    pixel is valid (not nodata).  If multiple valid values exist,
    use the median.
    """
    if len(scenes) == 1:
        return scenes[0]

    # Ensure same shape (crop to minimum dimensions)
    min_h = min(s[0].shape[0] for s in scenes)
    min_w = min(s[0].shape[1] for s in scenes)

    stacked = np.stack([s[0][:min_h, :min_w] for s in scenes], axis=0)
    masks = np.stack([s[1][:min_h, :min_w] for s in scenes], axis=0)

    # For each pixel, find valid scenes
    valid = ~masks  # (n_scenes, h, w)

    # Output: median of valid values per pixel
    output = np.full((min_h, min_w), np.nan, dtype=np.float32)

    for row in range(min_h):
        for col in range(min_w):
            valid_vals = stacked[:, row, col][valid[:, row, col]]
            if len(valid_vals) > 0:
                output[row, col] = np.median(valid_vals)

    # Nodata = pixels where no scene has valid data
    nodata_mask = ~valid.any(axis=0)

    return output, nodata_mask


def _get_profile(
    href: str,
    bbox: list[float],
    shape: tuple,
    band_names: list[str],
) -> dict:
    """Get a rasterio profile from the first scene."""
    import rasterio
    import os

    for key in ['GDAL_CACHEMAX', 'GDAL_DISABLE_READDIR_ON_OPEN',
                'CPL_VSIL_CURL_ALLOWED_EXTENSIONS', 'GDAL_HTTP_TIMEOUT',
                'GDAL_HTTP_MAX_RETRY']:
        if key in os.environ:
            del os.environ[key]

    with rasterio.Env(
        GDAL_CACHEMAX=64,
        GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
        GDAL_HTTP_TIMEOUT="30",
    ):
        with rasterio.open(href) as src:
            window, transform = _compute_window(src, bbox, shape[2])
            profile = src.profile.copy()
            profile.update(
                width=shape[2],
                height=shape[1],
                count=shape[0],
                transform=transform,
                dtype="float32",
            )
            return profile
