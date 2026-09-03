"""
Multi-Scene Selector for AOI Coverage.

Given an AOI and time period, selects enough scenes to collectively cover
the requested area.  Produces one "analysis-ready composite" per period.

Algorithm:
  1. Search all available scenes for the AOI + time range.
  2. Filter out scenes with unusable cloud/nodata conditions.
  3. Score each scene by: AOI coverage, cloud cover, temporal proximity.
  4. Greedily select scenes until AOI coverage >= threshold.
  5. If no single-sensor pair covers the AOI, report partial coverage.
  6. Enforce sensor consistency: reject cross-sensor pairs.

Memory note:
  All spatial operations use bbox geometry (no raster reads here).
  Raster mosaicking happens later in mosaic.py with windowed reads.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional

logger = logging.getLogger(__name__)


# ── Configuration ─────────────────────────────────────────────────────

# Minimum AOI coverage ratio to consider a scene "useful"
MIN_SCENE_OVERLAP_RATIO = 0.01

# Target coverage ratio — stop adding scenes once we reach this
TARGET_COVERAGE_RATIO = 0.95

# Maximum cloud cover for a scene to be considered
MAX_CLOUD_FILTER = 40

# Maximum scenes to select per period (memory limit on Render 512MB)
MAX_SCENES_PER_PERIOD = 6

# Sensor families — scenes within the same family are considered compatible
SENSOR_FAMILIES = {
    "sentinel-2-l2a": "sentinel-2",
    "sentinel-2-l1c": "sentinel-2",
    "landsat-c2-l2": "landsat",
    "naip": "naip",
    "sentinel-1-grd": "sentinel-1",
}


# ── Data classes ──────────────────────────────────────────────────────

@dataclass
class SelectedScene:
    """A scene selected for inclusion in the composite."""

    item_id: str
    collection: str
    bbox: list[float]
    geometry: Optional[dict[str, Any]]
    datetime: str
    cloud_cover: Optional[float]
    platform: str
    provider: str
    assets: dict[str, Any]
    score: float
    overlap_ratio: float  # fraction of AOI covered by this scene

    def to_dict(self) -> dict[str, Any]:
        return {
            "item_id": self.item_id,
            "collection": self.collection,
            "bbox": self.bbox,
            "geometry": self.geometry,
            "datetime": self.datetime,
            "cloud_cover": self.cloud_cover,
            "platform": self.platform,
            "provider": self.provider,
            "score": self.score,
            "overlap_ratio": self.overlap_ratio,
        }


@dataclass
class SceneSelectionResult:
    """Result of multi-scene selection for one time period."""

    period_label: str  # "period1" or "period2"
    scenes: list[SelectedScene]
    sensor: str  # dominant sensor family
    collection: str  # dominant collection
    total_scenes: int
    coverage_ratio: float  # estimated AOI coverage (0-1)
    is_complete: bool  # whether coverage >= target threshold
    is_mosaic: bool  # whether mosaicking is needed (>1 scene)
    acquisition_dates: list[str]  # sorted dates of selected scenes
    total_cloud_cover: Optional[float]  # average cloud cover
    resolution_m: Optional[float]  # dominant resolution
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


# ── Bbox helpers ──────────────────────────────────────────────────────

def _bbox_area(bbox: list[float]) -> float:
    """Area of a bbox in degrees²."""
    if len(bbox) < 4:
        return 0
    return max(0, bbox[2] - bbox[0]) * max(0, bbox[3] - bbox[1])


def _bbox_intersection_area(a: list[float], b: list[float]) -> float:
    """Intersection area of two bboxes in degrees²."""
    west = max(a[0], b[0])
    south = max(a[1], b[1])
    east = min(a[2], b[2])
    north = min(a[3], b[3])
    if west >= east or south >= north:
        return 0
    return (east - west) * (north - south)


def _bbox_overlap_ratio(scene_bbox: list[float], aoi_bbox: list[float]) -> float:
    """Fraction of the AOI covered by the scene bbox."""
    aoi_area = _bbox_area(aoi_bbox)
    if aoi_area <= 0:
        return 0
    return _bbox_intersection_area(scene_bbox, aoi_bbox) / aoi_area


def _bbox_union_bbox(bboxes: list[list[float]]) -> list[float]:
    """Compute the bounding box that encloses all given bboxes."""
    if not bboxes:
        return [0, 0, 0, 0]
    return [
        min(b[0] for b in bboxes),
        min(b[1] for b in bboxes),
        max(b[2] for b in bboxes),
        max(b[3] for b in bboxes),
    ]


# ── Sensor consistency ────────────────────────────────────────────────

def _get_sensor_family(collection: str) -> str:
    """Map a collection to its sensor family."""
    return SENSOR_FAMILIES.get(collection, collection)


def _check_sensor_consistency(
    scenes: list[dict[str, Any]],
) -> tuple[str, str, list[str]]:
    """
    Determine the dominant sensor and check consistency.

    Returns (dominant_collection, dominant_family, warnings).
    """
    if not scenes:
        return "", "", []

    # Count by collection
    collection_counts: dict[str, int] = {}
    for s in scenes:
        c = s.get("collection", "unknown")
        collection_counts[c] = collection_counts.get(c, 0) + 1

    # Dominant collection = most common
    dominant = max(collection_counts, key=collection_counts.get)  # type: ignore
    dominant_family = _get_sensor_family(dominant)

    warnings = []
    # Check for cross-sensor mixing
    families = set(_get_sensor_family(s.get("collection", "")) for s in scenes)
    if len(families) > 1:
        warnings.append(
            f"Cross-sensor data detected: {', '.join(families)}. "
            f"Using dominant sensor {dominant}."
        )

    return dominant, dominant_family, warnings


# ── Scene scoring ─────────────────────────────────────────────────────

def _score_scene(
    scene: dict[str, Any],
    aoi_bbox: list[float],
    target_date: Optional[datetime],
) -> tuple[float, float]:
    """
    Score a scene for inclusion in the composite.

    Returns (total_score, overlap_ratio).
    Higher score = better scene.

    Components:
      - AOI overlap (0.4): how much of the AOI this scene covers
      - Cloud cover (0.3): lower is better
      - Temporal proximity (0.2): closer to target date is better
      - Resolution (0.1): finer resolution is better
    """
    bbox = scene.get("bbox", [])
    if not bbox or len(bbox) != 4:
        return 0, 0

    overlap = _bbox_overlap_ratio(bbox, aoi_bbox)
    if overlap < MIN_SCENE_OVERLAP_RATIO:
        return 0, overlap

    # Cloud cover score
    props = scene.get("properties", {})
    cloud = props.get("eo:cloud_cover")
    if cloud is not None:
        cloud_score = max(0, 1 - (cloud / 100))
    else:
        cloud_score = 0.5  # unknown = neutral

    # Temporal proximity score
    dt_str = props.get("datetime", "")
    temporal_score = 0.5  # default if no date
    if dt_str and target_date:
        try:
            scene_dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
            target_dt = target_date if target_date.tzinfo else target_date.replace(
                tzinfo=scene_dt.tzinfo
            )
            days_diff = abs((scene_dt - target_dt).days)
            temporal_score = max(0, 1 - (days_diff / 365))
        except Exception:
            pass

    # Resolution score (lower GSD = better)
    gsd = props.get("eo:gsd", 30)
    if gsd is not None:
        resolution_score = max(0, 1 - (gsd / 100))
    else:
        resolution_score = 0.5

    total = overlap * 0.4 + cloud_score * 0.3 + temporal_score * 0.2 + resolution_score * 0.1
    return total, overlap


# ── Grid-based coverage estimation ────────────────────────────────────

def _estimate_collective_coverage(
    aoi_bbox: list[float],
    selected_bboxes: list[list[float]],
    grid_res: int = 50,
) -> float:
    """
    Estimate what fraction of the AOI is covered by the selected scenes.

    Uses a pixel-grid approximation.
    """
    aoi_area = _bbox_area(aoi_bbox)
    if aoi_area <= 0:
        return 0

    aoi_w = aoi_bbox[2] - aoi_bbox[0]
    aoi_h = aoi_bbox[3] - aoi_bbox[1]
    if aoi_w <= 0 or aoi_h <= 0:
        return 0

    cell_w = aoi_w / grid_res
    cell_h = aoi_h / grid_res

    covered = [False] * (grid_res * grid_res)

    for sb in selected_bboxes:
        if not sb or len(sb) != 4:
            continue
        col_start = max(0, int((sb[0] - aoi_bbox[0]) / cell_w))
        col_end = min(grid_res, int(math.ceil((sb[2] - aoi_bbox[0]) / cell_w)))
        row_start = max(0, int((sb[1] - aoi_bbox[1]) / cell_h))
        row_end = min(grid_res, int(math.ceil((sb[3] - aoi_bbox[1]) / cell_h)))

        for row in range(row_start, row_end):
            for col in range(col_start, col_end):
                covered[row * grid_res + col] = True

    return sum(covered) / len(covered)


# ── Main selection function ───────────────────────────────────────────

def select_scenes_for_period(
    aoi_bbox: list[float],
    scenes: list[dict[str, Any]],
    period_label: str,
    target_date: Optional[datetime] = None,
    max_cloud_cover: int = MAX_CLOUD_FILTER,
    required_sensor: Optional[str] = None,
) -> SceneSelectionResult:
    """
    Select enough scenes to cover the AOI for one time period.

    This is the core selection algorithm:

    1. Filter scenes by cloud cover.
    2. Score each scene.
    3. Greedily select scenes until target coverage is reached.
    4. Enforce sensor consistency.
    5. Return selection result with coverage metadata.

    Args:
        aoi_bbox: Bounding box [west, south, east, north]
        scenes: List of STAC item dicts from the provider
        period_label: "period1" or "period2" (for logging)
        target_date: Preferred datetime for this period
        max_cloud_cover: Maximum cloud cover % to accept
        required_sensor: If set, only accept this sensor family

    Returns:
        SceneSelectionResult with selected scenes and coverage metadata
    """
    logger.info(
        "[%s] Selecting scenes for AOI %s from %d candidates",
        period_label, aoi_bbox, len(scenes),
    )

    if not scenes:
        return SceneSelectionResult(
            period_label=period_label,
            scenes=[],
            sensor="",
            collection="",
            total_scenes=0,
            coverage_ratio=0.0,
            is_complete=False,
            is_mosaic=False,
            acquisition_dates=[],
            total_cloud_cover=None,
            resolution_m=None,
            errors=["No scenes available for this period"],
        )

    # Step 1: Filter by cloud cover
    filtered = []
    for s in scenes:
        props = s.get("properties", {})
        cloud = props.get("eo:cloud_cover")
        if cloud is not None and cloud > max_cloud_cover:
            continue
        filtered.append(s)

    logger.info(
        "[%s] %d scenes after cloud filter (max %d%%)",
        period_label, len(filtered), max_cloud_cover,
    )

    if not filtered:
        # Relax cloud filter and try again
        logger.info("[%s] No scenes pass cloud filter, relaxing to 100%%", period_label)
        filtered = [s for s in scenes if s.get("bbox")]

    # Step 2: Score all scenes
    scored = []
    for s in filtered:
        score, overlap = _score_scene(s, aoi_bbox, target_date)
        if score > 0:
            scored.append((s, score, overlap))

    scored.sort(key=lambda x: x[1], reverse=True)

    logger.info(
        "[%s] %d scenes with positive score", period_label, len(scored),
    )

    if not scored:
        return SceneSelectionResult(
            period_label=period_label,
            scenes=[],
            sensor="",
            collection="",
            total_scenes=0,
            coverage_ratio=0.0,
            is_complete=False,
            is_mosaic=False,
            acquisition_dates=[],
            total_cloud_cover=None,
            resolution_m=None,
            errors=["No usable scenes found for this period"],
        )

    # Step 3: Greedy selection — pick best scenes until coverage is sufficient
    selected: list[tuple[dict, float, float]] = []
    covered_bboxes: list[list[float]] = []
    warnings: list[str] = []

    for scene, score, overlap in scored:
        if len(selected) >= MAX_SCENES_PER_PERIOD:
            warnings.append(
                f"Hit max scene limit ({MAX_SCENES_PER_PERIOD}). "
                f"Coverage may be incomplete."
            )
            break

        selected.append((scene, score, overlap))
        scene_bbox = scene.get("bbox", [])
        if scene_bbox and len(scene_bbox) == 4:
            covered_bboxes.append(scene_bbox)

        # Check current coverage
        current_coverage = _estimate_collective_coverage(aoi_bbox, covered_bboxes)
        if current_coverage >= TARGET_COVERAGE_RATIO:
            break

    # Step 4: Sensor consistency check
    selected_dicts = [s[0] for s in selected]
    dominant_collection, dominant_family, sensor_warnings = _check_sensor_consistency(
        selected_dicts
    )
    warnings.extend(sensor_warnings)

    # If required_sensor is specified, filter to compatible scenes only
    if required_sensor:
        required_family = _get_sensor_family(required_sensor)
        compatible = [
            (s, sc, ov) for s, sc, ov in selected
            if _get_sensor_family(s.get("collection", "")) == required_family
        ]
        if len(compatible) < len(selected):
            warnings.append(
                f"Removed {len(selected) - len(compatible)} scenes "
                f"incompatible with sensor {required_sensor}"
            )
            selected = compatible
            selected_dicts = [s[0] for s in selected]
            dominant_collection, dominant_family, extra_warnings = _check_sensor_consistency(
                selected_dicts
            )
            warnings.extend(extra_warnings)

    # Step 5: Compute final metadata
    total_coverage = _estimate_collective_coverage(aoi_bbox, covered_bboxes)
    is_mosaic = len(selected) > 1

    # Acquisition dates
    dates = []
    for s, _, _ in selected:
        dt = s.get("properties", {}).get("datetime", "")
        if dt:
            dates.append(dt.split("T")[0])
    dates.sort()

    # Average cloud cover
    clouds = []
    for s, _, _ in selected:
        c = s.get("properties", {}).get("eo:cloud_cover")
        if c is not None:
            clouds.append(c)
    avg_cloud = sum(clouds) / len(clouds) if clouds else None

    # Resolution (use the finest available)
    resolutions = []
    for s, _, _ in selected:
        gsd = s.get("properties", {}).get("eo:gsd")
        if gsd is not None:
            resolutions.append(gsd)
    resolution = min(resolutions) if resolutions else None

    # Build SelectedScene objects
    selected_scenes = []
    for scene, score, overlap in selected:
        props = scene.get("properties", {})
        selected_scenes.append(SelectedScene(
            item_id=scene.get("id", "unknown"),
            collection=scene.get("collection", "unknown"),
            bbox=scene.get("bbox", []),
            geometry=scene.get("geometry"),
            datetime=props.get("datetime", ""),
            cloud_cover=props.get("eo:cloud_cover"),
            platform=props.get("platform", "unknown"),
            provider=scene.get("provider", "unknown"),
            assets=scene.get("assets", {}),
            score=score,
            overlap_ratio=overlap,
        ))

    logger.info(
        "[%s] Selected %d scenes, coverage=%.1f%%, sensor=%s, mosaic=%s",
        period_label, len(selected_scenes), total_coverage * 100,
        dominant_collection, is_mosaic,
    )

    return SceneSelectionResult(
        period_label=period_label,
        scenes=selected_scenes,
        sensor=dominant_family,
        collection=dominant_collection,
        total_scenes=len(selected_scenes),
        coverage_ratio=total_coverage,
        is_complete=total_coverage >= TARGET_COVERAGE_RATIO,
        is_mosaic=is_mosaic,
        acquisition_dates=dates,
        total_cloud_cover=avg_cloud,
        resolution_m=resolution,
        warnings=warnings,
    )


# ── Cross-period sensor compatibility ─────────────────────────────────

def check_periods_compatible(
    period1: SceneSelectionResult,
    period2: SceneSelectionResult,
) -> tuple[bool, list[str]]:
    """
    Check if two periods are sensor-compatible for change detection.

    Returns (is_compatible, warnings).
    """
    warnings = []

    if not period1.sensor or not period2.sensor:
        return False, ["Sensor family could not be determined for one or both periods"]

    family1 = period1.sensor
    family2 = period2.sensor

    if family1 == family2:
        return True, []

    # Cross-sensor: not directly comparable pixel-for-pixel
    warnings.append(
        f"Cross-sensor comparison: {family1} vs {family2}. "
        f"Results may not be directly comparable pixel-for-pixel. "
        f"Resolution, spectral response, and viewing geometry differ."
    )
    return False, warnings
