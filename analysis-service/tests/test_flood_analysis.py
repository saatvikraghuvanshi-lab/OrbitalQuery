"""Tests for the flood impact intelligence pipeline."""

import numpy as np
import pytest

from app.services.query_parser import (
    parse_query,
    extract_dates,
    extract_location,
    detect_analysis_type,
    compute_event_windows,
)
from app.services.flood_detection import (
    compute_backscatter_diff,
    threshold_flood,
    remove_small_regions,
    detect_flood,
)
from app.services.flood_analysis import run_flood_assessment


# ── Query Parser Tests ──────────────────────────────────────────


class TestQueryParser:
    def test_flood_detection(self):
        assert detect_analysis_type("Assess flood impact in Jaipur") == "flood_impact"
        assert detect_analysis_type("How bad is the flooding in Mumbai?") == "flood_impact"
        assert detect_analysis_type("Show me urban expansion") != "flood_impact"

    def test_location_extraction(self):
        loc = extract_location("Flood impact in Jaipur from August 2024")
        assert loc == "jaipur"

    def test_location_case_insensitive(self):
        loc = extract_location("FLOOD in MUMBAI")
        assert loc == "mumbai"

    def test_date_extraction_month_year(self):
        dates = extract_dates("Floods in Jaipur August 2024")
        assert len(dates) > 0
        assert dates[0][0] == "2024-08-01"
        assert dates[0][1] == "2024-08-31"

    def test_date_extraction_iso(self):
        dates = extract_dates("Flooding on 2024-08-15")
        assert len(dates) > 0
        assert dates[0][0] == "2024-08-15"

    def test_full_parse(self):
        plan = parse_query("Assess flood impact in Jaipur from August 2024")
        assert plan.analysis_type == "flood_impact"
        assert plan.aoi_description == "jaipur"
        assert plan.aoi_bbox is not None
        assert plan.primary_sensor == "sentinel-1-grd"
        assert plan.secondary_sensor == "sentinel-2-l2a"

    def test_parse_with_explicit_bbox(self):
        plan = parse_query(
            "Flood assessment",
            aoi_bbox=[75.7, 26.8, 75.9, 27.0],
            event_date="2024-08-15",
        )
        assert plan.aoi_bbox == [75.7, 26.8, 75.9, 27.0]
        assert plan.event_date == "2024-08-15"
        assert plan.pre_event_start is not None
        assert plan.post_event_end is not None

    def test_event_windows(self):
        windows = compute_event_windows("2024-08-15")
        assert windows["pre_event_start"] == "2024-07-16"
        assert windows["pre_event_end"] == "2024-08-14"
        assert windows["post_event_start"] == "2024-08-15"
        assert windows["post_event_end"] == "2024-08-29"


# ── Flood Detection Algorithm Tests ─────────────────────────────


class TestFloodAlgorithms:
    def test_backscatter_diff(self):
        pre = np.full((100, 100), -12.0, dtype=np.float32)
        post = np.full((100, 100), -12.0, dtype=np.float32)
        # Create a flooded region: post drops to -20 dB
        post[40:60, 40:60] = -20.0
        diff = compute_backscatter_diff(pre, post)
        # Flooded region: pre - post = -12 - (-20) = 8 dB increase
        assert diff[50, 50] == pytest.approx(8.0)
        # Non-flooded: 0 dB
        assert diff[10, 10] == pytest.approx(0.0)

    def test_threshold_flood(self):
        diff = np.array([[-1.0, 0.0, 2.0, 4.0, 6.0]], dtype=np.float32)
        mask = threshold_flood(diff, threshold_db=3.0)
        expected = np.array([[False, False, False, True, True]])
        np.testing.assert_array_equal(mask, expected)

    def test_remove_small_regions(self):
        mask = np.zeros((50, 50), dtype=np.uint8)
        # Large region: 200 pixels
        mask[0:10, 0:20] = 1
        # Small region: 3 pixels
        mask[40:41, 40:43] = 1
        cleaned = remove_small_regions(mask, min_size=10)
        assert np.sum(cleaned) == 200
        assert cleaned[40, 40] == 0

    def test_known_flood_detection(self):
        """10x10 flood region with known area."""
        size = 100
        resolution = 10.0

        pre = np.full((size, size), -12.0, dtype=np.float32)
        post = np.full((size, size), -12.0, dtype=np.float32)
        # Flood region at (30,30)-(40,40): VV drops by 8 dB
        post[30:40, 30:40] = -20.0

        result = detect_flood(
            pre_vv_db=pre,
            post_vv_db=post,
            vv_threshold=3.0,
            min_region_size=1,
            resolution_meters=resolution,
        )

        assert result.status == "ok"
        assert result.num_flood_regions >= 1
        # 100 pixels * 100 m² = 10,000 m²
        assert result.flood_area_sq_meters == pytest.approx(10000.0, rel=0.01)
        assert result.flood_extent_pct == pytest.approx(1.0, rel=0.01)

    def test_no_flood_identical(self):
        """Identical pre/post → no flood."""
        size = 50
        pre = np.full((size, size), -12.0, dtype=np.float32)
        post = np.full((size, size), -12.0, dtype=np.float32)

        result = detect_flood(pre_vv_db=pre, post_vv_db=post)
        assert result.flood_area_sq_meters == 0
        assert result.num_flood_regions == 0

    def test_vv_vh_consensus(self):
        """VV+VH consensus should detect more than VV alone in some cases."""
        size = 50
        pre_vv = np.full((size, size), -12.0, dtype=np.float32)
        post_vv = np.full((size, size), -12.0, dtype=np.float32)
        pre_vh = np.full((size, size), -20.0, dtype=np.float32)
        post_vh = np.full((size, size), -20.0, dtype=np.float32)

        # Region 1: VV drops (detected by VV)
        post_vv[10:20, 10:20] = -20.0
        # Region 2: Only VH drops
        post_vh[30:40, 30:40] = -30.0

        result_vv_only = detect_flood(
            pre_vv_db=pre_vv, post_vv_db=post_vv,
            use_vh_fallback=False, min_region_size=1,
        )
        result_combined = detect_flood(
            pre_vv_db=pre_vv, post_vv_db=post_vv,
            pre_vh_db=pre_vh, post_vh_db=post_vh,
            use_vh_fallback=True, min_region_size=1,
        )

        # Combined should detect more area (VV region + VH region)
        assert result_combined.flood_area_sq_meters >= result_vv_only.flood_area_sq_meters

    def test_shape_mismatch_raises(self):
        pre = np.zeros((10, 10), dtype=np.float32)
        post = np.zeros((20, 20), dtype=np.float32)
        with pytest.raises(ValueError, match="Shape mismatch"):
            detect_flood(pre_vv_db=pre, post_vv_db=post)

    def test_confidence_assessment(self):
        """Low confidence when VH not available."""
        pre = np.full((50, 50), -12.0, dtype=np.float32)
        post = np.full((50, 50), -20.0, dtype=np.float32)
        result = detect_flood(pre_vv_db=pre, post_vv_db=post)
        assert "single-polarization" in " ".join(result.limitations).lower() or result.confidence in ("medium", "low")

    def test_flood_mask_in_result(self):
        """Result must include binary flood mask."""
        pre = np.full((20, 20), -12.0, dtype=np.float32)
        post = np.full((20, 20), -12.0, dtype=np.float32)
        post[5:10, 5:10] = -25.0
        result = detect_flood(pre_vv_db=pre, post_vv_db=post, min_region_size=1)
        assert result.flood_mask.shape == (20, 20)
        assert result.flood_mask.dtype in (np.uint8, np.uint32, np.int32, np.int64)

    def test_reproducibility(self):
        """Same inputs → same output (deterministic)."""
        pre = np.random.RandomState(42).uniform(-15, -5, (50, 50)).astype(np.float32)
        post = pre.copy()
        post[20:30, 20:30] -= 8.0

        r1 = detect_flood(pre_vv_db=pre, post_vv_db=post)
        r2 = detect_flood(pre_vv_db=pre, post_vv_db=post)
        assert r1.flood_area_sq_meters == r2.flood_area_sq_meters
        assert r1.num_flood_regions == r2.num_flood_regions


# ── End-to-end pipeline tests ────────────────────────────────────


class TestFloodPipeline:
    def test_metadata_only_mode(self):
        """Without backscatter arrays, pipeline returns scene metadata only."""
        result = run_flood_assessment(
            query="Assess flood impact in Jaipur August 2024",
            aoi_bbox=[75.7, 26.8, 75.9, 27.0],
            event_date="2024-08-15",
        )
        assert result.analysis_id.startswith("flood-")
        assert result.status == "metadata_only"
        assert len(result.processing_steps) > 0
        assert result.method == "sar_backscatter_threshold"

    def test_full_pipeline_with_synthetic_data(self):
        """Full pipeline with synthetic backscatter arrays."""
        size = 100
        pre = np.full((size, size), -12.0, dtype=np.float32)
        post = np.full((size, size), -12.0, dtype=np.float32)
        # 15x15 flood region
        post[20:35, 20:35] = -22.0

        result = run_flood_assessment(
            query="Flood assessment in Jaipur",
            aoi_bbox=[75.7, 26.8, 75.9, 27.0],
            event_date="2024-08-15",
            pre_vv_db=pre,
            post_vv_db=post,
            resolution_meters=10.0,
        )

        assert result.status == "ok"
        assert result.change_map_summary["flood_area_sq_meters"] > 0
        assert result.confidence in ("high", "medium")
        assert len(result.processing_steps) > 3
        assert result.evidence["plan_confidence"] in ("high", "medium")

    def test_no_aoi_returns_error(self):
        """Without AOI, pipeline should return error status."""
        result = run_flood_assessment(
            query="Flood assessment",
            aoi_bbox=[],
        )
        assert result.status == "error_no_aoi"
