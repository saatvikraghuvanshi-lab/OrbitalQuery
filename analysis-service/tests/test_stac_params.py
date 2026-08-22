"""Unit tests for STAC search parameter validation."""

import pytest
from pydantic import ValidationError

from app.models.requests import STACSearchRequest


class TestSTACSearchParameters:
    """Test STAC search request parameter validation."""

    def test_default_collection(self):
        req = STACSearchRequest()
        assert req.collection == "sentinel-2-l2a"

    def test_custom_collection(self):
        req = STACSearchRequest(collection="landsat-c2-l2")
        assert req.collection == "landsat-c2-l2"

    def test_default_cloud_cover(self):
        req = STACSearchRequest()
        assert req.max_cloud_cover == 30

    def test_custom_cloud_cover(self):
        req = STACSearchRequest(max_cloud_cover=10)
        assert req.max_cloud_cover == 10

    def test_cloud_cover_zero(self):
        req = STACSearchRequest(max_cloud_cover=0)
        assert req.max_cloud_cover == 0

    def test_cloud_cover_too_high(self):
        with pytest.raises(ValidationError):
            STACSearchRequest(max_cloud_cover=101)

    def test_cloud_cover_negative(self):
        with pytest.raises(ValidationError):
            STACSearchRequest(max_cloud_cover=-1)

    def test_default_limit(self):
        req = STACSearchRequest()
        assert req.limit == 10

    def test_custom_limit(self):
        req = STACSearchRequest(limit=5)
        assert req.limit == 5

    def test_limit_too_high(self):
        with pytest.raises(ValidationError):
            STACSearchRequest(limit=51)

    def test_limit_zero(self):
        with pytest.raises(ValidationError):
            STACSearchRequest(limit=0)

    def test_with_bbox(self):
        req = STACSearchRequest(bbox=[75.5, 26.5, 76.0, 27.0])
        assert req.bbox == [75.5, 26.5, 76.0, 27.0]

    def test_with_geometry(self):
        req = STACSearchRequest(
            geometry={"type": "Point", "coordinates": [75.8, 26.9]}
        )
        assert req.geometry.type == "Point"

    def test_full_search_request(self):
        """A complete, realistic search request."""
        req = STACSearchRequest(
            bbox=[75.5, 26.5, 76.0, 27.0],
            start_date=None,
            end_date=None,
            datetime="2024-01-01/2024-06-30",
            collection="sentinel-2-l2a",
            max_cloud_cover=20,
            limit=5,
        )
        assert req.bbox == [75.5, 26.5, 76.0, 27.0]
        assert req.collection == "sentinel-2-l2a"
        assert req.max_cloud_cover == 20
        assert req.limit == 5
