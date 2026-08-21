"""Unit tests for cloud cover filtering logic."""

import pytest


class TestCloudCoverFiltering:
    """Test cloud cover filtering in STAC search parameters."""

    def test_cloud_cover_filter_applied(self):
        """When max_cloud_cover is set, it should be included in query."""
        from app.models.requests import STACSearchRequest

        req = STACSearchRequest(max_cloud_cover=15)
        assert req.max_cloud_cover == 15

    def test_cloud_cover_zero_means_clear(self):
        """Cloud cover 0 means only completely clear scenes."""
        from app.models.requests import STACSearchRequest

        req = STACSearchRequest(max_cloud_cover=0)
        assert req.max_cloud_cover == 0

    def test_cloud_cover_100_means_all(self):
        """Cloud cover 100 means any cloud level accepted."""
        from app.models.requests import STACSearchRequest

        req = STACSearchRequest(max_cloud_cover=100)
        assert req.max_cloud_cover == 100

    def test_cloud_cover_boundary_values(self):
        """Test boundary values for cloud cover."""
        from app.models.requests import STACSearchRequest

        for val in [0, 1, 25, 50, 75, 100]:
            req = STACSearchRequest(max_cloud_cover=val)
            assert req.max_cloud_cover == val

    def test_cloud_cover_not_integer_rejected(self):
        """Non-integer cloud cover should be rejected."""
        from pydantic import ValidationError
        from app.models.requests import STACSearchRequest

        with pytest.raises(ValidationError):
            STACSearchRequest(max_cloud_cover=25.5)
