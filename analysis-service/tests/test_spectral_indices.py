"""Tests for the spectral index engine using synthetic raster arrays."""

import numpy as np
import pytest

from app.services.spectral_indices import (
    INDEX_BAND_MAP,
    INDEX_DEFINITIONS,
    IndexDefinition,
    _safe_divide,
    compute_index,
    compute_index_from_bands,
    get_available_indices,
    get_supported_sensors,
    validate_index_request,
)


# ── Synthetic data helpers ──────────────────────────────────────────

def make_vegetation_band_array(size: int = 100) -> tuple[np.ndarray, np.ndarray]:
    """
    Create synthetic RED and NIR bands simulating healthy vegetation.

    Healthy vegetation: high NIR (~0.8), low RED (~0.2)
    Expected NDVI: (0.8 - 0.2) / (0.8 + 0.2) = 0.6
    """
    rng = np.random.default_rng(42)
    red = (rng.random((size, size)) * 0.1 + 0.15).astype(np.float32)  # ~0.15-0.25
    nir = (rng.random((size, size)) * 0.1 + 0.75).astype(np.float32)  # ~0.75-0.85
    return red, nir


def make_water_band_array(size: int = 100) -> tuple[np.ndarray, np.ndarray]:
    """
    Create synthetic GREEN and NIR bands simulating open water.

    Water: high GREEN (~0.6), low NIR (~0.05)
    Expected NDWI: (0.6 - 0.05) / (0.6 + 0.05) ≈ 0.846
    """
    rng = np.random.default_rng(42)
    green = (rng.random((size, size)) * 0.05 + 0.58).astype(np.float32)
    nir = (rng.random((size, size)) * 0.02 + 0.04).astype(np.float32)
    return green, nir


def make_urban_band_array(size: int = 100) -> tuple[np.ndarray, np.ndarray]:
    """
    Create synthetic SWIR and NIR bands simulating built-up area.

    Urban: high SWIR (~0.7), moderate NIR (~0.3)
    Expected NDBI: (0.7 - 0.3) / (0.7 + 0.3) = 0.4
    """
    rng = np.random.default_rng(42)
    swir = (rng.random((size, size)) * 0.1 + 0.65).astype(np.float32)
    nir = (rng.random((size, size)) * 0.1 + 0.25).astype(np.float32)
    return swir, nir


def make_burned_band_array(size: int = 100) -> tuple[np.ndarray, np.ndarray]:
    """
    Create synthetic NIR and SWIR2 bands simulating burned area.

    Burned: low NIR (~0.1), high SWIR2 (~0.6)
    Expected NBR: (0.1 - 0.6) / (0.1 + 0.6) ≈ -0.714
    """
    rng = np.random.default_rng(42)
    nir = (rng.random((size, size)) * 0.05 + 0.08).astype(np.float32)
    swir2 = (rng.random((size, size)) * 0.05 + 0.58).astype(np.float32)
    return nir, swir2


def make_snow_band_array(size: int = 100) -> tuple[np.ndarray, np.ndarray]:
    """
    Create synthetic GREEN and SWIR1 bands simulating snow.

    Snow: high GREEN (~0.7), low SWIR1 (~0.05)
    Expected NDSI: (0.7 - 0.05) / (0.7 + 0.05) ≈ 0.867
    """
    rng = np.random.default_rng(42)
    green = (rng.random((size, size)) * 0.05 + 0.68).astype(np.float32)
    swir1 = (rng.random((size, size)) * 0.02 + 0.04).astype(np.float32)
    return green, swir1


# ── Safe divide tests ──────────────────────────────────────────────

class TestSafeDivide:
    """Test division-by-zero and nodata handling."""

    def test_normal_division(self):
        a = np.array([4.0, 6.0, 8.0], dtype=np.float32)
        b = np.array([2.0, 3.0, 4.0], dtype=np.float32)
        result = _safe_divide(a, b)
        np.testing.assert_array_almost_equal(result, [2.0, 2.0, 2.0])

    def test_division_by_zero(self):
        a = np.array([4.0, 6.0, 8.0], dtype=np.float32)
        b = np.array([2.0, 0.0, 4.0], dtype=np.float32)
        result = _safe_divide(a, b)
        assert result[0] == 2.0
        assert np.isnan(result[1])  # Division by zero → NaN
        assert result[2] == 2.0

    def test_nodata_propagation(self):
        a = np.array([4.0, 6.0, 8.0], dtype=np.float32)
        b = np.array([2.0, 3.0, 4.0], dtype=np.float32)
        nodata = np.array([False, True, False], dtype=bool)
        result = _safe_divide(a, b, nodata_mask=nodata)
        assert result[0] == 2.0
        assert np.isnan(result[1])  # Nodata → NaN
        assert result[2] == 2.0

    def test_zero_divided_by_zero(self):
        a = np.array([0.0], dtype=np.float32)
        b = np.array([0.0], dtype=np.float32)
        result = _safe_divide(a, b)
        assert np.isnan(result[0])


# ── NDVI tests ─────────────────────────────────────────────────────

class TestNDVI:
    """Test NDVI computation with synthetic vegetation data."""

    def test_ndvi_vegetation(self):
        """Healthy vegetation should have NDVI > 0.5."""
        red, nir = make_vegetation_band_array(50)
        result, meta = compute_index_from_bands(
            bands={"B04": red, "B08": nir},
            index_name="NDVI",
            sensor="sentinel-2-l2a",
            date="2024-03-15",
            crs="EPSG:4326",
            resolution_meters=10.0,
        )
        assert result.shape == (50, 50)
        assert meta.short_name == "NDVI"
        assert meta.formula == "(NIR - RED) / (NIR + RED)"
        assert meta.sensor == "sentinel-2-l2a"
        assert meta.bands_used == {"NIR": "B08", "RED": "B04"}
        # Mean NDVI should be around 0.6 for healthy vegetation
        assert 0.4 < meta.stats["mean"] < 0.8
        assert meta.valid_pixels > 0

    def test_ndvi_bare_soil(self):
        """Bare soil should have NDVI near 0."""
        size = 50
        red = np.full((size, size), 0.3, dtype=np.float32)
        nir = np.full((size, size), 0.35, dtype=np.float32)
        result, meta = compute_index_from_bands(
            bands={"B04": red, "B08": nir},
            index_name="NDVI",
            sensor="sentinel-2-l2a",
        )
        # (0.35 - 0.3) / (0.35 + 0.3) = 0.05 / 0.65 ≈ 0.077
        assert 0.0 < meta.stats["mean"] < 0.2

    def test_ndvi_landsat(self):
        """NDVI works with Landsat band mapping."""
        red = np.full((10, 10), 0.2, dtype=np.float32)
        nir = np.full((10, 10), 0.8, dtype=np.float32)
        result, meta = compute_index_from_bands(
            bands={"B3": red, "B4": nir},
            index_name="NDVI",
            sensor="landsat-c2-l2",
        )
        # (0.8 - 0.2) / (0.8 + 0.2) = 0.6
        assert abs(meta.stats["mean"] - 0.6) < 0.01

    def test_ndvi_with_nodata(self):
        """Nodata pixels should be NaN in result."""
        red = np.full((10, 10), 0.2, dtype=np.float32)
        nir = np.full((10, 10), 0.8, dtype=np.float32)
        nodata = np.zeros((10, 10), dtype=bool)
        nodata[0, 0] = True
        result, meta = compute_index_from_bands(
            bands={"B04": red, "B08": nir},
            index_name="NDVI",
            sensor="sentinel-2-l2a",
            nodata_masks={"B04": nodata},
        )
        assert np.isnan(result[0, 0])
        assert meta.nan_count >= 1

    def test_ndvi_division_by_zero(self):
        """When both bands are 0, result should be NaN."""
        red = np.zeros((5, 5), dtype=np.float32)
        nir = np.zeros((5, 5), dtype=np.float32)
        result, meta = compute_index_from_bands(
            bands={"B04": red, "B08": nir},
            index_name="NDVI",
            sensor="sentinel-2-l2a",
        )
        assert np.all(np.isnan(result))
        assert meta.nan_count == 25


# ── NDWI tests ─────────────────────────────────────────────────────

class TestNDWI:
    """Test NDWI computation with synthetic water data."""

    def test_ndwi_water(self):
        """Open water should have NDWI > 0.5."""
        green, nir = make_water_band_array(50)
        result, meta = compute_index_from_bands(
            bands={"B03": green, "B08": nir},
            index_name="NDWI",
            sensor="sentinel-2-l2a",
        )
        assert meta.short_name == "NDWI"
        assert meta.formula == "(GREEN - NIR) / (GREEN + NIR)"
        assert meta.stats["mean"] > 0.7  # Strong water signal

    def test_ndwi_land(self):
        """Land should have NDWI < 0."""
        green = np.full((10, 10), 0.2, dtype=np.float32)
        nir = np.full((10, 10), 0.4, dtype=np.float32)
        result, meta = compute_index_from_bands(
            bands={"B03": green, "B08": nir},
            index_name="NDWI",
            sensor="sentinel-2-l2a",
        )
        # (0.2 - 0.4) / (0.2 + 0.4) = -0.333
        assert meta.stats["mean"] < 0


# ── NDBI tests ─────────────────────────────────────────────────────

class TestNDBI:
    """Test NDBI computation with synthetic urban data."""

    def test_ndbi_urban(self):
        """Built-up areas should have NDBI > 0."""
        swir, nir = make_urban_band_array(50)
        result, meta = compute_index_from_bands(
            bands={"B11": swir, "B08": nir},
            index_name="NDBI",
            sensor="sentinel-2-l2a",
        )
        assert meta.short_name == "NDBI"
        assert meta.formula == "(SWIR - NIR) / (SWIR + NIR)"
        assert meta.stats["mean"] > 0.2

    def test_ndbi_landsat(self):
        """NDBI works with Landsat."""
        swir = np.full((10, 10), 0.7, dtype=np.float32)
        nir = np.full((10, 10), 0.3, dtype=np.float32)
        result, meta = compute_index_from_bands(
            bands={"B5": swir, "B4": nir},
            index_name="NDBI",
            sensor="landsat-c2-l2",
        )
        # (0.7 - 0.3) / (0.7 + 0.3) = 0.4
        assert abs(meta.stats["mean"] - 0.4) < 0.01


# ── NBR tests ──────────────────────────────────────────────────────

class TestNBR:
    """Test NBR computation with synthetic burned area data."""

    def test_nbr_burned(self):
        """Burned areas should have NBR < 0."""
        nir, swir2 = make_burned_band_array(50)
        result, meta = compute_index_from_bands(
            bands={"B08": nir, "B12": swir2},
            index_name="NBR",
            sensor="sentinel-2-l2a",
        )
        assert meta.short_name == "NBR"
        assert meta.formula == "(NIR - SWIR2) / (NIR + SWIR2)"
        assert meta.stats["mean"] < 0  # Burned = negative

    def test_nbr_healthy(self):
        """Healthy vegetation should have NBR > 0."""
        nir = np.full((10, 10), 0.7, dtype=np.float32)
        swir2 = np.full((10, 10), 0.2, dtype=np.float32)
        result, meta = compute_index_from_bands(
            bands={"B08": nir, "B12": swir2},
            index_name="NBR",
            sensor="sentinel-2-l2a",
        )
        # (0.7 - 0.2) / (0.7 + 0.2) = 0.556
        assert meta.stats["mean"] > 0


# ── NDSI tests ─────────────────────────────────────────────────────

class TestNDSI:
    """Test NDSI computation with synthetic snow data."""

    def test_ndsi_snow(self):
        """Snow should have NDSI > 0.5."""
        green, swir1 = make_snow_band_array(50)
        result, meta = compute_index_from_bands(
            bands={"B03": green, "B11": swir1},
            index_name="NDSI",
            sensor="sentinel-2-l2a",
        )
        assert meta.short_name == "NDSI"
        assert meta.formula == "(GREEN - SWIR1) / (GREEN + SWIR1)"
        assert meta.stats["mean"] > 0.7

    def test_ndsi_no_snow(self):
        """Non-snow surface should have NDSI < 0."""
        green = np.full((10, 10), 0.15, dtype=np.float32)
        swir1 = np.full((10, 10), 0.5, dtype=np.float32)
        result, meta = compute_index_from_bands(
            bands={"B03": green, "B11": swir1},
            index_name="NDSI",
            sensor="sentinel-2-l2a",
        )
        # (0.15 - 0.5) / (0.15 + 0.5) = -0.538
        assert meta.stats["mean"] < 0


# ── Registry tests ─────────────────────────────────────────────────

class TestRegistry:
    """Test the index registry architecture."""

    def test_all_indices_defined(self):
        """All 5 indices must be defined."""
        expected = {"NDVI", "NDWI", "NDBI", "NBR", "NDSI"}
        assert set(INDEX_DEFINITIONS.keys()) == expected

    def test_index_metadata_complete(self):
        """Every index must have all required fields."""
        for name, defn in INDEX_DEFINITIONS.items():
            assert defn.name, f"{name} missing name"
            assert defn.short_name, f"{name} missing short_name"
            assert defn.formula, f"{name} missing formula"
            assert defn.description, f"{name} missing description"
            assert len(defn.bands_required) == 2, f"{name} needs exactly 2 bands"
            assert defn.valid_range == (-1.0, 1.0), f"{name} range should be [-1, 1]"

    def test_band_mappings_exist(self):
        """Every (sensor, index) pair must have a band mapping."""
        sensors = ["sentinel-2-l2a", "landsat-c2-l2"]
        for sensor in sensors:
            for index_name in INDEX_DEFINITIONS:
                key = (sensor, index_name)
                assert key in INDEX_BAND_MAP, f"Missing mapping for {key}"

    def test_available_indices(self):
        """get_available_indices returns all 5."""
        indices = get_available_indices()
        assert len(indices) == 5
        names = {i["short_name"] for i in indices}
        assert names == {"NDVI", "NDWI", "NDBI", "NBR", "NDSI"}

    def test_supported_sensors(self):
        """get_supported_sensors returns both sensors."""
        sensors = get_supported_sensors()
        assert "sentinel-2-l2a" in sensors
        assert "landsat-c2-l2" in sensors


# ── Validation tests ───────────────────────────────────────────────

class TestValidation:
    """Test index request validation."""

    def test_valid_request(self):
        errors = validate_index_request("NDVI", "sentinel-2-l2a", ["B04", "B08"])
        assert errors == []

    def test_invalid_index(self):
        errors = validate_index_request("INVALID", "sentinel-2-l2a", ["B04", "B08"])
        assert len(errors) > 0
        assert "Unknown index" in errors[0]

    def test_invalid_sensor(self):
        errors = validate_index_request("NDVI", "modis", ["B04", "B08"])
        assert len(errors) > 0
        assert "No mapping" in errors[0]

    def test_missing_band(self):
        errors = validate_index_request("NDVI", "sentinel-2-l2a", ["B04"])
        assert len(errors) > 0
        assert "B08" in errors[0]

    def test_unknown_index_compute(self):
        """Computing unknown index raises ValueError."""
        with pytest.raises(ValueError, match="Unknown index"):
            compute_index_from_bands(
                bands={"B04": np.zeros((5, 5)), "B08": np.zeros((5, 5))},
                index_name="FAKE",
                sensor="sentinel-2-l2a",
            )

    def test_unknown_sensor_compute(self):
        """Computing with unknown sensor raises ValueError."""
        with pytest.raises(ValueError, match="No band mapping"):
            compute_index_from_bands(
                bands={"B04": np.zeros((5, 5)), "B08": np.zeros((5, 5))},
                index_name="NDVI",
                sensor="modis",
            )
