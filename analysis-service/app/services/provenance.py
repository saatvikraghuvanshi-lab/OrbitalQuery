"""
Provenance / Evidence Chain — Stage 16.

Every analysis produces an immutable provenance record.
Every result is traceable back to source data, processing, and parameters.

Chain: Query → Plan → Scenes → Processing → Result → Explanation
"""

from __future__ import annotations

import time
import uuid
import logging
from dataclasses import dataclass, field
from typing import Any, Optional

logger = logging.getLogger(__name__)


# ── Provenance Record ───────────────────────────────────────────

@dataclass
class ProvenanceRecord:
    """Immutable record of how an analysis result was produced."""

    # Identity
    analysis_id: str = field(default_factory=lambda: f"prov-{uuid.uuid4().hex[:12]}")
    created_at: str = field(default_factory=lambda: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))

    # Step 1: User Query
    user_query: str = ""
    query_language: str = "en"

    # Step 2: Analysis Plan
    analysis_plan: dict = field(default_factory=dict)
    # {
    #   "phenomenon": "flood_impact",
    #   "aoi": "Jaipur",
    #   "bbox": [75.7, 26.8, 75.9, 27.0],
    #   "time_range": {"start": "2024-01-01", "end": "2024-06-30"},
    #   "preferred_sensors": ["sentinel-1-grd"],
    #   "analysis_type": "sar_thresholding",
    #   "cloud_threshold": 30,
    # }

    # Step 3: Data Discovery
    provider: str = ""              # e.g. "bhoonidhi", "copernicus_cdse", "planetary_computer"
    collection: str = ""            # e.g. "sentinel-2-l2a", "ResourceSat-2A_AWIFS_L2"
    stac_query_params: dict = field(default_factory=dict)  # exact STAC search body

    # Step 4: Selected Scenes
    selected_scenes: list[dict] = field(default_factory=list)
    # [
    #   {
    #     "scene_id": "S2A_MSIL2A_20240620T053649...",
    #     "satellite": "Sentinel-2A",
    #     "sensor": "MSI",
    #     "acquisition_date": "2024-06-20",
    #     "cloud_cover_pct": 5.2,
    #     "provider": "planetary_computer",
    #     "bbox": [75.5, 26.5, 76.0, 27.0],
    #     "resolution_m": 10,
    #     "assets_selected": ["B04", "B08"],
    #   }
    # ]

    # Step 5: Preprocessing
    preprocessing_steps: list[dict] = field(default_factory=list)
    # [
    #   {"step": "cloud_masking", "method": "SCL band threshold", "params": {...}},
    #   {"step": "reprojection", "from": "EPSG:32643", "to": "EPSG:4326"},
    #   {"step": "resampling", "from_resolution": 10, "to_resolution": 10, "method": "nearest"},
    #   {"step": "aoi_clipping", "bbox": [75.7, 26.8, 75.9, 27.0]},
    # ]

    # Step 6: Algorithms & Parameters
    algorithms: list[dict] = field(default_factory=list)
    # [
    #   {
    #     "name": "NDVI",
    #     "formula": "(NIR - Red) / (NIR + Red)",
    #     "bands": {"nir": "B08", "red": "B04"},
    #     "params": {},
    #   },
    #   {
    #     "name": "change_threshold",
    #     "method": "otsu",
    #     "threshold_value": 0.15,
    #     "params": {"min_region_size_px": 10},
    #   },
    # ]

    # Step 7: Results
    statistics: dict = field(default_factory=dict)
    # {
    #   "total_flood_area_km2": 23.7,
    #   "aoi_area_km2": 200.0,
    #   "flood_pct": 11.85,
    #   "cluster_count": 5,
    # }

    # Step 8: Decision Intelligence
    decision: dict = field(default_factory=dict)
    # {
    #   "overall_severity": "HIGH",
    #   "confidence": "high",
    #   "recommendations": [...],
    #   "metrics": [...],
    # }

    # Step 9: Explanation
    explanation: Optional[dict] = None
    # {
    #   "summary": "...",
    #   "key_findings": [...],
    #   "confidence_statement": "...",
    #   "limitations": [...],
    #   "source": "deterministic" | "n8n_llm",
    # }

    # Step 10: Metadata
    confidence: str = "medium"
    limitations: list[str] = field(default_factory=list)
    processing_time_ms: int = 0

    def to_dict(self) -> dict:
        return {
            "analysis_id": self.analysis_id,
            "created_at": self.created_at,
            "user_query": self.user_query,
            "query_language": self.query_language,
            "analysis_plan": self.analysis_plan,
            "provider": self.provider,
            "collection": self.collection,
            "stac_query_params": self.stac_query_params,
            "selected_scenes": self.selected_scenes,
            "preprocessing_steps": self.preprocessing_steps,
            "algorithms": self.algorithms,
            "statistics": self.statistics,
            "decision": self.decision,
            "explanation": self.explanation,
            "confidence": self.confidence,
            "limitations": self.limitations,
            "processing_time_ms": self.processing_time_ms,
        }

    def get_evidence_chain(self) -> list[dict]:
        """
        Return the full evidence chain as an ordered list of steps.
        Used for UI rendering and audit trail.
        """
        chain = []

        # Step 1: Query
        chain.append({
            "step": 1,
            "name": "User Query",
            "description": self.user_query,
            "data": {"query": self.user_query, "language": self.query_language},
        })

        # Step 2: Analysis Plan
        if self.analysis_plan:
            chain.append({
                "step": 2,
                "name": "Analysis Plan",
                "description": f"Phenomenon: {self.analysis_plan.get('phenomenon', 'unknown')}",
                "data": self.analysis_plan,
            })

        # Step 3: Data Discovery
        chain.append({
            "step": 3,
            "name": "Data Discovery",
            "description": f"Searched {self.provider} / {self.collection}",
            "data": {
                "provider": self.provider,
                "collection": self.collection,
                "query_params": self.stac_query_params,
            },
        })

        # Step 4: Selected Scenes
        if self.selected_scenes:
            chain.append({
                "step": 4,
                "name": "Selected Scenes",
                "description": f"{len(self.selected_scenes)} scene(s) selected",
                "data": self.selected_scenes,
            })

        # Step 5: Preprocessing
        if self.preprocessing_steps:
            chain.append({
                "step": 5,
                "name": "Preprocessing",
                "description": f"{len(self.preprocessing_steps)} step(s)",
                "data": self.preprocessing_steps,
            })

        # Step 6: Algorithms
        if self.algorithms:
            chain.append({
                "step": 6,
                "name": "Algorithms",
                "description": ", ".join(a.get("name", "?") for a in self.algorithms),
                "data": self.algorithms,
            })

        # Step 7: Results
        if self.statistics:
            chain.append({
                "step": 7,
                "name": "Results",
                "description": f"Computed {len(self.statistics)} statistic(s)",
                "data": self.statistics,
            })

        # Step 8: Decision
        if self.decision:
            chain.append({
                "step": 8,
                "name": "Decision Intelligence",
                "description": f"Severity: {self.decision.get('overall_severity', 'unknown')}",
                "data": self.decision,
            })

        # Step 9: Explanation
        if self.explanation:
            chain.append({
                "step": 9,
                "name": "Explanation",
                "description": self.explanation.get("summary", "")[:100],
                "data": self.explanation,
            })

        return chain


# ══════════════════════════════════════════════════════════════════
# In-Memory Provenance Store
# ══════════════════════════════════════════════════════════════════
# In production, this would be a database. For now, in-memory.

_provenance_store: dict[str, ProvenanceRecord] = {}


def record_provenance(record: ProvenanceRecord) -> str:
    """Store a provenance record. Returns the analysis_id."""
    _provenance_store[record.analysis_id] = record
    logger.info(
        "[provenance] Recorded %s (query='%s', provider=%s, scenes=%d)",
        record.analysis_id,
        record.user_query[:50],
        record.provider,
        len(record.selected_scenes),
    )
    return record.analysis_id


def get_provenance(analysis_id: str) -> Optional[ProvenanceRecord]:
    """Retrieve a provenance record by ID."""
    return _provenance_store.get(analysis_id)


def list_provenance(limit: int = 50, offset: int = 0) -> list[ProvenanceRecord]:
    """List recent provenance records, newest first."""
    records = sorted(
        _provenance_store.values(),
        key=lambda r: r.created_at,
        reverse=True,
    )
    return records[offset: offset + limit]


def get_evidence(analysis_id: str) -> Optional[list[dict]]:
    """Get the full evidence chain for an analysis."""
    record = get_provenance(analysis_id)
    if record is None:
        return None
    return record.get_evidence_chain()
