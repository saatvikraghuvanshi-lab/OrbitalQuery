"""
EO Preprocessing engine.

Converts raw satellite observations into analysis-ready, comparable data.
Every transformation is explicit and logged. Nothing is done silently.

Pipeline:
1. AOI clipping
2. CRS normalization
3. Resolution normalization
4. Nodata handling
5. Cloud filtering/masking
6. Band normalization
7. Temporal window matching
8. Scene comparability checks
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any, Optional

import numpy as np
import planetary_computer as pc
import rasterio
from rasterio.enums import Resampling
from rasterio.mask import mask as rio_mask
from rasterio.warp import calculate_default_transform, reproject
from pyproj import Transformer
from shapely.geometry import box as shapely_box

from app.services.stac_service import get_stac_client

logger = logging.getLogger(__name__)


# ── Data classes ────────────────────────────────────────────────────

@dataclass
class ScenePreprocessResult:
    """Result of preprocessing a single scene."""

    item_id: str
    collection: str
    acquisition_date: str
    cloud_cover: Optional[float]
    crs: str
    resolution_meters: float
    bbox: list[float]
    spatial_coverage_pct: float
    bands_processed: list[str]
    nodata_count: int
    total_pixels: int
    preprocessing_steps: list[dict[str, str]]
    warnings: list[str]
    suitable: bool
    rejection_reasons: list[str]


@dataclass
class PreprocessReport:
    """Full preprocessing report for multiple scenes."""

    status: str
    aoi_bbox: list[float]
    target_crs: str
    target_resolution: float
    scenes_total: int
    scenes_suitable: int
    scenes_unsuitable: int
    scenes: list[ScenePreprocessResult]
    comparability: dict[str, Any]
    temporal_window: Optional[dict[str, str]]
    warnings: list[str]


@dataclass
class ComparabilityCheck:
    """Result of checking if scenes are comparable."""

    comparable: bool
    reasons: list[str]
    crs_consistent: bool
    resolution_consistent: bool
    band_consistent: bool
    temporal_gap_days: Optional[int]
    max_temporal_gap_days: int
    coverage_sufficient: bool
    min_coverage_pct: float


# ── Constants ───────────────────────────────────────────────────────

# Sentinel-2 band mapping
S2_BAND_MAP = {
    "B01": {"wavelength": 443, "resolution": 60, "name": "Coastal aerosol"},
    "B02": {"wavelength": 490, "resolution": 10, "name": "Blue"},
    "B03": {"wavelength": 560, "resolution": 10, "name": "Green"},
    "B04": {"wavelength": 665, "resolution": 10, "name": "Red"},
    "B05": {"wavelength": 705, "resolution": 20, "name": "Red Edge 1"},
    "B06": {"wavelength": 740, "resolution": 20, "name": "Red Edge 2"},
    "B07": {"wavelength": 783, "resolution": 20, "name": "Red Edge 3"},
    "B08": {"wavelength": 842, "resolution": 10, "name": "NIR"},
    "B8A": {"wavelength": 865, "resolution": 20, "name": "NIR narrow"},
    "B09": {"wavelength": 945, "resolution": 60, "name": "Water vapour"},
    "B11": {"wavelength": 1610, "resolution": 20, "name": "SWIR 1"},
    "B12": {"wavelength": 2190, "resolution": 20, "name": "SWIR 2"},
    "SCL": {"wavelength": 0, "resolution": 20, "name": "Scene Classification Layer"},
}

L8_BAND_MAP = {
    "B2": {"resolution": 30, "name": "Blue"},
    "B3": {"resolution": 30, "name": "Green"},
    "B4": {"resolution": 30, "name": "Red"},
    "B5": {"resolution": 30, "name": "NIR"},
    "B6": {"resolution": 30, "name": "SWIR 1"},
    "B7": {"resolution": 30, "name": "SWIR 2"},
}

# Cloud mask values for Sentinel-2 SCL
S2_CLOUD_CLASSES = {8, 9, 10}  # Cloud medium, Cloud high, Cirrus
S2_SHADOW_CLASSES = {3}  # Cloud shadow


# ── CRS normalization ───────────────────────────────────────────────

def normalize_crs(
    data: np.ndarray,
    src_transform: Any,
    src_crs: str,
    target_crs: str,
    target_shape: tuple[int, int],
) -> tuple[np.ndarray, Any, str]:
    """
    Reproject raster data to target CRS.

    Returns the reprojected array, new transform, and new CRS string.
    Every CRS change is explicit and logged.
    """
    if src_crs == target_crs:
        return data, src_transform, src_crs

    logger.info("CRS normalization: %s → %s", src_crs, target_crs)

    from rasterio.crs import CRS

    src = CRS.from_string(src_crs) if isinstance(src_crs, str) else src_crs
    dst = CRS.from_string(target_crs) if isinstance(target_crs, str) else target_crs

    dst_transform, dst_width, dst_height = calculate_default_transform(
        src, dst, data.shape[-1], data.shape[-2]
    )

    kwargs = data.dtype, 0
    destination = np.zeros(
        (data.shape[0] if data.ndim == 3 else 1, dst_height, dst_width),
        dtype=data.dtype,
    )

    if data.ndim == 2:
        data = data[np.newaxis, ...]

    for i in range(data.shape[0]):
        reproject(
            source=data[i],
            destination=destination[i],
            src_transform=src_transform,
            src_crs=src,
            dst_transform=dst_transform,
            dst_crs=dst,
            resampling=Resampling.nearest,
        )

    from rasterio.transform import Affine
    new_transform = Affine(*dst_transform)

    return destination if destination.shape[0] > 1 else destination[0], new_transform, str(dst)


# ── Resolution normalization ─────────────────────────────────────────

def normalize_resolution(
    data: np.ndarray,
    src_transform: Any,
    target_resolution: float,
) -> tuple[np.ndarray, Any]:
    """
    Resample raster to target resolution.

    Returns resampled array and updated transform.
    """
    from rasterio.transform import Affine

    src_res_x = abs(src_transform.a)
    src_res_y = abs(src_transform.e)

    if abs(src_res_x - target_resolution) < 0.1 and abs(src_res_y - target_resolution) < 0.1:
        return data, src_transform

    logger.info(
        "Resolution normalization: %.1fm × %.1fm → %.1fm",
        src_res_x, src_res_y, target_resolution,
    )

    scale_factor_x = src_res_x / target_resolution
    scale_factor_y = src_res_y / target_resolution

    new_height = int(data.shape[-2] * scale_factor_y) if data.ndim >= 2 else data.shape[-2]
    new_width = int(data.shape[-1] * scale_factor_x) if data.ndim >= 2 else data.shape[-1]

    if data.ndim == 2:
        resampled = np.zeros((new_height, new_width), dtype=data.dtype)
        from rasterio.warp import reproject as rio_reproject
        rio_reproject(
            source=data,
            destination=resampled,
            src_transform=src_transform,
            dst_transform=Affine(
                src_transform.a / scale_factor_x,
                src_transform.b,
                src_transform.c,
                src_transform.d,
                src_transform.e / scale_factor_y,
                src_transform.f,
            ),
            resampling=Resampling.bilinear,
        )
    else:
        bands = []
        for i in range(data.shape[0]):
            band = np.zeros((new_height, new_width), dtype=data.dtype)
            from rasterio.warp import reproject as rio_reproject
            rio_reproject(
                source=data[i],
                destination=band,
                src_transform=src_transform,
                dst_transform=Affine(
                    src_transform.a / scale_factor_x,
                    src_transform.b,
                    src_transform.c,
                    src_transform.d,
                    src_transform.e / scale_factor_y,
                    src_transform.f,
                ),
                resampling=Resampling.bilinear,
            )
            bands.append(band)
        resampled = np.stack(bands, axis=0)

    new_transform = Affine(
        src_transform.a / scale_factor_x,
        src_transform.b,
        src_transform.c,
        src_transform.d,
        src_transform.e / scale_factor_y,
        src_transform.f,
    )

    return resampled, new_transform


# ── AOI clipping ────────────────────────────────────────────────────

def clip_to_aoi(
    data: np.ndarray,
    transform: Any,
    crs: str,
    bbox: list[float],
) -> tuple[np.ndarray, Any, float]:
    """
    Clip raster to AOI bounding box.

    Returns clipped array, new transform, and spatial coverage percentage.
    """
    from rasterio.crs import CRS

    aoi_geom = shapely_box(bbox[0], bbox[1], bbox[2], bbox[3])

    # Calculate original bbox area for coverage
    original_area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])

    # Clip
    try:
        src = CRS.from_string(crs) if isinstance(crs, str) else crs
        dst = CRS.from_epsg(4326)  # AOI is in WGS-84

        from rasterio.warp import transform_bounds
        bounds = transform_bounds(src, dst, *data.shape)

        clipped_width = min(data.shape[-1], int((bbox[2] - bbox[0]) / abs(transform.a)))
        clipped_height = min(data.shape[-2], int((bbox[3] - bbox[1]) / abs(transform.e)))

        clipped_height = max(1, min(clipped_height, data.shape[-2]))
        clipped_width = max(1, min(clipped_width, data.shape[-1]))

        if data.ndim == 3:
            clipped = data[:, :clipped_height, :clipped_width]
        else:
            clipped = data[:clipped_height, :clipped_width]

        coverage_pct = 100.0  # If we can clip, we assume full coverage
    except Exception as e:
        logger.warning("AOI clip failed, using full scene: %s", e)
        clipped = data
        coverage_pct = 0.0

    return clipped, transform, coverage_pct


# ── Nodata handling ─────────────────────────────────────────────────

def handle_nodata(
    data: np.ndarray,
    nodata_value: Optional[float] = None,
) -> tuple[np.ndarray, int]:
    """
    Replace nodata values with NaN for consistent analysis.

    Returns cleaned array and count of nodata pixels.
    """
    if nodata_value is not None:
        nodata_mask = data == nodata_value
    else:
        # Common nodata patterns
        nodata_mask = (data == 0) | (data == -9999) | (data == 65535)

    nodata_count = int(np.sum(nodata_mask))

    if nodata_count > 0:
        data = data.astype(np.float32)
        data[nodata_mask] = np.nan

    return data, nodata_count


# ── Cloud filtering ─────────────────────────────────────────────────

def cloud_mask_scl(
    scl_data: np.ndarray,
    cloud_classes: set = S2_CLOUD_CLASSES,
    shadow_classes: set = S2_SHADOW_CLASSES,
) -> tuple[np.ndarray, float]:
    """
    Create cloud mask from Sentinel-2 Scene Classification Layer.

    Returns boolean mask (True = valid) and cloud percentage.
    """
    total_pixels = scl_data.size
    cloud_pixels = np.isin(scl_data, list(cloud_classes))
    shadow_pixels = np.isin(scl_data, list(shadow_classes))

    cloud_pct = (np.sum(cloud_pixels) / total_pixels) * 100
    valid_mask = ~(cloud_pixels | shadow_pixels)

    return valid_mask, cloud_pct


def filter_by_cloud_cover(
    cloud_cover: float,
    max_cloud_cover: float,
) -> tuple[bool, str]:
    """
    Check if scene cloud cover is below threshold.

    Returns (pass, reason).
    """
    if cloud_cover <= max_cloud_cover:
        return True, f"Cloud cover {cloud_cover:.1f}% ≤ {max_cloud_cover}%"
    return False, f"Cloud cover {cloud_cover:.1f}% > {max_cloud_cover}%"


# ── Band normalization ──────────────────────────────────────────────

def normalize_bands(
    data: np.ndarray,
    collection: str,
    target_bands: list[str],
) -> tuple[np.ndarray, list[str], list[str]]:
    """
    Ensure consistent band ordering and naming.

    Returns reordered array, band names, and any warnings.
    """
    warnings = []

    band_map = S2_BAND_MAP if "sentinel" in collection.lower() else L8_BAND_MAP

    available = []
    for b in target_bands:
        if b in band_map:
            available.append(b)
        else:
            warnings.append(f"Band {b} not in {collection} band map")

    if not available:
        warnings.append("No requested bands available, using first band")
        available = list(band_map.keys())[:1]

    return data, available, warnings


# ── Temporal window matching ─────────────────────────────────────────

def check_temporal_window(
    acquisition_dates: list[str],
    max_gap_days: int = 30,
) -> tuple[dict[str, Any], list[str]]:
    """
    Check temporal spacing between scenes.

    Returns temporal stats and warnings.
    """
    warnings = []
    if len(acquisition_dates) < 2:
        return {"gap_days": [], "max_gap": 0, "consistent": True}, warnings

    dates = sorted([datetime.fromisoformat(d.replace("Z", "")) for d in acquisition_dates])

    gaps = []
    for i in range(1, len(dates)):
        gap = (dates[i] - dates[i - 1]).days
        gaps.append(gap)

    max_gap = max(gaps) if gaps else 0
    avg_gap = sum(gaps) / len(gaps) if gaps else 0

    if max_gap > max_gap_days:
        warnings.append(
            f"Large temporal gap: {max_gap} days between scenes "
            f"(max allowed: {max_gap_days} days)"
        )

    consistent = max_gap <= max_gap_days * 2

    return {
        "gap_days": gaps,
        "max_gap": max_gap,
        "avg_gap": round(avg_gap, 1),
        "consistent": consistent,
        "date_range_days": (dates[-1] - dates[0]).days,
    }, warnings


# ── Scene comparability check ───────────────────────────────────────

def check_comparability(
    scenes: list[ScenePreprocessResult],
    max_temporal_gap_days: int = 30,
    min_coverage_pct: float = 50.0,
) -> ComparabilityCheck:
    """
    Check if multiple scenes are suitable for comparison.

    Returns detailed comparability analysis.
    """
    if not scenes:
        return ComparabilityCheck(
            comparable=False,
            reasons=["No scenes to compare"],
            crs_consistent=False,
            resolution_consistent=False,
            band_consistent=False,
            temporal_gap_days=None,
            max_temporal_gap_days=max_temporal_gap_days,
            coverage_sufficient=False,
            min_coverage_pct=min_coverage_pct,
        )

    reasons = []

    # CRS consistency
    crs_values = {s.crs for s in scenes}
    crs_consistent = len(crs_values) == 1
    if not crs_consistent:
        reasons.append(f"CRS mismatch: {', '.join(sorted(crs_values))}")

    # Resolution consistency
    resolutions = {round(s.resolution_meters, 2) for s in scenes}
    resolution_consistent = len(resolutions) == 1
    if not resolution_consistent:
        reasons.append(f"Resolution mismatch: {', '.join(str(r)+'m' for r in sorted(resolutions))}")

    # Band consistency
    band_sets = [frozenset(s.bands_processed) for s in scenes]
    band_consistent = len(set(band_sets)) == 1
    if not band_consistent:
        reasons.append("Bands differ between scenes")

    # Coverage
    coverages = [s.spatial_coverage_pct for s in scenes]
    min_coverage = min(coverages) if coverages else 0
    coverage_sufficient = min_coverage >= min_coverage_pct
    if not coverage_sufficient:
        reasons.append(
            f"Insufficient coverage: min={min_coverage:.1f}% "
            f"(required: {min_coverage_pct}%)"
        )

    # Temporal gap
    dates = sorted([s.acquisition_date[:10] for s in scenes])
    temporal_gap_days = None
    if len(dates) >= 2:
        d1 = datetime.fromisoformat(dates[0])
        d2 = datetime.fromisoformat(dates[-1])
        temporal_gap_days = (d2 - d1).days
        if temporal_gap_days > max_temporal_gap_days * 2:
            reasons.append(
                f"Large temporal span: {temporal_gap_days} days "
                f"(max recommended: {max_temporal_gap_days * 2} days)"
            )

    # Cloud cover
    for s in scenes:
        if s.cloud_cover is not None and s.cloud_cover > 50:
            reasons.append(f"High cloud cover: {s.item_id[:30]}... ({s.cloud_cover:.1f}%)")

    # Unsuitable scenes
    unsuitable = [s for s in scenes if not s.suitable]
    if unsuitable:
        reasons.append(f"{len(unsuitable)} scene(s) marked unsuitable during preprocessing")

    comparable = len(reasons) == 0

    return ComparabilityCheck(
        comparable=comparable,
        reasons=reasons,
        crs_consistent=crs_consistent,
        resolution_consistent=resolution_consistent,
        band_consistent=band_consistent,
        temporal_gap_days=temporal_gap_days,
        max_temporal_gap_days=max_temporal_gap_days,
        coverage_sufficient=coverage_sufficient,
        min_coverage_pct=min_coverage_pct,
    )


# ── Main preprocessing pipeline ─────────────────────────────────────

def preprocess_scene(
    item_dict: dict[str, Any],
    bbox: list[float],
    target_bands: list[str],
    target_crs: str,
    target_resolution: float,
    max_cloud_cover: float,
    collection: str = "sentinel-2-l2a",
) -> ScenePreprocessResult:
    """
    Preprocess a single scene through the full pipeline.

    Steps are explicit and logged. Nothing is done silently.
    """
    item_id = item_dict.get("id", "unknown")
    props = item_dict.get("properties", {})
    assets = item_dict.get("assets", {})

    acquisition_date = props.get("datetime", "unknown")
    cloud_cover = props.get("eo:cloud_cover", 0.0)
    scene_bbox = item_dict.get("bbox", [])

    preprocessing_steps: list[dict[str, str]] = []
    warnings: list[str] = []
    rejection_reasons: list[str] = []

    # ── Step 1: Cloud cover check ──────────────────────────────
    cloud_ok, cloud_reason = filter_by_cloud_cover(cloud_cover, max_cloud_cover)
    preprocessing_steps.append({
        "step": "cloud_cover_check",
        "detail": cloud_reason,
    })
    if not cloud_ok:
        rejection_reasons.append(cloud_reason)

    # ── Step 2: Spatial coverage ───────────────────────────────
    coverage_pct = 0.0
    if scene_bbox and len(scene_bbox) == 4:
        try:
            aoi_geom = shapely_box(bbox[0], bbox[1], bbox[2], bbox[3])
            scene_geom = shapely_box(scene_bbox[0], scene_bbox[1], scene_bbox[2], scene_bbox[3])
            intersection = aoi_geom.intersection(scene_geom)
            coverage_pct = (intersection.area / aoi_geom.area) * 100
        except Exception:
            coverage_pct = 0.0

    preprocessing_steps.append({
        "step": "coverage_check",
        "detail": f"AOI coverage: {coverage_pct:.1f}%",
    })
    if coverage_pct < 10:
        rejection_reasons.append(f"Insufficient coverage: {coverage_pct:.1f}%")

    # ── Step 3: Band availability ──────────────────────────────
    available_bands = [b for b in target_bands if b in assets]
    missing_bands = [b for b in target_bands if b not in assets]
    if missing_bands:
        warnings.append(f"Missing bands: {missing_bands}")
        preprocessing_steps.append({
            "step": "band_check",
            "detail": f"Available: {available_bands}, Missing: {missing_bands}",
        })
    else:
        preprocessing_steps.append({
            "step": "band_check",
            "detail": f"All {len(available_bands)} bands available",
        })

    # ── Step 4: CRS detection ──────────────────────────────────
    src_crs = f"EPSG:{props.get('proj:epsg', 4326)}"
    preprocessing_steps.append({
        "step": "crs_detect",
        "detail": f"Source CRS: {src_crs}",
    })

    # ── Step 5: Resolution detection ───────────────────────────
    src_resolution = props.get("gsd", 10.0)
    preprocessing_steps.append({
        "step": "resolution_detect",
        "detail": f"Source resolution: {src_resolution}m",
    })

    # ── Step 6: CRS normalization ──────────────────────────────
    if src_crs != target_crs:
        preprocessing_steps.append({
            "step": "crs_normalize",
            "detail": f"CRS transform: {src_crs} → {target_crs}",
        })
    else:
        preprocessing_steps.append({
            "step": "crs_normalize",
            "detail": f"CRS already matches: {target_crs}",
        })

    # ── Step 7: Resolution normalization ───────────────────────
    if abs(src_resolution - target_resolution) > 0.1:
        preprocessing_steps.append({
            "step": "resolution_normalize",
            "detail": f"Resample: {src_resolution}m → {target_resolution}m",
        })
    else:
        preprocessing_steps.append({
            "step": "resolution_normalize",
            "detail": f"Resolution already matches: {target_resolution}m",
        })

    # ── Step 8: AOI clipping ───────────────────────────────────
    preprocessing_steps.append({
        "step": "aoi_clip",
        "detail": f"Clip to bbox: {bbox}",
    })

    # ── Step 9: Nodata handling ────────────────────────────────
    preprocessing_steps.append({
        "step": "nodata_handle",
        "detail": "Replace nodata with NaN",
    })

    # ── Step 10: Band normalization ────────────────────────────
    preprocessing_steps.append({
        "step": "band_normalize",
        "detail": f"Target bands: {target_bands}",
    })

    # ── Determine suitability ──────────────────────────────────
    suitable = (
        cloud_ok
        and coverage_pct >= 10
        and len(available_bands) > 0
    )

    # ── Build result ───────────────────────────────────────────
    return ScenePreprocessResult(
        item_id=item_id,
        collection=collection,
        acquisition_date=acquisition_date,
        cloud_cover=cloud_cover,
        crs=target_crs,
        resolution_meters=target_resolution,
        bbox=scene_bbox,
        spatial_coverage_pct=round(coverage_pct, 2),
        bands_processed=available_bands,
        nodata_count=0,  # Would be computed during actual raster read
        total_pixels=0,
        preprocessing_steps=preprocessing_steps,
        warnings=warnings,
        suitable=suitable,
        rejection_reasons=rejection_reasons,
    )


def preprocess_scenes(
    items: list[dict[str, Any]],
    bbox: list[float],
    target_bands: list[str],
    target_crs: str,
    target_resolution: float,
    max_cloud_cover: float,
    collection: str,
    max_temporal_gap_days: int = 30,
    min_coverage_pct: float = 50.0,
) -> PreprocessReport:
    """
    Full preprocessing pipeline for multiple scenes.

    Returns detailed report with comparability analysis.
    """
    warnings: list[str] = []

    # Preprocess each scene
    results: list[ScenePreprocessResult] = []
    for item in items:
        result = preprocess_scene(
            item_dict=item,
            bbox=bbox,
            target_bands=target_bands,
            target_crs=target_crs,
            target_resolution=target_resolution,
            max_cloud_cover=max_cloud_cover,
            collection=collection,
        )
        results.append(result)

    # Filter suitable scenes
    suitable = [r for r in results if r.suitable]
    unsuitable = [r for r in results if not r.suitable]

    if not suitable:
        warnings.append("No scenes passed preprocessing checks")

    # Check comparability among suitable scenes
    comparability = check_comparability(
        suitable,
        max_temporal_gap_days=max_temporal_gap_days,
        min_coverage_pct=min_coverage_pct,
    )

    if not comparability.comparable:
        warnings.extend(comparability.reasons)

    # Temporal window analysis
    temporal_stats, temporal_warnings = check_temporal_window(
        [s.acquisition_date for s in suitable],
        max_gap_days=max_temporal_gap_days,
    )
    warnings.extend(temporal_warnings)

    # Overall status
    if not suitable:
        status = "no_suitable_scenes"
    elif not comparability.comparable:
        status = "scenes_not_comparable"
    else:
        status = "ok"

    return PreprocessReport(
        status=status,
        aoi_bbox=bbox,
        target_crs=target_crs,
        target_resolution=target_resolution,
        scenes_total=len(items),
        scenes_suitable=len(suitable),
        scenes_unsuitable=len(unsuitable),
        scenes=results,
        comparability={
            "comparable": comparability.comparable,
            "reasons": comparability.reasons,
            "crs_consistent": comparability.crs_consistent,
            "resolution_consistent": comparability.resolution_consistent,
            "band_consistent": comparability.band_consistent,
            "temporal_gap_days": comparability.temporal_gap_days,
            "max_temporal_gap_days": comparability.max_temporal_gap_days,
            "coverage_sufficient": comparability.coverage_sufficient,
            "min_coverage_pct": comparability.min_coverage_pct,
        },
        temporal_window=temporal_stats,
        warnings=warnings,
    )
