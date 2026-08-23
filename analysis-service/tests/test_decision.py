"""Tests for Decision Intelligence Engine."""

import pytest
from app.services.decision_engine import (
    assess_flood_impact,
    assess_urban_impact,
    assess_vegetation_impact,
    assess_impact,
)
from app.services.decision_config import (
    Severity,
    FloodThresholds,
    UrbanThresholds,
    VegetationThresholds,
)


# ══════════════════════════════════════════════════════════════════
# Flood Impact Tests
# ══════════════════════════════════════════════════════════════════

class TestFloodImpact:
    def test_no_flood(self):
        result = assess_flood_impact({
            "total_flood_area_km2": 0.0,
            "aoi_area_km2": 100.0,
            "confidence": "high",
        })
        assert result.overall_severity == Severity.LOW
        assert result.confidence == "no_flood_detected"
        assert len(result.metrics) == 2

    def test_low_flood(self):
        result = assess_flood_impact({
            "total_flood_area_km2": 2.0,
            "aoi_area_km2": 100.0,
            "cluster_count": 1,
        })
        assert result.overall_severity == Severity.MEDIUM
        area_metric = result.metrics[0]
        assert area_metric.name == "total_flood_area"
        assert area_metric.value == 2.0
        assert area_metric.unit == "km²"
        assert area_metric.severity == Severity.MEDIUM
        assert "SAR backscatter" in area_metric.source_analysis

    def test_medium_flood(self):
        result = assess_flood_impact({
            "total_flood_area_km2": 15.0,
            "aoi_area_km2": 500.0,
            "cluster_count": 3,
        })
        assert result.overall_severity == Severity.HIGH

    def test_high_flood(self):
        result = assess_flood_impact({
            "total_flood_area_km2": 60.0,
            "aoi_area_km2": 500.0,
            "cluster_count": 7,
        })
        assert result.overall_severity == Severity.CRITICAL

    def test_builtup_intersection(self):
        result = assess_flood_impact({
            "total_flood_area_km2": 30.0,
            "aoi_area_km2": 200.0,
            "builtup_affected_km2": 5.0,
            "cluster_count": 4,
        })
        builtup = [m for m in result.metrics if m.name == "builtup_affected"]
        assert len(builtup) == 1
        assert builtup[0].severity == Severity.HIGH
        assert builtup[0].unit == "km²"

    def test_no_builtup_data(self):
        result = assess_flood_impact({
            "total_flood_area_km2": 10.0,
            "aoi_area_km2": 200.0,
        })
        builtup = [m for m in result.metrics if m.name == "builtup_affected"]
        assert len(builtup) == 0
        assert any("Built-up" in lim for lim in result.limitations)

    def test_recommendations_for_critical(self):
        result = assess_flood_impact({
            "total_flood_area_km2": 100.0,
            "aoi_area_km2": 500.0,
            "builtup_affected_km2": 15.0,
            "cluster_count": 8,
        })
        assert result.overall_severity == Severity.CRITICAL
        assert any("IMMEDIATE" in r for r in result.recommendations)

    def test_metrics_have_provenance(self):
        result = assess_flood_impact({
            "total_flood_area_km2": 5.0,
            "aoi_area_km2": 100.0,
        })
        for metric in result.metrics:
            assert metric.name
            assert metric.value is not None
            assert metric.unit
            assert metric.source_analysis
            assert metric.method

    def test_custom_thresholds(self):
        custom = FloodThresholds(low_area_km2=0.1, medium_area_km2=1.0, high_area_km2=5.0)
        result = assess_flood_impact(
            {"total_flood_area_km2": 3.0, "aoi_area_km2": 100.0},
            thresholds=custom,
        )
        assert result.overall_severity == Severity.HIGH

    def test_output_to_dict(self):
        result = assess_flood_impact({
            "total_flood_area_km2": 10.0,
            "aoi_area_km2": 200.0,
        })
        d = result.to_dict()
        assert d["analysis_type"] == "flood_impact"
        assert d["overall_severity"] in ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
        assert isinstance(d["metrics"], list)
        assert isinstance(d["recommendations"], list)


# ══════════════════════════════════════════════════════════════════
# Urban Expansion Tests
# ══════════════════════════════════════════════════════════════════

class TestUrbanImpact:
    def test_no_change(self):
        result = assess_urban_impact({
            "ndbi_change_mean": 0.01,
            "urban_expansion_area_km2": 0.1,
        })
        assert result.overall_severity == Severity.LOW

    def test_moderate_expansion(self):
        result = assess_urban_impact({
            "ndbi_change_mean": 0.20,
            "urban_expansion_area_km2": 6.0,
            "expansion_pct": 3.0,
        })
        assert result.overall_severity == Severity.HIGH

    def test_rapid_expansion(self):
        result = assess_urban_impact({
            "ndbi_change_mean": 0.35,
            "urban_expansion_area_km2": 30.0,
            "expansion_pct": 10.0,
        })
        assert result.overall_severity == Severity.CRITICAL

    def test_output_structure(self):
        result = assess_urban_impact({
            "ndbi_change_mean": 0.2,
            "urban_expansion_area_km2": 5.0,
        })
        d = result.to_dict()
        assert d["analysis_type"] == "urban_expansion"
        assert len(d["metrics"]) >= 2


# ══════════════════════════════════════════════════════════════════
# Vegetation Change Tests
# ══════════════════════════════════════════════════════════════════

class TestVegetationImpact:
    def test_stable(self):
        result = assess_vegetation_impact({
            "ndvi_change_mean": -0.05,
        })
        assert result.overall_severity == Severity.LOW

    def test_moderate_degradation(self):
        result = assess_vegetation_impact({
            "ndvi_change_mean": -0.3,
            "degradation_area_km2": 15.0,
        })
        assert result.overall_severity == Severity.HIGH

    def test_severe_degradation(self):
        result = assess_vegetation_impact({
            "ndvi_change_mean": -0.5,
            "degradation_area_km2": 60.0,
        })
        assert result.overall_severity == Severity.CRITICAL


# ══════════════════════════════════════════════════════════════════
# Generic Dispatcher Tests
# ══════════════════════════════════════════════════════════════════

class TestGenericDispatcher:
    def test_flood_dispatch(self):
        result = assess_impact("flood_impact", {
            "total_flood_area_km2": 20.0,
            "aoi_area_km2": 300.0,
        })
        assert result.analysis_type == "flood_impact"
        assert result.overall_severity == Severity.HIGH

    def test_urban_dispatch(self):
        result = assess_impact("urban_expansion", {
            "ndbi_change_mean": 0.25,
            "urban_expansion_area_km2": 8.0,
        })
        assert result.analysis_type == "urban_expansion"

    def test_unknown_type(self):
        result = assess_impact("unknown_analysis", {"some_stat": 1.0})
        assert result.overall_severity == Severity.LOW
        assert any("No decision rules" in lim for lim in result.limitations)

    def test_all_outputs_have_method(self):
        result = assess_impact("flood_impact", {
            "total_flood_area_km2": 5.0,
            "aoi_area_km2": 100.0,
        })
        assert result.method
        for m in result.metrics:
            assert m.method
