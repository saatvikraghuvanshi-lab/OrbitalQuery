"""
Lightweight Semantic Concept Layer for OrbitalQuery.

Maps real-world EO phenomena (as humans describe them) to:
  - Semantic concept identifier
  - Required spectral indicators (potentially multiple)
  - Multi-signal combination rules
  - Expected evidence types
  - Data requirements

Inspired by:
  "Semantic Querying in Earth Observation Data Cubes"
  van der Meer et al. — ISPRS Archives, FOSS4G 2022.

The research principle:
  HUMAN CONCEPT → SEMANTIC CONCEPT → EO DATA + INDICATORS → ANALYSIS → RESULT

This is a lightweight engineering implementation — not a full ontology engine.

Architecture:
  "urban expansion"
    → SEMANTIC_CONCEPT: URBAN_EXPANSION
    → indicators: [NDBI, NDVI]
    → multi_signal_rules: {ndbi_increase: True, ndvi_decrease: True}
    → analysis: temporal_change
    → evidence: [built_up_increase, vegetation_context]

Supported concepts map 1:1 to phenomena in capability_registry.py,
but add the multi-signal analysis layer and evidence requirements.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Optional

logger = logging.getLogger(__name__)


# ── Multi-signal rule definitions ──────────────────────────────────

@dataclass
class SignalRule:
    """A rule for a single spectral signal within a multi-signal concept."""

    index_name: str
    # Direction of expected change: "increase", "decrease", "absolute_change"
    direction: str
    # Threshold for this specific signal (overrides global if set)
    threshold: Optional[float] = None
    # Whether this signal is primary (must be satisfied) or supporting
    is_primary: bool = True
    # Human-readable label
    label: str = ""


@dataclass
class EvidenceRequirement:
    """Describes what evidence should be present in the result."""

    name: str
    description: str
    # Which indicators produce this evidence
    indicators: list[str]
    # How to interpret the evidence
    interpretation: str = ""


@dataclass
class SemanticConcept:
    """
    A semantic EO concept — the core of the semantic querying layer.

    Each concept represents a real-world phenomenon that humans care about,
    mapped to the EO measurements and analysis needed to detect it.
    """

    # Concept identifier (UPPER_SNAKE_CASE)
    concept_id: str

    # Human-readable description
    description: str

    # The capability_registry phenomenon key (1:1 mapping)
    registry_phenomenon: str

    # Preferred sensors (ordered by preference)
    preferred_sensors: list[str]

    # All indicators that CAN be used for this concept
    available_indicators: list[str]

    # The PRIMARY indicator (what we compute first)
    primary_indicator: str

    # Multi-signal rules: when to use additional indicators
    # Empty = single-signal analysis is sufficient
    signal_rules: list[SignalRule] = field(default_factory=list)

    # Evidence requirements — what the result should explain
    evidence_requirements: list[EvidenceRequirement] = field(default_factory=list)

    # Minimum number of signals that must agree for a "candidate change"
    min_agreeing_signals: int = 1

    # Whether multi-signal analysis is recommended (vs single-signal)
    multi_signal_recommended: bool = False

    # Keywords for NL detection (supplements capability_registry keywords)
    keywords: list[str] = field(default_factory=list)

    # Semantic layer metadata
    layer: str = ""
    # Expected output description
    expected_output: str = ""


# ══════════════════════════════════════════════════════════════════
# Semantic Concept Registry
# ══════════════════════════════════════════════════════════════════

SEMANTIC_CONCEPTS: dict[str, SemanticConcept] = {
    "URBAN_EXPANSION": SemanticConcept(
        concept_id="URBAN_EXPANSION",
        description="Detect built-up area growth over time using multiple spectral signals",
        registry_phenomenon="urban_expansion",
        preferred_sensors=["sentinel-2-l2a", "landsat-c2-l2"],
        available_indicators=["NDBI", "NDVI"],
        primary_indicator="NDBI",
        signal_rules=[
            SignalRule(
                index_name="NDBI",
                direction="increase",
                threshold=0.10,
                is_primary=True,
                label="Built-up increase",
            ),
            SignalRule(
                index_name="NDVI",
                direction="decrease",
                threshold=0.08,
                is_primary=False,
                label="Vegetation decrease (supporting)",
            ),
        ],
        evidence_requirements=[
            EvidenceRequirement(
                name="built_up_increase",
                description="Increase in NDBI indicating new impervious surfaces",
                indicators=["NDBI"],
                interpretation="Positive NDBI change suggests construction or urbanization",
            ),
            EvidenceRequirement(
                name="vegetation_context",
                description="Concurrent NDVI decrease providing corroboration",
                indicators=["NDVI"],
                interpretation="NDVI decrease near NDBI increase strengthens urban expansion signal",
            ),
            EvidenceRequirement(
                name="spatial_coherence",
                description="Changed regions form spatially coherent clusters",
                indicators=["NDBI", "NDVI"],
                interpretation="Spatially coherent changes are more likely real than noise",
            ),
        ],
        min_agreeing_signals=1,
        multi_signal_recommended=True,
        keywords=["urban", "built-up", "built up", "construction", "expansion", "urbanization", "urbanisation", "city growth", "infrastructure", "settlement", "impervious"],
        layer="URBAN EXPANSION",
        expected_output="Candidate changed regions with built-up + vegetation context",
    ),
    "VEGETATION_CHANGE": SemanticConcept(
        concept_id="VEGETATION_CHANGE",
        description="Monitor vegetation health and cover changes over time",
        registry_phenomenon="vegetation_change",
        preferred_sensors=["sentinel-2-l2a", "landsat-c2-l2"],
        available_indicators=["NDVI"],
        primary_indicator="NDVI",
        signal_rules=[
            SignalRule(
                index_name="NDVI",
                direction="absolute_change",
                threshold=0.15,
                is_primary=True,
                label="Vegetation change",
            ),
        ],
        evidence_requirements=[
            EvidenceRequirement(
                name="vegetation_signal",
                description="NDVI change indicating vegetation health change",
                indicators=["NDVI"],
                interpretation="Significant NDVI change suggests vegetation loss, gain, or stress",
            ),
            EvidenceRequirement(
                name="baseline_context",
                description="Pre-change vegetation density for context",
                indicators=["NDVI"],
                interpretation="High baseline NDVI with decrease suggests deforestation; low baseline with increase suggests regrowth",
            ),
        ],
        min_agreeing_signals=1,
        multi_signal_recommended=False,
        keywords=["vegetation", "deforestation", "forest", "ndvi", "greenery", "greenness", "tree cover", "canopy", "foliage", "crop health", "drought stress", "browning", "regrowth"],
        layer="VEGETATION",
        expected_output="Vegetation change regions with baseline and comparison NDVI context",
    ),
    "WATER_CHANGE": SemanticConcept(
        concept_id="WATER_CHANGE",
        description="Monitor water body changes (expansion, shrinking, flooding)",
        registry_phenomenon="water_change",
        preferred_sensors=["sentinel-2-l2a", "landsat-c2-l2"],
        available_indicators=["NDWI"],
        primary_indicator="NDWI",
        signal_rules=[
            SignalRule(
                index_name="NDWI",
                direction="absolute_change",
                threshold=0.15,
                is_primary=True,
                label="Water extent change",
            ),
        ],
        evidence_requirements=[
            EvidenceRequirement(
                name="water_signal",
                description="NDWI change indicating water body extent change",
                indicators=["NDWI"],
                interpretation="Positive NDWI change suggests water expansion; negative suggests shrinkage",
            ),
        ],
        min_agreeing_signals=1,
        multi_signal_recommended=False,
        keywords=["water", "lake", "reservoir", "river", "pond", "wetland", "water body", "water level", "drought", "flooding", "shoreline"],
        layer="WATER",
        expected_output="Water change regions with NDWI comparison",
    ),
    "BURN_CHANGE": SemanticConcept(
        concept_id="BURN_CHANGE",
        description="Assess wildfire damage and burn severity using dNBR",
        registry_phenomenon="burn_severity",
        preferred_sensors=["sentinel-2-l2a", "landsat-c2-l2"],
        available_indicators=["NBR"],
        primary_indicator="NBR",
        signal_rules=[
            SignalRule(
                index_name="NBR",
                direction="decrease",
                threshold=0.20,
                is_primary=True,
                label="Burn ratio decrease (dNBR)",
            ),
        ],
        evidence_requirements=[
            EvidenceRequirement(
                name="burn_signal",
                description="NBR decrease indicating fire damage",
                indicators=["NBR"],
                interpretation="dNBR > 0.27 indicates low-severity burn; > 0.66 indicates high-severity",
            ),
        ],
        min_agreeing_signals=1,
        multi_signal_recommended=False,
        keywords=["fire", "burn", "wildfire", "forest fire", "burn severity", "fire damage", "char", "scorched", "fire scar", "post-fire"],
        layer="FIRE",
        expected_output="Burn severity classification with dNBR values",
    ),
    "SNOW_CHANGE": SemanticConcept(
        concept_id="SNOW_CHANGE",
        description="Monitor snow and ice cover changes over time",
        registry_phenomenon="snow_cover",
        preferred_sensors=["sentinel-2-l2a", "landsat-c2-l2"],
        available_indicators=["NDSI"],
        primary_indicator="NDSI",
        signal_rules=[
            SignalRule(
                index_name="NDSI",
                direction="absolute_change",
                threshold=0.15,
                is_primary=True,
                label="Snow cover change",
            ),
        ],
        evidence_requirements=[
            EvidenceRequirement(
                name="snow_signal",
                description="NDSI change indicating snow/ice cover change",
                indicators=["NDSI"],
                interpretation="NDSI decrease suggests snow line retreat or melt",
            ),
        ],
        min_agreeing_signals=1,
        multi_signal_recommended=False,
        keywords=["snow", "ice", "glacier", "glacial", "snowmelt", "cryosphere", "permafrost", "ice sheet", "glacier retreat", "snow line", "deglaciation"],
        layer="CRYOSPHERE",
        expected_output="Snow/ice change regions with NDSI comparison",
    ),
}


# ── Concept lookup functions ──────────────────────────────────────

def get_concept(concept_id: str) -> Optional[SemanticConcept]:
    """Get a semantic concept by ID."""
    return SEMANTIC_CONCEPTS.get(concept_id)


def get_concept_for_phenomenon(phenomenon: str) -> Optional[SemanticConcept]:
    """Get the semantic concept for a capability_registry phenomenon key."""
    for concept in SEMANTIC_CONCEPTS.values():
        if concept.registry_phenomenon == phenomenon:
            return concept
    return None


def detect_semantic_concept(query: str) -> Optional[str]:
    """
    Detect the semantic concept from a natural language query.

    Returns the concept_id or None.
    Uses keyword matching — deterministic, no LLM needed.
    """
    query_lower = query.lower()

    scores: dict[str, int] = {}
    for concept_id, concept in SEMANTIC_CONCEPTS.items():
        score = 0
        for keyword in concept.keywords:
            if keyword in query_lower:
                score += len(keyword)
        if score > 0:
            scores[concept_id] = score

    if not scores:
        return None

    return max(scores, key=scores.get)


def list_semantic_concepts() -> list[dict[str, Any]]:
    """List all semantic concepts for API responses."""
    result = []
    for concept_id, concept in SEMANTIC_CONCEPTS.items():
        result.append({
            "concept_id": concept_id,
            "description": concept.description,
            "registry_phenomenon": concept.registry_phenomenon,
            "primary_indicator": concept.primary_indicator,
            "available_indicators": concept.available_indicators,
            "multi_signal_recommended": concept.multi_signal_recommended,
            "layer": concept.layer,
            "expected_output": concept.expected_output,
            "num_evidence_requirements": len(concept.evidence_requirements),
        })
    return result
