"""
EO Discovery Engine — coverage-aware, multi-criteria scene selection.

Replaces the naive "pick first scene" approach with:
  1. Federated STAC discovery across providers
  2. Normalized scene metadata (NormalizedScene)
  3. Geometric coverage calculation (AOI intersection / union)
  4. Multi-criteria scene ranking (cloud, coverage, temporal, bands)
  5. Period-aware scene selection (comparable seasons, same sensor)

Design principles (from sat-search + stackstac):
  - AOI + DATE + COLLECTION + CLOUD + QUALITY + SORTING → RANKED SCENES
  - Coverage must be geometry-derived, not scene-count-derived
  - Return real metadata; null for unavailable fields

References:
  - sat-search: https://github.com/sat-utils/sat-search
  - stackstac: https://github.com/gjoseph92/stackstac
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Optional

import numpy as np

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════
# Normalized Scene Model
# ══════════════════════════════════════════════════════════════════

@dataclass
class NormalizedScene:
    """
    Provider-agnostic scene representation.

    Every field is either populated from real STAC metadata or None.
    Never fabricate values.
    """
    # Identity
    scene_id: str
    collection: str
    provider: str

    # Temporal
    datetime: str               # ISO 8601
    datetime_obj: Optional[datetime] = None

    # Spatial
    bbox: list[float] = field(default_factory=list)      # [west, south, east, north]
    geometry: Optional[dict] = None                        # GeoJSON
    gsd: Optional[float] = None                            # Ground sample distance (meters)

    # Quality
    cloud_cover: Optional[float] = None                    # Percentage 0-100
    platform: Optional[str] = None                         # e.g. "sentinel-2a"
    instrument: Optional[str] = None                       # e.g. "msi"

    # Coverage (computed, not from metadata)
    aoi_overlap_pct: Optional[float] = None                # % of AOI covered by this scene
    aoi_overlap_area_km2: Optional[float] = None

    # Assets
    assets: dict[str, dict] = field(default_factory=dict)  # band → {href, type, title}
    bands_available: list[str] = field(default_factory=list)

    # Derived scores (computed during ranking)
    rank_score: Optional[float] = None
    rank_breakdown: dict[str, float] = field(default_factory=dict)

    # Processing
    is_composite: bool = False
    n_scenes_composited: int = 1
    composite_scene_ids: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dict for API responses."""
        return {
            "scene_id": self.scene_id,
            "collection": self.collection,
            "provider": self.provider,
            "datetime": self.datetime,
            "bbox": self.bbox,
            "gsd": self.gsd,
            "cloud_cover": self.cloud_cover,
            "platform": self.platform,
            "instrument": self.instrument,
            "aoi_overlap_pct": self.aoi_overlap_pct,
            "bands_available": self.bands_available,
            "rank_score": self.rank_score,
            "is_composite": self.is_composite,
            "n_scenes_composited": self.n_scenes_composited,
        }


def scene_from_stac_item(item: dict[str, Any], provider: str = "unknown") -> NormalizedScene:
    """Convert a normalized STAC item dict to NormalizedScene."""
    props = item.get("properties", {})
    assets = item.get("assets", {})

    # Parse datetime
    dt_str = props.get("datetime", "")
    dt_obj = None
    if dt_str:
        try:
            dt_obj = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            pass

    # Extract band names from assets
    bands = []
    for key, asset in assets.items():
        if isinstance(asset, dict):
            # Sentinel-2 band naming: B01, B02, ..., B8A, B11, B12, SCL
            if key.upper().startswith("B") or key.lower() in ("vv", "vh", "scl", "aot", "wvp"):
                bands.append(key)

    return NormalizedScene(
        scene_id=item.get("id", "unknown"),
        collection=item.get("collection", "unknown"),
        provider=provider,
        datetime=dt_str,
        datetime_obj=dt_obj,
        bbox=item.get("bbox", []),
        geometry=item.get("geometry"),
        cloud_cover=props.get("eo:cloud_cover"),
        platform=props.get("platform"),
        instrument=props.get("instruments", [None])[0] if isinstance(props.get("instruments"), list) else props.get("instruments"),
        assets=assets,
        bands_available=bands,
    )


# ══════════════════════════════════════════════════════════════════
# Coverage Calculation
# ══════════════════════════════════════════════════════════════════

def _bbox_intersection_area(a: list[float], b: list[float]) -> float:
    """
    Compute area of intersection between two bounding boxes [west, south, east, north].
    Returns area in degrees² (for relative comparison).
    """
    west = max(a[0], b[0])
    south = max(a[1], b[1])
    east = min(a[2], b[2])
    north = min(a[3], b[3])

    if west >= east or south >= north:
        return 0.0

    return (east - west) * (north - south)


def _bbox_area(bbox: list[float]) -> float:
    """Compute area of a bounding box in degrees²."""
    if not bbox or len(bbox) != 4:
        return 0.0
    return max(0, bbox[2] - bbox[0]) * max(0, bbox[3] - bbox[1])


def _bbox_union_area(a: list[float], b: list[float]) -> float:
    """Compute area of union of two bounding boxes."""
    area_a = _bbox_area(a)
    area_b = _bbox_area(b)
    intersection = _bbox_intersection_area(a, b)
    return area_a + area_b - intersection


def compute_aoi_coverage(scene_bbox: list[float], aoi_bbox: list[float]) -> float:
    """
    Compute what fraction of the AOI is covered by the scene.
    Returns 0.0 to 1.0.
    """
    aoi_area = _bbox_area(aoi_bbox)
    if aoi_area <= 0:
        return 0.0

    intersection = _bbox_intersection_area(scene_bbox, aoi_bbox)
    return min(intersection / aoi_area, 1.0)


def compute_union_coverage(scenes: list[NormalizedScene], aoi_bbox: list[float]) -> float:
    """
    Compute what fraction of the AOI is covered by the UNION of all scene bboxes.
    This answers: "If we combine all these scenes, how much of the AOI do we cover?"
    """
    aoi_area = _bbox_area(aoi_bbox)
    if aoi_area <= 0 or not scenes:
        return 0.0

    # Simple approximation: union of bboxes
    # For production, use polygon union via shapely, but bbox union is sufficient for ranking
    if len(scenes) == 1:
        return compute_aoi_coverage(scenes[0].bbox, aoi_bbox)

    # Approximate: take the bounding box of all scene bboxes
    all_west = min(s.bbox[0] for s in scenes if s.bbox)
    all_south = min(s.bbox[1] for s in scenes if s.bbox)
    all_east = max(s.bbox[2] for s in scenes if s.bbox)
    all_north = max(s.bbox[3] for s in scenes if s.bbox)

    combined_bbox = [all_west, all_south, all_east, all_north]
    return compute_aoi_coverage(combined_bbox, aoi_bbox)


def find_uncovered_portions(scenes: list[NormalizedScene], aoi_bbox: list[float]) -> list[list[float]]:
    """
    Identify portions of the AOI not covered by any scene.
    Returns list of [west, south, east, north] bboxes for uncovered regions.
    """
    if not scenes:
        return [aoi_bbox]

    # Simple grid-based approach: divide AOI into quadrants and check coverage
    aw, as_, ae, an = aoi_bbox
    mid_w = (aw + ae) / 2
    mid_s = (as_ + an) / 2

    quadrants = [
        [aw, as_, mid_w, mid_s],   # SW
        [mid_w, as_, ae, mid_s],   # SE
        [aw, mid_s, mid_w, an],   # NW
        [mid_w, mid_s, ae, an],   # NE
    ]

    uncovered = []
    for q in quadrants:
        covered = False
        for scene in scenes:
            if compute_aoi_coverage(scene.bbox, q) > 0.5:
                covered = True
                break
        if not covered:
            uncovered.append(q)

    return uncovered


# ══════════════════════════════════════════════════════════════════
# Multi-Criteria Scene Ranking
# ══════════════════════════════════════════════════════════════════

@dataclass
class RankingWeights:
    """Configurable weights for multi-criteria ranking."""
    aoi_coverage: float = 0.30       # How much of the AOI does this scene cover?
    cloud_quality: float = 0.25      # Lower cloud cover = better
    temporal_fit: float = 0.20       # How close to the requested time window?
    band_availability: float = 0.15  # Are required bands available?
    resolution: float = 0.10         # Higher resolution = better


def rank_scenes(
    scenes: list[NormalizedScene],
    aoi_bbox: list[float],
    target_date: Optional[str] = None,
    required_bands: Optional[list[str]] = None,
    weights: Optional[RankingWeights] = None,
) -> list[NormalizedScene]:
    """
    Rank scenes by multiple criteria.

    Each criterion produces a score in [0, 1].
    Final score = weighted sum of criteria scores.
    """
    if not scenes:
        return []

    if weights is None:
        weights = RankingWeights()

    if required_bands is None:
        required_bands = []

    # Parse target date for temporal scoring
    target_dt = None
    if target_date:
        try:
            target_dt = datetime.fromisoformat(target_date.replace("Z", "+00:00")).replace(tzinfo=None)
        except (ValueError, TypeError):
            pass

    for scene in scenes:
        scores = {}

        # 1. AOI Coverage
        coverage = compute_aoi_coverage(scene.bbox, aoi_bbox)
        scene.aoi_overlap_pct = round(coverage * 100, 1)
        scores["aoi_coverage"] = coverage

        # 2. Cloud Quality (lower is better)
        if scene.cloud_cover is not None:
            # Map 0% → 1.0, 100% → 0.0, with a steep dropoff after 30%
            cloud = min(scene.cloud_cover, 100.0)
            scores["cloud_quality"] = max(0.0, 1.0 - (cloud / 50.0))
        else:
            scores["cloud_quality"] = 0.5  # Unknown cloud cover = medium score

        # 3. Temporal Fit
        if target_dt and scene.datetime_obj:
            scene_dt = scene.datetime_obj.replace(tzinfo=None) if scene.datetime_obj.tzinfo else scene.datetime_obj
            t_dt = target_dt.replace(tzinfo=None) if target_dt.tzinfo else target_dt
            days_diff = abs((scene_dt - t_dt).days)
            # Score: 1.0 if same day, 0.0 if > 365 days away
            scores["temporal_fit"] = max(0.0, 1.0 - (days_diff / 365.0))
        else:
            scores["temporal_fit"] = 0.5

        # 4. Band Availability
        if required_bands:
            available = set(b.upper() for b in scene.bands_available)
            required = set(b.upper() for b in required_bands)
            if required:
                match_pct = len(available & required) / len(required)
                scores["band_availability"] = match_pct
            else:
                scores["band_availability"] = 1.0
        else:
            scores["band_availability"] = 1.0

        # 5. Resolution (GSD — lower is better)
        if scene.gsd is not None:
            # 10m → 1.0, 30m → 0.5, 100m → 0.1
            scores["resolution"] = max(0.0, min(1.0, 30.0 / scene.gsd))
        else:
            scores["resolution"] = 0.5

        # Weighted sum
        total = (
            weights.aoi_coverage * scores["aoi_coverage"]
            + weights.cloud_quality * scores["cloud_quality"]
            + weights.temporal_fit * scores["temporal_fit"]
            + weights.band_availability * scores["band_availability"]
            + weights.resolution * scores["resolution"]
        )

        scene.rank_score = round(total, 4)
        scene.rank_breakdown = {k: round(v, 4) for k, v in scores.items()}

    # Sort by score descending
    scenes.sort(key=lambda s: s.rank_score or 0, reverse=True)

    logger.info(
        "[Discovery] Ranked %d scenes. Top score=%.3f, bottom=%.3f",
        len(scenes),
        scenes[0].rank_score if scenes else 0,
        scenes[-1].rank_score if scenes else 0,
    )

    return scenes


# ══════════════════════════════════════════════════════════════════
# Period-Aware Scene Selection
# ══════════════════════════════════════════════════════════════════

def select_best_scene_for_period(
    scenes: list[NormalizedScene],
    aoi_bbox: list[float],
    period_start: str,
    period_end: str,
    required_bands: Optional[list[str]] = None,
    max_cloud_cover: float = 30.0,
    prefer_same_sensor: Optional[str] = None,
) -> Optional[NormalizedScene]:
    """
    Select the best scene for a specific time period.

    Selection criteria:
    1. Must fall within the time window
    2. Cloud cover < max_cloud_cover
    3. Best ranked by multi-criteria scoring
    4. Prefer same sensor as specified
    """
    # Parse period boundaries
    try:
        start_dt = datetime.fromisoformat(period_start)
        end_dt = datetime.fromisoformat(period_end)
        # Ensure timezone-naive for comparison with scene datetimes
        if start_dt.tzinfo is not None:
            start_dt = start_dt.replace(tzinfo=None)
        if end_dt.tzinfo is not None:
            end_dt = end_dt.replace(tzinfo=None)
    except (ValueError, TypeError):
        logger.warning("[Discovery] Invalid period dates: %s / %s", period_start, period_end)
        return None

    # Filter to scenes within the period
    candidates = []
    for scene in scenes:
        if scene.datetime_obj is None:
            continue

        # Check if scene falls within the period (with 30-day tolerance)
        tolerance = timedelta(days=30)
        scene_dt = scene.datetime_obj.replace(tzinfo=None) if scene.datetime_obj.tzinfo else scene.datetime_obj
        if scene_dt < (start_dt - tolerance) or scene_dt > (end_dt + tolerance):
            continue

        # Check cloud cover
        if scene.cloud_cover is not None and scene.cloud_cover > max_cloud_cover:
            continue

        candidates.append(scene)

    if not candidates:
        logger.warning("[Discovery] No candidates for period %s to %s", period_start, period_end)
        return None

    # Rank candidates
    target_mid = start_dt + (end_dt - start_dt) / 2
    ranked = rank_scenes(
        candidates,
        aoi_bbox,
        target_date=target_mid.isoformat(),
        required_bands=required_bands,
    )

    # Prefer same sensor if specified
    if prefer_same_sensor:
        same_sensor = [s for s in ranked if s.platform and prefer_same_sensor.lower() in s.platform.lower()]
        if same_sensor:
            ranked = same_sensor

    best = ranked[0]
    logger.info(
        "[Discovery] Best scene for %s–%s: %s (score=%.3f, cloud=%.1f%%, coverage=%.1f%%)",
        period_start, period_end, best.scene_id, best.rank_score or 0,
        best.cloud_cover or -1, best.aoi_overlap_pct or 0,
    )

    return best


def select_scene_set_for_period(
    scenes: list[NormalizedScene],
    aoi_bbox: list[float],
    period_start: str,
    period_end: str,
    required_bands: Optional[list[str]] = None,
    max_cloud_cover: float = 30.0,
    min_coverage_pct: float = 80.0,
) -> list[NormalizedScene]:
    """
    Select a SET of scenes that together cover the AOI for a period.

    When a single scene doesn't cover the full AOI, this selects
    multiple scenes whose combined coverage meets the threshold.
    """
    # First try single best scene
    best = select_best_scene_for_period(
        scenes, aoi_bbox, period_start, period_end,
        required_bands, max_cloud_cover,
    )

    if best and (best.aoi_overlap_pct or 0) >= min_coverage_pct:
        return [best]

    # Need multiple scenes — greedy coverage expansion
    selected = []
    remaining_scenes = list(scenes)
    covered_pct = 0.0

    while covered_pct < min_coverage_pct / 100.0 and remaining_scenes:
        # Find the scene that adds the most new coverage
        best_addition = None
        best_new_coverage = 0.0

        for scene in remaining_scenes:
            # Estimate new coverage by checking overlap with already-selected
            candidate_bboxes = [s.bbox for s in selected] + [scene.bbox]
            # Simple: take union of all bboxes
            if candidate_bboxes:
                all_west = min(b[0] for b in candidate_bboxes if b)
                all_south = min(b[1] for b in candidate_bboxes if b)
                all_east = max(b[2] for b in candidate_bboxes if b)
                all_north = max(b[3] for b in candidate_bboxes if b)
                union_bbox = [all_west, all_south, all_east, all_north]
                new_coverage = compute_aoi_coverage(union_bbox, aoi_bbox)
                marginal = new_coverage - covered_pct
                if marginal > best_new_coverage:
                    best_new_coverage = marginal
                    best_addition = scene

        if best_addition is None or best_new_coverage < 0.01:
            break

        selected.append(best_addition)
        remaining_scenes.remove(best_addition)

        # Recompute coverage
        all_bboxes = [s.bbox for s in selected if s.bbox]
        if all_bboxes:
            union_bbox = [
                min(b[0] for b in all_bboxes),
                min(b[1] for b in all_bboxes),
                max(b[2] for b in all_bboxes),
                max(b[3] for b in all_bboxes),
            ]
            covered_pct = compute_aoi_coverage(union_bbox, aoi_bbox)

    logger.info(
        "[Discovery] Selected %d scenes for period %s–%s, coverage=%.1f%%",
        len(selected), period_start, period_end, covered_pct * 100,
    )

    return selected


# ══════════════════════════════════════════════════════════════════
# Discovery Summary (for UI)
# ══════════════════════════════════════════════════════════════════

@dataclass
class DiscoverySummary:
    """Rich metadata about what was discovered — for the UI."""
    collection: str
    provider: str
    total_scenes_found: int
    scenes_after_filtering: int
    date_range: str
    best_cloud_cover: Optional[float]
    best_aoi_coverage: Optional[float]
    resolution_m: Optional[float]
    platform: Optional[str]
    bands_used: list[str]
    composite_status: str          # "single_scene" | "multi_scene_composite" | "partial_coverage"
    uncovered_portions: list[list[float]]
    period1_scenes: list[str]
    period2_scenes: list[str]


def build_discovery_summary(
    period1_scenes: list[NormalizedScene],
    period2_scenes: list[NormalizedScene],
    aoi_bbox: list[float],
    collection: str,
    provider: str,
) -> DiscoverySummary:
    """Build a rich discovery summary for the API response."""
    all_scenes = period1_scenes + period2_scenes

    cloud_covers = [s.cloud_cover for s in all_scenes if s.cloud_cover is not None]
    coverages = [s.aoi_overlap_pct for s in all_scenes if s.aoi_overlap_pct is not None]

    platforms = list(set(s.platform for s in all_scenes if s.platform))

    # Determine composite status
    if len(period1_scenes) > 1 or len(period2_scenes) > 1:
        composite_status = "multi_scene_composite"
    elif all(c and c >= 80 for c in coverages if c is not None):
        composite_status = "single_scene"
    else:
        composite_status = "partial_coverage"

    return DiscoverySummary(
        collection=collection,
        provider=provider,
        total_scenes_found=len(all_scenes),
        scenes_after_filtering=len(all_scenes),
        date_range=f"{period1_scenes[0].datetime if period1_scenes else 'N/A'} — {period2_scenes[-1].datetime if period2_scenes else 'N/A'}",
        best_cloud_cover=min(cloud_covers) if cloud_covers else None,
        best_aoi_coverage=max(coverages) if coverages else None,
        resolution_m=all_scenes[0].gsd if all_scenes else None,
        platform=platforms[0] if platforms else None,
        bands_used=list(set(b for s in all_scenes for b in s.bands_available)),
        composite_status=composite_status,
        uncovered_portions=find_uncovered_portions(all_scenes, aoi_bbox),
        period1_scenes=[s.scene_id for s in period1_scenes],
        period2_scenes=[s.scene_id for s in period2_scenes],
    )
