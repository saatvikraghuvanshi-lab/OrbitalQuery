"""
Explicit Analysis Plan dataclass for semantic querying.

Represents the structured internal plan that maps a human query
to concrete EO data requirements, indicators, and analysis operations.

Architecture:
  USER QUERY
    ↓
  SEMANTIC CONCEPT
    ↓
  ANALYSIS PLAN (this module)
    ↓
  EO DATA DISCOVERY
    ↓
  INDICATORS
    ↓
  CHANGE DETECTION
    ↓
  EVIDENCE

This makes OrbitalQuery's reasoning traceable and explainable.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Optional


@dataclass
class AnalysisPlan:
    """
    An explicit, traceable analysis plan.

    Captures every decision from human query to EO operation,
    making the system's reasoning explainable.
    """

    # ── Identity ──────────────────────────────────────────────
    plan_id: str
    query: str

    # ── Semantic layer ────────────────────────────────────────
    semantic_concept: str          # e.g. "URBAN_EXPANSION"
    concept_description: str       # human-readable description
    registry_phenomenon: str       # maps to capability_registry key

    # ── AOI ───────────────────────────────────────────────────
    aoi_name: str                  # e.g. "hyderabad"
    bbox: list[float]              # [west, south, east, north]

    # ── Temporal ──────────────────────────────────────────────
    start_date: str                # ISO format YYYY-MM-DD
    end_date: str                  # ISO format YYYY-MM-DD

    # ── Data requirements ─────────────────────────────────────
    preferred_sensors: list[str]   # ordered by preference
    selected_sensor: str           # the sensor we'll actually use
    collection: str                # STAC collection ID
    bands: list[str]               # physical band names
    cloud_threshold: int           # max cloud cover %

    # ── Indicators ────────────────────────────────────────────
    primary_indicator: str         # e.g. "NDBI"
    all_indicators: list[str]      # e.g. ["NDBI", "NDVI"]
    indicator_formulas: dict[str, str]  # indicator → formula

    # ── Multi-signal rules ────────────────────────────────────
    multi_signal_enabled: bool     # whether multi-signal analysis is active
    signal_rules: list[dict[str, Any]]  # rules for each indicator
    min_agreeing_signals: int      # minimum signals that must agree

    # ── Analysis configuration ────────────────────────────────
    analysis_type: str             # e.g. "ndbi_change"
    comparison_strategy: str       # e.g. "temporal_diff"
    min_scenes: int
    max_scenes: int

    # ── Evidence requirements ─────────────────────────────────
    evidence_requirements: list[dict[str, Any]]

    # ── Output requirements ───────────────────────────────────
    output_requirements: list[str]

    # ── Semantic traceability ─────────────────────────────────
    # Documents the reasoning chain from query to plan
    trace: list[dict[str, str]] = field(default_factory=list)

    def add_trace(self, step: str, detail: str) -> None:
        """Add a trace step documenting the reasoning chain."""
        self.trace.append({"step": step, "detail": detail})

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dict for API responses."""
        return {
            "plan_id": self.plan_id,
            "query": self.query,
            "semantic": {
                "concept": self.semantic_concept,
                "description": self.concept_description,
                "registry_phenomenon": self.registry_phenomenon,
            },
            "aoi": {
                "name": self.aoi_name,
                "bbox": self.bbox,
            },
            "temporal": {
                "start_date": self.start_date,
                "end_date": self.end_date,
            },
            "data_requirements": {
                "preferred_sensors": self.preferred_sensors,
                "selected_sensor": self.selected_sensor,
                "collection": self.collection,
                "bands": self.bands,
                "cloud_threshold": self.cloud_threshold,
            },
            "indicators": {
                "primary": self.primary_indicator,
                "all": self.all_indicators,
                "formulas": self.indicator_formulas,
            },
            "multi_signal": {
                "enabled": self.multi_signal_enabled,
                "rules": self.signal_rules,
                "min_agreeing_signals": self.min_agreeing_signals,
            },
            "analysis": {
                "type": self.analysis_type,
                "strategy": self.comparison_strategy,
                "min_scenes": self.min_scenes,
                "max_scenes": self.max_scenes,
            },
            "evidence_requirements": self.evidence_requirements,
            "output_requirements": self.output_requirements,
            "trace": self.trace,
        }


def generate_plan_id(
    semantic_concept: str,
    aoi_name: str,
    start_date: str,
    end_date: str,
    query: str,
) -> str:
    """Generate a deterministic plan ID from key parameters."""
    raw = f"{semantic_concept}:{aoi_name}:{start_date}:{end_date}:{query}"
    return hashlib.sha256(raw.encode()).hexdigest()[:12]
