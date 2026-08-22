"""
Evidence ranking engine for satellite scene selection.

Deterministic, configurable scoring of STAC scenes for analytical suitability.
No LLM — pure numerical scoring with documented weights.

Scoring dimensions:
- cloud quality (weight: 0.25)
- AOI coverage (weight: 0.25)
- temporal suitability (weight: 0.15)
- seasonal similarity (weight: 0.10)
- sensor suitability (weight: 0.10)
- spatial resolution (weight: 0.05)
- data quality (weight: 0.05)
- band availability (weight: 0.05)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Optional

import numpy as np

logger = logging.getLogger(__name__)


# ── Configurable weights ─────────────────────────────────────────

DEFAULT_WEIGHTS = {
    "cloud": 0.25,
    "coverage": 0.25,
    "temporal": 0.15,
    "seasonal": 0.10,
    "sensor": 0.10,
    "resolution": 0.05,
    "data_quality": 0.05,
    "band_availability": 0.05,
}

# Maximum cloud cover considered "perfect" for scoring
CLOUD_EXCELLENT = 5.0
CLOUD_GOOD = 20.0
CLOUD_ACCEPTABLE = 50.0

# Coverage thresholds
COVERAGE_COMPLETE = 95.0
COVERAGE_GOOD = 75.0
COVERAGE_ACCEPTABLE = 50.0

# Seasonal matching tolerance (days)
SEASONAL_TOLERANCE_DAYS = 15

# Temporal decay: half-life in days from target date
TEMPORAL_HALF_LIFE_DAYS = 30

# Known sensor quality scores (0-100)
SENSOR_QUALITY = {
    "sentinel-2-l2a": 95,
    "sentinel-2-l1c": 85,
    "landsat-c2-l2": 90,
    "landsat-c2-l1": 80,
    "sentinel-1-grd": 85,
    "naip": 75,
    "io-lulc-annual-v02": 60,
}

# Known resolution scores (better resolution = higher score)
RESOLUTION_SCORES = {
    # meters: score
    0.5: 95, 1: 90, 3: 85, 10: 75, 15: 70, 20: 65, 30: 55, 60: 40,
}


@dataclass
class ComponentScore:
    """Score for a single dimension."""

    dimension: str
    score: float  # 0-100
    weight: float
    weighted: float  # score * weight
    reason: str


@dataclass
class SceneRanking:
    """Full ranking result for a single scene."""

    item_id: str
    overall_score: float  # 0-100, weighted sum
    components: list[ComponentScore]
    reasons: list[str]
    rejection_reasons: list[str]
    suitable: bool  # overall_score > 50 and no rejections


@dataclass
class EvidenceResult:
    """Result of evidence ranking for multiple scenes."""

    status: str
    total_scenes: int
    suitable_count: int
    rejected_count: int
    rankings: list[SceneRanking]
    best_scene: Optional[SceneRanking]
    weights: dict[str, float]
    processing_steps: list[dict[str, str]]


# ── Component scoring functions ──────────────────────────────────


def score_cloud(cloud_cover: Optional[float]) -> tuple[float, str]:
    """
    Score cloud cover quality.

    0-5% cloud → 100 (excellent)
    5-20%      → 80-100 (good)
    20-50%     → 40-80 (acceptable)
    50-100%    → 0-40 (poor)
    None       → 70 (unknown, assume reasonable)
    """
    if cloud_cover is None:
        return 70.0, "Cloud cover unknown, defaulting to 70"

    if cloud_cover <= CLOUD_EXCELLENT:
        score = 100.0 - (cloud_cover / CLOUD_EXCELLENT) * 5.0
        return score, f"Excellent cloud cover: {cloud_cover:.1f}%"

    if cloud_cover <= CLOUD_GOOD:
        score = 95.0 - ((cloud_cover - CLOUD_EXCELLENT) / (CLOUD_GOOD - CLOUD_EXCELLENT)) * 15.0
        return score, f"Good cloud cover: {cloud_cover:.1f}%"

    if cloud_cover <= CLOUD_ACCEPTABLE:
        score = 80.0 - ((cloud_cover - CLOUD_GOOD) / (CLOUD_ACCEPTABLE - CLOUD_GOOD)) * 40.0
        return score, f"Moderate cloud cover: {cloud_cover:.1f}%"

    score = max(0, 40.0 - ((cloud_cover - CLOUD_ACCEPTABLE) / (100 - CLOUD_ACCEPTABLE)) * 40.0)
    return score, f"High cloud cover: {cloud_cover:.1f}%"


def score_coverage(
    scene_bbox: list[float], aoi_bbox: list[float]
) -> tuple[float, str]:
    """
    Score spatial coverage of the AOI by the scene.

    Uses intersection-over-union (IoU) of bounding boxes.
    """
    # Compute intersection
    ix_min = max(scene_bbox[0], aoi_bbox[0])
    iy_min = max(scene_bbox[1], aoi_bbox[1])
    ix_max = min(scene_bbox[2], aoi_bbox[2])
    iy_max = min(scene_bbox[3], aoi_bbox[3])

    if ix_min >= ix_max or iy_min >= iy_max:
        return 0.0, "No spatial overlap with AOI"

    intersection_area = (ix_max - ix_min) * (iy_max - iy_min)
    aoi_area = (aoi_bbox[2] - aoi_bbox[0]) * (aoi_bbox[3] - aoi_bbox[1])

    if aoi_area <= 0:
        return 0.0, "Invalid AOI area"

    coverage_pct = (intersection_area / aoi_area) * 100.0

    if coverage_pct >= COVERAGE_COMPLETE:
        return 100.0, f"Complete AOI coverage: {coverage_pct:.1f}%"
    elif coverage_pct >= COVERAGE_GOOD:
        score = 70.0 + (coverage_pct - COVERAGE_GOOD) / (COVERAGE_COMPLETE - COVERAGE_GOOD) * 30.0
        return score, f"Good AOI coverage: {coverage_pct:.1f}%"
    elif coverage_pct >= COVERAGE_ACCEPTABLE:
        score = 40.0 + (coverage_pct - COVERAGE_ACCEPTABLE) / (COVERAGE_GOOD - COVERAGE_ACCEPTABLE) * 30.0
        return score, f"Partial AOI coverage: {coverage_pct:.1f}%"
    else:
        score = coverage_pct / COVERAGE_ACCEPTABLE * 40.0
        return score, f"Low AOI coverage: {coverage_pct:.1f}%"


def score_temporal(
    scene_date: Optional[str],
    target_start: Optional[str],
    target_end: Optional[str],
) -> tuple[float, str]:
    """
    Score temporal suitability based on proximity to target window center.

    Closer to the center of the target date range = higher score.
    """
    if not scene_date or not target_start or not target_end:
        return 60.0, "Insufficient date info for temporal scoring"

    try:
        # Strip timezone info to avoid offset-naive vs offset-aware errors
        scene_str = scene_date.replace("Z", "").split("+")[0].split("T")[0]
        start_str = target_start.replace("Z", "").split("+")[0]
        end_str = target_end.replace("Z", "").split("+")[0]

        scene_dt = datetime.fromisoformat(scene_str)
        start_dt = datetime.fromisoformat(start_str)
        end_dt = datetime.fromisoformat(end_str)
    except (ValueError, AttributeError):
        return 60.0, "Could not parse dates for temporal scoring"

    center = start_dt + (end_dt - start_dt) / 2
    half_range = max((end_dt - start_dt).days / 2, 1)
    distance_days = abs((scene_dt - center).days)

    if distance_days == 0:
        return 100.0, "Scene at exact center of target window"

    # Exponential decay from center
    score = 100.0 * (0.5 ** (distance_days / max(half_range, 1)))
    score = max(0, min(100, score))

    return score, f"Scene is {distance_days} days from target window center"


def score_seasonal(
    scene_date: Optional[str],
    target_month: Optional[int],
) -> tuple[float, str]:
    """
    Score seasonal similarity — how close the scene month is to the target month.

    Useful when comparing across years (e.g. Jan 2023 vs Jan 2024).
    """
    if not scene_date or not target_month:
        return 70.0, "Insufficient info for seasonal scoring"

    try:
        scene_dt = datetime.fromisoformat(scene_date.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return 70.0, "Could not parse scene date for seasonal scoring"

    scene_month = scene_dt.month
    month_diff = abs(scene_month - target_month)
    # Handle wrapping (Dec=12, Jan=1 → diff=1, not 11)
    month_diff = min(month_diff, 12 - month_diff)

    if month_diff == 0:
        return 100.0, f"Same month as target (month {target_month})"
    elif month_diff <= 1:
        return 90.0, f"±1 month from target (month {target_month})"
    elif month_diff <= 2:
        return 75.0, f"±2 months from target"
    elif month_diff <= 3:
        return 60.0, f"±3 months from target"
    else:
        score = max(10, 60.0 - (month_diff - 3) * 10)
        return score, f"{month_diff} months from target season"


def score_sensor(collection: str) -> tuple[float, str]:
    """Score based on known sensor quality for the analysis task."""
    score = SENSOR_QUALITY.get(collection, 50)
    return float(score), f"Sensor quality for {collection}: {score}/100"


def score_resolution(properties: dict) -> tuple[float, str]:
    """Score spatial resolution from item properties."""
    gsd = properties.get("gsd")
    if gsd is None:
        return 60.0, "Resolution unknown, defaulting to 60"

    # Find closest known resolution
    best_score = 40
    for res_m, score in RESOLUTION_SCORES.items():
        if abs(gsd - res_m) < abs(gsd - list(RESOLUTION_SCORES.keys())[0]):
            best_score = score

    # Linear interpolation
    sorted_res = sorted(RESOLUTION_SCORES.items())
    for i, (res, score) in enumerate(sorted_res):
        if gsd <= res:
            if i == 0:
                return float(score), f"Resolution {gsd}m: {score}/100"
            prev_res, prev_score = sorted_res[i - 1]
            frac = (gsd - prev_res) / (res - prev_res) if res != prev_res else 0
            interp = prev_score + frac * (score - prev_score)
            return interp, f"Resolution {gsd}m: {interp:.0f}/100"

    return float(best_score), f"Resolution {gsd}m: {best_score}/100"


def score_data_quality(properties: dict) -> tuple[float, str]:
    """Score overall data quality from available metadata."""
    score = 70.0  # baseline
    reasons = []

    # Check for quality indicators
    if properties.get("processing:level"):
        score += 5
        reasons.append(f"Processing level: {properties['processing:level']}")

    if properties.get("eo:instrument"):
        score += 5
        reasons.append(f"Instrument: {properties['eo:instrument']}")

    if properties.get("platform"):
        score += 5
        reasons.append(f"Platform: {properties['platform']}")

    # Penalize if radiometric calibration info missing
    if not properties.get("radiometric_calibration"):
        score -= 5

    score = max(0, min(100, score))
    reason = "; ".join(reasons) if reasons else "Baseline data quality score"
    return score, reason


def score_band_availability(
    assets: dict[str, Any],
    required_bands: Optional[list[str]],
) -> tuple[float, str]:
    """Score availability of required bands."""
    if not required_bands:
        return 90.0, "No specific bands requested, defaulting to 90"

    available = set(assets.keys())
    found = [b for b in required_bands if b in available]
    missing = [b for b in required_bands if b not in available]

    coverage = len(found) / len(required_bands) if required_bands else 1.0
    score = coverage * 100

    if not missing:
        return score, f"All {len(required_bands)} required bands available"
    else:
        return score, f"{len(found)}/{len(required_bands)} bands available, missing: {', '.join(missing)}"


# ── Rejection rules ──────────────────────────────────────────────


def check_rejections(
    scene: dict[str, Any],
    aoi_bbox: list[float],
    max_cloud_cover: Optional[float] = None,
    required_bands: Optional[list[str]] = None,
) -> list[str]:
    """Check if a scene should be rejected outright."""
    rejections = []
    props = scene.get("properties", {})

    # Cloud cover hard reject
    cloud = props.get("eo:cloud_cover")
    if cloud is not None and max_cloud_cover is not None and cloud > max_cloud_cover:
        rejections.append(f"Cloud cover {cloud:.1f}% exceeds threshold {max_cloud_cover}%")

    # No spatial overlap
    scene_bbox = scene.get("bbox")
    if scene_bbox:
        ix_min = max(scene_bbox[0], aoi_bbox[0])
        ix_max = min(scene_bbox[2], aoi_bbox[2])
        iy_min = max(scene_bbox[1], aoi_bbox[1])
        iy_max = min(scene_bbox[3], aoi_bbox[3])
        if ix_min >= ix_max or iy_min >= iy_max:
            rejections.append("No spatial overlap with AOI")

    # Missing required bands
    if required_bands:
        assets = scene.get("assets", {})
        available = set(assets.keys())
        missing = [b for b in required_bands if b not in available]
        if missing:
            rejections.append(f"Missing required bands: {', '.join(missing)}")

    return rejections


# ── Main ranking function ────────────────────────────────────────


def rank_scene(
    scene: dict[str, Any],
    aoi_bbox: list[float],
    target_start: Optional[str] = None,
    target_end: Optional[str] = None,
    target_month: Optional[int] = None,
    required_bands: Optional[list[str]] = None,
    max_cloud_cover: Optional[float] = None,
    weights: Optional[dict[str, float]] = None,
) -> SceneRanking:
    """
    Rank a single scene for analytical suitability.

    Returns a SceneRanking with component scores, reasons, and rejections.
    """
    w = weights or DEFAULT_WEIGHTS
    props = scene.get("properties", {})
    scene_bbox = scene.get("bbox", [0, 0, 0, 0])
    assets = scene.get("assets", {})

    # Check rejections first
    rejections = check_rejections(scene, aoi_bbox, max_cloud_cover, required_bands)

    # Compute component scores
    components = []

    # Cloud
    cloud_val = props.get("eo:cloud_cover")
    c_score, c_reason = score_cloud(cloud_val)
    components.append(ComponentScore("cloud", c_score, w.get("cloud", 0.25), c_score * w.get("cloud", 0.25), c_reason))

    # Coverage
    cov_score, cov_reason = score_coverage(scene_bbox, aoi_bbox)
    components.append(ComponentScore("coverage", cov_score, w.get("coverage", 0.25), cov_score * w.get("coverage", 0.25), cov_reason))

    # Temporal
    scene_date = props.get("datetime")
    temp_score, temp_reason = score_temporal(scene_date, target_start, target_end)
    components.append(ComponentScore("temporal", temp_score, w.get("temporal", 0.15), temp_score * w.get("temporal", 0.15), temp_reason))

    # Seasonal
    seas_score, seas_reason = score_seasonal(scene_date, target_month)
    components.append(ComponentScore("seasonal", seas_score, w.get("seasonal", 0.10), seas_score * w.get("seasonal", 0.10), seas_reason))

    # Sensor
    collection = scene.get("collection", "unknown")
    sen_score, sen_reason = score_sensor(collection)
    components.append(ComponentScore("sensor", sen_score, w.get("sensor", 0.10), sen_score * w.get("sensor", 0.10), sen_reason))

    # Resolution
    res_score, res_reason = score_resolution(props)
    components.append(ComponentScore("resolution", res_score, w.get("resolution", 0.05), res_score * w.get("resolution", 0.05), res_reason))

    # Data quality
    dq_score, dq_reason = score_data_quality(props)
    components.append(ComponentScore("data_quality", dq_score, w.get("data_quality", 0.05), dq_score * w.get("data_quality", 0.05), dq_reason))

    # Band availability
    ba_score, ba_reason = score_band_availability(assets, required_bands)
    components.append(ComponentScore("band_availability", ba_score, w.get("band_availability", 0.05), ba_score * w.get("band_availability", 0.05), ba_reason))

    # Overall score
    overall = sum(c.weighted for c in components)

    # Build reasons from top components
    sorted_components = sorted(components, key=lambda c: c.weighted, reverse=True)
    reasons = [c.reason for c in sorted_components[:3]]

    # Determine suitability
    suitable = overall > 50 and len(rejections) == 0

    if not suitable and rejections:
        reasons.append(f"REJECTED: {'; '.join(rejections)}")

    return SceneRanking(
        item_id=scene.get("id", "unknown"),
        overall_score=round(overall, 2),
        components=components,
        reasons=reasons,
        rejection_reasons=rejections,
        suitable=suitable,
    )


def rank_scenes(
    scenes: list[dict[str, Any]],
    aoi_bbox: list[float],
    target_start: Optional[str] = None,
    target_end: Optional[str] = None,
    target_month: Optional[int] = None,
    required_bands: Optional[list[str]] = None,
    max_cloud_cover: Optional[float] = None,
    weights: Optional[dict[str, float]] = None,
    top_n: Optional[int] = None,
) -> EvidenceResult:
    """
    Rank multiple scenes by analytical suitability.

    Returns an EvidenceResult with ranked scenes, best scene, and diagnostics.
    """
    steps = []
    steps.append({"step": "init", "detail": f"Ranking {len(scenes)} candidate scenes"})

    # Rank all scenes
    rankings = []
    rejected_count = 0
    suitable_count = 0

    for scene in scenes:
        ranking = rank_scene(
            scene=scene,
            aoi_bbox=aoi_bbox,
            target_start=target_start,
            target_end=target_end,
            target_month=target_month,
            required_bands=required_bands,
            max_cloud_cover=max_cloud_cover,
            weights=weights,
        )
        rankings.append(ranking)
        if ranking.suitable:
            suitable_count += 1
        else:
            rejected_count += 1

    steps.append({"step": "rank", "detail": f"Scored {len(scenes)} scenes: {suitable_count} suitable, {rejected_count} rejected"})

    # Sort by overall score (descending)
    rankings.sort(key=lambda r: r.overall_score, reverse=True)

    steps.append({"step": "sort", "detail": f"Sorted by overall score descending"})

    # Apply top_n
    if top_n is not None and top_n > 0:
        rankings = rankings[:top_n]
        steps.append({"step": "select", "detail": f"Selected top {top_n} scenes"})

    best = rankings[0] if rankings else None

    status = "ok"
    if not rankings:
        status = "no_scenes"
    elif suitable_count == 0:
        status = "no_suitable_scenes"

    return EvidenceResult(
        status=status,
        total_scenes=len(scenes),
        suitable_count=suitable_count,
        rejected_count=rejected_count,
        rankings=rankings,
        best_scene=best,
        weights=weights or DEFAULT_WEIGHTS,
        processing_steps=steps,
    )
