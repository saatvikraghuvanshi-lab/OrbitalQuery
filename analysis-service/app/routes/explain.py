"""Explanation endpoint — generates structured intelligence reports."""

from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.explanation import (
    Explanation,
    generate_deterministic_explanation,
    prepare_for_n8n,
    validate_explanation,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analysis", tags=["explanation"])


class ExplanationRequest(BaseModel):
    """Request body for generating an explanation."""

    analysis_id: str = Field(..., description="Analysis ID from the completed analysis")
    query: str = Field(..., description="Original user query")
    analysis_plan: dict[str, Any] = Field(default_factory=dict)
    aoi_bbox: list[float] = Field(default_factory=list)
    event_date: Optional[str] = None
    selected_scenes: list[dict[str, Any]] = Field(default_factory=list)
    processing_steps: list[dict[str, str]] = Field(default_factory=list)
    method: str = "unknown"
    statistics: dict[str, Any] = Field(default_factory=dict)
    change_map_summary: dict[str, Any] = Field(default_factory=dict)
    confidence: str = "unknown"
    limitations: list[str] = Field(default_factory=list)
    evidence: dict[str, Any] = Field(default_factory=dict)
    # Mode control
    mode: str = Field("deterministic", description="'deterministic' or 'n8n'")


class ExplanationResponse(BaseModel):
    """Structured explanation response."""

    analysis_id: str
    summary: str
    key_findings: list[dict[str, Any]]
    affected_area: dict[str, Any]
    spatial_findings: dict[str, Any]
    confidence_statement: str
    limitations: list[str]
    evidence_references: list[str]
    generated_at: str
    source: str
    validated: bool
    validation_error: Optional[str] = None


@router.post("/explain", response_model=ExplanationResponse)
async def explain_analysis(request: ExplanationRequest):
    """
    Generate a structured explanation from analysis results.

    In 'deterministic' mode: generates fact-based explanation without LLM.
    In 'n8n' mode: prepares payload for n8n webhook (caller must forward).
    """
    # Build the analysis result dict
    analysis_result = {
        "analysis_id": request.analysis_id,
        "query": request.query,
        "analysis_plan": request.analysis_plan,
        "aoi_bbox": request.aoi_bbox,
        "event_date": request.event_date,
        "selected_scenes": request.selected_scenes,
        "processing_steps": request.processing_steps,
        "method": request.method,
        "statistics": request.statistics,
        "change_map_summary": request.change_map_summary,
        "confidence": request.confidence,
        "limitations": request.limitations,
        "evidence": request.evidence,
    }

    if request.mode == "n8n":
        # Forward to n8n webhook for LLM explanation
        import os
        import httpx

        n8n_webhook_url = os.environ.get("N8N_WEBHOOK_URL")
        if not n8n_webhook_url:
            logger.warning("N8N_WEBHOOK_URL not set — falling back to deterministic mode")
        else:
            payload = prepare_for_n8n(analysis_result)
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    resp = await client.post(
                        n8n_webhook_url,
                        json=payload,
                        headers={"Content-Type": "application/json"},
                    )
                    if resp.status_code == 200:
                        n8n_result = resp.json()
                        # Validate the n8n response
                        is_valid, error_msg = validate_explanation(
                            n8n_result.get("explanation", n8n_result),
                            analysis_result,
                        )
                        explanation_data = n8n_result.get("explanation", n8n_result)
                        return ExplanationResponse(
                            analysis_id=request.analysis_id,
                            summary=explanation_data.get("summary", ""),
                            key_findings=explanation_data.get("key_findings", []),
                            affected_area=explanation_data.get("affected_area", {}),
                            spatial_findings=explanation_data.get("spatial_findings", {}),
                            confidence_statement=explanation_data.get("confidence_statement", ""),
                            limitations=explanation_data.get("limitations", []),
                            evidence_references=explanation_data.get("evidence_references", []),
                            generated_at=n8n_result.get("generated_at", ""),
                            source="n8n",
                            validated=is_valid,
                            validation_error=error_msg,
                        )
                    else:
                        logger.error("n8n webhook returned %d: %s", resp.status_code, resp.text[:200])
            except Exception as e:
                logger.error("n8n webhook call failed: %s", e)

        # Fallback to deterministic if n8n fails
        logger.info("Falling back to deterministic explanation")

    # Deterministic mode
    try:
        explanation: Explanation = generate_deterministic_explanation(analysis_result)
    except Exception as e:
        logger.error("Explanation generation failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Explanation failed: {e}")

    # Validate
    is_valid, error_msg = validate_explanation(
        explanation.to_dict(), analysis_result
    )

    resp_dict = explanation.to_dict()
    return ExplanationResponse(
        analysis_id=resp_dict["analysis_id"],
        summary=resp_dict["summary"],
        key_findings=resp_dict["key_findings"],
        affected_area=resp_dict["affected_area"],
        spatial_findings=resp_dict["spatial_findings"],
        confidence_statement=resp_dict["confidence_statement"],
        limitations=resp_dict["limitations"],
        evidence_references=resp_dict["evidence_references"],
        generated_at=resp_dict["generated_at"],
        source=resp_dict["source"],
        validated=is_valid,
        validation_error=error_msg,
    )
