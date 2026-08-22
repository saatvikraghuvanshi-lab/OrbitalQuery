"""Tests for the explanation service — deterministic explanations and validation."""

import pytest

from app.services.explanation import (
    Explanation,
    KeyFinding,
    generate_deterministic_explanation,
    validate_explanation,
    prepare_for_n8n,
)


# ── Synthetic analysis results ───────────────────────────────────


def make_flood_result_with_area() -> dict:
    """Analysis result with detected flood area."""
    return {
        "analysis_id": "flood-20240815-abc123",
        "query": "Assess flood impact in Jaipur from August 2024",
        "analysis_plan": {"analysis_type": "flood_impact", "location": "jaipur"},
        "aoi_bbox": [75.7, 26.8, 75.9, 27.0],
        "event_date": "2024-08-15",
        "selected_scenes": [
            {
                "item_id": "S1A_IW_GRDH_1SDV_20240801",
                "sensor": "sentinel-1-grd",
                "role": "pre_event",
                "datetime": "2024-08-01T04:30:00Z",
            },
            {
                "item_id": "S1A_IW_GRDH_1SDV_20240817",
                "sensor": "sentinel-1-grd",
                "role": "post_event",
                "datetime": "2024-08-17T04:30:00Z",
            },
        ],
        "processing_steps": [
            {"step": "parse_query", "detail": "Parsed query"},
            {"step": "search_s1_pre", "detail": "Found 5 pre-event scenes"},
            {"step": "search_s1_post", "detail": "Found 3 post-event scenes"},
            {"step": "flood_detection", "detail": "VV threshold 3.0 dB"},
        ],
        "method": "sar_backscatter_threshold",
        "statistics": {
            "pre_event_vv": {"mean": -12.5, "std": 2.1, "min": -18.0, "max": -5.0},
            "post_event_vv": {"mean": -15.8, "std": 3.5, "min": -25.0, "max": -8.0},
            "vv_diff_mean": 3.3,
            "flood_pixel_count": 25000,
            "total_pixel_count": 4000000,
            "flooded_in_aoi_pct": 0.625,
        },
        "change_map_summary": {
            "flood_extent_pct": 0.625,
            "flood_area_sq_meters": 2500000.0,
            "num_flood_regions": 3,
            "largest_region_sq_meters": 1800000.0,
        },
        "confidence": "high",
        "limitations": ["VH polarization not used"],
        "evidence": {
            "s1_pre_scenes_found": 5,
            "s1_post_scenes_found": 3,
            "selected_pre_event": "S1A_IW_GRDH_1SDV_20240801",
            "selected_post_event": "S1A_IW_GRDH_1SDV_20240817",
        },
    }


def make_flood_result_no_flood() -> dict:
    """Analysis result with no flood detected."""
    result = make_flood_result_with_area()
    result["analysis_id"] = "flood-20240815-noflood"
    result["change_map_summary"] = {
        "flood_extent_pct": 0.0,
        "flood_area_sq_meters": 0.0,
        "num_flood_regions": 0,
        "largest_region_sq_meters": 0.0,
    }
    result["statistics"]["flood_pixel_count"] = 0
    result["statistics"]["flooded_in_aoi_pct"] = 0.0
    return result


# ── Deterministic explanation tests ──────────────────────────────


class TestDeterministicExplanation:
    def test_generates_summary_with_flood(self):
        result = make_flood_result_with_area()
        explanation = generate_deterministic_explanation(result)
        assert explanation.analysis_id == "flood-20240815-abc123"
        assert "2.50" in explanation.summary
        assert "3 distinct" in explanation.summary

    def test_generates_summary_no_flood(self):
        result = make_flood_result_no_flood()
        explanation = generate_deterministic_explanation(result)
        assert "no significant flood signal" in explanation.summary.lower()

    def test_key_findings_include_scenes(self):
        result = make_flood_result_with_area()
        explanation = generate_deterministic_explanation(result)
        scene_findings = [f for f in explanation.key_findings if f.source == "metadata"]
        assert len(scene_findings) == 2

    def test_key_findings_include_statistics(self):
        result = make_flood_result_with_area()
        explanation = generate_deterministic_explanation(result)
        computed_findings = [f for f in explanation.key_findings if f.source == "computed"]
        assert len(computed_findings) >= 1

    def test_evidence_references_populated(self):
        result = make_flood_result_with_area()
        explanation = generate_deterministic_explanation(result)
        assert len(explanation.evidence_references) >= 2
        assert "S1A_IW_GRDH_1SDV_20240801" in explanation.evidence_references

    def test_confidence_statement_matches(self):
        result = make_flood_result_with_area()
        explanation = generate_deterministic_explanation(result)
        assert "High confidence" in explanation.confidence_statement

        result["confidence"] = "low"
        explanation = generate_deterministic_explanation(result)
        assert "Low confidence" in explanation.confidence_statement

    def test_limitations_included(self):
        result = make_flood_result_with_area()
        explanation = generate_deterministic_explanation(result)
        assert any("VH polarization" in l for l in explanation.limitations)
        # Always includes auto-analysis limitation
        assert any("automated" in l.lower() for l in explanation.limitations)

    def test_affected_area_populated(self):
        result = make_flood_result_with_area()
        explanation = generate_deterministic_explanation(result)
        assert explanation.affected_area["affected_area_sq_meters"] == 2500000.0
        assert "2.50" in explanation.affected_area["affected_area_human"]

    def test_source_is_deterministic(self):
        result = make_flood_result_with_area()
        explanation = generate_deterministic_explanation(result)
        assert explanation.source == "deterministic"

    def test_serialization(self):
        result = make_flood_result_with_area()
        explanation = generate_deterministic_explanation(result)
        d = explanation.to_dict()
        assert isinstance(d, dict)
        assert "summary" in d
        assert "key_findings" in d
        assert isinstance(d["key_findings"], list)


# ── Validation tests ─────────────────────────────────────────────


class TestExplanationValidation:
    def test_valid_explanation_passes(self):
        result = make_flood_result_with_area()
        explanation = generate_deterministic_explanation(result)
        is_valid, error = validate_explanation(explanation.to_dict(), result)
        assert is_valid is True
        assert error is None

    def test_missing_summary_fails(self):
        result = make_flood_result_with_area()
        explanation = generate_deterministic_explanation(result)
        d = explanation.to_dict()
        del d["summary"]
        is_valid, error = validate_explanation(d, result)
        assert is_valid is False
        assert "summary" in error

    def test_missing_key_findings_fails(self):
        result = make_flood_result_with_area()
        explanation = generate_deterministic_explanation(result)
        d = explanation.to_dict()
        del d["key_findings"]
        is_valid, error = validate_explanation(d, result)
        assert is_valid is False

    def test_non_array_key_findings_fails(self):
        result = make_flood_result_with_area()
        d = {"summary": "test", "key_findings": "not_an_array",
             "confidence_statement": "test", "limitations": []}
        is_valid, error = validate_explanation(d, result)
        assert is_valid is False
        assert "array" in error

    def test_area_exceeds_computed_fails(self):
        result = make_flood_result_with_area()
        d = {
            "summary": "test",
            "key_findings": [],
            "confidence_statement": "test",
            "limitations": [],
            "affected_area": {"affected_area_sq_meters": 999999999},  # Way too high
        }
        is_valid, error = validate_explanation(d, result)
        assert is_valid is False
        assert "exceeds" in error.lower()


# ── n8n preparation tests ───────────────────────────────────────


class TestN8nPreparation:
    def test_strips_large_arrays(self):
        result = make_flood_result_with_area()
        payload = prepare_for_n8n(result)
        assert "analysis_id" in payload
        assert "statistics" in payload
        assert "selected_scenes" in payload
        # Selected scenes should be simplified
        assert all("item_id" in s for s in payload["selected_scenes"])

    def test_preserves_essential_fields(self):
        result = make_flood_result_with_area()
        payload = prepare_for_n8n(result)
        assert payload["analysis_id"] == result["analysis_id"]
        assert payload["query"] == result["query"]
        assert payload["method"] == result["method"]
        assert payload["confidence"] == result["confidence"]
        assert payload["statistics"] == result["statistics"]

    def test_empty_result_handled(self):
        payload = prepare_for_n8n({})
        assert payload["analysis_id"] == "unknown"
        assert payload["selected_scenes"] == []
