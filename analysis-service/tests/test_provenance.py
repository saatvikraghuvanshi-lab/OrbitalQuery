"""Tests for Provenance / Evidence Chain."""

import pytest
from app.services.provenance import (
    ProvenanceRecord,
    record_provenance,
    get_provenance,
    list_provenance,
    get_evidence,
    _provenance_store,
)


@pytest.fixture(autouse=True)
def clean_store():
    """Clean the in-memory store before each test."""
    _provenance_store.clear()
    yield
    _provenance_store.clear()


# ══════════════════════════════════════════════════════════════════
# Record Tests
# ══════════════════════════════════════════════════════════════════

class TestProvenanceRecord:
    def test_create_record(self):
        record = ProvenanceRecord(user_query="flood in Jaipur")
        assert record.analysis_id.startswith("prov-")
        assert record.user_query == "flood in Jaipur"
        assert record.created_at

    def test_record_to_dict(self):
        record = ProvenanceRecord(
            user_query="urban expansion in Jaipur",
            provider="bhoonidhi",
            collection="ResourceSat-2A_AWIFS_L2",
        )
        d = record.to_dict()
        assert d["user_query"] == "urban expansion in Jaipur"
        assert d["provider"] == "bhoonidhi"
        assert d["collection"] == "ResourceSat-2A_AWIFS_L2"
        assert "analysis_id" in d
        assert "created_at" in d

    def test_record_with_full_chain(self):
        record = ProvenanceRecord(
            user_query="deforestation near Assam",
            analysis_plan={
                "phenomenon": "vegetation_change",
                "aoi": "assam",
                "bbox": [89.5, 24.0, 96.0, 28.0],
            },
            provider="planetary_computer",
            collection="sentinel-2-l2a",
            stac_query_params={"bbox": [89.5, 24.0, 96.0, 28.0], "limit": 10},
            selected_scenes=[
                {
                    "scene_id": "S2A_MSIL2A_20240620T053649",
                    "satellite": "Sentinel-2A",
                    "acquisition_date": "2024-06-20",
                    "cloud_cover_pct": 3.1,
                    "provider": "planetary_computer",
                    "resolution_m": 10,
                    "assets_selected": ["B04", "B08"],
                },
            ],
            preprocessing_steps=[
                {"step": "cloud_masking", "method": "SCL band threshold"},
                {"step": "reprojection", "from": "EPSG:32646", "to": "EPSG:4326"},
            ],
            algorithms=[
                {
                    "name": "NDVI",
                    "formula": "(NIR - Red) / (NIR + Red)",
                    "bands": {"nir": "B08", "red": "B04"},
                },
            ],
            statistics={"ndvi_change_mean": -0.25, "degradation_area_km2": 15.0},
            decision={"overall_severity": "HIGH", "confidence": "high"},
            explanation={"summary": "Significant vegetation loss detected in Assam region."},
            confidence="high",
            limitations=["Cloud cover may affect some pixels"],
            processing_time_ms=4500,
        )
        d = record.to_dict()
        assert len(d["selected_scenes"]) == 1
        assert len(d["preprocessing_steps"]) == 2
        assert len(d["algorithms"]) == 1
        assert d["processing_time_ms"] == 4500


# ══════════════════════════════════════════════════════════════════
# Store Tests
# ══════════════════════════════════════════════════════════════════

class TestProvenanceStore:
    def test_record_and_retrieve(self):
        record = ProvenanceRecord(user_query="test query")
        aid = record_provenance(record)
        assert aid == record.analysis_id
        retrieved = get_provenance(aid)
        assert retrieved is not None
        assert retrieved.user_query == "test query"

    def test_record_generates_id(self):
        record = ProvenanceRecord()
        aid = record_provenance(record)
        assert aid.startswith("prov-")
        assert len(aid) >= 10

    def test_get_nonexistent(self):
        assert get_provenance("prov-nonexistent") is None

    def test_list_records(self):
        for i in range(5):
            record_provenance(ProvenanceRecord(user_query=f"query {i}"))
        records = list_provenance(limit=3)
        assert len(records) == 3

    def test_list_records_ordered_newest_first(self):
        import time
        r1_id = record_provenance(ProvenanceRecord(user_query="first"))
        # Manually set different timestamps for ordering test
        _provenance_store[r1_id].created_at = "2024-01-01T00:00:00Z"
        r2_id = record_provenance(ProvenanceRecord(user_query="second"))
        _provenance_store[r2_id].created_at = "2024-06-01T00:00:00Z"
        records = list_provenance()
        assert records[0].analysis_id == r2_id
        assert records[1].analysis_id == r1_id


# ══════════════════════════════════════════════════════════════════
# Evidence Chain Tests
# ══════════════════════════════════════════════════════════════════

class TestEvidenceChain:
    def test_evidence_chain_structure(self):
        record = ProvenanceRecord(
            user_query="flood in Jaipur",
            analysis_plan={"phenomenon": "flood_impact"},
            provider="bhoonidhi",
            collection="Sentinel-1A_SAR-IW_GRD",
            selected_scenes=[{"scene_id": "S1A_001"}],
            preprocessing_steps=[{"step": "radiometric_calibration"}],
            algorithms=[{"name": "SAR_thresholding"}],
            statistics={"flood_area_km2": 10.0},
            decision={"overall_severity": "HIGH"},
            explanation={"summary": "Flood detected."},
        )
        record_provenance(record)
        chain = get_evidence(record.analysis_id)
        assert chain is not None
        assert len(chain) == 9  # All 9 steps present

    def test_evidence_chain_step_names(self):
        record = ProvenanceRecord(
            user_query="test",
            analysis_plan={"phenomenon": "test"},
            provider="test",
            selected_scenes=[{"id": "s1"}],
            preprocessing_steps=[{"step": "p1"}],
            algorithms=[{"name": "test"}],
            statistics={"x": 1},
            decision={"y": 2},
            explanation={"z": 3},
        )
        record_provenance(record)
        chain = get_evidence(record.analysis_id)
        step_names = [s["name"] for s in chain]
        assert "User Query" in step_names
        assert "Analysis Plan" in step_names
        assert "Data Discovery" in step_names
        assert "Selected Scenes" in step_names
        assert "Preprocessing" in step_names
        assert "Algorithms" in step_names
        assert "Results" in step_names
        assert "Decision Intelligence" in step_names
        assert "Explanation" in step_names

    def test_evidence_chain_nonexistent(self):
        assert get_evidence("prov-nonexistent") is None

    def test_evidence_chain_step_numbers(self):
        record = ProvenanceRecord(
            user_query="test",
            analysis_plan={"phenomenon": "test"},
            provider="test",
            selected_scenes=[{"id": "s1"}],
            preprocessing_steps=[{"step": "p1"}],
            algorithms=[{"name": "a1"}],
            statistics={"x": 1},
            decision={"y": 2},
            explanation={"z": 3},
        )
        record_provenance(record)
        chain = get_evidence(record.analysis_id)
        # Steps are numbered 1..N, not by index
        for i, step in enumerate(chain):
            assert step["step"] == i + 1

    def test_evidence_chain_describes_query(self):
        record = ProvenanceRecord(user_query="urban expansion in Jaipur")
        record_provenance(record)
        chain = get_evidence(record.analysis_id)
        query_step = chain[0]
        assert query_step["name"] == "User Query"
        assert query_step["description"] == "urban expansion in Jaipur"

    def test_evidence_chain_links_to_scenes(self):
        scenes = [
            {"scene_id": "S2A_001", "cloud_cover_pct": 5.0},
            {"scene_id": "S2A_002", "cloud_cover_pct": 8.0},
        ]
        record = ProvenanceRecord(
            user_query="test",
            analysis_plan={"phenomenon": "test"},
            provider="planetary_computer",
            selected_scenes=scenes,
        )
        record_provenance(record)
        chain = get_evidence(record.analysis_id)
        scenes_step = [s for s in chain if s["name"] == "Selected Scenes"][0]
        assert scenes_step["data"] == scenes
        assert "2 scene(s)" in scenes_step["description"]

    def test_full_audit_trail(self):
        """Test that a complete analysis produces a full audit trail."""
        record = ProvenanceRecord(
            user_query="Assess flood impact in Assam 2024",
            analysis_plan={
                "phenomenon": "flood_impact",
                "aoi": "assam",
                "bbox": [89.5, 24.0, 96.0, 28.0],
                "time_range": {"start": "2024-06-01", "end": "2024-08-31"},
            },
            provider="planetary_computer",
            collection="sentinel-1-grd",
            stac_query_params={"bbox": [89.5, 24.0, 96.0, 28.0], "limit": 10},
            selected_scenes=[
                {
                    "scene_id": "S1A_IW_GRD_20240615",
                    "satellite": "Sentinel-1A",
                    "sensor": "SAR-C",
                    "acquisition_date": "2024-06-15",
                    "cloud_cover_pct": 0,
                    "provider": "planetary_computer",
                    "resolution_m": 10,
                },
            ],
            preprocessing_steps=[
                {"step": "radiometric_calibration"},
                {"step": "terrain_correction"},
                {"step": "speckle_filter"},
            ],
            algorithms=[
                {"name": "SAR_thresholding", "bands": ["VV", "VH"], "threshold_db": -15},
            ],
            statistics={"flood_area_km2": 45.3, "aoi_area_km2": 500.0, "flood_pct": 9.06},
            decision={"overall_severity": "HIGH", "confidence": "high"},
            explanation={"summary": "Major flooding detected in Assam."},
            confidence="high",
            limitations=["Limited to SAR-visible areas"],
            processing_time_ms=12000,
        )
        record_provenance(record)
        chain = get_evidence(record.analysis_id)

        assert len(chain) == 9
        assert chain[0]["data"]["query"] == "Assess flood impact in Assam 2024"
        assert chain[1]["data"]["phenomenon"] == "flood_impact"
        assert chain[2]["data"]["provider"] == "planetary_computer"
        assert chain[3]["data"][0]["scene_id"] == "S1A_IW_GRD_20240615"
        assert len(chain[4]["data"]) == 3  # 3 preprocessing steps
        assert chain[5]["data"][0]["name"] == "SAR_thresholding"
        assert chain[6]["data"]["flood_area_km2"] == 45.3
        assert chain[7]["data"]["overall_severity"] == "HIGH"
        assert chain[8]["data"]["summary"] == "Major flooding detected in Assam."
