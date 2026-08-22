"""Unit tests for AOI (Area of Interest) validation."""

import pytest
from pydantic import ValidationError

from app.models.requests import BBox, GeoJSONAOI


class TestBBoxValidation:
    """Test BBox model validation."""

    def test_valid_bbox(self):
        bbox = BBox(values=[75.5, 26.5, 76.0, 27.0])
        assert bbox.values == [75.5, 26.5, 76.0, 27.0]

    def test_jaipur_bbox(self):
        """Jaipur, India bounding box."""
        bbox = BBox(values=[75.7, 26.8, 75.9, 27.0])
        assert bbox.values[0] < bbox.values[2]
        assert bbox.values[1] < bbox.values[3]

    def test_invalid_west_greater_than_east(self):
        with pytest.raises(ValidationError, match="west must be less than east"):
            BBox(values=[76.0, 26.5, 75.5, 27.0])

    def test_invalid_south_greater_than_north(self):
        with pytest.raises(ValidationError, match="south must be less than north"):
            BBox(values=[75.5, 27.0, 76.0, 26.5])

    def test_out_of_range_longitude(self):
        with pytest.raises(ValidationError, match="longitude"):
            BBox(values=[-190.0, 26.5, -180.0, 27.0])

    def test_out_of_range_latitude(self):
        with pytest.raises(ValidationError, match="latitude"):
            BBox(values=[75.5, -95.0, 76.0, -90.0])

    def test_too_large_area(self):
        """Area exceeds MAX_AREA_DEGREES_SQ (100 deg²)."""
        with pytest.raises(ValidationError, match="exceeds max"):
            BBox(values=[-10.0, -10.0, 10.0, 10.0])  # 400 deg²

    def test_too_few_values(self):
        with pytest.raises(ValidationError):
            BBox(values=[75.5, 26.5, 76.0])

    def test_too_many_values(self):
        with pytest.raises(ValidationError):
            BBox(values=[75.5, 26.5, 76.0, 27.0, 0.0])


class TestGeoJSONAOI:
    """Test GeoJSON AOI model."""

    def test_valid_point(self):
        aoi = GeoJSONAOI(type="Point", coordinates=[75.8, 26.9])
        assert aoi.type == "Point"

    def test_valid_polygon(self):
        aoi = GeoJSONAOI(
            type="Polygon",
            coordinates=[[[75.7, 26.8], [75.9, 26.8], [75.9, 27.0], [75.7, 27.0], [75.7, 26.8]]],
        )
        assert aoi.type == "Polygon"

    def test_valid_with_bbox(self):
        aoi = GeoJSONAOI(
            type="Polygon",
            coordinates=[[[75.7, 26.8], [75.9, 26.8], [75.9, 27.0], [75.7, 27.0], [75.7, 26.8]]],
            bbox=[75.7, 26.8, 75.9, 27.0],
        )
        assert aoi.bbox == [75.7, 26.8, 75.9, 27.0]
