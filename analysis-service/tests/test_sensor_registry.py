"""Tests for sensor registry and Sentinel-1 service."""

import pytest

from app.services.sensor_registry import (
    SENSOR_REGISTRY,
    get_sensor,
    get_all_sensors,
    get_optical_sensors,
    get_sar_sensors,
    get_sensor_bands,
    get_sensors_for_index,
    recommend_sensor,
)


# ── Registry tests ───────────────────────────────────────────────


class TestSensorRegistry:
    def test_all_sensors_present(self):
        sensors = get_all_sensors()
        names = [s["name"] for s in sensors]
        assert "sentinel-2-l2a" in names
        assert "landsat-c2-l2" in names
        assert "sentinel-1-grd" in names
        assert "naip" in names

    def test_sentinel2_is_optical(self):
        cap = get_sensor("sentinel-2-l2a")
        assert cap is not None
        assert cap.is_optical is True
        assert cap.is_sar is False
        assert cap.is_multispectral is True

    def test_sentinel1_is_sar(self):
        cap = get_sensor("sentinel-1-grd")
        assert cap is not None
        assert cap.is_sar is True
        assert cap.is_optical is False
        assert cap.spatial_resolution_m == 10.0

    def test_landsat_bands(self):
        bands = get_sensor_bands("landsat-c2-l2")
        assert "B1" in bands
        assert "B4" in bands  # NIR
        assert bands["B3"]["name"] == "Red"

    def test_sentinel2_bands(self):
        bands = get_sensor_bands("sentinel-2-l2a")
        assert "B02" in bands
        assert "B04" in bands
        assert "B08" in bands
        assert bands["B08"]["name"] == "NIR"

    def test_sentinel1_polarizations(self):
        cap = get_sensor("sentinel-1-grd")
        assert "VV" in cap.polarizations
        assert "VH" in cap.polarizations

    def test_unknown_sensor(self):
        cap = get_sensor("nonexistent-sensor")
        assert cap is None

    def test_optical_sensors(self):
        optical = get_optical_sensors()
        assert "sentinel-2-l2a" in optical
        assert "landsat-c2-l2" in optical
        assert "sentinel-1-grd" not in optical

    def test_sar_sensors(self):
        sar = get_sar_sensors()
        assert "sentinel-1-grd" in sar
        assert "sentinel-2-l2a" not in sar


# ── Index support tests ──────────────────────────────────────────


class TestIndexSensorMapping:
    def test_ndvi_sensors(self):
        sensors = get_sensors_for_index("NDVI")
        assert "sentinel-2-l2a" in sensors
        assert "landsat-c2-l2" in sensors

    def test_sentinel1_no_optical_indices(self):
        """Sentinel-1 should NOT support optical indices like NDVI."""
        sensors = get_sensors_for_index("NDVI")
        assert "sentinel-1-grd" not in sensors

    def test_all_indices_have_sensors(self):
        for index_name in ["NDVI", "NDWI", "NDBI", "NBR", "NDSI"]:
            sensors = get_sensors_for_index(index_name)
            assert len(sensors) > 0, f"No sensors support {index_name}"


# ── Recommendation tests ─────────────────────────────────────────


class TestSensorRecommendation:
    def test_optical_recommendation(self):
        recs = recommend_sensor(is_optical_needed=True, is_sar_needed=False)
        assert len(recs) > 0
        # Should include optical sensors
        for name in recs:
            cap = get_sensor(name)
            assert cap.is_optical is True

    def test_sar_recommendation(self):
        recs = recommend_sensor(is_optical_needed=False, is_sar_needed=True)
        assert "sentinel-1-grd" in recs

    def test_high_resolution_recommendation(self):
        recs = recommend_sensor(is_optical_needed=True, max_resolution=1.0)
        assert "naip" in recs

    def test_frequent_revisit_recommendation(self):
        recs = recommend_sensor(is_optical_needed=True, max_revisit_days=10)
        # Sentinel-2 has 5-day revisit
        assert "sentinel-2-l2a" in recs
        # Landsat has 16-day revisit, should be excluded
        assert "landsat-c2-l2" not in recs


# ── Sentinel-1 specific tests ────────────────────────────────────


class TestSentinel1Capabilities:
    def test_s1_has_no_cloud_cover(self):
        """S1 is SAR — cloud cover field should be False."""
        cap = get_sensor("sentinel-1-grd")
        assert cap.has_cloud_cover is False

    def test_s1_acquisition_modes(self):
        cap = get_sensor("sentinel-1-grd")
        assert "IW" in cap.acquisition_modes
        assert "EW" in cap.acquisition_modes

    def test_s1_orbit_types(self):
        cap = get_sensor("sentinel-1-grd")
        assert "sun-synchronous" in cap.orbit_types

    def test_s1_sar_extensions(self):
        cap = get_sensor("sentinel-1-grd")
        assert "sar" in cap.stac_extensions

    def test_s1_no_optical_bands(self):
        """S1 should not have optical band names like B02, B04."""
        cap = get_sensor("sentinel-1-grd")
        band_keys = list(cap.bands.keys())
        assert "B02" not in band_keys
        assert "B04" not in band_keys
        # Should have VV/VH
        assert any("v" in k.lower() for k in band_keys)
