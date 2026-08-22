"""
Sentinel-1 SAR discovery service.

Handles STAC search, metadata extraction, and asset selection for
Sentinel-1 GRD scenes. Sentinel-1 is a C-band SAR satellite — it
works through clouds and at night, making it essential for flood
and disaster monitoring.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional

from app.services.stac_service import get_stac_client, get_item_assets
from app.services.sensor_registry import get_sensor

try:
    import planetary_computer as pc
except ImportError:
    pc = None

logger = logging.getLogger(__name__)


@dataclass
class Sentinel1Scene:
    """Metadata for a single Sentinel-1 scene."""

    item_id: str
    collection: str
    datetime: str
    orbit_direction: Optional[str]  # ascending / descending
    orbit_number: Optional[int]
    relative_orbit: Optional[int]
    pass_number: Optional[str]  # ASCENDING / DESCENDING
    acquisition_mode: Optional[str]  # IW, EW, SM
    polarization: list[str]  # ["VV", "VH"] etc.
    bbox: list[float]
    geometry: dict[str, Any]
    assets: dict[str, dict]
    properties: dict[str, Any]
    processing_level: Optional[str]
    resolution: Optional[dict[str, float]]

    def to_dict(self) -> dict[str, Any]:
        return {
            "item_id": self.item_id,
            "collection": self.collection,
            "datetime": self.datetime,
            "orbit_direction": self.orbit_direction,
            "orbit_number": self.orbit_number,
            "relative_orbit": self.relative_orbit,
            "pass_number": self.pass_number,
            "acquisition_mode": self.acquisition_mode,
            "polarization": self.polarization,
            "bbox": self.bbox,
            "geometry": self.geometry,
            "asset_keys": list(self.assets.keys()),
            "processing_level": self.processing_level,
            "resolution": self.resolution,
        }


@dataclass
class Sentinel1SearchResult:
    """Result of a Sentinel-1 STAC search."""

    status: str
    collection: str
    total_matches: int
    returned: int
    scenes: list[Sentinel1Scene]
    polarizations_found: list[str]
    orbit_directions_found: list[str]
    date_range: Optional[list[str]]
    processing_steps: list[dict[str, str]]


def _extract_s1_metadata(item_dict: dict[str, Any]) -> Sentinel1Scene:
    """Extract Sentinel-1 specific metadata from a STAC item."""
    props = item_dict.get("properties", {})
    assets = item_dict.get("assets", {})

    # SAR-specific metadata
    sar = props.get("sar", {})
    orbit = props.get("sat", {})

    # Polarization
    polarization = []
    if sar.get("polarizations"):
        polarization = sar["polarizations"]
    elif sar.get("instrument_mode") == "IW":
        # Default for IW mode
        polarization = ["VV", "VH"]

    # Orbit info
    orbit_direction = orbit.get("orbit_state")  # ascending / descending
    orbit_number = orbit.get("absolute_orbit")
    relative_orbit = orbit.get("relative_orbit")

    # Acquisition mode
    acquisition_mode = sar.get("instrument_mode", "IW")

    # Processing level
    processing_level = props.get("processing:level", "GRD")

    # Resolution
    resolution = {}
    if sar.get("resolution"):
        resolution = sar["resolution"]
    elif item_dict.get("gsd"):
        resolution = {"range": item_dict["gsd"], "azimuth": item_dict["gsd"]}

    return Sentinel1Scene(
        item_id=item_dict.get("id", "unknown"),
        collection=item_dict.get("collection", "sentinel-1-grd"),
        datetime=props.get("datetime", "unknown"),
        orbit_direction=orbit_direction,
        orbit_number=orbit_number,
        relative_orbit=relative_orbit,
        pass_number=orbit_direction.upper() if orbit_direction else None,
        acquisition_mode=acquisition_mode,
        polarization=polarization,
        bbox=item_dict.get("bbox", []),
        geometry=item_dict.get("geometry", {}),
        assets=assets,
        properties=props,
        processing_level=processing_level,
        resolution=resolution,
    )


def search_sentinel1(
    bbox: list[float],
    start_date: str,
    end_date: str,
    max_cloud_cover: Optional[int] = None,
    limit: int = 10,
    orbit_direction: Optional[str] = None,
    polarization: Optional[str] = None,
    acquisition_mode: Optional[str] = None,
) -> Sentinel1SearchResult:
    """
    Search for Sentinel-1 GRD scenes.

    Args:
        bbox: [west, south, east, north]
        start_date: ISO date string (YYYY-MM-DD)
        end_date: ISO date string (YYYY-MM-DD)
        max_cloud_cover: Ignored for SAR (SAR penetrates clouds)
        limit: Maximum results
        orbit_direction: Filter by ascending/descending
        polarization: Filter by polarization (VV, VH, etc.)
        acquisition_mode: Filter by mode (IW, EW, SM)

    Returns:
        Sentinel1SearchResult with matched scenes.
    """
    steps = []
    steps.append({"step": "init", "detail": f"Searching Sentinel-1 GRD for {bbox}"})

    client = get_stac_client()
    collection = "sentinel-1-grd"

    # Build search params
    search_kwargs: dict[str, Any] = {
        "collections": [collection],
        "bbox": bbox,
        "datetime": f"{start_date}/{end_date}",
        "max_items": limit,
    }

    # Sentinel-1 doesn't have cloud cover, but we accept the parameter
    # and ignore it (SAR penetrates clouds)

    # Add SAR-specific query filters
    query = {}
    if orbit_direction:
        query["sat:orbit_state"] = {"eq": orbit_direction.lower()}
    if polarization:
        query["sar:polarizations"] = {"contains": polarization.upper()}
    if acquisition_mode:
        query["sar:instrument_mode"] = {"eq": acquisition_mode.upper()}

    if query:
        search_kwargs["query"] = query

    steps.append({"step": "search", "detail": f"STAC search with params: {list(search_kwargs.keys())}"})

    try:
        search_results = client.search(**search_kwargs)
        total = search_results.matched()
        items = list(search_results.items())

        # Sign with Planetary Computer
        if pc:
            signed_items = [pc.sign(item).to_dict() for item in items]
        else:
            signed_items = [item.to_dict() for item in items]

        steps.append({"step": "results", "detail": f"Found {total or len(signed_items)} scenes"})

    except Exception as e:
        logger.error("Sentinel-1 search failed: %s", e)
        return Sentinel1SearchResult(
            status="error",
            collection=collection,
            total_matches=0,
            returned=0,
            scenes=[],
            polarizations_found=[],
            orbit_directions_found=[],
            date_range=None,
            processing_steps=steps + [{"step": "error", "detail": str(e)}],
        )

    # Extract metadata
    scenes = [_extract_s1_metadata(item) for item in signed_items]

    # Collect stats
    polarizations_found = list(set(
        p for scene in scenes for p in scene.polarization
    ))
    orbit_directions_found = list(set(
        scene.orbit_direction for scene in scenes if scene.orbit_direction
    ))

    dates = [scene.datetime for scene in scenes if scene.datetime != "unknown"]
    date_range = [min(dates), max(dates)] if dates else None

    steps.append({"step": "extract", "detail": f"Extracted metadata for {len(scenes)} scenes"})

    return Sentinel1SearchResult(
        status="ok",
        collection=collection,
        total_matches=total or len(scenes),
        returned=len(scenes),
        scenes=scenes,
        polarizations_found=polarizations_found,
        orbit_directions_found=orbit_directions_found,
        date_range=date_range,
        processing_steps=steps,
    )


def select_s1_asset(
    scene: Sentinel1Scene,
    preferred_polarization: Optional[str] = None,
) -> tuple[str, dict]:
    """
    Select the best SAR asset from a Sentinel-1 scene.

    Priority:
    1. Preferred polarization if available
    2. VH (for vegetation/flood analysis)
    3. VV (for surface water detection)
    4. First available asset
    """
    assets = scene.assets

    # Known SAR asset naming patterns
    pol_priority = {
        "VV": ["vv", "VV"],
        "VH": ["vh", "VH"],
    }

    if preferred_polarization and preferred_polarization.upper() in pol_priority:
        for key in pol_priority[preferred_polarization.upper()]:
            if key in assets:
                return key, assets[key]

    # Default: prefer VH (penetrates vegetation, good for flood)
    for key in ["vh", "VH"]:
        if key in assets:
            return key, assets[key]

    # Fall back to VV
    for key in ["vv", "VV"]:
        if key in assets:
            return key, assets[key]

    # Fall back to any asset
    if assets:
        first_key = next(iter(assets))
        return first_key, assets[first_key]

    raise ValueError("No assets found in Sentinel-1 scene")


def get_s1_scene_info(scene: Sentinel1Scene) -> dict[str, Any]:
    """Get detailed information about a Sentinel-1 scene."""
    cap = get_sensor("sentinel-1-grd")
    return {
        "scene": scene.to_dict(),
        "sensor": {
            "name": cap.name if cap else "sentinel-1-grd",
            "full_name": cap.full_name if cap else "Sentinel-1 GRD",
            "provider": cap.provider if cap else "Copernicus/ESA",
            "is_sar": True,
            "is_optical": False,
        },
        "analysis_notes": {
            "cloud_cover": "N/A — SAR penetrates clouds",
            "best_for": ["Flood detection", "Surface water mapping", "Ground deformation", "Ice monitoring"],
            "polarization_guide": {
                "VV": "Surface water, smooth surfaces, urban areas",
                "VH": "Vegetation structure, soil moisture, flood under canopy",
            },
        },
    }
