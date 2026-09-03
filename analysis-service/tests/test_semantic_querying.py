"""
Tests for the Semantic Querying Layer.

Tests the lightweight semantic interpretation layer inspired by:
  "Semantic Querying in Earth Observation Data Cubes"
  van der Meer et al. — ISPRS Archives, FOSS4G 2022.

Test categories:
1. Semantic concept detection from NL queries
2. Concept → data requirements mapping
3. Multi-signal analysis configuration
4. Analysis plan generation with semantic tracing
5. Edge cases and validation
"""

from __future__ import annotations

import pytest

from app.services.semantic_concepts import (
    SEMANTIC_CONCEPTS,
    SemanticConcept,
    SignalRule,
    EvidenceRequirement,
    get_concept,
    get_concept_for_phenomenon,
    detect_semantic_concept,
    list_semantic_concepts,
)
from app.services.query_to_plan import build_analysis_plan
from app.services.capability_registry import PHENOMENON_REGISTRY


# ═══════════════════════════════════════════════════════════════
# SECTION 1: Semantic Concept Detection
# ═══════════════════════════════════════════════════════════════

class TestSemanticConceptDetection:
    def test_urban_expansion_detection(self):
        """'urban expansion' should map to URBAN_EXPANSION concept."""
        concept_id = detect_semantic_concept("show urban expansion between 2021 and 2025")
        assert concept_id == "URBAN_EXPANSION"

    def test_urban_synonyms(self):
        """Urban synonyms should also detect URBAN_EXPANSION."""
        assert detect_semantic_concept("city growth in Mumbai") == "URBAN_EXPANSION"
        assert detect_semantic_concept("urbanization near Jaipur") == "URBAN_EXPANSION"
        assert detect_semantic_concept("built-up area change") == "URBAN_EXPANSION"

    def test_vegetation_change_detection(self):
        """'vegetation change' should map to VEGETATION_CHANGE."""
        assert detect_semantic_concept("vegetation change in Assam") == "VEGETATION_CHANGE"

    def test_vegetation_synonyms(self):
        """Vegetation synonyms should also detect VEGETATION_CHANGE."""
        assert detect_semantic_concept("deforestation near Delhi") == "VEGETATION_CHANGE"
        assert detect_semantic_concept("NDVI analysis for Jaipur") == "VEGETATION_CHANGE"

    def test_water_change_detection(self):
        """'water change' should map to WATER_CHANGE."""
        assert detect_semantic_concept("water body change near Chennai") == "WATER_CHANGE"

    def test_burn_change_detection(self):
        """'burned area' should map to BURN_CHANGE."""
        assert detect_semantic_concept("burned area in Uttarakhand") == "BURN_CHANGE"

    def test_burn_synonyms(self):
        """Fire synonyms should detect BURN_CHANGE."""
        assert detect_semantic_concept("forest fire damage assessment") == "BURN_CHANGE"
        assert detect_semantic_concept("wildfire burn severity") == "BURN_CHANGE"

    def test_snow_change_detection(self):
        """'snow cover' should map to SNOW_CHANGE."""
        assert detect_semantic_concept("snow cover change in Himalayas") == "SNOW_CHANGE"

    def test_glacier_detection(self):
        """'glacier retreat' should map to SNOW_CHANGE."""
        assert detect_semantic_concept("glacier retreat in Himalayas") == "SNOW_CHANGE"

    def test_unsupported_query(self):
        """Unrelated queries should return None."""
        assert detect_semantic_concept("tell me a joke") is None

    def test_empty_query(self):
        """Empty query should return None."""
        assert detect_semantic_concept("") is None


# ═══════════════════════════════════════════════════════════════
# SECTION 2: Concept → Data Requirements Mapping
# ═══════════════════════════════════════════════════════════════

class TestConceptDataRequirements:
    def test_urban_expansion_indicators(self):
        """URBAN_EXPANSION should require NDBI + NDVI."""
        concept = get_concept("URBAN_EXPANSION")
        assert concept is not None
        assert "NDBI" in concept.available_indicators
        assert "NDVI" in concept.available_indicators
        assert concept.primary_indicator == "NDBI"

    def test_urban_expansion_multi_signal(self):
        """URBAN_EXPANSION should recommend multi-signal analysis."""
        concept = get_concept("URBAN_EXPANSION")
        assert concept.multi_signal_recommended is True
        assert len(concept.signal_rules) >= 2

    def test_urban_expansion_signal_rules(self):
        """URBAN_EXPANSION should have NDBI increase + NDVI decrease rules."""
        concept = get_concept("URBAN_EXPANSION")
        rules = {r.index_name: r for r in concept.signal_rules}
        assert "NDBI" in rules
        assert "NDVI" in rules
        assert rules["NDBI"].direction == "increase"
        assert rules["NDVI"].direction == "decrease"

    def test_vegetation_change_single_signal(self):
        """VEGETATION_CHANGE should use single-signal NDVI."""
        concept = get_concept("VEGETATION_CHANGE")
        assert concept is not None
        assert concept.primary_indicator == "NDVI"
        assert concept.multi_signal_recommended is False
        assert concept.available_indicators == ["NDVI"]

    def test_water_change_single_signal(self):
        """WATER_CHANGE should use single-signal NDWI."""
        concept = get_concept("WATER_CHANGE")
        assert concept is not None
        assert concept.primary_indicator == "NDWI"
        assert concept.multi_signal_recommended is False

    def test_burn_change_single_signal(self):
        """BURN_CHANGE should use single-signal NBR."""
        concept = get_concept("BURN_CHANGE")
        assert concept is not None
        assert concept.primary_indicator == "NBR"
        assert concept.multi_signal_recommended is False

    def test_snow_change_single_signal(self):
        """SNOW_CHANGE should use single-signal NDSI."""
        concept = get_concept("SNOW_CHANGE")
        assert concept is not None
        assert concept.primary_indicator == "NDSI"
        assert concept.multi_signal_recommended is False

    def test_concept_has_preferred_sensors(self):
        """All concepts should specify preferred sensors."""
        for concept_id, concept in SEMANTIC_CONCEPTS.items():
            assert len(concept.preferred_sensors) > 0, f"{concept_id} has no sensors"

    def test_concept_has_evidence_requirements(self):
        """All concepts should define evidence requirements."""
        for concept_id, concept in SEMANTIC_CONCEPTS.items():
            assert len(concept.evidence_requirements) > 0, f"{concept_id} has no evidence requirements"

    def test_concept_has_registry_mapping(self):
        """All concepts should map to a capability_registry phenomenon."""
        for concept_id, concept in SEMANTIC_CONCEPTS.items():
            assert concept.registry_phenomenon in PHENOMENON_REGISTRY, \
                f"{concept_id} maps to unknown phenomenon '{concept.registry_phenomenon}'"


# ═══════════════════════════════════════════════════════════════
# SECTION 3: Concept Lookup
# ═══════════════════════════════════════════════════════════════

class TestConceptLookup:
    def test_get_concept_valid(self):
        """Should return concept for valid ID."""
        concept = get_concept("URBAN_EXPANSION")
        assert concept is not None
        assert concept.concept_id == "URBAN_EXPANSION"

    def test_get_concept_invalid(self):
        """Should return None for invalid ID."""
        assert get_concept("NONEXISTENT") is None

    def test_get_concept_case_sensitive(self):
        """Concept lookup should be case-sensitive."""
        assert get_concept("urban_expansion") is None  # lowercase
        assert get_concept("URBAN_EXPANSION") is not None  # uppercase

    def test_get_concept_for_phenomenon(self):
        """Should find concept by phenomenon key."""
        concept = get_concept_for_phenomenon("urban_expansion")
        assert concept is not None
        assert concept.concept_id == "URBAN_EXPANSION"

    def test_get_concept_for_unknown_phenomenon(self):
        """Should return None for unknown phenomenon."""
        assert get_concept_for_phenomenon("unknown_phenomenon") is None

    def test_list_semantic_concepts(self):
        """Should return all concepts."""
        concepts = list_semantic_concepts()
        assert len(concepts) > 0
        assert all("concept_id" in c for c in concepts)


# ═══════════════════════════════════════════════════════════════
# SECTION 4: Analysis Plan with Semantic Layer
# ═══════════════════════════════════════════════════════════════

class TestSemanticAnalysisPlan:
    def test_urban_plan_has_semantic_fields(self):
        """Analysis plan should contain semantic concept metadata."""
        result = build_analysis_plan("urban expansion in Jaipur 2021-2025")
        assert result["status"] == "ok"
        plan = result["plan"]

        # Semantic layer
        assert "semantic" in plan
        assert plan["semantic"]["concept"] == "URBAN_EXPANSION"
        assert plan["semantic"]["registry_phenomenon"] == "urban_expansion"
        assert "description" in plan["semantic"]

        # Indicators
        assert "indicators" in plan
        assert plan["indicators"]["primary"] == "NDBI"
        assert "NDBI" in plan["indicators"]["all"]
        assert "NDVI" in plan["indicators"]["all"]
        assert "formulas" in plan["indicators"]
        assert "NDBI" in plan["indicators"]["formulas"]

        # Multi-signal
        assert "multi_signal" in plan
        assert plan["multi_signal"]["enabled"] is True
        assert len(plan["multi_signal"]["rules"]) >= 2
        assert plan["multi_signal"]["min_agreeing_signals"] >= 1

        # Evidence requirements
        assert "evidence_requirements" in plan
        assert len(plan["evidence_requirements"]) >= 2

        # Trace
        assert "trace" in plan
        assert len(plan["trace"]) >= 3
        trace_steps = [t["step"] for t in plan["trace"]]
        assert "user_query" in trace_steps
        assert "semantic_concept" in trace_steps
        assert "indicators" in trace_steps

    def test_vegetation_plan_single_signal(self):
        """Vegetation plan should use single-signal analysis."""
        result = build_analysis_plan("vegetation change in Assam 2020-2024")
        assert result["status"] == "ok"
        plan = result["plan"]

        assert plan["semantic"]["concept"] == "VEGETATION_CHANGE"
        assert plan["indicators"]["primary"] == "NDVI"
        assert plan["multi_signal"]["enabled"] is False

    def test_water_plan_single_signal(self):
        """Water plan should use single-signal analysis."""
        result = build_analysis_plan("water change in Chennai 2020-2024")
        assert result["status"] == "ok"
        plan = result["plan"]

        assert plan["semantic"]["concept"] == "WATER_CHANGE"
        assert plan["indicators"]["primary"] == "NDWI"
        assert plan["multi_signal"]["enabled"] is False

    def test_burn_plan_single_signal(self):
        """Burn plan should use single-signal analysis."""
        result = build_analysis_plan("forest fire burn severity in Uttarakhand 2023")
        assert result["status"] == "ok"
        plan = result["plan"]

        assert plan["semantic"]["concept"] == "BURN_CHANGE"
        assert plan["indicators"]["primary"] == "NBR"
        assert plan["multi_signal"]["enabled"] is False

    def test_plan_trace_documents_reasoning(self):
        """Plan trace should document the reasoning chain."""
        result = build_analysis_plan("urban expansion near Hyderabad 2021-2025")
        assert result["status"] == "ok"
        plan = result["plan"]

        trace = plan["trace"]
        # Check that the trace includes key reasoning steps
        step_names = [t["step"] for t in trace]
        assert "user_query" in step_names
        assert "semantic_concept" in step_names
        assert "data_requirements" in step_names
        assert "indicators" in step_names
        assert "analysis" in step_names

    def test_plan_backward_compatible(self):
        """Plan should still contain all original fields for backward compatibility."""
        result = build_analysis_plan("urban expansion in Jaipur 2018-2025")
        assert result["status"] == "ok"
        plan = result["plan"]

        # Original fields still present
        required_original = [
            "plan_id", "query", "phenomenon", "phenomenon_description",
            "analysis_type", "sensor", "bands", "aoi", "bbox",
            "start_date", "end_date", "cloud_threshold", "comparison_strategy",
            "output_requirements", "required_indices", "validation",
        ]
        for field in required_original:
            assert field in plan, f"Missing original field: {field}"

    def test_different_geographies_same_concept(self):
        """Same semantic concept should work for different geographic regions."""
        queries = [
            "urban expansion in Jaipur 2021-2025",
            "urban expansion in Mumbai 2021-2025",
            "urban expansion in Delhi 2021-2025",
        ]
        for query in queries:
            result = build_analysis_plan(query)
            assert result["status"] == "ok"
            assert result["plan"]["semantic"]["concept"] == "URBAN_EXPANSION"
            # AOI should differ
            assert result["plan"]["aoi"] is not None


# ═══════════════════════════════════════════════════════════════
# SECTION 5: Edge Cases
# ═══════════════════════════════════════════════════════════════

class TestSemanticEdgeCases:
    def test_unsupported_phenomenon_returns_error(self):
        """Unsupported phenomenon should return unsupported status."""
        result = build_analysis_plan("tell me a joke about satellites")
        assert result["status"] == "unsupported"

    def test_missing_dates_gets_defaults(self):
        """Missing dates should get sensible defaults."""
        result = build_analysis_plan("urban expansion in Jaipur")
        assert result["status"] == "ok"
        # Should have default dates
        assert result["plan"]["start_date"] is not None
        assert result["plan"]["end_date"] is not None

    def test_missing_location_returns_error(self):
        """Missing location should return error with suggestions."""
        result = build_analysis_plan("urban expansion 2021-2025")
        assert result["status"] == "error"
        assert "known_locations" in result

    def test_same_concept_different_sensors(self):
        """Same concept should map to same primary indicator regardless of sensor."""
        result = build_analysis_plan("urban expansion in Jaipur 2021-2025")
        assert result["status"] == "ok"
        plan = result["plan"]
        # Primary indicator is semantic, not sensor-dependent
        assert plan["indicators"]["primary"] == "NDBI"

    def test_evidence_requirements_have_required_fields(self):
        """All evidence requirements should have required fields."""
        for concept in SEMANTIC_CONCEPTS.values():
            for ev in concept.evidence_requirements:
                assert ev.name, f"{concept.concept_id} has evidence without name"
                assert ev.description, f"{concept.concept_id} has evidence without description"
                assert len(ev.indicators) > 0, f"{concept.concept_id} evidence '{ev.name}' has no indicators"

    def test_signal_rules_have_required_fields(self):
        """All signal rules should have required fields."""
        for concept in SEMANTIC_CONCEPTS.values():
            for rule in concept.signal_rules:
                assert rule.index_name, f"{concept.concept_id} has rule without index_name"
                assert rule.direction in ("increase", "decrease", "absolute_change"), \
                    f"{concept.concept_id} rule has invalid direction: {rule.direction}"
                assert rule.threshold is not None, f"{concept.concept_id} rule has no threshold"
