"""
Tests for Stage 11 — Query → Analysis Plan.

Tests:
- Phenomenon detection from NL queries
- Date extraction from NL queries
- AOI extraction from NL queries
- Full plan building (valid + invalid cases)
- Validation rules
- Known-good plans
- Unsupported queries
- Override fields
"""

from __future__ import annotations

import pytest
from datetime import date

from app.services.capability_registry import (
    PHENOMENON_REGISTRY,
    ANALYSIS_TYPES,
    detect_phenomenon,
    validate_analysis_plan,
    list_phenomena,
    list_analysis_types,
)
from app.services.query_to_plan import (
    extract_dates,
    extract_aoi,
    resolve_bbox,
    select_sensor,
    select_analysis_type,
    select_bands,
    build_analysis_plan,
    KNOWN_LOCATIONS,
)


# ═══════════════════════════════════════════════════════════════
# SECTION 1: Phenomenon Detection
# ═══════════════════════════════════════════════════════════════

class TestPhenomenonDetection:
    def test_urban_expansion(self):
        assert detect_phenomenon("urban expansion near Jaipur") == "urban_expansion"

    def test_urban_synonyms(self):
        assert detect_phenomenon("city growth in Mumbai") == "urban_expansion"

    def test_flood_impact(self):
        assert detect_phenomenon("flood impact assessment") == "flood_impact"

    def test_flood_synonyms(self):
        assert detect_phenomenon("inundation area near river") == "flood_impact"

    def test_vegetation_change(self):
        assert detect_phenomenon("deforestation in Assam") == "vegetation_change"

    def test_vegetation_ndvi(self):
        assert detect_phenomenon("NDVI change analysis") == "vegetation_change"

    def test_burn_severity(self):
        assert detect_phenomenon("forest fire damage assessment") == "burn_severity"

    def test_burn_synonyms(self):
        assert detect_phenomenon("wildfire burn severity") == "burn_severity"

    def test_water_change(self):
        assert detect_phenomenon("lake water level change") == "water_change"

    def test_snow_cover(self):
        assert detect_phenomenon("glacier retreat in Himalayas") == "snow_cover"

    def test_soil_moisture(self):
        assert detect_phenomenon("soil moisture drought analysis") == "soil_moisture"

    def test_land_cover_change(self):
        assert detect_phenomenon("land cover change detection") == "land_cover_change"

    def test_unrecognized_query(self):
        result = detect_phenomenon("tell me a joke")
        assert result is None

    def test_empty_query(self):
        result = detect_phenomenon("")
        assert result is None

    def test_ambiguous_query_prefers_stronger_match(self):
        # "urban expansion" is longer than "vegetation"
        result = detect_phenomenon("urban expansion near vegetation")
        assert result == "urban_expansion"


# ═══════════════════════════════════════════════════════════════
# SECTION 2: Date Extraction
# ═══════════════════════════════════════════════════════════════

class TestDateExtraction:
    def test_between_years(self):
        dates = extract_dates("change between 2018 and 2025")
        assert dates["start_date"] == "2018-01-01"
        assert dates["end_date"] == "2025-12-31"

    def test_from_to_years(self):
        dates = extract_dates("from 2015 to 2020")
        assert dates["start_date"] == "2015-01-01"
        assert dates["end_date"] == "2020-12-31"

    def test_dash_range(self):
        dates = extract_dates("analysis 2019-2023")
        assert dates["start_date"] == "2019-01-01"
        assert dates["end_date"] == "2023-12-31"

    def test_en_dash_range(self):
        dates = extract_dates("period 2018–2024")
        assert dates["start_date"] == "2018-01-01"
        assert dates["end_date"] == "2024-12-31"

    def test_in_year(self):
        dates = extract_dates("data from 2022")
        # "in 2022" won't match because "from" is captured first
        # But "from 2015 to 2020" has both
        # "data in 2022" should work
        dates2 = extract_dates("data in 2022")
        assert dates2["start_date"] == "2022-01-01"
        assert dates2["end_date"] == "2022-12-31"

    def test_after_year(self):
        dates = extract_dates("after 2020")
        assert dates["start_date"] == "2020-01-01"
        assert dates["end_date"] is not None  # Should be today-ish

    def test_before_year(self):
        dates = extract_dates("before 2020")
        assert dates["start_date"] == "2015-01-01"
        assert dates["end_date"] == "2020-12-31"

    def test_standalone_years(self):
        dates = extract_dates("2018 to 2025")
        assert dates["start_date"] == "2018-01-01"
        assert dates["end_date"] == "2025-12-31"

    def test_no_dates(self):
        dates = extract_dates("show me vegetation")
        assert dates["start_date"] is None
        assert dates["end_date"] is None

    def test_single_year(self):
        dates = extract_dates("analysis 2023")
        assert dates["start_date"] == "2023-01-01"
        assert dates["end_date"] == "2023-12-31"


# ═══════════════════════════════════════════════════════════════
# SECTION 3: AOI Extraction
# ═══════════════════════════════════════════════════════════════

class TestAOIExtraction:
    def test_jaipur(self):
        assert extract_aoi("urban expansion in Jaipur") == "jaipur"

    def test_mumbai(self):
        assert extract_aoi("flood near Mumbai") == "mumbai"

    def test_himalayas(self):
        assert extract_aoi("glacier retreat in Himalayas") == "himalayas"

    def test_sundarbans(self):
        assert extract_aoi("deforestation in Sundarbans") == "sundarbans"

    def test_thar_desert(self):
        assert extract_aoi("sand dune movement in Thar Desert") == "thar desert"

    def test_unknown_location(self):
        assert extract_aoi("vegetation in Atlantis") is None

    def test_longest_match_wins(self):
        # "new york" should match before any substring
        result = extract_aoi("analysis in New York City")
        assert result == "new york"

    def test_resolve_bbox_known(self):
        bbox = resolve_bbox("jaipur")
        assert bbox == [75.7, 26.8, 75.9, 27.0]

    def test_resolve_bbox_unknown(self):
        assert resolve_bbox("atlantis") is None


# ═══════════════════════════════════════════════════════════════
# SECTION 4: Sensor Selection
# ═══════════════════════════════════════════════════════════════

class TestSensorSelection:
    def test_urban_selects_sentinel2(self):
        assert select_sensor("urban_expansion") == "sentinel-2-l2a"

    def test_flood_selects_sentinel1(self):
        assert select_sensor("flood_impact") == "sentinel-1-grd"

    def test_vegetation_selects_sentinel2(self):
        assert select_sensor("vegetation_change") == "sentinel-2-l2a"

    def test_analysis_type_selection(self):
        assert select_analysis_type("urban_expansion") == "ndbi_change"

    def test_bands_selection_optical(self):
        bands = select_bands("urban_expansion", "sentinel-2-l2a")
        assert "B08" in bands or "B11" in bands  # NIR or SWIR

    def test_bands_selection_sar(self):
        bands = select_bands("flood_impact", "sentinel-1-grd")
        assert "vv" in bands or "vh" in bands


# ═══════════════════════════════════════════════════════════════
# SECTION 5: Validation
# ═══════════════════════════════════════════════════════════════

class TestValidation:
    def test_valid_plan_no_errors(self):
        errors = validate_analysis_plan(
            phenomenon="urban_expansion",
            analysis_type="ndbi_change",
            sensor="sentinel-2-l2a",
            bands=["B08", "B11", "B04"],
            start_date="2018-01-01",
            end_date="2025-12-31",
        )
        assert errors == []

    def test_unsupported_phenomenon(self):
        errors = validate_analysis_plan(
            phenomenon="alien_invasion",
            analysis_type="ndbi_change",
            sensor="sentinel-2-l2a",
            bands=["B08", "B11"],
        )
        assert len(errors) > 0
        assert "Unsupported" in errors[0] or "alien_invasion" in errors[0]

    def test_wrong_analysis_type_for_phenomenon(self):
        errors = validate_analysis_plan(
            phenomenon="urban_expansion",
            analysis_type="flood_detection",  # Wrong type
            sensor="sentinel-2-l2a",
            bands=["B08", "B11"],
        )
        assert len(errors) > 0

    def test_wrong_sensor_for_phenomenon(self):
        errors = validate_analysis_plan(
            phenomenon="urban_expansion",
            analysis_type="ndbi_change",
            sensor="sentinel-1-grd",  # SAR can't do NDBI
            bands=["vv", "vh"],
        )
        assert len(errors) > 0

    def test_missing_bands(self):
        errors = validate_analysis_plan(
            phenomenon="urban_expansion",
            analysis_type="ndbi_change",
            sensor="sentinel-2-l2a",
            bands=["B04"],  # Missing NIR and SWIR
        )
        assert len(errors) > 0

    def test_date_order_invalid(self):
        errors = validate_analysis_plan(
            phenomenon="urban_expansion",
            analysis_type="ndbi_change",
            sensor="sentinel-2-l2a",
            bands=["B08", "B11"],
            start_date="2025-01-01",
            end_date="2018-01-01",  # Before start
        )
        assert len(errors) > 0

    def test_temporal_diff_needs_dates(self):
        errors = validate_analysis_plan(
            phenomenon="urban_expansion",
            analysis_type="ndbi_change",
            sensor="sentinel-2-l2a",
            bands=["B08", "B11"],
            start_date=None,
            end_date=None,
        )
        assert len(errors) > 0

    def test_wrong_band_for_sensor(self):
        errors = validate_analysis_plan(
            phenomenon="urban_expansion",
            analysis_type="ndbi_change",
            sensor="sentinel-2-l2a",
            bands=["B08", "B99"],  # B99 doesn't exist on S2
        )
        assert len(errors) > 0


# ═══════════════════════════════════════════════════════════════
# SECTION 6: Full Plan Building (known-good plans)
# ═══════════════════════════════════════════════════════════════

class TestPlanBuilding:
    def test_jaipur_urban(self):
        result = build_analysis_plan(
            "How much of Jaipur became urbanized between 2018 and 2025?"
        )
        assert result["status"] == "ok"
        plan = result["plan"]
        assert plan["phenomenon"] == "urban_expansion"
        assert plan["aoi"] == "jaipur"
        assert plan["bbox"] == [75.7, 26.8, 75.9, 27.0]
        assert plan["start_date"] == "2018-01-01"
        assert plan["end_date"] == "2025-12-31"
        assert plan["sensor"] == "sentinel-2-l2a"
        assert plan["analysis_type"] == "ndbi_change"
        assert "SWIR" in plan["bands"] or "B11" in plan["bands"]

    def test_flood_mumbai(self):
        result = build_analysis_plan(
            "Assess flood impact in Mumbai 2024"
        )
        assert result["status"] == "ok"
        plan = result["plan"]
        assert plan["phenomenon"] == "flood_impact"
        assert plan["aoi"] == "mumbai"
        assert plan["sensor"] == "sentinel-1-grd"

    def test_vegetation_assam(self):
        result = build_analysis_plan(
            "Deforestation near Assam 2015-2020"
        )
        assert result["status"] == "ok"
        plan = result["plan"]
        assert plan["phenomenon"] == "vegetation_change"
        assert plan["start_date"] == "2015-01-01"
        assert plan["end_date"] == "2020-12-31"

    def test_burn_severity(self):
        result = build_analysis_plan(
            "Forest fire burn severity in Uttarakhand 2023"
        )
        assert result["status"] == "ok"
        plan = result["plan"]
        assert plan["phenomenon"] == "burn_severity"
        assert plan["analysis_type"] == "nbr_change"

    def test_glacier_retreat(self):
        result = build_analysis_plan(
            "Glacier retreat in Himalayas 2010-2024"
        )
        assert result["status"] == "ok"
        plan = result["plan"]
        assert plan["phenomenon"] == "snow_cover"
        assert plan["analysis_type"] == "ndsi_change"

    def test_unsupported_query(self):
        result = build_analysis_plan("tell me a joke about satellites")
        assert result["status"] == "unsupported"
        assert "suggestions" in result

    def test_no_location(self):
        result = build_analysis_plan("urban expansion 2020-2024")
        assert result["status"] == "error"
        assert "known_locations" in result

    def test_override_phenomenon(self):
        result = build_analysis_plan(
            "analysis in Jaipur",
            overrides={"phenomenon": "vegetation_change", "start_date": "2020-01-01", "end_date": "2024-12-31"},
        )
        assert result["status"] == "ok"
        assert result["plan"]["phenomenon"] == "vegetation_change"

    def test_override_bbox(self):
        result = build_analysis_plan(
            "analysis near unknown place",
            overrides={"bbox": [0, 0, 1, 1], "phenomenon": "urban_expansion", "start_date": "2020-01-01", "end_date": "2024-12-31"},
        )
        assert result["status"] == "ok"
        assert result["plan"]["bbox"] == [0, 0, 1, 1]

    def test_plan_has_required_fields(self):
        result = build_analysis_plan(
            "urban expansion in Jaipur 2018-2025"
        )
        assert result["status"] == "ok"
        plan = result["plan"]
        required = [
            "plan_id", "query", "phenomenon", "analysis_type",
            "sensor", "bands", "aoi", "bbox", "start_date", "end_date",
            "cloud_threshold", "comparison_strategy", "output_requirements",
        ]
        for field in required:
            assert field in plan, f"Missing field: {field}"


# ═══════════════════════════════════════════════════════════════
# SECTION 7: Registry completeness
# ═══════════════════════════════════════════════════════════════

class TestRegistry:
    def test_all_phenomena_have_analysis_types(self):
        for name, config in PHENOMENON_REGISTRY.items():
            assert len(config["analysis_types"]) > 0, f"{name} has no analysis types"

    def test_all_phenomena_have_keywords(self):
        for name, config in PHENOMENON_REGISTRY.items():
            assert len(config["keywords"]) > 0, f"{name} has no keywords"

    def test_all_phenomena_have_sensors(self):
        for name, config in PHENOMENON_REGISTRY.items():
            assert len(config["preferred_sensors"]) > 0, f"{name} has no sensors"

    def test_analysis_types_have_required_fields(self):
        for name, config in ANALYSIS_TYPES.items():
            assert config.name == name
            assert len(config.preferred_sensors) > 0
            assert config.min_scenes >= 1
            assert config.max_scenes >= config.min_scenes

    def test_list_phenomena(self):
        result = list_phenomena()
        assert len(result) > 0
        assert all("phenomenon" in p for p in result)

    def test_list_analysis_types(self):
        result = list_analysis_types()
        assert len(result) > 0
        assert all("name" in a for a in result)

    def test_known_locations_count(self):
        assert len(KNOWN_LOCATIONS) >= 20
