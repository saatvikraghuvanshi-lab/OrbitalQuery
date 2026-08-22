"""
Flood Impact Intelligence — complete vertical workflow.

Orchestrates:
1. Query parsing → structured plan
2. Pre/post event scene discovery (S1 + S2)
3. Scene ranking via evidence engine
4. Pre/post data retrieval
5. Flood detection (SAR thresholding)
6. Change map generation
7. Area statistics
8. Evidence package assembly

No LLM. Deterministic pipeline. Reproducible results.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional

import numpy as np

from app.services.flood_detection import detect_flood, FloodResult
from app.services.query_parser import parse_query, AnalysisPlan
from app.services.sentinel1 import search_sentinel1
from app.services.stac_service import search_stac
from app.services.evidence_ranking import rank_scenes
from app.services.sensor_registry import get_sensor

logger = logging.getLogger(__name__)


@dataclass
class SceneSelection:
    """Selected scene with metadata."""

    item_id: str
    sensor: str  # sentinel-1-grd or sentinel-2-l2a
    role: str  # pre_event or post_event
    datetime: str
    polarization: Optional[list[str]] = None
    orbit_direction: Optional[str] = None
    cloud_cover: Optional[float] = None
    bbox: Optional[list[float]] = None
    score: Optional[float] = None
    assets: Optional[list[str]] = None


@dataclass
class FloodEvidencePackage:
    """Complete evidence package for a flood assessment."""

    analysis_id: str
    query: str
    analysis_plan: dict[str, Any]
    aoi_bbox: list[float]
    event_date: Optional[str]
    selected_scenes: list[dict[str, Any]]
    processing_steps: list[dict[str, str]]
    method: str
    statistics: dict[str, Any]
    change_map_summary: dict[str, Any]
    confidence: str
    limitations: list[str]
    evidence: dict[str, Any]
    status: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "analysis_id": self.analysis_id,
            "query": self.query,
            "analysis_plan": self.analysis_plan,
            "aoi_bbox": self.aoi_bbox,
            "event_date": self.event_date,
            "selected_scenes": self.selected_scenes,
            "processing_steps": self.processing_steps,
            "method": self.method,
            "statistics": self.statistics,
            "change_map_summary": self.change_map_summary,
            "confidence": self.confidence,
            "limitations": self.limitations,
            "evidence": self.evidence,
            "status": self.status,
        }


def _generate_analysis_id() -> str:
    """Generate a unique, readable analysis ID."""
    ts = datetime.utcnow().strftime("%Y%m%d%H%M")
    short = uuid.uuid4().hex[:6]
    return f"flood-{ts}-{short}"


def _scene_to_selection(scene_dict: dict, sensor: str, role: str) -> SceneSelection:
    """Convert a scene dict to a SceneSelection."""
    props = scene_dict.get("properties", {})
    return SceneSelection(
        item_id=scene_dict.get("id", "unknown"),
        sensor=sensor,
        role=role,
        datetime=props.get("datetime", "unknown"),
        polarization=props.get("sar", {}).get("polarizations"),
        orbit_direction=props.get("sat", {}).get("orbit_state"),
        cloud_cover=props.get("eo:cloud_cover"),
        bbox=scene_dict.get("bbox"),
        assets=list(scene_dict.get("assets", {}).keys()),
    )


def run_flood_assessment(
    query: str,
    aoi_bbox: list[float],
    event_date: Optional[str] = None,
    max_cloud_cover: int = 30,
    vv_threshold: float = 3.0,
    pre_vv_db: Optional[np.ndarray] = None,
    post_vv_db: Optional[np.ndarray] = None,
    pre_vh_db: Optional[np.ndarray] = None,
    post_vh_db: Optional[np.ndarray] = None,
    resolution_meters: float = 10.0,
) -> FloodEvidencePackage:
    """
    Run the complete flood impact assessment pipeline.

    When pre/post backscatter arrays are provided directly,
    the pipeline skips scene search and goes straight to detection.

    When arrays are NOT provided, the pipeline searches STAC
    and reports what scenes were found (metadata-only mode).
    """
    analysis_id = _generate_analysis_id()
    steps = []
    selected_scenes = []
    warnings = []
    limitations = []

    # ── Step 1: Parse query ───────────────────────────────────
    steps.append({"step": "parse_query", "detail": f"Parsing: '{query[:80]}...'"})
    plan = parse_query(query, aoi_bbox, event_date)

    # Use parsed plan values if not provided
    if not aoi_bbox and plan.aoi_bbox:
        aoi_bbox = plan.aoi_bbox
    if not event_date and plan.event_date:
        event_date = plan.event_date

    steps.append({"step": "analysis_plan", "detail": f"Type: {plan.analysis_type}, Location: {plan.aoi_description}, Event: {event_date or 'not specified'}"})
    warnings.extend(plan.warnings)

    if not aoi_bbox:
        return FloodEvidencePackage(
            analysis_id=analysis_id,
            query=query,
            analysis_plan=plan.parsed_entities,
            aoi_bbox=[],
            event_date=event_date,
            selected_scenes=[],
            processing_steps=steps + [{"step": "error", "detail": "No AOI specified"}],
            method="sar_backscatter_threshold",
            statistics={},
            change_map_summary={},
            confidence="low",
            limitations=["Cannot proceed without AOI bounding box"],
            evidence={},
            status="error_no_aoi",
        )

    # ── Step 2: Discover Sentinel-1 scenes ────────────────────
    s1_pre_scenes = []
    s1_post_scenes = []

    if plan.pre_event_start and plan.pre_event_end:
        steps.append({"step": "search_s1_pre", "detail": f"Searching S1 pre-event: {plan.pre_event_start} to {plan.pre_event_end}"})
        try:
            s1_pre_result = search_sentinel1(
                bbox=aoi_bbox,
                start_date=plan.pre_event_start,
                end_date=plan.pre_event_end,
                limit=10,
            )
            s1_pre_scenes = [s.to_dict() for s in s1_pre_result.scenes]
            steps.append({"step": "search_s1_pre_done", "detail": f"Found {len(s1_pre_scenes)} pre-event S1 scenes"})
        except Exception as e:
            steps.append({"step": "search_s1_pre_error", "detail": f"S1 pre-search failed: {str(e)[:100]}"})
            warnings.append(f"S1 pre-event search failed: {str(e)[:100]}")

    if plan.post_event_start and plan.post_event_end:
        steps.append({"step": "search_s1_post", "detail": f"Searching S1 post-event: {plan.post_event_start} to {plan.post_event_end}"})
        try:
            s1_post_result = search_sentinel1(
                bbox=aoi_bbox,
                start_date=plan.post_event_start,
                end_date=plan.post_event_end,
                limit=10,
            )
            s1_post_scenes = [s.to_dict() for s in s1_post_result.scenes]
            steps.append({"step": "search_s1_post_done", "detail": f"Found {len(s1_post_scenes)} post-event S1 scenes"})
        except Exception as e:
            steps.append({"step": "search_s1_post_error", "detail": f"S1 post-search failed: {str(e)[:100]}"})
            warnings.append(f"S1 post-event search failed: {str(e)[:100]}")

    # ── Step 3: Rank scenes ───────────────────────────────────
    if s1_pre_scenes:
        steps.append({"step": "rank_s1_pre", "detail": f"Ranking {len(s1_pre_scenes)} pre-event scenes"})
        try:
            pre_result = rank_scenes(
                scenes=s1_pre_scenes,
                aoi_bbox=aoi_bbox,
                target_start=plan.pre_event_start,
                target_end=plan.pre_event_end,
                top_n=1,
            )
            if pre_result.best_scene:
                sel = _scene_to_selection(
                    next((s for s in s1_pre_scenes if s["id"] == pre_result.best_scene.item_id), s1_pre_scenes[0]),
                    "sentinel-1-grd",
                    "pre_event",
                )
                sel.score = pre_result.best_scene.overall_score
                selected_scenes.append(sel)
                steps.append({"step": "select_pre", "detail": f"Selected pre-event: {sel.item_id} (score: {sel.score})"})
        except Exception as e:
            steps.append({"step": "rank_pre_error", "detail": f"Ranking failed: {str(e)[:100]}"})

    if s1_post_scenes:
        steps.append({"step": "rank_s1_post", "detail": f"Ranking {len(s1_post_scenes)} post-event scenes"})
        try:
            post_result = rank_scenes(
                scenes=s1_post_scenes,
                aoi_bbox=aoi_bbox,
                target_start=plan.post_event_start,
                target_end=plan.post_event_end,
                top_n=1,
            )
            if post_result.best_scene:
                sel = _scene_to_selection(
                    next((s for s in s1_post_scenes if s["id"] == post_result.best_scene.item_id), s1_post_scenes[0]),
                    "sentinel-1-grd",
                    "post_event",
                )
                sel.score = post_result.best_scene.overall_score
                selected_scenes.append(sel)
                steps.append({"step": "select_post", "detail": f"Selected post-event: {sel.item_id} (score: {sel.score})"})
        except Exception as e:
            steps.append({"step": "rank_post_error", "detail": f"Ranking failed: {str(e)[:100]}"})

    # ── Step 4: Flood detection (if arrays provided) ──────────
    flood_result: Optional[FloodResult] = None

    if pre_vv_db is not None and post_vv_db is not None:
        steps.append({"step": "flood_detection", "detail": f"Running SAR flood detection (shapes: pre={pre_vv_db.shape}, post={post_vv_db.shape})"})
        try:
            flood_result = detect_flood(
                pre_vv_db=pre_vv_db,
                post_vv_db=post_vv_db,
                pre_vh_db=pre_vh_db,
                post_vh_db=post_vh_db,
                aoi_bbox=aoi_bbox,
                vv_threshold=vv_threshold,
                resolution_meters=resolution_meters,
            )
            steps.extend(flood_result.processing_steps)
            limitations.extend(flood_result.limitations)
        except Exception as e:
            steps.append({"step": "flood_detection_error", "detail": f"Detection failed: {str(e)[:100]}"})
            limitations.append(f"Flood detection failed: {str(e)[:100]}")
    else:
        steps.append({"step": "no_raster_data", "detail": "No backscatter arrays provided — metadata-only mode"})
        limitations.append("No raster data provided — only scene metadata returned. Provide pre_vv_db and post_vv_db for flood detection.")

    # ── Step 5: Assemble evidence package ─────────────────────
    statistics = {}
    change_map_summary = {}
    method = "sar_backscatter_threshold"
    confidence = "medium"
    status = "ok"

    if flood_result:
        statistics = flood_result.statistics
        change_map_summary = {
            "flood_extent_pct": flood_result.flood_extent_pct,
            "flood_area_sq_meters": flood_result.flood_area_sq_meters,
            "num_flood_regions": flood_result.num_flood_regions,
            "largest_region_sq_meters": flood_result.largest_flood_region_sq_meters,
        }
        method = flood_result.method
        confidence = flood_result.confidence
        status = flood_result.status
    else:
        status = "metadata_only"
        confidence = "low"
        limitations.append("Flood extent not computed — provide SAR backscatter arrays")

    evidence = {
        "s1_pre_scenes_found": len(s1_pre_scenes),
        "s1_post_scenes_found": len(s1_post_scenes),
        "selected_pre_event": selected_scenes[0].item_id if len(selected_scenes) > 0 else None,
        "selected_post_event": selected_scenes[1].item_id if len(selected_scenes) > 1 else None,
        "plan_confidence": plan.confidence,
        "aoi_source": plan.aoi_description,
        "date_source": plan.parsed_entities.get("event_date_source", "unknown"),
    }

    steps.append({"step": "assemble_evidence", "detail": f"Evidence package assembled. Status: {status}, Confidence: {confidence}"})

    return FloodEvidencePackage(
        analysis_id=analysis_id,
        query=query,
        analysis_plan=plan.parsed_entities,
        aoi_bbox=aoi_bbox,
        event_date=event_date,
        selected_scenes=[s.__dict__ if hasattr(s, '__dict__') else s for s in selected_scenes],
        processing_steps=steps,
        method=method,
        statistics=statistics,
        change_map_summary=change_map_summary,
        confidence=confidence,
        limitations=limitations,
        evidence=evidence,
        status=status,
    )
