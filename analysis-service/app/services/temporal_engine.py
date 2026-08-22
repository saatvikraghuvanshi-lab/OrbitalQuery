"""
Temporal Earth Observation data engine.

Given an AOI, collection, date range, cloud threshold, and scene limit:
1. Discovers suitable STAC observations
2. Ranks, filters, and deduplicates scenes
3. Constructs a lazy temporal datacube via stackstac + xarray

Every transformation is explicit. Nothing is silently resampled or reprojected.
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Optional

import numpy as np
import planetary_computer as pc
import stackstac
from pyproj import Transformer
from shapely.geometry import box as shapely_box
from shapely.ops import transform as shapely_transform

from app.services.stac_service import get_stac_client

logger = logging.getLogger(__name__)


# ── Data classes ────────────────────────────────────────────────────

@dataclass
class SceneCandidate:
    """A single STAC item candidate with metadata for ranking."""

    item_id: str
    item_dict: dict[str, Any]
    datetime_str: str
    cloud_cover: float
    bbox: list[float]
    geometry: dict[str, Any]
    assets: list[str]
    gsd: Optional[float] = None
    coverage_pct: float = 0.0  # AOI coverage percentage
    score: float = 0.0

    @property
    def datetime_obj(self) -> datetime:
        return datetime.fromisoformat(self.datetime_str.replace("Z", "+00:00"))


@dataclass
class RejectionRecord:
    """Why a scene was rejected."""

    item_id: str
    reason: str
    detail: str = ""


@dataclass
class TemporalAnalysisResult:
    """Complete result of a temporal analysis request."""

    analysis_id: str
    status: str
    collection: str
    aoi_bbox: list[float]
    date_range: list[str]
    bands: list[str]
    crs: str
    resolution_meters: Optional[float]
    cube_shape: list[int]
    cube_dims: dict[str, int]
    scenes_discovered: int
    scenes_rejected: int
    scenes_selected: int
    selected_scenes: list[dict[str, Any]]
    acquisition_dates: list[str]
    cloud_covers: list[float]
    processing_steps: list[dict[str, str]]
    diagnostics: dict[str, Any]
    rejection_reasons: list[dict[str, str]]


# ── Scene discovery ─────────────────────────────────────────────────

def discover_scenes(
    collection: str,
    bbox: list[float],
    start_date: date,
    end_date: date,
    max_cloud_cover: int,
    max_scenes: int,
) -> list[dict[str, Any]]:
    """
    Search STAC API for all matching scenes in the date range.

    Fetches up to 3x the requested limit to have enough candidates
    after filtering/ranking.
    """
    client = get_stac_client()
    datetime_str = f"{start_date.isoformat()}/{end_date.isoformat()}"

    # Fetch extra candidates for ranking
    fetch_limit = min(max_scenes * 3, 100)

    logger.info(
        "Discovering scenes: collection=%s bbox=%s dates=%s cloud<=%d limit=%d",
        collection, bbox, datetime_str, max_cloud_cover, fetch_limit,
    )

    search = client.search(
        collections=[collection],
        bbox=bbox,
        datetime=datetime_str,
        max_items=fetch_limit,
        query={"eo:cloud_cover": {"lt": max_cloud_cover}},
    )

    items = list(search.items())
    total = search.matched() or len(items)

    logger.info("Discovered %d scenes (total matched: %d)", len(items), total)

    return [pc.sign(item).to_dict() for item in items]


# ── Scene filtering ─────────────────────────────────────────────────

def filter_scenes(
    items: list[dict[str, Any]],
    bbox: list[float],
    required_bands: Optional[list[str]] = None,
) -> tuple[list[SceneCandidate], list[RejectionRecord]]:
    """
    Filter discovered scenes.

    Rejection criteria:
    - No assets available
    - Required bands missing
    - No valid datetime
    - Zero spatial coverage of AOI
    """
    candidates = []
    rejected = []

    aoi_geom = shapely_box(bbox[0], bbox[1], bbox[2], bbox[3])

    for item in items:
        item_id = item.get("id", "unknown")
        props = item.get("properties", {})
        assets = item.get("assets", {})
        item_bbox = item.get("bbox")
        geometry = item.get("geometry")

        # Check datetime
        dt_str = props.get("datetime")
        if not dt_str:
            rejected.append(RejectionRecord(
                item_id=item_id,
                reason="no_datetime",
                detail="Scene has no datetime property",
            ))
            continue

        # Check assets
        asset_keys = list(assets.keys())
        # Filter out non-raster assets
        raster_keys = [
            k for k in asset_keys
            if k.lower() not in {"visual", "rendered_preview", "thumbnail", "preview", "quicklook", "tilejson"}
        ]
        if not raster_keys:
            rejected.append(RejectionRecord(
                item_id=item_id,
                reason="no_raster_assets",
                detail=f"Only non-raster assets: {asset_keys}",
            ))
            continue

        # Check required bands
        if required_bands:
            missing = [b for b in required_bands if b not in assets]
            if missing:
                rejected.append(RejectionRecord(
                    item_id=item_id,
                    reason="missing_bands",
                    detail=f"Missing bands: {missing}",
                ))
                continue

        # Compute spatial coverage
        coverage_pct = 0.0
        if item_bbox and geometry:
            try:
                scene_geom = shapely_box(
                    item_bbox[0], item_bbox[1], item_bbox[2], item_bbox[3]
                )
                intersection = aoi_geom.intersection(scene_geom)
                coverage_pct = (intersection.area / aoi_geom.area) * 100
            except Exception:
                coverage_pct = 0.0

        if coverage_pct < 10.0:
            rejected.append(RejectionRecord(
                item_id=item_id,
                reason="insufficient_coverage",
                detail=f"Scene covers only {coverage_pct:.1f}% of AOI",
            ))
            continue

        # Cloud cover
        cloud_cover = props.get("eo:cloud_cover", 0.0)

        # GSD (ground sampling distance)
        gsd = props.get("gsd")

        candidates.append(SceneCandidate(
            item_id=item_id,
            item_dict=item,
            datetime_str=dt_str,
            cloud_cover=cloud_cover,
            bbox=item_bbox or [],
            geometry=geometry or {},
            assets=raster_keys,
            gsd=gsd,
            coverage_pct=coverage_pct,
        ))

    return candidates, rejected


# ── Scene ranking ───────────────────────────────────────────────────

def rank_scenes(candidates: list[SceneCandidate]) -> list[SceneCandidate]:
    """
    Rank scenes by composite score.

    Score = weighted sum of:
    - Cloud cover (lower is better) — weight 0.5
    - Spatial coverage (higher is better) — weight 0.3
    - Recency (newer is better) — weight 0.2
    """
    if not candidates:
        return candidates

    max_date = max(c.datetime_obj for c in candidates)
    min_date = min(c.datetime_obj for c in candidates)
    date_range = (max_date - min_date).total_seconds() or 1

    for c in candidates:
        # Cloud cover score: 0 (100%) to 1 (0%)
        cloud_score = 1.0 - (c.cloud_cover / 100.0)

        # Coverage score: 0 to 1
        coverage_score = min(c.coverage_pct / 100.0, 1.0)

        # Recency score: 0 (oldest) to 1 (newest)
        days_ago = (max_date - c.datetime_obj).total_seconds()
        recency_score = 1.0 - (days_ago / date_range)

        c.score = (0.5 * cloud_score) + (0.3 * coverage_score) + (0.2 * recency_score)

    return sorted(candidates, key=lambda c: c.score, reverse=True)


# ── Duplicate removal ──────────────────────────────────────────────

def remove_duplicates(candidates: list[SceneCandidate]) -> list[SceneCandidate]:
    """
    Remove duplicate scenes (same date + similar bbox).

    Uses datetime truncation to day + bbox hash for deduplication.
    Keeps the higher-scored scene.
    """
    seen: dict[str, SceneCandidate] = {}

    for c in candidates:
        # Truncate to day for dedup
        day = c.datetime_str[:10]
        # Hash bbox to detect same pass
        bbox_hash = hashlib.md5(
            str([round(b, 2) for b in c.bbox]).encode()
        ).hexdigest()[:8]

        key = f"{day}_{bbox_hash}"

        if key not in seen:
            seen[key] = c
        elif c.score > seen[key].score:
            seen[key] = c

    return list(seen.values())


# ── Temporal sorting ────────────────────────────────────────────────

def sort_temporally(candidates: list[SceneCandidate]) -> list[SceneCandidate]:
    """Sort scenes by acquisition date (ascending)."""
    return sorted(candidates, key=lambda c: c.datetime_str)


# ── Datacube construction ──────────────────────────────────────────

def build_datacube(
    candidates: list[SceneCandidate],
    bbox: list[float],
    bands: list[str],
    target_crs: Optional[str] = None,
    target_resolution: Optional[float] = None,
) -> dict[str, Any]:
    """
    Construct a lazy temporal datacube using stackstac.

    Returns metadata about the cube without loading data into RAM.
    The cube is lazy — actual data is fetched on-demand via Dask.

    Every transformation (CRS, resolution) is explicit and logged.
    """
    if not candidates:
        raise ValueError("No candidates to build datacube")

    # Prepare STAC items for stackstac
    stac_items = [c.item_dict for c in candidates]

    # Determine output CRS from first item
    if target_crs is None:
        first_item = stac_items[0]
        proj = first_item.get("properties", {}).get("proj:epsg")
        if proj:
            target_crs = f"EPSG:{proj}"
        else:
            target_crs = "EPSG:4326"

    # Determine resolution
    if target_resolution is None:
        first_item = stac_items[0]
        gsd = first_item.get("properties", {}).get("gsd", 10.0)
        target_resolution = gsd

    processing_steps = [
        {"step": "stac_items_prepared", "detail": f"{len(stac_items)} items for stackstac"},
        {"step": "crs_set", "detail": f"Output CRS: {target_crs}"},
        {"step": "resolution_set", "detail": f"Target resolution: {target_resolution}m"},
    ]

    logger.info(
        "Building datacube: %d scenes, bands=%s, crs=%s, resolution=%sm",
        len(stac_items), bands, target_crs, target_resolution,
    )

    # Build lazy datacube with stackstac
    # rescale=False: keep raw integer values (Sentinel-2 = uint16)
    # This is explicit — no silent rescaling or dtype casting
    try:
        cube = stackstac.stack(
            stac_items,
            assets=bands,
            bounds_latlon=tuple(bbox),
            epsg=int(target_crs.split(":")[1]) if ":" in target_crs else 4326,
            resolution=target_resolution,
            rescale=False,
            chunksize=(1, len(bands), 512, 512),  # time, band, y, x
        )
    except Exception as e:
        logger.error("stackstac.stack failed: %s", e)
        raise RuntimeError(f"Failed to build datacube: {e}")

    # Cube dimensions — zip dim names with their sizes
    dims = dict(zip(cube.dims, cube.shape))
    shape = list(cube.shape)

    logger.info("Datacube shape: %s dims: %s", shape, dims)

    return {
        "cube": cube,
        "shape": shape,
        "dims": dims,
        "crs": target_crs,
        "resolution": target_resolution,
        "processing_steps": processing_steps,
    }


# ── Main orchestration ──────────────────────────────────────────────

def build_analysis_id(
    collection: str,
    bbox: list[float],
    start_date: date,
    end_date: date,
) -> str:
    """Generate a deterministic analysis ID from request parameters."""
    raw = f"{collection}:{bbox}:{start_date}:{end_date}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def run_timeseries_analysis(
    collection: str,
    bbox: list[float],
    start_date: date,
    end_date: date,
    max_cloud_cover: int,
    max_scenes: int,
    bands: list[str],
) -> TemporalAnalysisResult:
    """
    Full temporal analysis pipeline.

    1. Discover scenes
    2. Filter (coverage, bands, datetime)
    3. Rank by composite score
    4. Remove duplicates
    5. Sort temporally
    6. Select top N
    7. Build lazy datacube
    8. Return metadata (no data loaded into RAM)
    """
    analysis_id = build_analysis_id(collection, bbox, start_date, end_date)

    processing_steps: list[dict[str, str]] = []
    rejection_reasons: list[dict[str, str]] = []

    # ── Step 1: Discover ───────────────────────────────────────
    raw_items = discover_scenes(
        collection=collection,
        bbox=bbox,
        start_date=start_date,
        end_date=end_date,
        max_cloud_cover=max_cloud_cover,
        max_scenes=max_scenes,
    )
    scenes_discovered = len(raw_items)
    processing_steps.append({
        "step": "discover",
        "detail": f"Found {scenes_discovered} scenes from STAC",
    })

    # ── Step 2: Filter ─────────────────────────────────────────
    candidates, rejected = filter_scenes(
        items=raw_items,
        bbox=bbox,
        required_bands=bands,
    )
    for r in rejected:
        rejection_reasons.append({
            "item_id": r.item_id,
            "reason": r.reason,
            "detail": r.detail,
        })

    # Group rejection reasons
    rejection_counts: dict[str, int] = {}
    for r in rejected:
        rejection_counts[r.reason] = rejection_counts.get(r.reason, 0) + 1

    processing_steps.append({
        "step": "filter",
        "detail": f"{len(candidates)} passed, {len(rejected)} rejected",
    })

    # ── Step 3: Rank ───────────────────────────────────────────
    ranked = rank_scenes(candidates)
    processing_steps.append({
        "step": "rank",
        "detail": f"Ranked {len(ranked)} candidates by composite score",
    })

    # ── Step 4: Deduplicate ────────────────────────────────────
    deduped = remove_duplicates(ranked)
    processing_steps.append({
        "step": "deduplicate",
        "detail": f"{len(deduped)} unique scenes after removing duplicates",
    })

    # ── Step 5: Sort ───────────────────────────────────────────
    sorted_scenes = sort_temporally(deduped)
    processing_steps.append({
        "step": "sort_temporally",
        "detail": "Sorted by acquisition date (ascending)",
    })

    # ── Step 6: Select top N ───────────────────────────────────
    selected = sorted_scenes[:max_scenes]
    processing_steps.append({
        "step": "select",
        "detail": f"Selected {len(selected)} scenes (max_scenes={max_scenes})",
    })

    if not selected:
        return TemporalAnalysisResult(
            analysis_id=analysis_id,
            status="no_data",
            collection=collection,
            aoi_bbox=bbox,
            date_range=[start_date.isoformat(), end_date.isoformat()],
            bands=bands,
            crs="unknown",
            resolution_meters=None,
            cube_shape=[],
            cube_dims={},
            scenes_discovered=scenes_discovered,
            scenes_rejected=len(rejected),
            scenes_selected=0,
            selected_scenes=[],
            acquisition_dates=[],
            cloud_covers=[],
            processing_steps=processing_steps,
            diagnostics={
                "rejection_counts": rejection_counts,
                "total_rejected": len(rejected),
            },
            rejection_reasons=rejection_reasons,
        )

    # ── Step 7: Build datacube ─────────────────────────────────
    try:
        cube_result = build_datacube(
            candidates=selected,
            bbox=bbox,
            bands=bands,
        )
        processing_steps.extend(cube_result["processing_steps"])
        processing_steps.append({
            "step": "datacube_built",
            "detail": f"Lazy cube shape={cube_result['shape']}",
        })
    except Exception as e:
        logger.error("Datacube construction failed: %s", e)
        return TemporalAnalysisResult(
            analysis_id=analysis_id,
            status="error",
            collection=collection,
            aoi_bbox=bbox,
            date_range=[start_date.isoformat(), end_date.isoformat()],
            bands=bands,
            crs="unknown",
            resolution_meters=None,
            cube_shape=[],
            cube_dims={},
            scenes_discovered=scenes_discovered,
            scenes_rejected=len(rejected),
            scenes_selected=0,
            selected_scenes=[],
            acquisition_dates=[],
            cloud_covers=[],
            processing_steps=processing_steps,
            diagnostics={"error": str(e)},
            rejection_reasons=rejection_reasons,
        )

    # ── Build response ─────────────────────────────────────────
    selected_meta = []
    for s in selected:
        selected_meta.append({
            "item_id": s.item_id,
            "datetime": s.datetime_str,
            "cloud_cover": s.cloud_cover,
            "bbox": s.bbox,
            "coverage_pct": round(s.coverage_pct, 2),
            "score": round(s.score, 4),
            "assets_count": len(s.assets),
        })

    acquisition_dates = [s.datetime_str for s in selected]
    cloud_covers = [s.cloud_cover for s in selected]

    return TemporalAnalysisResult(
        analysis_id=analysis_id,
        status="ok",
        collection=collection,
        aoi_bbox=bbox,
        date_range=[start_date.isoformat(), end_date.isoformat()],
        bands=bands,
        crs=cube_result["crs"],
        resolution_meters=cube_result["resolution"],
        cube_shape=cube_result["shape"],
        cube_dims=cube_result["dims"],
        scenes_discovered=scenes_discovered,
        scenes_rejected=len(rejected),
        scenes_selected=len(selected),
        selected_scenes=selected_meta,
        acquisition_dates=acquisition_dates,
        cloud_covers=cloud_covers,
        processing_steps=processing_steps,
        diagnostics={
            "rejection_counts": rejection_counts,
            "total_rejected": len(rejected),
            "cube_chunksize": "(1, band_count, 512, 512)",
            "lazy": True,
        },
        rejection_reasons=rejection_reasons,
    )
