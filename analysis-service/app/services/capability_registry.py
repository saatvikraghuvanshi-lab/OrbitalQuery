"""
Analysis capability registry for OrbitalQuery.

Maps natural-language phenomena to validated analysis configurations.
Each phenomenon defines which sensors, indices, bands, and analysis types
are required. The LLM is ONLY trusted to convert language → schema.
This registry validates every field before execution.

Architecture:
  User query
    → LLM parses to structured plan
    → Registry validates all fields
    → If valid: plan is executable
    → If invalid: clear error with remediation
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Optional

logger = logging.getLogger(__name__)


# ── Analysis type definitions ────────────────────────────────────

@dataclass
class AnalysisTypeConfig:
    """Configuration for a specific analysis type."""
    name: str
    description: str
    required_indices: list[str]
    preferred_sensors: list[str]
    required_bands: list[str]
    comparison_strategy: str  # "temporal_diff", "single_date", "multi_date", "timeseries"
    min_scenes: int
    max_scenes: int
    default_cloud_threshold: int
    output_requirements: list[str]


# ── Phenomenon → analysis type mapping ───────────────────────────

PHENOMENON_REGISTRY: dict[str, dict[str, Any]] = {
    "urban_expansion": {
        "description": "Detect built-up area growth over time",
        "analysis_types": ["ndbi_change", "land_cover_change"],
        "default_index": "NDBI",
        "preferred_sensors": ["sentinel-2-l2a", "landsat-c2-l2"],
        "required_bands": ["SWIR", "NIR"],
        "comparison_strategy": "temporal_diff",
        "min_scenes": 2,
        "max_scenes": 10,
        "default_cloud_threshold": 20,
        "output_requirements": ["change_map", "area_statistics", "percentage_change"],
        "keywords": [
            "urban", "built-up", "built up", "construction", "expansion",
            "city growth", "urbanization", "urbanisation", "impervious",
            "infrastructure", "housing", "settlement",
        ],
    },
    "flood_impact": {
        "description": "Detect and measure flood extent and impact",
        "analysis_types": ["flood_detection", "backscatter_change"],
        "default_index": None,  # Uses SAR backscatter, not spectral index
        "preferred_sensors": ["sentinel-1-grd", "sentinel-2-l2a"],
        "required_bands": ["vv", "vh"],
        "comparison_strategy": "temporal_diff",
        "min_scenes": 2,
        "max_scenes": 6,
        "default_cloud_threshold": 30,
        "output_requirements": ["flood_mask", "affected_area", "change_map"],
        "keywords": [
            "flood", "flooding", "inundation", "waterlogged", "deluge",
            "submerged", "overflow", "river overflow", "flash flood",
            "monsoon flood", "dam breach",
        ],
    },
    "vegetation_change": {
        "description": "Monitor vegetation health and changes over time",
        "analysis_types": ["ndvi_change", "vegetation_health"],
        "default_index": "NDVI",
        "preferred_sensors": ["sentinel-2-l2a", "landsat-c2-l2"],
        "required_bands": ["NIR", "RED"],
        "comparison_strategy": "temporal_diff",
        "min_scenes": 2,
        "max_scenes": 20,
        "default_cloud_threshold": 20,
        "output_requirements": ["change_map", "area_statistics", "ndvi_timeseries"],
        "keywords": [
            "vegetation", "deforestation", "forest", "greenery", "greenness",
            "ndvi", "plant health", "crop health", "agriculture", "farming",
            "green cover", "tree cover", "canopy", "leaf", "foliage",
            "drought stress", "browning", "regrowth",
        ],
    },
    "burn_severity": {
        "description": "Assess wildfire damage and burn severity",
        "analysis_types": ["nbr_change", "burn_severity"],
        "default_index": "NBR",
        "preferred_sensors": ["sentinel-2-l2a", "landsat-c2-l2"],
        "required_bands": ["NIR", "SWIR2"],
        "comparison_strategy": "temporal_diff",
        "min_scenes": 2,
        "max_scenes": 6,
        "default_cloud_threshold": 15,
        "output_requirements": ["change_map", "severity_classification", "area_statistics"],
        "keywords": [
            "fire", "burn", "wildfire", "forest fire", "burn severity",
            "fire damage", "char", "scorched", "fire scar", "post-fire",
            "fire spread", "burned area",
        ],
    },
    "water_change": {
        "description": "Monitor water body changes (expansion, shrinking, flooding)",
        "analysis_types": ["ndwi_change", "water_detection"],
        "default_index": "NDWI",
        "preferred_sensors": ["sentinel-2-l2a", "landsat-c2-l2"],
        "required_bands": ["GREEN", "NIR"],
        "comparison_strategy": "temporal_diff",
        "min_scenes": 2,
        "max_scenes": 10,
        "default_cloud_threshold": 20,
        "output_requirements": ["change_map", "area_statistics", "water_mask"],
        "keywords": [
            "water", "lake", "reservoir", "river", "pond", "wetland",
            "water body", "water level", "drought", "desiccation",
            "water expansion", "water shrink", "shoreline",
        ],
    },
    "snow_cover": {
        "description": "Monitor snow and ice cover changes",
        "analysis_types": ["ndsi_change", "snow_detection"],
        "default_index": "NDSI",
        "preferred_sensors": ["sentinel-2-l2a", "landsat-c2-l2"],
        "required_bands": ["GREEN", "SWIR1"],
        "comparison_strategy": "temporal_diff",
        "min_scenes": 2,
        "max_scenes": 10,
        "default_cloud_threshold": 15,
        "output_requirements": ["change_map", "area_statistics", "snow_mask"],
        "keywords": [
            "snow", "ice", "glacier", "glacial", "ice cap", "snowmelt",
            "snow cover", "cryosphere", "permafrost", "ice sheet",
            "glacier retreat", "snow line",
        ],
    },
    "soil_moisture": {
        "description": "Estimate soil moisture and dryness conditions",
        "analysis_types": ["ndvi_ndwi_combined", "moisture_estimation"],
        "default_index": "NDVI",
        "preferred_sensors": ["sentinel-2-l2a", "landsat-c2-l2"],
        "required_bands": ["NIR", "RED", "SWIR1"],
        "comparison_strategy": "temporal_diff",
        "min_scenes": 2,
        "max_scenes": 10,
        "default_cloud_threshold": 20,
        "output_requirements": ["moisture_map", "area_statistics"],
        "keywords": [
            "soil moisture", "dryness", "aridity", "drought",
            "soil water", "irrigation", "parched",
        ],
    },
    "land_cover_change": {
        "description": "General-purpose land cover change detection",
        "analysis_types": ["multi_index_change", "classification_change"],
        "default_index": "NDVI",
        "preferred_sensors": ["sentinel-2-l2a", "landsat-c2-l2"],
        "required_bands": ["NIR", "RED", "SWIR"],
        "comparison_strategy": "temporal_diff",
        "min_scenes": 2,
        "max_scenes": 15,
        "default_cloud_threshold": 25,
        "output_requirements": ["change_map", "area_statistics"],
        "keywords": [
            "land cover", "land use", "land change", "deforestation",
            "afforestation", "reclamation", "mining", "quarry",
            "conversion",
        ],
    },
    "coastal_erosion": {
        "description": "Detect coastline changes and shoreline erosion",
        "analysis_types": ["ndwi_change", "shoreline_change"],
        "default_index": "NDWI",
        "preferred_sensors": ["sentinel-2-l2a", "landsat-c2-l2", "sentinel-1-grd"],
        "required_bands": ["GREEN", "NIR"],
        "comparison_strategy": "temporal_diff",
        "min_scenes": 2,
        "max_scenes": 10,
        "default_cloud_threshold": 15,
        "output_requirements": ["change_map", "shoreline_map", "area_statistics"],
        "keywords": [
            "coastal", "coastline", "erosion", "shoreline", "beach",
            "sea level", "coast retreat", "coast advance", "tidal",
            "littoral", "shore retreat",
        ],
    },
    "glacier_retreat": {
        "description": "Monitor glacier and ice sheet changes over time",
        "analysis_types": ["ndsi_change", "glacier_area_change"],
        "default_index": "NDSI",
        "preferred_sensors": ["sentinel-2-l2a", "landsat-c2-l2"],
        "required_bands": ["GREEN", "SWIR1"],
        "comparison_strategy": "temporal_diff",
        "min_scenes": 2,
        "max_scenes": 10,
        "default_cloud_threshold": 15,
        "output_requirements": ["change_map", "area_statistics", "terminus_change"],
        "keywords": [
            "glacier", "glacial", "glacier retreat", "ice melt",
            "ice loss", "terminus", "moraine", "glacial lake",
            "deglaciation", "ice cap",
        ],
    },
    "deforestation": {
        "description": "Detect forest cover loss or gain",
        "analysis_types": ["ndvi_change", "land_cover_change"],
        "default_index": "NDVI",
        "preferred_sensors": ["sentinel-2-l2a", "landsat-c2-l2"],
        "required_bands": ["NIR", "RED"],
        "comparison_strategy": "temporal_diff",
        "min_scenes": 2,
        "max_scenes": 15,
        "default_cloud_threshold": 20,
        "output_requirements": ["change_map", "area_statistics", "forest_loss_map"],
        "keywords": [
            "deforestation", "forest loss", "tree cover loss", "logging",
            "forest clearing", "forest degradation", "illegal logging",
            "amazon", "rainforest", "boreal forest",
        ],
    },
}


# ── Supported analysis types ─────────────────────────────────────

ANALYSIS_TYPES: dict[str, AnalysisTypeConfig] = {
    "ndbi_change": AnalysisTypeConfig(
        name="ndbi_change",
        description="Change in built-up index between two dates",
        required_indices=["NDBI"],
        preferred_sensors=["sentinel-2-l2a", "landsat-c2-l2"],
        required_bands=["SWIR", "NIR"],
        comparison_strategy="temporal_diff",
        min_scenes=2,
        max_scenes=10,
        default_cloud_threshold=20,
        output_requirements=["change_map", "area_statistics"],
    ),
    "ndvi_change": AnalysisTypeConfig(
        name="ndvi_change",
        description="Change in vegetation index between two dates",
        required_indices=["NDVI"],
        preferred_sensors=["sentinel-2-l2a", "landsat-c2-l2"],
        required_bands=["NIR", "RED"],
        comparison_strategy="temporal_diff",
        min_scenes=2,
        max_scenes=20,
        default_cloud_threshold=20,
        output_requirements=["change_map", "area_statistics"],
    ),
    "ndwi_change": AnalysisTypeConfig(
        name="ndwi_change",
        description="Change in water index between two dates",
        required_indices=["NDWI"],
        preferred_sensors=["sentinel-2-l2a", "landsat-c2-l2"],
        required_bands=["GREEN", "NIR"],
        comparison_strategy="temporal_diff",
        min_scenes=2,
        max_scenes=10,
        default_cloud_threshold=20,
        output_requirements=["change_map", "area_statistics"],
    ),
    "nbr_change": AnalysisTypeConfig(
        name="nbr_change",
        description="Change in burn ratio between two dates",
        required_indices=["NBR"],
        preferred_sensors=["sentinel-2-l2a", "landsat-c2-l2"],
        required_bands=["NIR", "SWIR2"],
        comparison_strategy="temporal_diff",
        min_scenes=2,
        max_scenes=6,
        default_cloud_threshold=15,
        output_requirements=["change_map", "severity_classification"],
    ),
    "ndsi_change": AnalysisTypeConfig(
        name="ndsi_change",
        description="Change in snow index between two dates",
        required_indices=["NDSI"],
        preferred_sensors=["sentinel-2-l2a", "landsat-c2-l2"],
        required_bands=["GREEN", "SWIR1"],
        comparison_strategy="temporal_diff",
        min_scenes=2,
        max_scenes=10,
        default_cloud_threshold=15,
        output_requirements=["change_map", "area_statistics"],
    ),
    "flood_detection": AnalysisTypeConfig(
        name="flood_detection",
        description="SAR-based flood extent detection",
        required_indices=[],
        preferred_sensors=["sentinel-1-grd"],
        required_bands=["vv", "vh"],
        comparison_strategy="temporal_diff",
        min_scenes=2,
        max_scenes=6,
        default_cloud_threshold=100,  # SAR ignores clouds
        output_requirements=["flood_mask", "affected_area"],
    ),
    "backscatter_change": AnalysisTypeConfig(
        name="backscatter_change",
        description="Change in SAR backscatter between dates",
        required_indices=[],
        preferred_sensors=["sentinel-1-grd"],
        required_bands=["vv", "vh"],
        comparison_strategy="temporal_diff",
        min_scenes=2,
        max_scenes=6,
        default_cloud_threshold=100,
        output_requirements=["change_map", "area_statistics"],
    ),
    "multi_index_change": AnalysisTypeConfig(
        name="multi_index_change",
        description="Combined multi-index land cover change",
        required_indices=["NDVI", "NDBI", "NDWI"],
        preferred_sensors=["sentinel-2-l2a"],
        required_bands=["NIR", "RED", "SWIR", "GREEN"],
        comparison_strategy="temporal_diff",
        min_scenes=2,
        max_scenes=15,
        default_cloud_threshold=25,
        output_requirements=["change_map", "area_statistics"],
    ),
    "vegetation_health": AnalysisTypeConfig(
        name="vegetation_health",
        description="Current vegetation health assessment",
        required_indices=["NDVI"],
        preferred_sensors=["sentinel-2-l2a"],
        required_bands=["NIR", "RED"],
        comparison_strategy="single_date",
        min_scenes=1,
        max_scenes=5,
        default_cloud_threshold=20,
        output_requirements=["ndvi_map", "health_classification"],
    ),
    "water_detection": AnalysisTypeConfig(
        name="water_detection",
        description="Current water body detection",
        required_indices=["NDWI"],
        preferred_sensors=["sentinel-2-l2a"],
        required_bands=["GREEN", "NIR"],
        comparison_strategy="single_date",
        min_scenes=1,
        max_scenes=5,
        default_cloud_threshold=20,
        output_requirements=["water_mask", "area_statistics"],
    ),
    "snow_detection": AnalysisTypeConfig(
        name="snow_detection",
        description="Current snow/ice cover detection",
        required_indices=["NDSI"],
        preferred_sensors=["sentinel-2-l2a"],
        required_bands=["GREEN", "SWIR1"],
        comparison_strategy="single_date",
        min_scenes=1,
        max_scenes=5,
        default_cloud_threshold=15,
        output_requirements=["snow_mask", "area_statistics"],
    ),
    "burn_severity": AnalysisTypeConfig(
        name="burn_severity",
        description="dNBR-based burn severity classification",
        required_indices=["NBR"],
        preferred_sensors=["sentinel-2-l2a", "landsat-c2-l2"],
        required_bands=["NIR", "SWIR2"],
        comparison_strategy="temporal_diff",
        min_scenes=2,
        max_scenes=6,
        default_cloud_threshold=15,
        output_requirements=["severity_classification", "area_statistics"],
    ),
    "land_cover_change": AnalysisTypeConfig(
        name="land_cover_change",
        description="General land cover change detection",
        required_indices=["NDVI", "NDBI"],
        preferred_sensors=["sentinel-2-l2a"],
        required_bands=["NIR", "RED", "SWIR"],
        comparison_strategy="temporal_diff",
        min_scenes=2,
        max_scenes=15,
        default_cloud_threshold=25,
        output_requirements=["change_map", "area_statistics"],
    ),
    "ndvi_ndwi_combined": AnalysisTypeConfig(
        name="ndvi_ndwi_combined",
        description="Combined vegetation-water analysis",
        required_indices=["NDVI", "NDWI"],
        preferred_sensors=["sentinel-2-l2a"],
        required_bands=["NIR", "RED", "GREEN"],
        comparison_strategy="temporal_diff",
        min_scenes=2,
        max_scenes=10,
        default_cloud_threshold=20,
        output_requirements=["moisture_map", "area_statistics"],
    ),
    "moisture_estimation": AnalysisTypeConfig(
        name="moisture_estimation",
        description="Soil moisture estimation from spectral indices",
        required_indices=["NDVI"],
        preferred_sensors=["sentinel-2-l2a"],
        required_bands=["NIR", "RED", "SWIR1"],
        comparison_strategy="temporal_diff",
        min_scenes=2,
        max_scenes=10,
        default_cloud_threshold=20,
        output_requirements=["moisture_map"],
    ),
    "classification_change": AnalysisTypeConfig(
        name="classification_change",
        description="Land cover classification change",
        required_indices=["NDVI", "NDBI", "NDWI"],
        preferred_sensors=["sentinel-2-l2a"],
        required_bands=["NIR", "RED", "SWIR", "GREEN"],
        comparison_strategy="temporal_diff",
        min_scenes=2,
        max_scenes=15,
        default_cloud_threshold=25,
        output_requirements=["change_map", "area_statistics"],
    ),
    "shoreline_change": AnalysisTypeConfig(
        name="shoreline_change",
        description="Coastline and shoreline change detection",
        required_indices=["NDWI"],
        preferred_sensors=["sentinel-2-l2a", "landsat-c2-l2"],
        required_bands=["GREEN", "NIR"],
        comparison_strategy="temporal_diff",
        min_scenes=2,
        max_scenes=10,
        default_cloud_threshold=15,
        output_requirements=["shoreline_map", "change_map", "area_statistics"],
    ),
    "glacier_area_change": AnalysisTypeConfig(
        name="glacier_area_change",
        description="Glacier extent and terminus change",
        required_indices=["NDSI"],
        preferred_sensors=["sentinel-2-l2a", "landsat-c2-l2"],
        required_bands=["GREEN", "SWIR1"],
        comparison_strategy="temporal_diff",
        min_scenes=2,
        max_scenes=10,
        default_cloud_threshold=15,
        output_requirements=["change_map", "area_statistics", "terminus_change"],
    ),
    "timeseries": AnalysisTypeConfig(
        name="timeseries",
        description="Temporal datacube construction",
        required_indices=[],
        preferred_sensors=["sentinel-2-l2a", "landsat-c2-l2"],
        required_bands=["B04", "B03", "B02"],
        comparison_strategy="timeseries",
        min_scenes=2,
        max_scenes=50,
        default_cloud_threshold=30,
        output_requirements=["datacube", "temporal_stats"],
    ),
}


# ── Validation functions ─────────────────────────────────────────

def detect_phenomenon(query: str) -> Optional[str]:
    """
    Detect the phenomenon type from a natural language query.

    Returns the phenomenon key or None if unrecognized.
    Uses keyword matching — deterministic, no LLM needed.
    """
    query_lower = query.lower()

    # Score each phenomenon by keyword matches
    scores: dict[str, int] = {}
    for phenomenon, config in PHENOMENON_REGISTRY.items():
        score = 0
        for keyword in config["keywords"]:
            if keyword in query_lower:
                score += len(keyword)  # longer keyword match = higher confidence
        if score > 0:
            scores[phenomenon] = score

    if not scores:
        return None

    # Return highest scoring phenomenon
    return max(scores, key=scores.get)


def validate_analysis_plan(
    phenomenon: str,
    analysis_type: str,
    sensor: str,
    bands: list[str],
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> list[str]:
    """
    Validate an analysis plan against the capability registry.

    Returns list of validation errors (empty = valid).
    """
    errors = []

    # 1. Validate phenomenon
    if phenomenon not in PHENOMENON_REGISTRY:
        errors.append(
            f"Unsupported phenomenon: '{phenomenon}'. "
            f"Supported: {sorted(PHENOMENON_REGISTRY.keys())}"
        )
        return errors  # Can't validate further

    pheno_config = PHENOMENON_REGISTRY[phenomenon]

    # 2. Validate analysis type
    if analysis_type not in ANALYSIS_TYPES:
        errors.append(
            f"Unknown analysis type: '{analysis_type}'. "
            f"Supported: {sorted(ANALYSIS_TYPES.keys())}"
        )
        return errors

    if analysis_type not in pheno_config["analysis_types"]:
        errors.append(
            f"Analysis type '{analysis_type}' is not valid for '{phenomenon}'. "
            f"Valid types: {pheno_config['analysis_types']}"
        )

    # 3. Validate sensor
    valid_sensors = pheno_config["preferred_sensors"]
    if sensor not in valid_sensors:
        errors.append(
            f"Sensor '{sensor}' is not preferred for '{phenomenon}'. "
            f"Preferred: {valid_sensors}"
        )

    # 4. Validate bands — accept both logical (NIR, SWIR) and physical (B08, B11) names
    required_logical = set(pheno_config["required_bands"])
    provided = set(bands)

    # Build a reverse map: physical → logical for the given sensor
    from app.services.spectral_indices import INDEX_BAND_MAP
    physical_to_logical: dict[str, str] = {}
    for (s, idx), band_map in INDEX_BAND_MAP.items():
        if s == sensor:
            for logical, physical in band_map.items():
                physical_to_logical[physical] = logical

    # Check if each required logical band is covered
    for req in required_logical:
        # Direct match (user passed logical name)
        if req in provided:
            continue
        # Physical match — check if any physical band maps to this logical band
        # Use prefix matching: 'SWIR' matches 'SWIR1', 'SWIR2' etc.
        if any(v == req or v.startswith(req) for v in physical_to_logical.values()):
            continue
        # Check if any provided band maps to this logical band
        # Use prefix matching: 'SWIR' matches 'SWIR1', 'SWIR2' etc.
        found = False
        for p in provided:
            mapped = physical_to_logical.get(p, '')
            if mapped == req or mapped.startswith(req):
                found = True
                break
        if not found:
            errors.append(
                f"Missing required band '{req}' for '{phenomenon}'. "
                f"Required logical bands: {sorted(required_logical)}"
            )

    # 5. Validate dates
    if start_date and end_date:
        if start_date >= end_date:
            errors.append("start_date must be before end_date")

    if analysis_type in ANALYSIS_TYPES:
        at_config = ANALYSIS_TYPES[analysis_type]
        if at_config.comparison_strategy == "temporal_diff":
            if not start_date or not end_date:
                errors.append(
                    f"Analysis type '{analysis_type}' requires both start_date and end_date "
                    f"(temporal comparison strategy)"
                )

    # 6. Validate bands against sensor capabilities
    from app.services.spectral_indices import SENSOR_BANDS
    if sensor in SENSOR_BANDS:
        sensor_band_ids = set(SENSOR_BANDS[sensor].keys())
        # For SAR sensors, bands are lowercase (vv, vh)
        # For optical sensors, bands are uppercase (B04, B08)
        for band in bands:
            if band.lower() not in {k.lower() for k in sensor_band_ids}:
                errors.append(
                    f"Band '{band}' not available on sensor '{sensor}'. "
                    f"Available: {sorted(sensor_band_ids)}"
                )

    return errors


def get_analysis_config(phenomenon: str, analysis_type: str) -> Optional[AnalysisTypeConfig]:
    """Get the full configuration for a validated analysis type."""
    return ANALYSIS_TYPES.get(analysis_type)


def list_phenomena() -> list[dict[str, Any]]:
    """List all supported phenomena with their configurations."""
    result = []
    for name, config in PHENOMENON_REGISTRY.items():
        result.append({
            "phenomenon": name,
            "description": config["description"],
            "analysis_types": config["analysis_types"],
            "default_index": config["default_index"],
            "preferred_sensors": config["preferred_sensors"],
            "required_bands": config["required_bands"],
            "comparison_strategy": config["comparison_strategy"],
            "keywords": config["keywords"][:5],  # First 5 for brevity
        })
    return result


def list_analysis_types() -> list[dict[str, Any]]:
    """List all supported analysis types."""
    result = []
    for name, config in ANALYSIS_TYPES.items():
        result.append({
            "name": config.name,
            "description": config.description,
            "required_indices": config.required_indices,
            "preferred_sensors": config.preferred_sensors,
            "required_bands": config.required_bands,
            "comparison_strategy": config.comparison_strategy,
            "min_scenes": config.min_scenes,
            "max_scenes": config.max_scenes,
            "output_requirements": config.output_requirements,
        })
    return result
