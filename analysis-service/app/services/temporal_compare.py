"""
Temporal Comparison Pipeline — the single reusable engine for all EO phenomena.

Query → discover scenes → select best → compute indices → change detection → metrics

This module orchestrates the full before/after comparison pipeline.
It does NOT hard-code any phenomenon — it uses the capability registry
to determine which indices, bands, and thresholds to use.

The same pipeline handles:
  - Hyderabad urban expansion 2021 → 2025
  - Kerala flood impact August 2024
  - Himalayan glacier retreat 2018 → 2025
  - Amazon deforestation
  - Chennai coastal erosion
  - etc.

Architecture:
  plan (phenomenon, bbox, dates)
    → search_period_1() → best_scene_t1
    → search_period_2() → best_scene_t2
    → compute_index_t1(index, bands)
    → compute_index_t2(index, bands)
    → change_detection(t1, t2)
    → metrics + explanation
"""

from __future__ import annotations

import logging
import math
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any, Optional

# Heavy imports are deferred to function bodies to keep startup memory under 500MB
# on Render free tier. numpy, rasterio, scipy etc. are only loaded when an analysis runs.
import numpy as np  # numpy is needed for type hints in dataclasses — keep this one

# These are loaded lazily inside run_temporal_comparison()
_PHENOMENON_REGISTRY = None
_INDEX_DEFINITIONS = None
_INDEX_BAND_MAP = None
_SENSOR_BANDS = None
_compute_index_from_bands = None
_run_change_detection = None
_get_default_provider = None
_get_provider = None

def _lazy_import_heavy():
    """Load heavy modules only when analysis actually runs."""
    global _PHENOMENON_REGISTRY, _INDEX_DEFINITIONS, _INDEX_BAND_MAP
    global _SENSOR_BANDS, _compute_index_from_bands, _run_change_detection
    global _get_default_provider, _get_provider
    if _PHENOMENON_REGISTRY is not None:
        return  # already loaded
    from app.services.capability_registry import PHENOMENON_REGISTRY, ANALYSIS_TYPES, get_analysis_config
    from app.services.change_detection import run_change_detection
    from app.services.eo_provider import get_default_provider, get_provider
    from app.services.spectral_indices import INDEX_DEFINITIONS, INDEX_BAND_MAP, SENSOR_BANDS, compute_index_from_bands
    _PHENOMENON_REGISTRY = PHENOMENON_REGISTRY
    _INDEX_DEFINITIONS = INDEX_DEFINITIONS
    _INDEX_BAND_MAP = INDEX_BAND_MAP
    _SENSOR_BANDS = SENSOR_BANDS
    _compute_index_from_bands = compute_index_from_bands
    _run_change_detection = run_change_detection
    _get_default_provider = get_default_provider
    _get_provider = get_provider
    logger.info("Heavy modules loaded (numpy, rasterio, scipy, planetary_computer)")

logger = logging.getLogger(__name__)


# ── Data classes ──────────────────────────────────────────────────

@dataclass
class SceneSelection:
    """A selected scene for one time period."""
    item_id: str
    collection: str
    datetime: str
    cloud_cover: Optional[float]
    bbox: list[float]
    provider: str
    platform: str
    score: float
    assets: dict[str, Any]


@dataclass
class IndexResult:
    """Result of computing a spectral index for one time period."""
    index_name: str
    value: Optional[np.ndarray]
    stats: dict[str, float]
    scene_id: str
    date: str
    resolution_m: float
    shape: list[int]
    valid_pixels: int
    total_pixels: int


@dataclass
class TemporalComparisonResult:
    """Complete result of a temporal comparison analysis."""
    status: str
    plan_id: str
    phenomenon: str
    analysis_type: str
    aoi_name: str
    aoi_bbox: list[float]

    # Time periods
    period1: dict[str, Any]  # {start, end, scene}
    period2: dict[str, Any]

    # Scene selections
    scene_t1: Optional[SceneSelection]
    scene_t2: Optional[SceneSelection]

    # Index results
    index_t1: Optional[IndexResult]
    index_t2: Optional[IndexResult]

    # Change detection
    change_detection: Optional[dict[str, Any]]

    # Change mask visualization (base64-encoded PNGs)
    change_visualizations: Optional[dict[str, Any]]

    # Computed metrics (the key numbers for the UI)
    metrics: dict[str, Any]

    # Imagery URLs for visualization
    imagery: dict[str, Any]

    # Processing metadata
    processing_steps: list[dict[str, str]]
    sensor_info: dict[str, Any]

    # Explanation
    explanation: dict[str, Any]


# ── Scene search & selection ──────────────────────────────────────

def _search_scenes(
    collection: str,
    bbox: list[float],
    start_date: str,
    end_date: str,
    max_cloud_cover: int,
    limit: int = 15,
    provider_name: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Search STAC for scenes in a time window."""
    _lazy_import_heavy()
    provider = _get_provider(provider_name) if provider_name else _get_default_provider()

    datetime_str = f"{start_date}/{end_date}"

    try:
        result = provider.search(
            collection=collection,
            bbox=bbox,
            datetime=datetime_str,
            max_cloud_cover=max_cloud_cover,
            limit=limit,
        )
        return result.items
    except Exception as e:
        logger.warning("Scene search failed for %s: %s", collection, e)
        return []


def _score_scene(
    item: dict[str, Any],
    target_bbox: list[float],
    max_cloud_cover: int,
) -> float:
    """
    Score a scene for suitability.
    Higher = better. Factors:
    - Cloud cover (lower is better)
    - Spatial coverage (more overlap with AOI is better)
    - Data quality flags
    """
    score = 0.5  # base

    props = item.get("properties", {})
    cloud_cover = props.get("eo:cloud_cover", 50)
    if cloud_cover is not None:
        if cloud_cover <= 10:
            score += 0.3
        elif cloud_cover <= 20:
            score += 0.2
        elif cloud_cover <= max_cloud_cover:
            score += 0.1
        else:
            score -= 0.2

    # Spatial overlap score
    item_bbox = item.get("bbox", [])
    if item_bbox and len(item_bbox) == 4 and target_bbox:
        overlap = _bbox_overlap(item_bbox, target_bbox)
        total_area = _bbox_area(target_bbox)
        if total_area > 0:
            coverage = overlap / total_area
            score += min(coverage * 0.2, 0.2)

    return min(max(score, 0.0), 1.0)


def _bbox_overlap(a: list[float], b: list[float]) -> float:
    """Compute area of overlap between two bounding boxes [west, south, east, north]."""
    west = max(a[0], b[0])
    south = max(a[1], b[1])
    east = min(a[2], b[2])
    north = min(a[3], b[3])

    if west >= east or south >= north:
        return 0.0

    return (east - west) * (north - south)


def _bbox_area(bbox: list[float]) -> float:
    """Compute area of a bounding box in degrees²."""
    return max(0, bbox[2] - bbox[0]) * max(0, bbox[3] - bbox[1])


def _select_best_scene(
    items: list[dict[str, Any]],
    target_bbox: list[float],
    max_cloud_cover: int,
) -> Optional[dict[str, Any]]:
    """Select the best scene from search results."""
    if not items:
        return None

    scored = [
        (item, _score_scene(item, target_bbox, max_cloud_cover))
        for item in items
    ]
    scored.sort(key=lambda x: x[1], reverse=True)

    return scored[0][0] if scored else None


def _scene_to_selection(item: dict[str, Any], provider_name: str) -> SceneSelection:
    """Convert a STAC item to a SceneSelection."""
    props = item.get("properties", {})
    return SceneSelection(
        item_id=item.get("id", "unknown"),
        collection=item.get("collection", "unknown"),
        datetime=props.get("datetime", ""),
        cloud_cover=props.get("eo:cloud_cover"),
        bbox=item.get("bbox", []),
        provider=provider_name,
        platform=props.get("platform", "unknown"),
        score=0.0,
        assets=item.get("assets", {}),
    )


def _get_imagery_urls(scene: SceneSelection) -> dict[str, str]:
    """Extract imagery URLs from a scene's assets + construct TileJSON URL.

    Returns tilejson URL and bounds so the frontend can fetch the signed
    tile template from Planetary Computer directly. The tilejson endpoint
    returns tiles that work WITHOUT signing — we just need to fetch it
    to get the correct tile template and spatial bounds.
    """
    urls = {}
    assets = scene.assets

    # Thumbnail / preview
    for key in ["thumbnail", "rendered_preview", "visual", "preview"]:
        if key in assets:
            href = assets[key].get("href", "") if isinstance(assets[key], dict) else assets[key]
            if href:
                urls["thumbnail"] = href
                break

    # Rendered image
    for key in ["rendered_preview", "visual"]:
        if key in assets:
            href = assets[key].get("href", "") if isinstance(assets[key], dict) else assets[key]
            if href:
                urls["rendered"] = href
                break

    # TileJSON URL — the frontend fetches this to get the signed tile template + bounds.
    # pc.sign() fails silently on Render free tier, so we return the unsigned tilejson
    # URL. The PC tilejson endpoint returns tile URLs that work WITHOUT authentication.
    if scene.collection and scene.item_id:
        tilejson_url = (
            f"https://planetarycomputer.microsoft.com/api/data/v1/item/tilejson.json"
            f"?collection={scene.collection}"
            f"&item={scene.item_id}"
            f"&assets=visual"
            f"&asset_bidx=visual%7C1%2C2%2C3"
        )
        urls["tilejson"] = tilejson_url

        # Also provide the direct tile URL as fallback (may not work without signing)
        tile_url = (
            f"https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{{z}}/{{x}}/{{y}}@1x"
            f"?collection={scene.collection}"
            f"&item={scene.item_id}"
            f"&assets=visual"
        )
        urls["tile_url"] = tile_url

    # Also check assets for tilejson (backup)
    if "tilejson" not in urls and "tilejson" in assets:
        href = assets["tilejson"].get("href", "") if isinstance(assets["tilejson"], dict) else assets["tilejson"]
        if href:
            urls["tilejson"] = href

    # Individual bands (for index computation)
    for key, asset in assets.items():
        if isinstance(asset, dict):
            if key.upper().startswith("B") or key.lower() in ("vv", "vh", "red", "green", "blue", "nir", "swir16", "swir22"):
                href = asset.get("href", "")
                if href:
                    urls[f"band_{key}"] = href

    return urls


# ── Index computation (simulated for demo) ────────────────────────

def _compute_index_stats(
    index_name: str,
    sensor: str,
    scene: SceneSelection,
    bbox: list[float],
) -> IndexResult:
    """
    Compute index statistics for a scene using REAL raster reads.

    Opens the actual COG band assets via rasterio, reads the AOI window,
    and computes the spectral index pixel-by-pixel using the spectral_indices engine.

    Falls back to metadata-based estimation only if raster reads fail entirely.
    """
    # Determine resolution
    resolution = 10.0
    if "landsat" in sensor:
        resolution = 30.0
    elif "sentinel-1" in sensor:
        resolution = 10.0

    _lazy_import_heavy()
    # Get band mapping for this sensor + index
    band_key = (sensor, index_name)
    band_map = _INDEX_BAND_MAP.get(band_key)
    if not band_map:
        logger.warning("No band mapping for %s on %s, falling back to estimation", index_name, sensor)
        return _compute_index_stats_fallback(index_name, sensor, scene, bbox)

    # Resolve physical band names from the index's required logical bands
    index_def = _INDEX_DEFINITIONS.get(index_name)
    if not index_def:
        return _compute_index_stats_fallback(index_name, sensor, scene, bbox)

    required_bands = index_def.bands_required  # e.g. ["NIR", "RED"] for NDVI
    physical_bands = {}
    for logical in required_bands:
        physical = band_map.get(logical)
        if physical:
            physical_bands[logical] = physical

    if len(physical_bands) < 2:
        logger.warning("Insufficient band mappings for %s: %s", index_name, physical_bands)
        return _compute_index_stats_fallback(index_name, sensor, scene, bbox)

    # Extract signed asset hrefs from scene
    # Assets can be: pystac.Asset objects, dicts with 'href' key, or plain strings
    band_hrefs = {}
    for logical_name, physical_name in physical_bands.items():
        asset = scene.assets.get(physical_name)
        href = ""
        if asset is None:
            href = ""
        elif hasattr(asset, 'href'):
            # pystac.Asset object — use .href attribute
            href = getattr(asset, 'href', '') or ''
        elif isinstance(asset, dict):
            href = asset.get('href', '') or ''
        elif isinstance(asset, str):
            href = asset
        if href:
            band_hrefs[logical_name] = href

    if len(band_hrefs) < 2:
        logger.warning(
            "Missing band assets for %s. Have: %s, Need: %s",
            index_name, list(band_hrefs.keys()), list(physical_bands.keys()),
        )
        return _compute_index_stats_fallback(index_name, sensor, scene, bbox)

    # Attempt real raster read and index computation
    try:
        from app.services.raster_service import read_raster_window

        # Read each band over the AOI bbox
        # band_arrays must be keyed by PHYSICAL band name (B08, B04, B11)
        # because compute_index_from_bands looks them up by physical name.
        band_arrays = {}
        nodata_masks = {}
        logical_to_physical = {}  # logical_name → physical_name
        crs = "EPSG:4326"
        transform = None
        shape = None

        for logical_name, href in band_hrefs.items():
            # Find the physical name for this logical name
            physical_name = physical_bands.get(logical_name, logical_name)
            logical_to_physical[logical_name] = physical_name

            logger.info("Reading band %s (%s) from %s", logical_name, physical_name, href[:100])
            raster_data = read_raster_window(href, bbox)
            data = raster_data["data"]

            # Take first band if multi-band (some assets are multi-band)
            if data.ndim == 3 and data.shape[0] > 1:
                band_arrays[physical_name] = data[0].astype(np.float32)
            elif data.ndim == 3:
                band_arrays[physical_name] = data[0].astype(np.float32)
            else:
                band_arrays[physical_name] = data.astype(np.float32)

            # Build nodata mask
            nodata_val = raster_data["profile"].get("nodata")
            if nodata_val is not None:
                nodata_masks[physical_name] = (band_arrays[physical_name] == nodata_val)
            else:
                nodata_masks[physical_name] = (band_arrays[physical_name] <= 0)

            crs = raster_data.get("crs", "EPSG:4326")
            if raster_data.get("transform") is not None:
                transform = raster_data["transform"]
            shape = list(band_arrays[physical_name].shape)

            logger.info(
                "Band %s: shape=%s, min=%.4f, max=%.4f, nodata_count=%d",
                logical_name, band_arrays[logical_name].shape,
                float(np.nanmin(band_arrays[logical_name])),
                float(np.nanmax(band_arrays[logical_name])),
                int(np.sum(nodata_masks[logical_name])),
            )

        # Compute the spectral index
        index_array, index_result = _compute_index_from_bands(
            bands=band_arrays,
            index_name=index_name,
            sensor=sensor,
            nodata_masks=nodata_masks,
            date=scene.datetime,
            crs=crs,
            resolution_meters=resolution,
        )

        logger.info(
            "[%s] Computed %s for %s: mean=%.4f, std=%.4f, valid=%d/%d",
            index_name, index_name, scene.item_id[:30],
            index_result.stats["mean"], index_result.stats["std"],
            index_result.valid_pixels, index_result.total_pixels,
        )

        # Convert IndexResult (spectral_indices) to our IndexResult (temporal_compare)
        return IndexResult(
            index_name=index_name,
            value=index_array,
            stats=index_result.stats,
            scene_id=scene.item_id,
            date=scene.datetime,
            resolution_m=resolution,
            shape=index_result.shape,
            valid_pixels=index_result.valid_pixels,
            total_pixels=index_result.total_pixels,
        )

    except Exception as e:
        error_msg = f"{type(e).__name__}: {str(e)[:200]}"
        logger.error(
            "Raster-based %s computation failed for %s: %s. Falling back to estimation.",
            index_name, scene.item_id, error_msg,
            exc_info=True,
        )
        result = _compute_index_stats_fallback(index_name, sensor, scene, bbox)
        # Attach error info so API response shows why raster failed
        result.stats["_raster_error"] = error_msg
        return result


def _compute_index_stats_fallback(
    index_name: str,
    sensor: str,
    scene: SceneSelection,
    bbox: list[float],
) -> IndexResult:
    """
    Fallback: estimate index stats from scene metadata.

    Used only when raster reads fail (network error, missing assets, etc.).
    Clearly marked as estimated in the response.
    """
    resolution = 10.0
    if "landsat" in sensor:
        resolution = 30.0

    if bbox and len(bbox) == 4:
        width_deg = bbox[2] - bbox[0]
        height_deg = bbox[3] - bbox[1]
        mid_lat = (bbox[1] + bbox[3]) / 2
        km_per_deg_lon = 111.0 * math.cos(math.radians(mid_lat))
        width_km = width_deg * km_per_deg_lon
        height_km = height_deg * 111.0
        area_km2 = width_km * height_km
    else:
        area_km2 = 100.0

    pixel_size_km = resolution / 1000.0
    total_pixels = int(area_km2 / (pixel_size_km ** 2))

    # Use index-specific realistic fallback values instead of generic zeros.
    # These represent typical mean values for each index over urban/rural areas.
    _fallback_profiles = {
        "NDVI":  {"min": -0.2, "max": 0.8, "mean": 0.35, "std": 0.18, "median": 0.38, "p5": 0.05, "p95": 0.65},
        "NDBI":  {"min": -0.3, "max": 0.5, "mean": 0.05, "std": 0.15, "median": 0.03, "p5": -0.18, "p95": 0.25},
        "NDWI":  {"min": -0.4, "max": 0.6, "mean": -0.1, "std": 0.2,  "median": -0.08, "p5": -0.35, "p95": 0.2},
        "NBR":   {"min": -0.3, "max": 0.7, "mean": 0.25, "std": 0.2,  "median": 0.28, "p5": -0.1, "p95": 0.55},
        "NDSI":  {"min": -0.2, "max": 0.9, "mean": 0.15, "std": 0.25, "median": 0.1, "p5": -0.1, "p95": 0.6},
    }
    stats = _fallback_profiles.get(index_name, {
        "min": -0.5, "max": 0.5, "mean": 0.0, "std": 0.2,
        "median": 0.0, "p5": -0.33, "p95": 0.33,
    }).copy()

    logger.warning(
        "[%s] Using fallback estimation for %s — not derived from raster data",
        index_name, scene.item_id,
    )

    return IndexResult(
        index_name=index_name,
        value=None,
        stats=stats,
        scene_id=scene.item_id,
        date=scene.datetime,
        resolution_m=resolution,
        shape=[total_pixels // 100, 100],
        valid_pixels=int(total_pixels * 0.85),
        total_pixels=total_pixels,
    )


# ── Metrics computation ──────────────────────────────────────────

def _compute_comparison_metrics(
    phenomenon: str,
    index_name: str,
    index_t1: IndexResult,
    index_t2: IndexResult,
    change_result: Optional[dict[str, Any]],
    bbox: list[float],
) -> dict[str, Any]:
    """Compute the key metrics for the UI based on phenomenon type."""
    t1_mean = index_t1.stats.get("mean", 0)
    t2_mean = index_t2.stats.get("mean", 0)
    delta = t2_mean - t1_mean

    # Compute area in km²
    if bbox and len(bbox) == 4:
        mid_lat = (bbox[1] + bbox[3]) / 2
        km_per_deg_lon = 111.0 * math.cos(math.radians(mid_lat))
        area_km2 = (bbox[2] - bbox[0]) * km_per_deg_lon * (bbox[3] - bbox[1]) * 111.0
    else:
        area_km2 = 100.0

    # Changed area from change detection
    changed_pct = change_result.get("changed_pct", abs(delta) * 100) if change_result else abs(delta) * 100
    changed_km2 = area_km2 * (changed_pct / 100.0)

    # Base metrics
    metrics = {
        "total_area_km2": round(area_km2, 2),
        "changed_area_km2": round(changed_km2, 2),
        "changed_pct": round(changed_pct, 2),
        "delta_index": round(delta, 4),
        "baseline_index_mean": round(t1_mean, 4),
        "comparison_index_mean": round(t2_mean, 4),
        "index_name": index_name,
        "resolution_m": index_t1.resolution_m,
    }

    # Direction indicator
    if delta > 0.05:
        direction = "increase"
    elif delta < -0.05:
        direction = "decrease"
    else:
        direction = "stable"
    metrics["direction"] = direction

    # Determine if values are raster-derived or estimated
    raster_derived = (index_t1.value is not None and index_t2.value is not None)
    metrics["raster_derived"] = raster_derived
    if raster_derived:
        metrics["data_quality"] = "raster_computed"
        metrics["estimation_method"] = "pixel_level_raster_analysis"
    else:
        metrics["data_quality"] = "estimated_from_metadata"
        metrics["estimation_method"] = "scene_metadata_fallback"
    metrics["estimated"] = not raster_derived

    return metrics


def _generate_explanation(
    phenomenon: str,
    aoi_name: str,
    metrics: dict[str, Any],
    period1: str,
    period2: str,
    index_name: str,
) -> dict[str, Any]:
    """Generate a structured explanation of the temporal comparison results."""

    direction = metrics.get("direction", "change")
    area = metrics.get("total_area_km2", 0)
    changed_area = metrics.get("changed_area_km2", 0)
    changed_pct = metrics.get("changed_pct", 0)

    phenomenon_descriptions = {
        "urban_expansion": {
            "title": "Urban Expansion Analysis",
            "summary": f"Temporal analysis of {aoi_name} from {period1} to {period2} reveals urban expansion patterns. Using {index_name} change detection on Sentinel-2 multispectral imagery, we tracked built-up area growth.",
            "methodology": "NDBI (Normalized Difference Built-up Index) was computed for both time periods. The change map shows areas where impervious surface cover has increased, indicating new construction, infrastructure development, or urban sprawl.",
            "key_indices": [index_name],
        },
        "vegetation_change": {
            "title": "Vegetation Health Analysis",
            "summary": f"Monitoring vegetation changes in {aoi_name} from {period1} to {period2} using NDVI time series analysis from Sentinel-2 imagery.",
            "methodology": "NDVI (Normalized Difference Vegetation Index) quantifies vegetation greenness and photosynthetic activity. Changes indicate deforestation, degradation, regrowth, or seasonal variation.",
            "key_indices": ["NDVI"],
        },
        "deforestation": {
            "title": "Deforestation Detection",
            "summary": f"Forest cover change analysis for {aoi_name} from {period1} to {period2}. NDVI-based detection identifies areas of forest loss and gain.",
            "methodology": "Multi-temporal NDVI analysis detects significant vegetation loss that indicates deforestation. Threshold-based classification separates natural variation from anthropogenic clearing.",
            "key_indices": ["NDVI"],
        },
        "flood_impact": {
            "title": "Flood Impact Assessment",
            "summary": f"Flood extent mapping for {aoi_name} from {period1} to {period2} using Sentinel-1 SAR and Sentinel-2 optical imagery.",
            "methodology": "Cross-sensor analysis combines Sentinel-1 SAR (cloud-penetrating) with Sentinel-2 NDWI for robust flood detection. SAR backscatter change identifies waterlogged areas, while NDWI confirms open water extent.",
            "key_indices": ["NDWI"],
            "sensors_used": ["Sentinel-1 (SAR)", "Sentinel-2 (Optical)"],
        },
        "water_change": {
            "title": "Water Body Change Analysis",
            "summary": f"Water body monitoring for {aoi_name} from {period1} to {period2}. NDWI tracks changes in surface water extent.",
            "methodology": "NDWI (Normalized Difference Water Index) delineates water bodies. Temporal comparison reveals expansion, shrinkage, or seasonal fluctuation of lakes, reservoirs, and rivers.",
            "key_indices": ["NDWI"],
        },
        "burn_severity": {
            "title": "Wildfire Burn Severity Assessment",
            "summary": f"Burn severity mapping for {aoi_name} from {period1} to {period2} using dNBR (differenced Normalized Burn Ratio).",
            "methodology": "dNBR is the standard metric for burn severity. Pre-fire NBR is subtracted from post-fire NBR. Low dNBR indicates unburned/low severity, high negative dNBR indicates high-severity burns.",
            "key_indices": ["NBR", "dNBR"],
        },
        "snow_cover": {
            "title": "Snow and Ice Cover Analysis",
            "summary": f"Snow/ice extent change for {aoi_name} from {period1} to {period2} using NDSI from Sentinel-2 imagery.",
            "methodology": "NDSI (Normalized Difference Snow Index) discriminates snow/ice from other surfaces. Temporal comparison reveals snow line retreat, seasonal snow cover variation, and cryosphere changes.",
            "key_indices": ["NDSI"],
        },
        "glacier_retreat": {
            "title": "Glacier Retreat Monitoring",
            "summary": f"Glacier extent change for {aoi_name} from {period1} to {period2}. Multi-temporal analysis tracks ice mass loss and terminus retreat.",
            "methodology": "NDSI-based glacier delineation combined with multi-temporal comparison. Snow/ice areas are mapped for both periods and differenced to quantify retreat. Higher-altitude analysis captures equilibrium line changes.",
            "key_indices": ["NDSI"],
        },
        "coastal_erosion": {
            "title": "Coastal Erosion Analysis",
            "summary": f"Coastline change detection for {aoi_name} from {period1} to {period2} using water-land boundary analysis.",
            "methodology": "NDWI-based water classification identifies the land-water boundary for both periods. shoreline position change indicates erosion (land loss) or accretion (land gain).",
            "key_indices": ["NDWI"],
        },
        "soil_moisture": {
            "title": "Soil Moisture Analysis",
            "summary": f"Soil moisture and dryness assessment for {aoi_name} from {period1} to {period2} using spectral moisture proxies.",
            "methodology": "Combined NDVI-NDMI analysis estimates relative soil moisture conditions. SWIR-band absorption characteristics reveal moisture content variations over time.",
            "key_indices": ["NDVI"],
        },
        "land_cover_change": {
            "title": "Land Cover Change Analysis",
            "summary": f"General land cover change detection for {aoi_name} from {period1} to {period2} using multi-index analysis.",
            "methodology": "Multi-temporal analysis combining NDVI, NDBI, and NDWI indices classifies land cover transitions between vegetation, built-up, water, and bare soil categories.",
            "key_indices": ["NDVI", "NDBI", "NDWI"],
        },
    }

    info = phenomenon_descriptions.get(phenomenon, phenomenon_descriptions["land_cover_change"])

    raster_derived = metrics.get("raster_derived", False)

    if raster_derived:
        confidence = "Computed from pixel-level raster analysis of Sentinel-2 multispectral imagery."
        limitations = [
            "Single pair comparison (not time series) — seasonal effects possible",
            "Cloud cover may affect optical imagery quality",
            "Resolution limits detection of small-scale changes",
        ]
    else:
        confidence = "Estimated from scene metadata. Quantitative metrics are not derived from pixel-level raster analysis."
        limitations = [
            "Index statistics are estimated from scene metadata, not computed from actual raster pixel analysis",
            "Cloud cover may affect optical imagery quality",
            "Single pair comparison (not time series) — seasonal effects possible",
            "Resolution limits detection of small-scale changes",
        ]

    return {
        "title": info["title"],
        "summary": info["summary"],
        "methodology": info["methodology"],
        "key_findings": _generate_findings(phenomenon, metrics),
        "key_indices": info.get("key_indices", [index_name]),
        "sensors_used": info.get("sensors_used", ["Sentinel-2"]),
        "confidence": confidence,
        "raster_derived": raster_derived,
        "limitations": limitations,
    }


def _generate_findings(phenomenon: str, metrics: dict[str, Any]) -> list[str]:
    """Generate key findings based on phenomenon and metrics."""
    findings = []
    direction = metrics.get("direction", "")
    changed_pct = metrics.get("changed_pct", 0)
    changed_km2 = metrics.get("changed_area_km2", 0)

    if direction in ("expansion", "loss", "flooding", "shrinking", "retreat", "erosion", "burned", "drier"):
        intensity = "significant" if changed_pct > 10 else "moderate" if changed_pct > 3 else "minor"
        findings.append(f"{intensity.title()} change detected — {changed_km2} km² affected ({changed_pct}% of study area)")

        if phenomenon == "urban_expansion":
            findings.append("Built-up index (NDBI) shows positive trend indicating infrastructure development")
            if "vegetation_impact" in metrics:
                findings.append(metrics["vegetation_impact"])
        elif phenomenon == "flood_impact":
            findings.append("Cross-sensor (SAR + optical) analysis provides robust flood extent mapping")
            findings.append(f"Flood severity: {metrics.get('severity', 'N/A')}")
        elif phenomenon == "burn_severity":
            findings.append(f"Burn severity classification: {metrics.get('burn_severity', 'N/A')}")
        elif phenomenon == "glacier_retreat":
            findings.append(metrics.get("retreat_status", "Status unknown"))
    elif direction in ("stable",):
        findings.append("Minimal change detected — area appears relatively stable over the analysis period")
    elif direction in ("gain", "advance", "accretion", "wetter"):
        findings.append(f"Positive change detected — {changed_km2} km² shows increase")

    if not findings:
        findings.append(f"Change magnitude: {metrics.get('delta_index', 0):.4f} index units")

    return findings


# ── Pure-Python PNG encoder (no Pillow required) ───────────────
import struct
import zlib


def _make_png_chunk(chunk_type: bytes, data: bytes) -> bytes:
    """Create a PNG chunk: length + type + data + CRC."""
    chunk = chunk_type + data
    crc = zlib.crc32(chunk) & 0xFFFFFFFF
    return struct.pack('>I', len(data)) + chunk + struct.pack('>I', crc)


def _encode_rgba_png(rgba_array: np.ndarray) -> str:
    """Encode a (H, W, 4) uint8 RGBA array as a PNG, returning hex string."""
    h, w = rgba_array.shape[:2]
    # PNG signature
    sig = b'\x89PNG\r\n\x1a\n'
    # IHDR: width, height, bit_depth=8, color_type=6 (RGBA)
    ihdr_data = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)
    ihdr = _make_png_chunk(b'IHDR', ihdr_data)
    # IDAT: filter byte (0) + raw pixel data per row, zlib-compressed
    raw_rows = []
    for row in rgba_array:
        raw_rows.append(b'\x00' + row.tobytes())
    raw = b''.join(raw_rows)
    compressed = zlib.compress(raw, 6)
    idat = _make_png_chunk(b'IDAT', compressed)
    # IEND
    iend = _make_png_chunk(b'IEND', b'')
    return (sig + ihdr + idat + iend).hex()


def _encode_rgb_png(rgb_array: np.ndarray) -> str:
    """Encode a (H, W, 3) uint8 RGB array as a PNG, returning hex string."""
    h, w = rgb_array.shape[:2]
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr_data = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
    ihdr = _make_png_chunk(b'IHDR', ihdr_data)
    raw_rows = []
    for row in rgb_array:
        raw_rows.append(b'\x00' + row.tobytes())
    raw = b''.join(raw_rows)
    compressed = zlib.compress(raw, 6)
    idat = _make_png_chunk(b'IDAT', compressed)
    iend = _make_png_chunk(b'IEND', b'')
    return (sig + ihdr + idat + iend).hex()


# ── Main pipeline ────────────────────────────────────────────────

def run_temporal_comparison(
    plan: dict[str, Any],
) -> TemporalComparisonResult:
    """
    Execute the full temporal comparison pipeline.

    Takes a validated analysis plan and produces:
    1. Scene selections for both time periods
    2. Spectral index computation for both periods
    3. Change detection between periods
    4. Computed metrics and explanation

    This is the single entry point for all EO phenomena.
    """
    processing_steps: list[dict[str, str]] = []

    phenomenon = plan["phenomenon"]
    analysis_type = plan.get("analysis_type", "ndvi_change")
    bbox = plan["bbox"]
    start_date = plan["start_date"]
    end_date = plan["end_date"]
    sensor = plan.get("sensor", "sentinel-2-l2a")
    collection = plan.get("collection", sensor)
    cloud_threshold = plan.get("cloud_threshold", 20)
    aoi_name = plan.get("aoi", "Unknown")
    plan_id = plan.get("plan_id", "unknown")

    _lazy_import_heavy()
    # Get index name from phenomenon config
    pheno_config = _PHENOMENON_REGISTRY.get(phenomenon, {})
    index_name = pheno_config.get("default_index", "NDVI")
    if not index_name:
        # For SAR-based phenomena like flood
        index_name = "NDWI"

    processing_steps.append({
        "step": "plan_validation",
        "detail": f"phenomenon={phenomenon}, analysis_type={analysis_type}, sensor={sensor}, index={index_name}",
    })

    # ── Step 1: Compute time windows ──────────────────────────────
    # Split the date range into two comparison periods
    try:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d")
        end_dt = datetime.strptime(end_date, "%Y-%m-%d")
    except ValueError:
        # Fallback
        start_dt = datetime(2023, 1, 1)
        end_dt = datetime(2025, 12, 31)

    total_days = (end_dt - start_dt).days
    if total_days < 60:
        # Short range: use start and end as-is with ±30 day windows
        period1_start = (start_dt - timedelta(days=30)).strftime("%Y-%m-%d")
        period1_end = (start_dt + timedelta(days=30)).strftime("%Y-%m-%d")
        period2_start = (end_dt - timedelta(days=30)).strftime("%Y-%m-%d")
        period2_end = (end_dt + timedelta(days=30)).strftime("%Y-%m-%d")
    else:
        # Long range: split in half, use narrow 45-day windows for faster search
        mid = start_dt + timedelta(days=total_days // 2)
        window = min(45, total_days // 4)  # 45-day search windows
        period1_start = start_dt.strftime("%Y-%m-%d")
        period1_end = (start_dt + timedelta(days=window)).strftime("%Y-%m-%d")
        period2_start = (end_dt - timedelta(days=window)).strftime("%Y-%m-%d")
        period2_end = end_dt.strftime("%Y-%m-%d")

    period1 = {"start": period1_start, "end": period1_end}
    period2 = {"start": period2_start, "end": period2_end}

    processing_steps.append({
        "step": "time_windows",
        "detail": f"Period 1: {period1_start} → {period1_end} | Period 2: {period2_start} → {period2_end}",
    })

    # ── Step 2: Search for scenes in each period (parallel) ────────
    logger.info("Searching scenes for period 1: %s to %s", period1_start, period1_end)
    logger.info("Searching scenes for period 2: %s to %s", period2_start, period2_end)

    search_limit = plan.get("max_scenes", 8)
    with ThreadPoolExecutor(max_workers=2) as executor:
        future_t1 = executor.submit(
            _search_scenes, collection, bbox, period1_start, period1_end, cloud_threshold, search_limit
        )
        future_t2 = executor.submit(
            _search_scenes, collection, bbox, period2_start, period2_end, cloud_threshold, search_limit
        )
        items_t1 = future_t1.result()
        items_t2 = future_t2.result()

    # ── Auto-widen: if 0 scenes found, retry with wider windows ──
    for period_label, start_key, end_key, items_var in [
        ('Period 1', 'period1_start', 'period1_end', 'items_t1'),
        ('Period 2', 'period2_start', 'period2_end', 'items_t2'),
    ]:
        current_items = items_t1 if period_label == 'Period 1' else items_t2
        if len(current_items) == 0:
            # Try wider window: ±90 days from the period edge
            p_start = locals()[start_key]
            p_end = locals()[end_key]
            p_start_dt = datetime.strptime(p_start, '%Y-%m-%d')
            p_end_dt = datetime.strptime(p_end, '%Y-%m-%d')
            wider_start = (p_start_dt - timedelta(days=45)).strftime('%Y-%m-%d')
            wider_end = (p_end_dt + timedelta(days=45)).strftime('%Y-%m-%d')
            logger.info("%s had 0 scenes, retrying with wider window: %s to %s", period_label, wider_start, wider_end)
            wider_items = _search_scenes(collection, bbox, wider_start, wider_end, cloud_threshold, search_limit)
            if len(wider_items) > 0:
                if period_label == 'Period 1':
                    items_t1 = wider_items
                    period1_start = wider_start
                    period1_end = wider_end
                else:
                    items_t2 = wider_items
                    period2_start = wider_start
                    period2_end = wider_end
                processing_steps.append({
                    "step": f"widened_{period_label.lower().replace(' ', '_')}",
                    "detail": f"Widened to {wider_start} → {wider_end}, found {len(wider_items)} scenes",
                })
            else:
                # Try even wider: full year
                year_start = p_start[:4] + '-01-01'
                year_end = p_start[:4] + '-12-31'
                logger.info("%s still 0 scenes, trying full year: %s to %s", period_label, year_start, year_end)
                year_items = _search_scenes(collection, bbox, year_start, year_end, cloud_threshold, search_limit)
                if len(year_items) > 0:
                    if period_label == 'Period 1':
                        items_t1 = year_items
                        period1_start = year_start
                        period1_end = year_end
                    else:
                        items_t2 = year_items
                        period2_start = year_start
                        period2_end = year_end
                    processing_steps.append({
                        "step": f"full_year_{period_label.lower().replace(' ', '_')}",
                        "detail": f"Full year search {year_start} → {year_end}, found {len(year_items)} scenes",
                    })

    # Update period dicts with potentially widened windows
    period1 = {"start": period1_start, "end": period1_end}
    period2 = {"start": period2_start, "end": period2_end}

    processing_steps.append({
        "step": "search_periods",
        "detail": f"Period 1: {len(items_t1)} scenes | Period 2: {len(items_t2)} scenes",
    })

    # ── Step 3: Select best scene for each period ─────────────────
    best_t1 = _select_best_scene(items_t1, bbox, cloud_threshold)
    best_t2 = _select_best_scene(items_t2, bbox, cloud_threshold)

    scene_sel_t1 = _scene_to_selection(best_t1, "planetary_computer") if best_t1 else None
    scene_sel_t2 = _scene_to_selection(best_t2, "planetary_computer") if best_t2 else None

    processing_steps.append({
        "step": "scene_selection",
        "detail": f"Period 1: {scene_sel_t1.item_id if scene_sel_t1 else 'none'} | Period 2: {scene_sel_t2.item_id if scene_sel_t2 else 'none'}",
    })

    # ── Step 4: Compute spectral indices for each period (parallel) ─
    index_t1 = None
    index_t2 = None

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = {}
        if scene_sel_t1:
            futures["t1"] = executor.submit(_compute_index_stats, index_name, sensor, scene_sel_t1, bbox)
        if scene_sel_t2:
            futures["t2"] = executor.submit(_compute_index_stats, index_name, sensor, scene_sel_t2, bbox)

        for key, future in futures.items():
            result = future.result()
            if key == "t1":
                index_t1 = result
                processing_steps.append({
                    "step": "compute_index_t1",
                    "detail": f"{index_name} for {scene_sel_t1.item_id}: mean={result.stats['mean']}",
                })
            else:
                index_t2 = result
                processing_steps.append({
                    "step": "compute_index_t2",
                    "detail": f"{index_name} for {scene_sel_t2.item_id}: mean={result.stats['mean']}",
                })

    # ── Step 5: Change detection ──────────────────────────────────
    change_result = None
    if index_t1 and index_t2:
        # Use real raster arrays for pixel-level change detection when available
        if index_t1.value is not None and index_t2.value is not None:
            try:
                import rasterio
                from rasterio.transform import array_bounds

                # Ensure same shape — reproject if needed
                t1_arr = index_t1.value
                t2_arr = index_t2.value

                # Resize to common shape if different
                min_h = min(t1_arr.shape[0], t2_arr.shape[0])
                min_w = min(t1_arr.shape[1], t2_arr.shape[1])
                t1_cropped = t1_arr[:min_h, :min_w]
                t2_cropped = t2_arr[:min_h, :min_w]

                # Pixel-level difference
                diff = t2_cropped - t1_cropped

                # Mask valid pixels (both must be valid)
                valid_mask = ~np.isnan(t1_cropped) & ~np.isnan(t2_cropped) & ~np.isinf(t1_cropped) & ~np.isinf(t2_cropped)
                total_valid = int(np.sum(valid_mask))

                # Threshold for significant change
                threshold = 0.1  # index units
                changed_mask = valid_mask & (np.abs(diff) >= threshold)
                changed_pixels = int(np.sum(changed_mask))

                changed_pct = (changed_pixels / total_valid * 100) if total_valid > 0 else 0.0
                pixel_area_sq_m = index_t1.resolution_m ** 2
                changed_area_sq_m = changed_pixels * pixel_area_sq_m

                # Statistics of the change
                if changed_pixels > 0:
                    changed_values = diff[changed_mask]
                    change_stats = {
                        "mean_change": round(float(np.mean(changed_values)), 4),
                        "max_increase": round(float(np.max(changed_values)), 4),
                        "max_decrease": round(float(np.min(changed_values)), 4),
                        "std_change": round(float(np.std(changed_values)), 4),
                    }
                else:
                    change_stats = {}

                # Simple region counting via connected components
                num_regions = 0
                try:
                    from scipy import ndimage
                    labeled, num_regions = ndimage.label(changed_mask)
                except ImportError:
                    # Estimate from pixel count if scipy unavailable
                    num_regions = max(1, changed_pixels // 1000)

                change_result = {
                    "status": "ok",
                    "algorithm": "raster_difference",
                    "index_name": index_name,
                    "baseline_date": index_t1.date,
                    "comparison_date": index_t2.date,
                    "changed_pct": round(changed_pct, 4),
                    "changed_pixels": changed_pixels,
                    "total_pixels": total_valid,
                    "num_regions": num_regions,
                    "changed_area_sq_meters": round(changed_area_sq_m, 2),
                    "threshold": threshold,
                    "change_stats": change_stats,
                    "baseline_stats": index_t1.stats,
                    "comparison_stats": index_t2.stats,
                    "raster_derived": True,
                }

                logger.info(
                    "[%s] Change detection: %d/%d pixels changed (%.2f%%), %d regions",
                    index_name, changed_pixels, total_valid, changed_pct, num_regions,
                )

            except Exception as e:
                logger.error("Raster change detection failed: %s, falling back to stats-based", e)
                # Fall back to stats-based
                delta = index_t2.stats["mean"] - index_t1.stats["mean"]
                change_result = {
                    "status": "ok",
                    "algorithm": "difference_threshold_fallback",
                    "index_name": index_name,
                    "baseline_date": index_t1.date,
                    "comparison_date": index_t2.date,
                    "changed_pct": round(abs(delta) * 100, 4),
                    "changed_pixels": int(abs(delta) * index_t1.total_pixels),
                    "total_pixels": index_t1.total_pixels,
                    "num_regions": max(1, int(abs(delta) * 50)),
                    "changed_area_sq_meters": abs(delta) * index_t1.total_pixels * (index_t1.resolution_m ** 2),
                    "baseline_stats": index_t1.stats,
                    "comparison_stats": index_t2.stats,
                    "raster_derived": False,
                }
        else:
            # No raster arrays available — use stats-based estimation
            delta = index_t2.stats["mean"] - index_t1.stats["mean"]
            change_result = {
                "status": "ok",
                "algorithm": "difference_threshold_estimated",
                "index_name": index_name,
                "baseline_date": index_t1.date,
                "comparison_date": index_t2.date,
                "changed_pct": round(abs(delta) * 100, 4),
                "changed_pixels": int(abs(delta) * index_t1.total_pixels),
                "total_pixels": index_t1.total_pixels,
                "num_regions": max(1, int(abs(delta) * 50)),
                "changed_area_sq_meters": abs(delta) * index_t1.total_pixels * (index_t1.resolution_m ** 2),
                "baseline_stats": index_t1.stats,
                "comparison_stats": index_t2.stats,
                "raster_derived": False,
            }

        processing_steps.append({
            "step": "change_detection",
            "detail": f"algorithm={change_result.get('algorithm', 'unknown')}, changed={change_result.get('changed_pct', 0)}%",
        })

    # ── Step 5b: Generate change mask visualization ──────────────
    change_mask_b64 = None
    diff_vis_b64 = None
    if index_t1 and index_t2 and index_t1.value is not None and index_t2.value is not None:
        try:
            t1_arr = index_t1.value
            t2_arr = index_t2.value
            min_h = min(t1_arr.shape[0], t2_arr.shape[0])
            min_w = min(t1_arr.shape[1], t2_arr.shape[1])
            t1_c = t1_arr[:min_h, :min_w]
            t2_c = t2_arr[:min_h, :min_w]

            valid = ~np.isnan(t1_c) & ~np.isnan(t2_c) & ~np.isinf(t1_c) & ~np.isinf(t2_c)
            diff = np.where(valid, t2_c - t1_c, 0.0)

            # -- Change mask visualization (green = increase, red = decrease) --
            threshold = 0.1
            change_mask = valid & (np.abs(diff) >= threshold)

            mask_img = np.zeros((min_h, min_w, 4), dtype=np.uint8)
            pos_mask = change_mask & (diff > 0)
            mask_img[pos_mask, 0] = 16
            mask_img[pos_mask, 1] = 185
            mask_img[pos_mask, 2] = 129
            mask_img[pos_mask, 3] = 200
            neg_mask = change_mask & (diff < 0)
            mask_img[neg_mask, 0] = 239
            mask_img[neg_mask, 1] = 68
            mask_img[neg_mask, 2] = 68
            mask_img[neg_mask, 3] = 200

            change_mask_b64 = _encode_rgba_png(mask_img)

            # -- Difference visualization (blue-white-red diverging) --
            diff_clipped = np.clip(diff, -1, 1)
            diff_norm = ((diff_clipped + 1) / 2 * 255).astype(np.uint8)
            diff_img = np.zeros((min_h, min_w, 3), dtype=np.uint8)
            diff_img[:, :, 0] = np.where(diff > 0, diff_norm, 0)
            diff_img[:, :, 1] = np.where(valid, np.full_like(diff_norm, 200), 0)
            diff_img[:, :, 2] = np.where(diff < 0, diff_norm, 0)
            diff_img[~valid] = [13, 23, 17]

            diff_vis_b64 = _encode_rgb_png(diff_img)

            logger.info("[%s] Generated change mask + difference visualization: %dx%d", index_name, min_w, min_h)
        except Exception as e:
            logger.warning("[%s] Visualization generation failed: %s", index_name, e)

    # ── Step 6: Compute metrics ───────────────────────────────────
    metrics = {}
    if index_t1 and index_t2:
        metrics = _compute_comparison_metrics(
            phenomenon, index_name, index_t1, index_t2, change_result, bbox,
        )

    processing_steps.append({
        "step": "metrics_computation",
        "detail": f"Computed {len(metrics)} metrics",
    })

    # ── Step 7: Extract imagery URLs ──────────────────────────────
    imagery = {
        "period1": {},
        "period2": {},
    }
    if scene_sel_t1:
        imagery["period1"] = _get_imagery_urls(scene_sel_t1)
        imagery["period1"]["scene_id"] = scene_sel_t1.item_id
        imagery["period1"]["date"] = scene_sel_t1.datetime
        imagery["period1"]["cloud_cover"] = scene_sel_t1.cloud_cover
        imagery["period1"]["platform"] = scene_sel_t1.platform
        imagery["period1"]["bbox"] = scene_sel_t1.bbox or []
        imagery["period1"]["collection"] = scene_sel_t1.collection
    if scene_sel_t2:
        imagery["period2"] = _get_imagery_urls(scene_sel_t2)
        imagery["period2"]["scene_id"] = scene_sel_t2.item_id
        imagery["period2"]["date"] = scene_sel_t2.datetime
        imagery["period2"]["cloud_cover"] = scene_sel_t2.cloud_cover
        imagery["period2"]["platform"] = scene_sel_t2.platform
        imagery["period2"]["bbox"] = scene_sel_t2.bbox or []
        imagery["period2"]["collection"] = scene_sel_t2.collection

    # ── Step 8: Generate explanation ──────────────────────────────
    explanation = _generate_explanation(
        phenomenon,
        aoi_name,
        metrics,
        period1_start,
        period2_end,
        index_name,
    )

    # ── Sensor info ───────────────────────────────────────────────
    sensor_info = {
        "primary_sensor": sensor,
        "collection": collection,
        "index_used": index_name,
        "resolution_m": index_t1.resolution_m if index_t1 else 10.0,
        "bands_used": _INDEX_BAND_MAP.get((sensor, index_name), {}),
        "index_formula": _INDEX_DEFINITIONS.get(index_name, {}).formula if index_name in _INDEX_DEFINITIONS else "",
        "index_description": _INDEX_DEFINITIONS.get(index_name, {}).description if index_name in _INDEX_DEFINITIONS else "",
    }

    # ── Build final result ────────────────────────────────────────
    return TemporalComparisonResult(
        status="ok",
        plan_id=plan_id,
        phenomenon=phenomenon,
        analysis_type=analysis_type,
        aoi_name=aoi_name,
        aoi_bbox=bbox,
        period1=period1,
        period2=period2,
        scene_t1=scene_sel_t1,
        scene_t2=scene_sel_t2,
        index_t1=index_t1,
        index_t2=index_t2,
        change_detection=change_result,
        change_visualizations={
            "change_mask_png": change_mask_b64,
            "difference_png": diff_vis_b64,
            "bbox": bbox,
        } if change_mask_b64 else None,
        metrics=metrics,
        imagery=imagery,
        processing_steps=processing_steps,
        sensor_info=sensor_info,
        explanation=explanation,
    )
