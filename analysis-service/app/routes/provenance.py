"""Provenance / Evidence Chain endpoints."""

from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.provenance import (
    ProvenanceRecord,
    record_provenance,
    get_provenance,
    list_provenance,
    get_evidence,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analysis/provenance", tags=["provenance"])


class ProvenanceRequest(BaseModel):
    """Request to record a provenance chain."""
    user_query: str = Field("", description="Original user query")
    query_language: str = Field("en", description="Query language")
    analysis_plan: dict = Field(default_factory=dict, description="Analysis plan")
    provider: str = Field("", description="Data provider name")
    collection: str = Field("", description="STAC collection")
    stac_query_params: dict = Field(default_factory=dict, description="STAC search parameters")
    selected_scenes: list[dict] = Field(default_factory=list, description="Selected STAC items")
    preprocessing_steps: list[dict] = Field(default_factory=list, description="Preprocessing steps")
    algorithms: list[dict] = Field(default_factory=list, description="Algorithms applied")
    statistics: dict = Field(default_factory=dict, description="Computed statistics")
    decision: dict = Field(default_factory=dict, description="Decision intelligence output")
    explanation: Optional[dict] = Field(None, description="Explanation output")
    confidence: str = Field("medium", description="Overall confidence")
    limitations: list[str] = Field(default_factory=list, description="Known limitations")
    processing_time_ms: int = Field(0, description="Total processing time")


@router.post("")
async def create_provenance(request: ProvenanceRequest):
    """Record an analysis provenance chain."""
    record = ProvenanceRecord(
        user_query=request.user_query,
        query_language=request.query_language,
        analysis_plan=request.analysis_plan,
        provider=request.provider,
        collection=request.collection,
        stac_query_params=request.stac_query_params,
        selected_scenes=request.selected_scenes,
        preprocessing_steps=request.preprocessing_steps,
        algorithms=request.algorithms,
        statistics=request.statistics,
        decision=request.decision,
        explanation=request.explanation,
        confidence=request.confidence,
        limitations=request.limitations,
        processing_time_ms=request.processing_time_ms,
    )
    analysis_id = record_provenance(record)
    return {
        "status": "ok",
        "analysis_id": analysis_id,
        "created_at": record.created_at,
    }


@router.get("/{analysis_id}")
async def get_provenance_record(analysis_id: str):
    """Retrieve a provenance record by ID."""
    record = get_provenance(analysis_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Provenance record '{analysis_id}' not found")
    return {"status": "ok", "record": record.to_dict()}


@router.get("/{analysis_id}/evidence")
async def get_evidence_chain(analysis_id: str):
    """Get the full evidence chain for an analysis."""
    chain = get_evidence(analysis_id)
    if chain is None:
        raise HTTPException(status_code=404, detail=f"Provenance record '{analysis_id}' not found")
    return {
        "status": "ok",
        "analysis_id": analysis_id,
        "chain_length": len(chain),
        "chain": chain,
    }


@router.get("")
async def list_records(limit: int = 20, offset: int = 0):
    """List recent provenance records."""
    records = list_provenance(limit=limit, offset=offset)
    return {
        "status": "ok",
        "count": len(records),
        "records": [
            {
                "analysis_id": r.analysis_id,
                "created_at": r.created_at,
                "user_query": r.user_query,
                "provider": r.provider,
                "collection": r.collection,
                "confidence": r.confidence,
                "scene_count": len(r.selected_scenes),
            }
            for r in records
        ],
    }
