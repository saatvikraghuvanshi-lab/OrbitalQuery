"""
Semantic Concepts endpoint.

GET /analysis/semantic/concepts — list all semantic EO concepts
GET /analysis/semantic/concepts/{concept_id} — get details for a specific concept
GET /analysis/semantic/trace — describe the semantic querying architecture
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, HTTPException

from app.services.semantic_concepts import (
    SEMANTIC_CONCEPTS,
    get_concept,
    list_semantic_concepts,
    detect_semantic_concept,
)
from app.services.capability_registry import PHENOMENON_REGISTRY

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analysis/semantic", tags=["semantic"])


@router.get("/concepts")
async def get_concepts():
    """
    List all supported semantic EO concepts.

    Each concept represents a real-world phenomenon that can be detected
    using Earth Observation data, mapped to specific indicators and analysis.
    """
    return {
        "status": "ok",
        "count": len(SEMANTIC_CONCEPTS),
        "concepts": list_semantic_concepts(),
        "architecture": {
            "description": (
                "Inspired by semantic querying research in Earth Observation. "
                "Real-world concepts are mapped to relevant EO data, indicators, "
                "and analysis through a lightweight semantic layer."
            ),
            "research_reference": (
                "van der Meer, L. et al. (2022). "
                "Semantic Querying in Earth Observation Data Cubes. "
                "ISPRS Archives, XLVIII-4/W1, 503-509."
            ),
            "principle": (
                "Human concept → Semantic concept → EO data + indicators → "
                "Analysis → Evidence"
            ),
        },
    }


@router.get("/concepts/{concept_id}")
async def get_concept_detail(concept_id: str):
    """
    Get detailed information about a specific semantic concept.

    Includes multi-signal rules, evidence requirements, and data requirements.
    """
    concept = get_concept(concept_id.upper())
    if not concept:
        raise HTTPException(
            status_code=404,
            detail=f"Concept '{concept_id}' not found. Available: {list(SEMANTIC_CONCEPTS.keys())}",
        )

    # Map to phenomenon registry for compatibility info
    phenomenon_info = PHENOMENON_REGISTRY.get(concept.registry_phenomenon, {})

    return {
        "status": "ok",
        "concept": {
            "concept_id": concept.concept_id,
            "description": concept.description,
            "registry_phenomenon": concept.registry_phenomenon,
            "layer": concept.layer,
            "expected_output": concept.expected_output,
        },
        "data_requirements": {
            "preferred_sensors": concept.preferred_sensors,
            "primary_indicator": concept.primary_indicator,
            "available_indicators": concept.available_indicators,
        },
        "multi_signal": {
            "enabled": concept.multi_signal_recommended,
            "min_agreeing_signals": concept.min_agreeing_signals,
            "rules": [
                {
                    "index_name": rule.index_name,
                    "direction": rule.direction,
                    "threshold": rule.threshold,
                    "is_primary": rule.is_primary,
                    "label": rule.label,
                }
                for rule in concept.signal_rules
            ],
        },
        "evidence_requirements": [
            {
                "name": ev.name,
                "description": ev.description,
                "indicators": ev.indicators,
                "interpretation": ev.interpretation,
            }
            for ev in concept.evidence_requirements
        ],
        "keywords": concept.keywords,
        "phenomenon_config": {
            "analysis_types": phenomenon_info.get("analysis_types", []),
            "comparison_strategy": phenomenon_info.get("comparison_strategy", ""),
            "cloud_threshold": phenomenon_info.get("default_cloud_threshold", 20),
        },
    }


@router.get("/trace")
async def get_architecture_trace():
    """
    Describe the semantic querying architecture.

    Shows how a human query is processed through the semantic layer
    to produce an evidence-based result.
    """
    return {
        "status": "ok",
        "architecture": {
            "flow": [
                "NATURAL LANGUAGE QUERY",
                "↓",
                "SEMANTIC CONCEPT DETECTION",
                "↓",
                "ANALYSIS PLAN GENERATION",
                "↓",
                "EO DATA DISCOVERY (STAC)",
                "↓",
                "TEMPORAL ALIGNMENT",
                "↓",
                "SPECTRAL INDICATOR COMPUTATION",
                "↓",
                "MULTI-SIGNAL CHANGE DETECTION",
                "↓",
                "CHANGE REGIONS + EVIDENCE",
            ],
            "principle": (
                "Inspired by semantic EO querying research, OrbitalQuery maps "
                "real-world concepts to relevant EO data, indicators, and analysis."
            ),
            "research_basis": {
                "paper": "Semantic Querying in Earth Observation Data Cubes",
                "authors": "van der Meer, L., Sudmanns, M., Augustin, H., Baraldi, A., Tiede, D.",
                "venue": "ISPRS Archives, FOSS4G 2022",
                "doi": "10.5194/isprs-archives-XLVIII-4-W1-2022-503-2022",
                "key_principle": (
                    "Human concepts → semantic mapping → EO measurements → analytical results"
                ),
            },
            "multi_signal_principle": (
                "Don't rely on one spectral signal. Combine multiple indicators "
                "(e.g. NDBI + NDVI for urban expansion) for more defensible results."
            ),
            "evidence_principle": (
                "Results explain what was analyzed, which indicators were computed, "
                "and what evidence supports the detected changes."
            ),
        },
    }


@router.post("/detect")
async def detect_concept_from_query(body: dict[str, Any]):
    """
    Detect the semantic concept from a natural language query.

    Returns the concept_id and the full semantic mapping.
    """
    query = body.get("query", "")
    if not query:
        raise HTTPException(status_code=400, detail="Query is required")

    concept_id = detect_semantic_concept(query)
    if not concept_id:
        return {
            "status": "unsupported",
            "message": "Could not determine the semantic concept from this query",
            "available_concepts": list(SEMANTIC_CONCEPTS.keys()),
        }

    concept = get_concept(concept_id)
    return {
        "status": "ok",
        "concept_id": concept_id,
        "concept": {
            "description": concept.description,
            "primary_indicator": concept.primary_indicator,
            "available_indicators": concept.available_indicators,
            "multi_signal_recommended": concept.multi_signal_recommended,
            "layer": concept.layer,
        } if concept else None,
    }
