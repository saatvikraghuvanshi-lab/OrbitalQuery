"""
Natural language query parser for flood impact analysis.

Converts user queries like "Assess flood impact in Jaipur from August 2024"
into structured analysis plans.

No LLM — deterministic keyword extraction and date parsing.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class AnalysisPlan:
    """Structured analysis plan parsed from a natural language query."""

    analysis_type: str  # "flood_impact"
    query: str  # Original query text
    aoi_description: str  # Extracted location name
    aoi_bbox: Optional[list[float]] = None  # Bounding box if known
    event_date: Optional[str] = None  # YYYY-MM-DD
    pre_event_start: Optional[str] = None  # YYYY-MM-DD
    pre_event_end: Optional[str] = None  # YYYY-MM-DD
    post_event_start: Optional[str] = None  # YYYY-MM-DD
    post_event_end: Optional[str] = None  # YYYY-MM-DD
    primary_sensor: str = "sentinel-1-grd"
    secondary_sensor: str = "sentinel-2-l2a"
    confidence: str = "medium"
    parsed_entities: dict = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)


# ── Known locations with approximate bounding boxes ──────────────

KNOWN_LOCATIONS: dict[str, dict] = {
    "jaipur": {"bbox": [75.7, 26.8, 76.0, 27.2], "state": "Rajasthan", "country": "India"},
    "mumbai": {"bbox": [72.75, 18.85, 73.05, 19.15], "state": "Maharashtra", "country": "India"},
    "chennai": {"bbox": [80.15, 12.9, 80.35, 13.15], "state": "Tamil Nadu", "country": "India"},
    "kolkata": {"bbox": [88.3, 22.5, 88.5, 22.7], "state": "West Bengal", "country": "India"},
    "delhi": {"bbox": [77.0, 28.5, 77.4, 28.85], "state": "Delhi", "country": "India"},
    "bangalore": {"bbox": [77.45, 12.85, 77.75, 13.05], "state": "Karnataka", "country": "India"},
    "hyderabad": {"bbox": [78.35, 17.3, 78.6, 17.5], "state": "Telangana", "country": "India"},
    "lucknow": {"bbox": [80.85, 26.75, 81.15, 26.95], "state": "Uttar Pradesh", "country": "India"},
    "patna": {"bbox": [85.05, 25.55, 85.3, 25.7], "state": "Bihar", "country": "India"},
    "guwahati": {"bbox": [91.65, 26.1, 91.85, 26.25], "state": "Assam", "country": "India"},
    "assam": {"bbox": [89.5, 24.5, 96.0, 28.5], "state": "Assam", "country": "India"},
    "kerala": {"bbox": [74.8, 8.0, 77.5, 12.8], "state": "Kerala", "country": "India"},
    "bihar": {"bbox": [83.2, 24.2, 88.2, 27.5], "state": "Bihar", "country": "India"},
    "odisha": {"bbox": [81.3, 17.8, 87.5, 22.6], "state": "Odisha", "country": "India"},
    "earth": {"bbox": [-180, -90, 180, 90], "state": "", "country": ""},
}

# Flood-related keywords
FLOOD_KEYWORDS = [
    "flood", "flooding", "flooded", "inundation", "inundated",
    "submerged", "waterlogging", "waterlogged", "deluge",
    "overflow", "breach", "levee", "dam break",
    "rainfall", "monsoon", "cyclone", "storm surge",
    "tsunami", "flash flood", "river flood",
]

# Date patterns
DATE_PATTERNS = [
    # "August 2024", "Aug 2024"
    (r"(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})", "month_year"),
    # "2024-08-15", "2024/08/15"
    (r"(\d{4})[-/](\d{1,2})[-/](\d{1,2})", "iso_date"),
    # "15 August 2024"
    (r"(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})", "day_month_year"),
    # "Aug 15, 2024"
    (r"(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})", "month_day_year"),
]

MONTH_MAP = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}


def _parse_month_year(month_str: str, year_str: str) -> tuple[str, str]:
    """Parse 'August 2024' → (start_date, end_date)."""
    month = MONTH_MAP.get(month_str.lower())
    if not month:
        return "", ""
    year = int(year_str)
    start = f"{year}-{month:02d}-01"
    # End of month
    if month == 12:
        end = f"{year}-12-31"
    else:
        end_date = datetime(year, month + 1, 1) - timedelta(days=1)
        end = end_date.strftime("%Y-%m-%d")
    return start, end


def _parse_iso_date(parts: tuple) -> tuple[str, str]:
    """Parse '2024-08-15' → (date, date)."""
    year, month, day = int(parts[0]), int(parts[1]), int(parts[2])
    date_str = f"{year:04d}-{month:02d}-{day:02d}"
    return date_str, date_str


def _parse_day_month_year(day_str: str, month_str: str, year_str: str) -> tuple[str, str]:
    """Parse '15 August 2024' → (date, date)."""
    day = int(day_str)
    month = MONTH_MAP.get(month_str.lower())
    if not month:
        return "", ""
    year = int(year_str)
    date_str = f"{year:02d}-{month:02d}-{day:02d}" if year >= 100 else f"{year:04d}-{month:02d}-{day:02d}"
    return date_str, date_str


def extract_dates(query: str) -> list[tuple[str, str]]:
    """Extract all dates from the query text."""
    dates = []
    for pattern, fmt in DATE_PATTERNS:
        matches = re.finditer(pattern, query, re.IGNORECASE)
        for match in matches:
            groups = match.groups()
            if fmt == "month_year":
                start, end = _parse_month_year(groups[0], groups[1])
            elif fmt == "iso_date":
                start, end = _parse_iso_date(groups)
            elif fmt == "day_month_year":
                start, end = _parse_day_month_year(groups[0], groups[1], groups[2])
            elif fmt == "month_day_year":
                start, end = _parse_day_month_year(groups[1], groups[0], groups[2])
            else:
                continue
            if start:
                dates.append((start, end))
    return dates


def extract_location(query: str) -> Optional[str]:
    """Extract known location from query text."""
    query_lower = query.lower()
    # Sort by length (longest first) to avoid partial matches
    for location in sorted(KNOWN_LOCATIONS.keys(), key=len, reverse=True):
        if location in query_lower:
            return location
    return None


def detect_analysis_type(query: str) -> str:
    """Detect the analysis type from query keywords."""
    query_lower = query.lower()
    for kw in FLOOD_KEYWORDS:
        if kw in query_lower:
            return "flood_impact"
    return "general"


def compute_event_windows(
    event_date: Optional[str],
    event_start: Optional[str] = None,
    event_end: Optional[str] = None,
) -> dict[str, Optional[str]]:
    """
    Compute pre/post event windows.

    Default logic:
    - Pre-event: 30 days before event
    - Post-event: 14 days after event
    """
    if event_date:
        evt = datetime.strptime(event_date, "%Y-%m-%d")
        pre_start = (evt - timedelta(days=30)).strftime("%Y-%m-%d")
        pre_end = (evt - timedelta(days=1)).strftime("%Y-%m-%d")
        post_start = evt.strftime("%Y-%m-%d")
        post_end = (evt + timedelta(days=14)).strftime("%Y-%m-%d")
    elif event_start and event_end:
        evt_start = datetime.strptime(event_start, "%Y-%m-%d")
        evt_end = datetime.strptime(event_end, "%Y-%m-%d")
        pre_start = (evt_start - timedelta(days=30)).strftime("%Y-%m-%d")
        pre_end = (evt_start - timedelta(days=1)).strftime("%Y-%m-%d")
        post_start = evt_start.strftime("%Y-%m-%d")
        post_end = (evt_end + timedelta(days=14)).strftime("%Y-%m-%d")
    else:
        return {
            "pre_event_start": None, "pre_event_end": None,
            "post_event_start": None, "post_event_end": None,
        }

    return {
        "pre_event_start": pre_start,
        "pre_event_end": pre_end,
        "post_event_start": post_start,
        "post_event_end": post_end,
    }


def parse_query(
    query: str,
    aoi_bbox: Optional[list[float]] = None,
    event_date: Optional[str] = None,
) -> AnalysisPlan:
    """
    Parse a natural language query into a structured analysis plan.

    This is deterministic — no LLM, no randomness.
    """
    warnings = []
    parsed = {}

    # 1. Detect analysis type
    analysis_type = detect_analysis_type(query)
    parsed["analysis_type_keywords"] = analysis_type

    # 2. Extract location
    location = extract_location(query)
    if location:
        loc_info = KNOWN_LOCATIONS[location]
        parsed["location"] = location
        parsed["state"] = loc_info.get("state", "")
        parsed["country"] = loc_info.get("country", "")
        if not aoi_bbox:
            aoi_bbox = loc_info["bbox"]
    elif not aoi_bbox:
        warnings.append("Could not determine AOI from query — provide bbox manually")

    # 3. Extract dates
    extracted_dates = extract_dates(query)
    if event_date:
        parsed["event_date_source"] = "parameter"
    elif extracted_dates:
        event_date = extracted_dates[0][0]  # Use first extracted date
        parsed["event_date_source"] = "query"
    else:
        warnings.append("No event date found in query — using date range search")

    # 4. Compute event windows
    windows = compute_event_windows(event_date)

    # 5. Build plan
    plan = AnalysisPlan(
        analysis_type=analysis_type,
        query=query,
        aoi_description=location or "unknown",
        aoi_bbox=aoi_bbox,
        event_date=event_date,
        pre_event_start=windows["pre_event_start"],
        pre_event_end=windows["pre_event_end"],
        post_event_start=windows["post_event_start"],
        post_event_end=windows["post_event_end"],
        primary_sensor="sentinel-1-grd",
        secondary_sensor="sentinel-2-l2a",
        confidence="high" if (location and event_date) else "medium",
        parsed_entities=parsed,
        warnings=warnings,
    )

    return plan
