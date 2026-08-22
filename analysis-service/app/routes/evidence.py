"""Evidence ranking endpoint."""

from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.evidence_ranking import (
    DEFAULT_WEIGHTS,
    EvidenceResult,
    rank_scenes,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analysis", tags=["evidence"])


class EvidenceSceneInput(BaseModel):
    """A candidate STAC scene for ranking."""

    id: str = Field(..., description="Scene ID")
    bbox: list[float] = Field(..., min_length=4, max_length=4)
    geometry: Optional[dict[str, Any]] = None
    collection: str = Field("sentinel-2-l2a")
    properties: dict[str, Any] = Field(default_factory=dict)
    assets: dict[str, Any] = Field(default_factory=dict)


class EvidenceRequest(BaseModel):
    """Request body for evidence ranking."""

    scenes: list[EvidenceSceneInput] = Field(
        ..., min_length=1, max_length=100, description="Candidate scenes to rank"
    )
    aoi_bbox: list[float] = Field(
        ..., min_length=4, max_length=4, description="AOI bounding box [west, south, east, north]"
    )
    target_start: Optional[str] = Field(None, description="Target start date (YYYY-MM-DD)")
    target_end: Optional[str] = Field(None, description="Target end date (YYYY-MM-DD)")
    target_month: Optional[int] = Field(None, ge=1, le=12, description="Target month for seasonal match")
    required_bands: Optional[list[str]] = Field(None, description="Required bands for analysis")
    max_cloud_cover: Optional[float] = Field(None, ge=0, le=100, description="Max cloud cover for hard rejection")
    weights: Optional[dict[str, float]] = Field(None, description="Custom scoring weights")
    top_n: Optional[int] = Field(None, ge=1, le=50, description="Return only top N results")


class EvidenceResponse(BaseModel):
    """Response for evidence ranking."""

    status: str
    total_scenes: int
    suitable_count: int
    rejected_count: int
    rankings: list[dict[str, Any]]
    best_scene: Optional[dict[str, Any]]
    weights: dict[str, float]
    processing_steps: list[dict[str, str]]


@router.post("/evidence/select", response_model=EvidenceResponse)
async def evidence_select(request: EvidenceRequest):
    """
    Rank satellite scenes by analytical suitability.

    Deterministic scoring using configurable weights.
    No LLM — pure numerical ranking with documented reasons.
    """
    if not request.scenes:
        raise HTTPException(status_code=400, detail="At least one scene is required")

    # Validate weights sum to 1.0 (if provided)
    weights = request.weights or DEFAULT_WEIGHTS
    if request.weights:
        total_weight = sum(weights.values())
        if abs(total_weight - 1.0) > 0.01:
            # Normalize weights
            weights = {k: v / total_weight for k, v in weights.items()}

    # Convert Pydantic models to dicts
    scenes_dicts = []
    for scene in request.scenes:
        scene_dict = scene.model_dump()
        # Ensure properties exist
        if "properties" not in scene_dict:
            scene_dict["properties"] = {}
        scenes_dicts.append(scene_dict)

    try:
        result: EvidenceResult = rank_scenes(
            scenes=scenes_dicts,
            aoi_bbox=request.aoi_bbox,
            target_start=request.target_start,
            target_end=request.target_end,
            target_month=request.target_month,
            required_bands=request.required_bands,
            max_cloud_cover=request.max_cloud_cover,
            weights=weights,
            top_n=request.top_n,
        )
    except Exception as e:
        logger.error("Evidence ranking failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Ranking failed: {e}")

    # Serialize rankings
    rankings_out = []
    for r in result.rankings:
        rankings_out.append({
            "item_id": r.item_id,
            "overall_score": r.overall_score,
            "suitable": r.suitable,
            "components": [
                {
                    "dimension": c.dimension,
                    "score": c.score,
                    "weight": c.weight,
                    "weighted": round(c.weighted, 4),
                    "reason": c.reason,
                }
                for c in r.components
            ],
            "reasons": r.reasons,
            "rejection_reasons": r.rejection_reasons,
        })

    best_out = None
    if result.best_scene:
        b = result.best_scene
        best_out = {
            "item_id": b.item_id,
            "overall_score": b.overall_score,
            "suitable": b.suitable,
            "reasons": b.reasons,
        }

    return EvidenceResponse(
        status=result.status,
        total_scenes=result.total_scenes,
        suitable_count=result.suitable_count,
        rejected_count=result.rejected_count,
        rankings=rankings_out,
        best_scene=best_out,
        weights=result.weights,
        processing_steps=result.processing_steps,
    )
