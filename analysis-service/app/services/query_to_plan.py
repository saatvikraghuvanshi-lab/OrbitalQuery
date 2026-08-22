"""
Natural language query → validated AnalysisPlan converter.

The LLM (or keyword parser) is ONLY responsible for converting language
into a structured schema. It must NOT perform analysis.

This module:
1. Parses NL query → raw plan (keyword matching + optional LLM)
2. Validates plan against capability registry
3. Returns validated plan or clear error with remediation

Architecture:
  "How much of Jaipur became urbanized between 2018 and 2025?"
    → detect_phenomenon() → "urban_expansion"
    → extract_dates() → start="2018-01-01", end="2025-12-31"
    → extract_aoi() → "Jaipur" → resolve to bbox
    → select_sensor() → "sentinel-2-l2a"
    → select_analysis() → "ndbi_change"
    → validate_plan() → OK or errors
"""

from __future__ import annotations

import hashlib
import logging
import re
from datetime import date, datetime
from typing import Any, Optional

from app.services.capability_registry import (
    PHENOMENON_REGISTRY,
    ANALYSIS_TYPES,
    detect_phenomenon,
    validate_analysis_plan,
    get_analysis_config,
)

logger = logging.getLogger(__name__)


# ── Known locations → bbox mapping ───────────────────────────────

KNOWN_LOCATIONS: dict[str, dict[str, Any]] = {
    "jaipur": {
        "bbox": [75.7, 26.8, 75.9, 27.0],
        "country": "India",
        "region": "Rajasthan",
    },
    "mumbai": {
        "bbox": [72.7, 18.8, 73.0, 19.1],
        "country": "India",
        "region": "Maharashtra",
    },
    "delhi": {
        "bbox": [77.0, 28.4, 77.4, 28.8],
        "country": "India",
        "region": "Delhi NCR",
    },
    "bangalore": {
        "bbox": [77.4, 12.8, 77.8, 13.1],
        "country": "India",
        "region": "Karnataka",
    },
    "chennai": {
        "bbox": [80.0, 12.8, 80.4, 13.2],
        "country": "India",
        "region": "Tamil Nadu",
    },
    "kolkata": {
        "bbox": [88.2, 22.4, 88.5, 22.7],
        "country": "India",
        "region": "West Bengal",
    },
    "hyderabad": {
        "bbox": [78.3, 17.2, 78.6, 17.5],
        "country": "India",
        "region": "Telangana",
    },
    "ahmedabad": {
        "bbox": [72.5, 22.9, 72.8, 23.2],
        "country": "India",
        "region": "Gujarat",
    },
    "pune": {
        "bbox": [73.7, 18.4, 74.0, 18.6],
        "country": "India",
        "region": "Maharashtra",
    },
    "lucknow": {
        "bbox": [80.8, 26.7, 81.1, 27.0],
        "country": "India",
        "region": "Uttar Pradesh",
    },
    "bhopal": {
        "bbox": [77.3, 23.1, 77.6, 23.4],
        "country": "India",
        "region": "Madhya Pradesh",
    },
    "patna": {
        "bbox": [84.9, 25.5, 85.3, 25.7],
        "country": "India",
        "region": "Bihar",
    },
    "guwahati": {
        "bbox": [91.6, 26.1, 91.9, 26.3],
        "country": "India",
        "region": "Assam",
    },
    "thar desert": {
        "bbox": [68.0, 24.0, 74.0, 29.0],
        "country": "India",
        "region": "Rajasthan/Sindh",
    },
    "sundarbans": {
        "bbox": [88.0, 21.5, 89.5, 22.5],
        "country": "India/Bangladesh",
        "region": "West Bengal",
    },
    "himalayas": {
        "bbox": [76.0, 28.0, 82.0, 35.0],
        "country": "India/Nepal/China",
        "region": "Himalayan Range",
    },
    "kerala": {
        "bbox": [74.8, 8.0, 77.5, 12.8],
        "country": "India",
        "region": "Kerala",
    },
    "lassa": {
        "bbox": [77.0, 27.5, 77.5, 28.0],
        "country": "India",
        "region": "Jammu & Kashmir",
    },
    "cherrapunji": {
        "bbox": [91.6, 25.2, 91.8, 25.4],
        "country": "India",
        "region": "Meghalaya",
    },
    "jaisalmer": {
        "bbox": [70.8, 26.8, 71.1, 27.0],
        "country": "India",
        "region": "Rajasthan",
    },
    # International examples
    "amazon": {
        "bbox": [-70.0, -10.0, -50.0, 0.0],
        "country": "Brazil",
        "region": "Amazon Basin",
    },
    "new york": {
        "bbox": [-74.1, 40.6, -73.7, 40.9],
        "country": "USA",
        "region": "New York",
    },
    "tokyo": {
        "bbox": [139.5, 35.5, 140.0, 36.0],
        "country": "Japan",
        "region": "Kanto",
    },
    "london": {
        "bbox": [-0.3, 51.4, 0.2, 51.6],
        "country": "UK",
        "region": "Greater London",
    },
    "cairo": {
        "bbox": [31.1, 29.9, 31.4, 30.2],
        "country": "Egypt",
        "region": "Cairo",
    },
    "sydney": {
        "bbox": [150.9, -34.0, 151.3, -33.7],
        "country": "Australia",
        "region": "New South Wales",
    },
    "rio de janeiro": {
        "bbox": [-43.5, -23.1, -43.0, -22.7],
        "country": "Brazil",
        "region": "Rio de Janeiro",
    },
    "dhaka": {
        "bbox": [90.3, 23.6, 90.5, 23.9],
        "country": "Bangladesh",
        "region": "Dhaka",
    },
    "kathmandu": {
        "bbox": [85.2, 27.6, 85.5, 27.8],
        "country": "Nepal",
        "region": "Bagmati",
    },
    "uttarakhand": {
        "bbox": [78.0, 29.0, 80.5, 31.5],
        "country": "India",
        "region": "Uttarakhand",
    },
    "assam": {
        "bbox": [89.5, 24.5, 96.0, 28.0],
        "country": "India",
        "region": "Assam",
    },
    "rajasthan": {
        "bbox": [69.0, 23.0, 76.0, 30.0],
        "country": "India",
        "region": "Rajasthan",
    },
    "karnataka": {
        "bbox": [74.0, 11.5, 78.5, 18.5],
        "country": "India",
        "region": "Karnataka",
    },
    "tamil nadu": {
        "bbox": [76.0, 8.0, 80.5, 13.5],
        "country": "India",
        "region": "Tamil Nadu",
    },
    "odisha": {
        "bbox": [81.0, 17.5, 87.5, 22.5],
        "country": "India",
        "region": "Odisha",
    },
    "madhya pradesh": {
        "bbox": [74.0, 21.0, 82.5, 26.5],
        "country": "India",
        "region": "Madhya Pradesh",
    },
    "maharashtra": {
        "bbox": [72.5, 15.5, 80.5, 22.0],
        "country": "India",
        "region": "Maharashtra",
    },
    "andhra pradesh": {
        "bbox": [77.0, 12.5, 84.5, 19.5],
        "country": "India",
        "region": "Andhra Pradesh",
    },
    "kashmir": {
        "bbox": [73.5, 32.0, 78.5, 37.0],
        "country": "India",
        "region": "Jammu & Kashmir",
    },
    "kampala": {
        "bbox": [32.5, 0.2, 32.7, 0.4],
        "country": "Uganda",
        "region": "Central Uganda",
    },
    "nairobi": {
        "bbox": [36.7, -1.4, 37.0, -1.2],
        "country": "Kenya",
        "region": "Nairobi",
    },
}


# ── Date extraction ──────────────────────────────────────────────

def extract_dates(query: str) -> dict[str, Optional[str]]:
    """
    Extract date range from natural language query.

    Returns dict with 'start_date' and 'end_date' (ISO format) or None.
    """
    result = {"start_date": None, "end_date": None}

    # Pattern: "between YYYY and YYYY"
    m = re.search(r'between\s+(\d{4})\s+and\s+(\d{4})', query, re.IGNORECASE)
    if m:
        result["start_date"] = f"{m.group(1)}-01-01"
        result["end_date"] = f"{m.group(2)}-12-31"
        return result

    # Pattern: "from YYYY to YYYY"
    m = re.search(r'from\s+(\d{4})\s+to\s+(\d{4})', query, re.IGNORECASE)
    if m:
        result["start_date"] = f"{m.group(1)}-01-01"
        result["end_date"] = f"{m.group(2)}-12-31"
        return result

    # Pattern: "YYYY-YYYY" or "YYYY to YYYY"
    m = re.search(r'(\d{4})\s*[-–]\s*(\d{4})', query)
    if m:
        result["start_date"] = f"{m.group(1)}-01-01"
        result["end_date"] = f"{m.group(2)}-12-31"
        return result

    # Pattern: "in YYYY" or "during YYYY"
    m = re.search(r'(?:in|during)\s+(\d{4})', query, re.IGNORECASE)
    if m:
        result["start_date"] = f"{m.group(1)}-01-01"
        result["end_date"] = f"{m.group(1)}-12-31"
        return result

    # Pattern: "after YYYY" or "since YYYY"
    m = re.search(r'(?:after|since)\s+(\d{4})', query, re.IGNORECASE)
    if m:
        result["start_date"] = f"{m.group(1)}-01-01"
        result["end_date"] = date.today().isoformat()
        return result

    # Pattern: "before YYYY"
    m = re.search(r'before\s+(\d{4})', query, re.IGNORECASE)
    if m:
        result["start_date"] = "2015-01-01"
        result["end_date"] = f"{m.group(1)}-12-31"
        return result

    # Pattern: standalone YYYY
    years = re.findall(r'\b(20\d{2})\b', query)
    if len(years) >= 2:
        result["start_date"] = f"{min(years)}-01-01"
        result["end_date"] = f"{max(years)}-12-31"
    elif len(years) == 1:
        result["start_date"] = f"{years[0]}-01-01"
        result["end_date"] = f"{years[0]}-12-31"

    return result


# ── AOI extraction ───────────────────────────────────────────────

def extract_aoi(query: str) -> Optional[str]:
    """
    Extract area of interest name from query.

    Returns the location name (lowercase) or None.
    """
    query_lower = query.lower()

    # Try to match known locations (longest first for specificity)
    matched = []
    for name in KNOWN_LOCATIONS:
        if name in query_lower:
            matched.append(name)

    if matched:
        # Return longest match (most specific)
        return max(matched, key=len)

    return None


def resolve_bbox(location: str) -> Optional[list[float]]:
    """Resolve a location name to a bounding box."""
    loc = KNOWN_LOCATIONS.get(location.lower())
    if loc:
        return loc["bbox"]
    return None


# ── Sensor selection ─────────────────────────────────────────────

def select_sensor(phenomenon: str) -> str:
    """Select the best sensor for a phenomenon."""
    config = PHENOMENON_REGISTRY.get(phenomenon)
    if config and config["preferred_sensors"]:
        return config["preferred_sensors"][0]
    return "sentinel-2-l2a"


def select_analysis_type(phenomenon: str) -> str:
    """Select the default analysis type for a phenomenon."""
    config = PHENOMENON_REGISTRY.get(phenomenon)
    if config and config["analysis_types"]:
        return config["analysis_types"][0]
    return "land_cover_change"


def select_bands(phenomenon: str, sensor: str) -> list[str]:
    """Select required bands for the phenomenon + sensor combination."""
    config = PHENOMENON_REGISTRY.get(phenomenon)
    if not config:
        return ["B04", "B03", "B02"]

    logical_bands = config["required_bands"]

    # Map logical bands to physical bands for the sensor
    from app.services.spectral_indices import INDEX_BAND_MAP

    # For SAR sensors, return lowercase band names directly
    if sensor in ("sentinel-1-grd",):
        return [b.lower() for b in logical_bands]

    # For optical sensors, find the physical band mapping
    physical = []
    for idx_name in (config.get("analysis_types", [None])):
        for (s, i), band_map in INDEX_BAND_MAP.items():
            if s == sensor:
                for logical in logical_bands:
                    if logical in band_map and band_map[logical] not in physical:
                        physical.append(band_map[logical])

    if physical:
        return physical

    # Fallback: return default RGB
    return ["B04", "B03", "B02"]


# ── Main plan builder ────────────────────────────────────────────

def build_analysis_plan(query: str, overrides: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    """
    Convert a natural language query into a validated analysis plan.

    Args:
        query: Natural language query (e.g. "urban expansion in Jaipur 2018-2025")
        overrides: Optional field overrides from the user

    Returns:
        dict with either:
          - "status": "ok", "plan": {...} — if valid
          - "status": "error", "errors": [...] — if invalid
          - "status": "unsupported", "message": str — if analysis not supported
    """
    overrides = overrides or {}

    # 1. Detect phenomenon
    phenomenon = overrides.get("phenomenon") or detect_phenomenon(query)
    if not phenomenon:
        return {
            "status": "unsupported",
            "message": (
                "Could not determine the analysis type from your query. "
                "Try using keywords like 'urban expansion', 'flood impact', "
                "'vegetation change', 'burn severity', 'water change', or 'snow cover'."
            ),
            "query": query,
            "suggestions": list(PHENOMENON_REGISTRY.keys()),
        }

    if phenomenon not in PHENOMENON_REGISTRY:
        return {
            "status": "unsupported",
            "message": f"Phenomenon '{phenomenon}' is not supported.",
            "query": query,
            "suggestions": list(PHENOMENON_REGISTRY.keys()),
        }

    # 2. Extract AOI
    location_name = overrides.get("aoi") or extract_aoi(query)
    bbox = None
    if location_name:
        bbox = resolve_bbox(location_name)
    if not bbox and overrides.get("bbox"):
        bbox = overrides["bbox"]

    if not bbox:
        return {
            "status": "error",
            "message": (
                "Could not determine the area of interest. "
                "Please provide a known location name or a bounding box."
            ),
            "query": query,
            "known_locations": sorted(KNOWN_LOCATIONS.keys()),
        }

    # 3. Extract dates
    dates = extract_dates(query)
    start_date = overrides.get("start_date") or dates["start_date"]
    end_date = overrides.get("end_date") or dates["end_date"]

    # 4. Select sensor and analysis type
    sensor = overrides.get("sensor") or select_sensor(phenomenon)
    analysis_type = overrides.get("analysis_type") or select_analysis_type(phenomenon)
    bands = overrides.get("bands") or select_bands(phenomenon, sensor)

    # 5. Set defaults
    pheno_config = PHENOMENON_REGISTRY[phenomenon]
    cloud_threshold = overrides.get("cloud_threshold") or pheno_config["default_cloud_threshold"]
    comparison_strategy = pheno_config["comparison_strategy"]

    # 6. Determine output requirements
    at_config = ANALYSIS_TYPES.get(analysis_type)
    output_requirements = at_config.output_requirements if at_config else ["change_map"]

    # 7. Validate
    validation_errors = validate_analysis_plan(
        phenomenon=phenomenon,
        analysis_type=analysis_type,
        sensor=sensor,
        bands=bands,
        start_date=start_date,
        end_date=end_date,
    )

    if validation_errors:
        return {
            "status": "error",
            "message": "Analysis plan validation failed",
            "query": query,
            "errors": validation_errors,
            "partial_plan": {
                "phenomenon": phenomenon,
                "analysis_type": analysis_type,
                "sensor": sensor,
                "bands": bands,
                "start_date": start_date,
                "end_date": end_date,
                "aoi": location_name,
                "bbox": bbox,
            },
        }

    # 8. Build final plan
    plan_id = hashlib.sha256(
        f"{phenomenon}:{analysis_type}:{location_name}:{start_date}:{end_date}".encode()
    ).hexdigest()[:12]

    plan = {
        "plan_id": plan_id,
        "query": query,
        "phenomenon": phenomenon,
        "phenomenon_description": pheno_config["description"],
        "analysis_type": analysis_type,
        "sensor": sensor,
        "bands": bands,
        "aoi": location_name,
        "bbox": bbox,
        "start_date": start_date,
        "end_date": end_date,
        "cloud_threshold": cloud_threshold,
        "comparison_strategy": comparison_strategy,
        "min_scenes": at_config.min_scenes if at_config else 2,
        "max_scenes": at_config.max_scenes if at_config else 10,
        "output_requirements": output_requirements,
        "required_indices": at_config.required_indices if at_config else [],
        "validation": {
            "status": "valid",
            "phenomenon": phenomenon,
            "analysis_type": analysis_type,
            "sensor": sensor,
            "bands": bands,
            "dates_provided": bool(start_date and end_date),
            "bbox_provided": True,
        },
    }

    return {
        "status": "ok",
        "plan": plan,
    }
