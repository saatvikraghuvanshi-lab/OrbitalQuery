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
                "Band %s (%s): shape=%s, min=%.4f, max=%.4f, nodata_count=%d",
                logical_name, physical_name, band_arrays[physical_name].shape,
                float(np.nanmin(band_arrays[physical_name])),
                float(np.nanmax(band_arrays[physical_name])),
                int(np.sum(nodata_masks[physical_name])),
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


# ── Multi-signal change analysis ───────────────────────────────

def _compute_multi_signal_change(
    primary_index_name: str,
    additional_indices: dict[str, dict[str, Any]],
    signal_rules: list[dict[str, Any]],
    min_agreeing_signals: int,
    scene_t1: Optional[SceneSelection],
    scene_t2: Optional[SceneSelection],
    bbox: list[float],
    resolution_m: float,
    primary_change_result: Optional[dict[str, Any]],
) -> dict[str, Any]:
    """
    Multi-signal change analysis.

    Combines primary indicator with supporting indicators to produce
    more defensible candidate change regions.

    For URBAN_EXPANSION:
    - Primary: NDBI increase (built-up signal)
    - Supporting: NDVI decrease (vegetation context)
    - A pixel is a candidate change if enough signals agree.

    This implements the research principle:
    Don't rely on one spectral signal — combine multiple indicators
    for more robust change detection.
    """
    signal_details = {}
    agreeing_pixels = 0
    candidate_changed_pct = 0.0
    candidate_changed_area = 0.0

    # ── Evaluate each signal rule ────────────────────────────────
    for rule in signal_rules:
        idx_name = rule["index_name"]
        direction = rule["direction"]
        threshold = rule.get("threshold", 0.10)
        is_primary = rule.get("is_primary", False)

        # Get the index results for this signal
        if idx_name == primary_index_name:
            # Use the primary change detection results
            sig_detail = {
                "index_name": idx_name,
                "direction": direction,
                "threshold": threshold,
                "is_primary": is_primary,
                "status": "primary",
            }
            if primary_change_result and primary_change_result.get("raster_derived"):
                # We already have raster-level analysis for this signal
                sig_detail["changed_pct"] = primary_change_result.get("changed_pct", 0)
                sig_detail["algorithm"] = primary_change_result.get("algorithm", "unknown")
                # For the primary signal, "agreeing" pixels = all changed pixels
                # (they already passed the threshold in the main change detection)
                sig_detail["agreeing_pixels"] = primary_change_result.get("changed_pixels", 0)
            else:
                sig_detail["changed_pct"] = 0
                sig_detail["algorithm"] = "not_raster_derived"
                sig_detail["agreeing_pixels"] = 0
        elif idx_name in additional_indices:
            idx_data = additional_indices[idx_name]
            idx_t1 = idx_data.get("t1")
            idx_t2 = idx_data.get("t2")

            if idx_t1 and idx_t2 and idx_t1.value is not None and idx_t2.value is not None:
                # Compute the delta for this supporting indicator
                t1_arr = idx_t1.value.astype(np.float32)
                t2_arr = idx_t2.value.astype(np.float32)
                min_h = min(t1_arr.shape[0], t2_arr.shape[0])
                min_w = min(t1_arr.shape[1], t2_arr.shape[1])
                t1_c = t1_arr[:min_h, :min_w]
                t2_c = t2_arr[:min_h, :min_w]

                valid = ~np.isnan(t1_c) & ~np.isnan(t2_c) & ~np.isinf(t1_c) & ~np.isinf(t2_c)
                delta = np.where(valid, t2_c - t1_c, np.nan)
                total_valid = int(np.sum(valid))

                # Apply direction-specific threshold
                if direction == "increase":
                    signal_mask = valid & (delta > threshold)
                elif direction == "decrease":
                    signal_mask = valid & (delta < -threshold)
                else:  # absolute_change
                    signal_mask = valid & (np.abs(delta) > threshold)

                signal_pixels = int(np.sum(signal_mask))
                signal_pct = (signal_pixels / total_valid * 100) if total_valid > 0 else 0.0

                sig_detail = {
                    "index_name": idx_name,
                    "direction": direction,
                    "threshold": threshold,
                    "is_primary": is_primary,
                    "status": "raster_computed",
                    "changed_pct": round(signal_pct, 4),
                    "changed_pixels": signal_pixels,
                    "total_valid_pixels": total_valid,
                    "agreeing_pixels": signal_pixels,
                    "delta_mean": round(float(np.nanmean(delta[valid])), 4) if total_valid > 0 else 0.0,
                }
            else:
                # Fallback: estimate from stats
                if idx_t1 and idx_t2:
                    delta_mean = idx_t2.stats.get("mean", 0) - idx_t1.stats.get("mean", 0)
                    if direction == "increase":
                        signal_satisfied = delta_mean > threshold
                    elif direction == "decrease":
                        signal_satisfied = delta_mean < -threshold
                    else:
                        signal_satisfied = abs(delta_mean) > threshold

                    sig_detail = {
                        "index_name": idx_name,
                        "direction": direction,
                        "threshold": threshold,
                        "is_primary": is_primary,
                        "status": "estimated",
                        "delta_mean": round(delta_mean, 4),
                        "signal_satisfied": signal_satisfied,
                        "agreeing_pixels": idx_t1.total_pixels if signal_satisfied else 0,
                    }
                else:
                    sig_detail = {
                        "index_name": idx_name,
                        "direction": direction,
                        "threshold": threshold,
                        "is_primary": is_primary,
                        "status": "no_data",
                        "agreeing_pixels": 0,
                    }
        else:
            sig_detail = {
                "index_name": idx_name,
                "direction": direction,
                "threshold": threshold,
                "is_primary": is_primary,
                "status": "not_computed",
                "agreeing_pixels": 0,
            }

        signal_details[idx_name] = sig_detail

    # ── Compute agreement ────────────────────────────────────────
    # Count how many signals agree (are satisfied)
    satisfied_count = 0
    total_signals = len(signal_rules)
    for rule in signal_rules:
        idx_name = rule["index_name"]
        detail = signal_details.get(idx_name, {})
        status = detail.get("status", "not_computed")
        if status in ("primary", "raster_computed"):
            # For primary: use the main change detection's changed_pixels
            # For supporting: use the signal's changed_pixels
            if detail.get("agreeing_pixels", 0) > 0:
                satisfied_count += 1
        elif status == "estimated":
            if detail.get("signal_satisfied", False):
                satisfied_count += 1

    meets_threshold = satisfied_count >= min_agreeing_signals

    # Compute candidate changed area from the primary signal
    # but only if enough signals agree
    if meets_threshold and primary_change_result:
        candidate_changed_pct = primary_change_result.get("changed_pct", 0)
        candidate_changed_area = primary_change_result.get("changed_area_sq_meters", 0)
        agreeing_pixels = primary_change_result.get("changed_pixels", 0)
    else:
        candidate_changed_pct = 0.0
        candidate_changed_area = 0.0
        agreeing_pixels = 0

    # Confidence note
    if meets_threshold:
        if satisfied_count == total_signals:
            confidence_note = (
                f"All {total_signals} indicators agree on candidate change regions. "
                f"Primary signal: {candidate_changed_pct:.2f}% of area."
            )
        else:
            confidence_note = (
                f"{satisfied_count}/{total_signals} indicators agree on candidate change. "
                f"Primary signal: {candidate_changed_pct:.2f}% of area. "
                f"Supporting signals provide additional context."
            )
    else:
        confidence_note = (
            f"Only {satisfied_count}/{total_signals} indicators agree — "
            f"below minimum threshold of {min_agreeing_signals}. "
            f"Detected changes may not represent real-world {primary_index_name.lower()} change."
        )

    return {
        "status": "ok",
        "satisfied_signals": satisfied_count,
        "total_signals": total_signals,
        "meets_threshold": meets_threshold,
        "agreeing_pixels": agreeing_pixels,
        "candidate_changed_pct": round(candidate_changed_pct, 4),
        "candidate_changed_area_sq_meters": round(candidate_changed_area, 2),
        "signal_details": signal_details,
        "confidence_note": confidence_note,
    }


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

    # ── Semantic layer: read multi-signal config from plan ──────
    semantic_config = plan.get("semantic", {})
    indicators_config = plan.get("indicators", {})
    multi_signal_config = plan.get("multi_signal", {})
    evidence_config = plan.get("evidence_requirements", [])

    _lazy_import_heavy()
    # Get index name: prefer semantic primary_indicator, fallback to phenomenon config
    index_name = indicators_config.get("primary", None)
    if not index_name:
        pheno_config = _PHENOMENON_REGISTRY.get(phenomenon, {})
        index_name = pheno_config.get("default_index", "NDVI")
        if not index_name:
            index_name = "NDWI"

    # All indicators for this concept (used in multi-signal analysis)
    all_indicators = indicators_config.get("all", [index_name])
    multi_signal_enabled = multi_signal_config.get("enabled", False)
    signal_rules = multi_signal_config.get("rules", [])
    min_agreeing = multi_signal_config.get("min_agreeing_signals", 1)

    # Track additional indicator results for multi-signal analysis
    additional_indices: dict[str, dict[str, IndexResult]] = {}  # indicator_name -> {"t1": ..., "t2": ...}

    processing_steps.append({
        "step": "plan_validation",
        "detail": f"phenomenon={phenomenon}, analysis_type={analysis_type}, sensor={sensor}, index={index_name}",
    })
    if multi_signal_enabled:
        processing_steps.append({
            "step": "multi_signal_config",
            "detail": f"Multi-signal enabled: indicators={all_indicators}, rules={len(signal_rules)}, min_agreeing={min_agreeing}",
        })
        if semantic_config.get("concept"):
            processing_steps.append({
                "step": "semantic_concept",
                "detail": f"Concept: {semantic_config['concept']} ({semantic_config.get('description', '')})",
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

    # ── Step 4: Compute spectral indices for each period ────────
    index_t1 = None
    index_t2 = None

    # 4a: Compute primary index
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

    # 4b: Compute additional indicators for multi-signal analysis
    if multi_signal_enabled and len(all_indicators) > 1:
        additional_indicator_names = [ind for ind in all_indicators if ind != index_name]
        for extra_idx_name in additional_indicator_names:
            extra_t1 = None
            extra_t2 = None
            with ThreadPoolExecutor(max_workers=2) as executor:
                futures = {}
                if scene_sel_t1:
                    futures["t1"] = executor.submit(_compute_index_stats, extra_idx_name, sensor, scene_sel_t1, bbox)
                if scene_sel_t2:
                    futures["t2"] = executor.submit(_compute_index_stats, extra_idx_name, sensor, scene_sel_t2, bbox)
                for key, future in futures.items():
                    result = future.result()
                    if key == "t1":
                        extra_t1 = result
                    else:
                        extra_t2 = result
            if extra_t1 or extra_t2:
                additional_indices[extra_idx_name] = {"t1": extra_t1, "t2": extra_t2}
                processing_steps.append({
                    "step": f"compute_index_{extra_idx_name.lower()}",
                    "detail": f"{extra_idx_name} (supporting indicator): t1_mean={extra_t1.stats['mean'] if extra_t1 else 'N/A'}, t2_mean={extra_t2.stats['mean'] if extra_t2 else 'N/A'}",
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

                # Water mask: exclude water/tidal pixels from change detection
                water_t1 = t1_cropped < -0.1
                water_t2 = t2_cropped < -0.1
                water_mask = water_t1 & water_t2  # only exclude pixels that are water in BOTH periods
                valid_mask = valid_mask & (~water_mask)
                total_valid = int(np.sum(valid_mask))

                # Adaptive threshold
                from scipy import ndimage as _ndimage
                valid_diff = diff[valid_mask]
                if len(valid_diff) > 100:
                    diff_std = float(np.std(valid_diff))
                    threshold = max(0.08, min(0.20, 1.2 * diff_std))
                else:
                    threshold = 0.10
                
                # Vegetation preconditions: more lenient thresholds to detect real change
                # Loss: significant NDVI decrease AND baseline had some vegetation
                loss_cond = valid_mask & (diff < -threshold) & (t1_cropped >= 0.15)
                # Gain: significant NDVI increase AND result has some vegetation  
                gain_cond = valid_mask & (diff > threshold) & (t2_cropped >= 0.15)
                changed_mask = loss_cond | gain_cond
                
                # Morphological cleaning: remove isolated noise pixels
                struct = _ndimage.generate_binary_structure(2, 1)  # 4-connectivity
                changed_mask = _ndimage.binary_opening(changed_mask, structure=struct, iterations=1)
                
                # Remove small connected regions (< 25 pixels = ~0.25 ha at 10m)
                min_region_pixels = 25
                labeled_raw, num_raw = _ndimage.label(changed_mask)
                region_sizes = _ndimage.sum(changed_mask, labeled_raw, range(1, num_raw + 1))
                cleaned = np.zeros_like(changed_mask)
                for i, size in enumerate(region_sizes):
                    if size >= min_region_pixels:
                        cleaned[labeled_raw == (i + 1)] = True
                changed_mask = cleaned
                
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

                # Connected components on cleaned mask
                labeled, num_regions = _ndimage.label(changed_mask)

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

    # ── Step 5a: Multi-signal change analysis ────────────────────
    # When multi-signal is enabled, combine primary + supporting indicators
    # to produce more defensible candidate change regions.
    multi_signal_result = None
    if multi_signal_enabled and additional_indices and change_result is not None:
        try:
            multi_signal_result = _compute_multi_signal_change(
                primary_index_name=index_name,
                additional_indices=additional_indices,
                signal_rules=signal_rules,
                min_agreeing_signals=min_agreeing,
                scene_t1=scene_sel_t1,
                scene_t2=scene_sel_t2,
                bbox=bbox,
                resolution_m=index_t1.resolution_m if index_t1 else 10.0,
                primary_change_result=change_result,
            )
            processing_steps.append({
                "step": "multi_signal_analysis",
                "detail": f"Combined {len(additional_indices) + 1} indicators, "
                          f"{multi_signal_result.get('agreeing_pixels', 0)} agreeing pixels, "
                          f"{multi_signal_result.get('candidate_changed_pct', 0):.2f}% candidate change",
            })

            # Enrich the main change_result with multi-signal evidence
            if multi_signal_result.get("status") == "ok":
                change_result["multi_signal"] = {
                    "enabled": True,
                    "indicators_used": [index_name] + list(additional_indices.keys()),
                    "agreeing_pixels": multi_signal_result.get("agreeing_pixels", 0),
                    "candidate_changed_pct": multi_signal_result.get("candidate_changed_pct", 0),
                    "candidate_changed_area_sq_meters": multi_signal_result.get("candidate_changed_area_sq_meters", 0),
                    "signal_details": multi_signal_result.get("signal_details", {}),
                    "confidence_note": multi_signal_result.get("confidence_note", ""),
                }
        except Exception as e:
            logger.warning("Multi-signal analysis failed: %s — falling back to single-signal", e)
            processing_steps.append({
                "step": "multi_signal_analysis",
                "detail": f"Failed: {type(e).__name__}: {str(e)[:100]}",
            })
    elif multi_signal_enabled:
        processing_steps.append({
            "step": "multi_signal_analysis",
            "detail": "Skipped — no additional indicator arrays available",
        })

    # ── Step 5c: Ensemble change detection (CVA + IR-MAD + Object-CD) ──
    # Runs three independent algorithms and combines via majority voting.
    # This is more robust than any single algorithm.
    ensemble_mask = None
    ensemble_confidence = None
    ensemble_stats = {}
    if index_t1 and index_t2 and index_t1.value is not None and index_t2.value is not None:
        try:
            from app.services.cva import run_cva
            from app.services.mad import run_ir_mad
            from app.services.object_cd import run_object_cd

            t1_arr = index_t1.value.astype(np.float32)
            t2_arr = index_t2.value.astype(np.float32)
            min_h = min(t1_arr.shape[0], t2_arr.shape[0])
            min_w = min(t1_arr.shape[1], t2_arr.shape[1])
            t1_c = t1_arr[:min_h, :min_w]
            t2_c = t2_arr[:min_h, :min_w]
            delta = t2_c - t1_c

            valid = ~np.isnan(t1_c) & ~np.isnan(t2_c) & ~np.isinf(t1_c) & ~np.isinf(t2_c)

            # --- Algorithm 1: CVA (single-band mode for NDVI) ---
            try:
                cva_result = run_cva(
                    t1_c, t2_c,
                    band_names=[index_name],
                    apply_normalization=True,
                )
                cva_mask = cva_result.change_mask & valid
                processing_steps.append({
                    "step": "ensemble_cva",
                    "detail": f"changed={cva_result.changed_pixels}/{cva_result.total_pixels} ({cva_result.changed_pct}%), normalized={cva_result.normalized}",
                })
            except Exception as e:
                cva_mask = np.zeros((min_h, min_w), dtype=bool)
                logger.warning("[Ensemble] CVA failed: %s", e)
                processing_steps.append({"step": "ensemble_cva", "detail": f"Failed: {type(e).__name__}: {str(e)[:80]}"})

            # --- Algorithm 2: IR-MAD (multi-band requires reshaping) ---
            try:
                # For single-index mode, create pseudo multi-band with delta and original
                bands_t1_3d = np.stack([t1_c, t2_c], axis=0)  # (2, H, W)
                bands_t2_3d = np.stack([t1_c, t2_c], axis=0)  # Dummy for MAD
                # Actually MAD needs two different time images — use the index arrays
                bands_t1_mad = t1_c[np.newaxis, ...]  # (1, H, W)
                bands_t2_mad = t2_c[np.newaxis, ...]  # (1, H, W)
                mad_result = run_ir_mad(
                    bands_t1_mad, bands_t2_mad,
                    significance_level=0.01,
                )
                mad_mask = mad_result.change_mask & valid
                processing_steps.append({
                    "step": "ensemble_mad",
                    "detail": f"changed={mad_result.changed_pixels}/{mad_result.total_pixels} ({mad_result.changed_pct}%), converged={mad_result.converged}",
                })
            except Exception as e:
                mad_mask = np.zeros((min_h, min_w), dtype=bool)
                logger.warning("[Ensemble] IR-MAD failed: %s", e)
                processing_steps.append({"step": "ensemble_mad", "detail": f"Failed: {type(e).__name__}: {str(e)[:80]}"})

            # --- Algorithm 3: Object-based multi-scale ---
            try:
                obj_result = run_object_cd(
                    delta,
                    scale_sigmas=[0.0, 1.5, 3.0, 6.0],
                    min_agreement=2,
                    min_object_size=10,
                )
                obj_mask = obj_result.change_mask & valid
                ensemble_confidence = obj_result.confidence
                processing_steps.append({
                    "step": "ensemble_object_cd",
                    "detail": f"changed={obj_result.changed_pixels}/{obj_result.total_pixels} ({obj_result.changed_pct}%), objects={obj_result.n_objects}",
                })
            except Exception as e:
                obj_mask = np.zeros((min_h, min_w), dtype=bool)
                logger.warning("[Ensemble] Object-CD failed: %s", e)
                processing_steps.append({"step": "ensemble_object_cd", "detail": f"Failed: {type(e).__name__}: {str(e)[:80]}"})

            # --- Ensemble voting: pixel is changed if ≥2/3 algorithms agree ---
            vote_count = cva_mask.astype(int) + mad_mask.astype(int) + obj_mask.astype(int)
            ensemble_mask = vote_count >= 2

            ensemble_changed = int(np.sum(ensemble_mask))
            ensemble_total = int(np.sum(valid))
            ensemble_pct = (ensemble_changed / ensemble_total * 100) if ensemble_total > 0 else 0.0

            ensemble_stats = {
                "algorithm": "ensemble_cva_mad_object",
                "n_algorithms": 3,
                "min_agreement": 2,
                "changed_pixels": ensemble_changed,
                "total_valid_pixels": ensemble_total,
                "changed_pct": round(ensemble_pct, 4),
                "cva_changed": int(np.sum(cva_mask)),
                "mad_changed": int(np.sum(mad_mask)),
                "object_changed": int(np.sum(obj_mask)),
            }

            processing_steps.append({
                "step": "ensemble_voting",
                "detail": f"cva={int(np.sum(cva_mask))}, mad={int(np.sum(mad_mask))}, obj={int(np.sum(obj_mask))}, ensemble={ensemble_changed} ({ensemble_pct:.2f}%)",
            })

            logger.info(
                "[Ensemble] CVA=%d, MAD=%d, Object=%d, Ensemble=%d/%d (%.2f%%)",
                int(np.sum(cva_mask)), int(np.sum(mad_mask)), int(np.sum(obj_mask)),
                ensemble_changed, ensemble_total, ensemble_pct,
            )

        except Exception as e:
            logger.warning("[Ensemble] Failed: %s — falling back to threshold method", e)
            processing_steps.append({
                "step": "ensemble_detection",
                "detail": f"Failed: {type(e).__name__}: {str(e)[:100]}",
            })

    # ── Step 5b: Generate NDVI-based categorical change mask ────
    # Uses the actual spectral index arrays (NDVI/NDBI/etc.), NOT raw RGB pixels.
    # Classifies into: Vegetation Loss / Stable / Vegetation Gain / No Data
    change_mask_b64 = None
    diff_vis_b64 = None
    change_vis_stats = {}
    if index_t1 and index_t2 and index_t1.value is not None and index_t2.value is not None:
        try:
            from scipy import ndimage as _ndimage_vis

            t1_arr = index_t1.value.astype(np.float32)
            t2_arr = index_t2.value.astype(np.float32)
            min_h = min(t1_arr.shape[0], t2_arr.shape[0])
            min_w = min(t1_arr.shape[1], t2_arr.shape[1])
            t1_c = t1_arr[:min_h, :min_w]
            t2_c = t2_arr[:min_h, :min_w]

            # Valid pixel mask: both scenes must have valid (non-NaN, non-zero) data
            valid = (~np.isnan(t1_c)) & (~np.isnan(t2_c)) & (~np.isinf(t1_c)) & (~np.isinf(t2_c))
            valid = valid & (np.abs(t1_c) > 0.001) & (np.abs(t2_c) > 0.001)

            # --- Water mask using NDVI proxy ---
            # Only exclude pixels that are clearly water in BOTH periods
            water_t1 = t1_c < -0.1  # clearly water in period 1
            water_t2 = t2_c < -0.1  # clearly water in period 2
            water_mask = water_t1 & water_t2  # only exclude pixels water in BOTH periods

            valid = valid & (~water_mask)
            total_valid_pixels = int(np.sum(valid))

            # Compute delta: index_after - index_before
            delta = np.where(valid, t2_c - t1_c, np.nan)

            # --- Adaptive threshold ---
            valid_delta = delta[valid]
            if len(valid_delta) > 100:
                delta_std = float(np.std(valid_delta))
                threshold = max(0.08, min(0.20, 1.2 * delta_std))
            else:
                threshold = 0.10

            # --- Classify into categorical mask ---
            # Use ensemble mask if available (from CVA+IR-MAD+Object-CD),
            # otherwise fall back to threshold-based classification
            if ensemble_mask is not None and ensemble_mask.shape == (min_h, min_w):
                # Ensemble-validated change: classify by direction of delta
                loss_condition = ensemble_mask & valid & (delta < 0)
                gain_condition = ensemble_mask & valid & (delta > 0)
                classification = np.zeros((min_h, min_w), dtype=np.uint8)
                classification[valid] = 2  # Default: Stable
                classification[loss_condition] = 1  # Loss
                classification[gain_condition] = 3   # Gain
                processing_steps.append({
                    "step": "mask_source",
                    "detail": f"Using ENSEMBLE mask ({int(np.sum(ensemble_mask))} changed pixels from CVA+MAD+ObjectCD)",
                })
            else:
                # Fallback: threshold-based classification
                loss_condition = valid & (delta < -threshold) & (t1_c >= 0.15)
                gain_condition = valid & (delta > threshold) & (t2_c >= 0.15)
                classification = np.zeros((min_h, min_w), dtype=np.uint8)
                classification[valid] = 2  # Default: Stable
                classification[loss_condition] = 1  # Loss
                classification[gain_condition] = 3   # Gain
                processing_steps.append({
                    "step": "mask_source",
                    "detail": "Using THRESHOLD-based mask (ensemble unavailable)",
                })

            # --- Morphological filtering ---
            # Remove isolated noise pixels using binary opening
            struct = _ndimage_vis.generate_binary_structure(2, 1)  # 4-connectivity

            # Filter loss regions (min 25 pixels = ~0.25 ha at 10m)
            loss_mask = classification == 1
            loss_cleaned = _ndimage_vis.binary_opening(loss_mask, structure=struct, iterations=1)
            min_region = 25
            labeled_loss, n_loss = _ndimage_vis.label(loss_cleaned)
            if n_loss > 0:
                sizes_loss = _ndimage_vis.sum(loss_cleaned, labeled_loss, range(1, n_loss + 1))
                for i, sz in enumerate(sizes_loss):
                    if sz < min_region:
                        loss_cleaned[labeled_loss == (i + 1)] = False

            # Filter gain regions (min 25 pixels = ~0.25 ha at 10m)
            gain_mask = classification == 3
            gain_cleaned = _ndimage_vis.binary_opening(gain_mask, structure=struct, iterations=1)
            labeled_gain, n_gain = _ndimage_vis.label(gain_cleaned)
            if n_gain > 0:
                sizes_gain = _ndimage_vis.sum(gain_cleaned, labeled_gain, range(1, n_gain + 1))
                for i, sz in enumerate(sizes_gain):
                    if sz < min_region:
                        gain_cleaned[labeled_gain == (i + 1)] = False

            # Rebuild classification from cleaned masks
            final_class = np.zeros((min_h, min_w), dtype=np.uint8)  # 0 = No Data
            final_class[valid] = 2  # Stable
            final_class[loss_cleaned] = 1  # Loss (overwrites stable)
            final_class[gain_cleaned] = 3  # Gain (overwrites stable)

            # --- Generate categorical RGBA image ---
            # Loss  = warm red (220, 60, 60)  — semi-transparent
            # Stable = very dark, nearly invisible — lets the basemap show through
            # Gain  = green (34, 180, 90) — semi-transparent
            # No Data = dark charcoal (20, 28, 24) — opaque
            mask_img = np.zeros((min_h, min_w, 4), dtype=np.uint8)

            # No Data (opaque dark)
            nodata = final_class == 0
            mask_img[nodata] = [20, 28, 24, 255]

            # Stable (nearly invisible — very low alpha so basemap shows through)
            stable = final_class == 2
            mask_img[stable] = [15, 22, 18, 30]  # barely visible tint

            # Vegetation Loss (red, strong alpha)
            loss_final = final_class == 1
            mask_img[loss_final] = [220, 60, 60, 180]

            # Vegetation Gain (green, strong alpha)
            gain_final = final_class == 3
            mask_img[gain_final] = [34, 180, 90, 180]

            change_mask_b64 = _encode_rgba_png(mask_img)

            # --- Compute statistics from the FINAL filtered mask ---
            pixel_area_sq_m = index_t1.resolution_m ** 2
            loss_pixels = int(np.sum(final_class == 1))
            gain_pixels = int(np.sum(final_class == 3))
            stable_pixels = int(np.sum(final_class == 2))
            nodata_pixels = int(np.sum(final_class == 0))
            changed_pixels_total = loss_pixels + gain_pixels

            loss_area_km2 = loss_pixels * pixel_area_sq_m / 1e6
            gain_area_km2 = gain_pixels * pixel_area_sq_m / 1e6
            stable_area_km2 = stable_pixels * pixel_area_sq_m / 1e6
            total_analyzed_km2 = (total_valid_pixels * pixel_area_sq_m) / 1e6

            # Dominant trend
            if loss_pixels > gain_pixels * 1.5:
                dominant_trend = "vegetation_loss"
            elif gain_pixels > loss_pixels * 1.5:
                dominant_trend = "vegetation_gain"
            else:
                dominant_trend = "stable_mixed"

            # Mean delta of changed pixels
            loss_mean_delta = float(np.nanmean(delta[loss_cleaned])) if np.any(loss_cleaned) else 0.0
            gain_mean_delta = float(np.nanmean(delta[gain_cleaned])) if np.any(gain_cleaned) else 0.0

            change_vis_stats = {
                "loss_pixels": loss_pixels,
                "gain_pixels": gain_pixels,
                "stable_pixels": stable_pixels,
                "nodata_pixels": nodata_pixels,
                "loss_area_km2": round(loss_area_km2, 2),
                "gain_area_km2": round(gain_area_km2, 2),
                "stable_area_km2": round(stable_area_km2, 2),
                "total_analyzed_km2": round(total_analyzed_km2, 2),
                "dominant_trend": dominant_trend,
                "loss_mean_delta": round(loss_mean_delta, 4),
                "gain_mean_delta": round(gain_mean_delta, 4),
                "threshold": round(threshold, 4),
                "total_valid_pixels": total_valid_pixels,
                "num_loss_regions": n_loss,
                "num_gain_regions": n_gain,
            }

            # --- Difference visualization (for the Difference mode, not Change Mask) ---
            diff_clipped = np.clip(np.nan_to_num(delta, nan=0.0), -0.5, 0.5)
            diff_norm = ((diff_clipped + 0.5) / 1.0 * 255).astype(np.uint8)
            diff_img = np.zeros((min_h, min_w, 4), dtype=np.uint8)
            sig_mask = valid & (np.abs(np.nan_to_num(delta, nan=0.0)) >= threshold)
            diff_img[sig_mask, 0] = np.where(delta[sig_mask] > 0, diff_norm[sig_mask], 80)
            diff_img[sig_mask, 1] = 50
            diff_img[sig_mask, 2] = np.where(delta[sig_mask] < 0, diff_norm[sig_mask], 80)
            diff_img[sig_mask, 3] = 160
            diff_img[~valid] = [13, 23, 17, 255]
            diff_vis_b64 = _encode_rgba_png(diff_img)

            logger.info(
                "[%s] Change mask: loss=%d px (%.2f km2), gain=%d px (%.2f km2), trend=%s, threshold=%.3f",
                index_name, loss_pixels, loss_area_km2, gain_pixels, gain_area_km2,
                dominant_trend, threshold,
            )
        except Exception as e:
            logger.warning("[%s] Change mask generation failed: %s", index_name, e, exc_info=True)

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
        change_detection={**(change_result or {}), **({"ensemble": ensemble_stats} if ensemble_stats else {})},
        change_visualizations={
            "change_mask_png": change_mask_b64,
            "difference_png": diff_vis_b64,
            "bbox": bbox,
            **change_vis_stats,
            **({"ensemble": ensemble_stats} if ensemble_stats else {}),
        } if change_mask_b64 else None,
        metrics=metrics,
        imagery=imagery,
        processing_steps=processing_steps,
        sensor_info=sensor_info,
        explanation=explanation,
    )
