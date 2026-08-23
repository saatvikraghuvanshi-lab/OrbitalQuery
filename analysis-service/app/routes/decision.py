"""Decision Intelligence endpoint."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Any, Optional

from app.services.decision_engine import assess_impact

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analysis", tags=["decision"])


class DecisionRequest(BaseModel):
    """Request body for decision intelligence assessment."""
    analysis_type: str = Field(
        ...,
        description="Type of analysis: 'flood_impact', 'urban_expansion', 'vegetation_change'",
        examples=["flood_impact"],
    )
    statistics: dict[str, Any] = Field(
        ...,
        description="Computed statistics from the analysis pipeline",
    )
    custom_thresholds: Optional[dict[str, Any]] = Field(
        None,
        description="Override default thresholds (optional)",
    )


@router.post("/decision")
async def decision_intelligence(request: DecisionRequest):
    """
    Compute decision intelligence from analysis statistics.

    Produces severity classification, impact metrics, and actionable
    recommendations based on configurable thresholds.
    """
    try:
        output = assess_impact(
            analysis_type=request.analysis_type,
            stats=request.statistics,
            custom_thresholds=request.custom_thresholds,
        )
        return {
            "status": "ok",
            "analysis_type": output.analysis_type,
            "overall_severity": output.overall_severity.value,
            "confidence": output.confidence,
            "method": output.method,
            "metrics": [m.to_dict() for m in output.metrics],
            "recommendations": output.recommendations,
            "limitations": output.limitations,
        }
    except Exception as e:
        logger.error("Decision intelligence failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
