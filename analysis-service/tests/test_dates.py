"""Unit tests for date validation in search requests."""

import pytest
from datetime import date
from pydantic import ValidationError

from app.models.requests import STACSearchRequest, AnalysisPreviewRequest


class TestSTACSearchDateValidation:
    """Test date handling in STAC search requests."""

    def test_date_range(self):
        req = STACSearchRequest(
            start_date=date(2024, 1, 1),
            end_date=date(2024, 6, 30),
        )
        assert req.start_date == date(2024, 1, 1)
        assert req.end_date == date(2024, 6, 30)

    def test_datetime_string(self):
        req = STACSearchRequest(datetime="2024-01-01/2024-06-30")
        assert req.datetime == "2024-01-01/2024-06-30"

    def test_start_only(self):
        req = STACSearchRequest(start_date=date(2024, 1, 1))
        assert req.start_date == date(2024, 1, 1)
        assert req.end_date is None

    def test_end_only(self):
        req = STACSearchRequest(end_date=date(2024, 12, 31))
        assert req.end_date == date(2024, 12, 31)
        assert req.start_date is None

    def test_no_dates(self):
        req = STACSearchRequest()
        assert req.start_date is None
        assert req.end_date is None
        assert req.datetime is None

    def test_datetime_takes_precedence(self):
        """If datetime is provided directly, start/end dates are ignored."""
        req = STACSearchRequest(
            datetime="2020-01-01/2020-12-31",
            start_date=date(2024, 1, 1),
            end_date=date(2024, 6, 30),
        )
        assert req.datetime == "2020-01-01/2020-12-31"


class TestAnalysisPreviewDateValidation:
    """Test date handling in analysis preview requests."""

    def test_valid_dates(self):
        req = AnalysisPreviewRequest(
            bbox=[75.5, 26.5, 76.0, 27.0],
            start_date=date(2024, 1, 1),
            end_date=date(2024, 6, 30),
        )
        assert req.start_date == date(2024, 1, 1)
        assert req.end_date == date(2024, 6, 30)

    def test_dates_required(self):
        """start_date and end_date are required for analysis preview."""
        with pytest.raises(ValidationError):
            AnalysisPreviewRequest(
                bbox=[75.5, 26.5, 76.0, 27.0],
            )
