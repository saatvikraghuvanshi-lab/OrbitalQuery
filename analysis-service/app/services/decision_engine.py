"""
Decision Intelligence Engine.

Computes impact assessment from geospatial analysis results.
Uses configurable thresholds from decision_config.py.
Every output contains: value, unit, source, method, threshold, confidence.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from app.services.decision_config import (
    DecisionMetric,
    DecisionOutput,
    FloodThresholds,
    UrbanThresholds,
    VegetationThresholds,
    Severity,
    DEFAULT_FLOOD_THRESHOLDS,
    DEFAULT_URBAN_THRESHOLDS,
    DEFAULT_VEGETATION_THRESHOLDS,
)

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════
# Flood Decision Intelligence
# ══════════════════════════════════════════════════════════════════

def assess_flood_impact(
    flood_stats: dict[str, Any],
    thresholds: Optional[FloodThresholds] = None,
) -> DecisionOutput:
    """
    Produce decision intelligence from flood detection statistics.

    Args:
        flood_stats: Output from flood_detection.py containing:
            - total_flood_area_km2
            - aoi_area_km2
            - flood_pct
            - builtup_affected_km2 (optional)
            - cluster_count (optional)
            - high_impact_zones (optional)
            - confidence
        thresholds: Configurable thresholds (uses defaults if None)

    Returns:
        DecisionOutput with severity classification + metrics + recommendations
    """
    t = thresholds or DEFAULT_FLOOD_THRESHOLDS
    metrics: list[DecisionMetric] = []
    limitations: list[str] = []

    # ── Total flooded area ──────────────────────────────────────
    area_km2 = flood_stats.get("total_flood_area_km2", 0.0)
    area_severity = t.classify_area(area_km2)
    metrics.append(DecisionMetric(
        name="total_flood_area",
        value=round(area_km2, 3),
        unit="km²",
        source_analysis="SAR backscatter thresholding (VV+VH consensus)",
        method="Connected component analysis on binary flood mask",
        threshold=f"LOW < {t.low_area_km2} km², MEDIUM < {t.medium_area_km2} km², HIGH < {t.high_area_km2} km²",
        severity=area_severity,
        confidence=flood_stats.get("confidence", "derived"),
    ))

    # ── Percentage of AOI affected ──────────────────────────────
    aoi_area = flood_stats.get("aoi_area_km2", 0.0)
    pct = flood_stats.get("flood_pct", 0.0)
    if aoi_area > 0:
        pct = (area_km2 / aoi_area) * 100
    pct_severity = t.classify_pct(pct)
    metrics.append(DecisionMetric(
        name="aoi_coverage_pct",
        value=round(pct, 2),
        unit="%",
        source_analysis="Flood area / total AOI area",
        method="Division of flood extent by AOI bounding box area",
        threshold=f"LOW < {t.low_pct}%, MEDIUM < {t.medium_pct}%, HIGH < {t.high_pct}%",
        severity=pct_severity,
    ))

    # ── Built-up area affected ──────────────────────────────────
    builtup_km2 = flood_stats.get("builtup_affected_km2", 0.0)
    if builtup_km2 > 0:
        builtup_severity = t.classify_builtup(builtup_km2)
        metrics.append(DecisionMetric(
            name="builtup_affected",
            value=round(builtup_km2, 3),
            unit="km²",
            source_analysis="Intersection of flood mask with built-up land cover",
            method="Spatial intersection of flood extent with urban land use layer",
            threshold=f"LOW < {t.low_builtup_km2} km², MEDIUM < {t.medium_builtup_km2} km², HIGH < {t.high_builtup_km2} km²",
            severity=builtup_severity,
        ))
    else:
        limitations.append("Built-up area intersection not computed (no land cover data available)")

    # ── High-impact clusters ────────────────────────────────────
    clusters = flood_stats.get("cluster_count", flood_stats.get("high_impact_zones", 0))
    if clusters > 0:
        if clusters >= t.high_clusters:
            cluster_sev = Severity.CRITICAL
        elif clusters >= t.medium_clusters:
            cluster_sev = Severity.HIGH
        elif clusters >= t.low_clusters:
            cluster_sev = Severity.MEDIUM
        else:
            cluster_sev = Severity.LOW

        metrics.append(DecisionMetric(
            name="high_impact_clusters",
            value=clusters,
            unit="zones",
            source_analysis="Connected component analysis of flood mask",
            method="Morphological filtering + connected components on binary change mask",
            threshold=f"LOW < {t.low_clusters}, MEDIUM < {t.medium_clusters}, HIGH < {t.high_clusters}",
            severity=cluster_sev,
        ))

    # ── Overall severity (worst of all metrics) ─────────────────
    severity_order = [Severity.LOW, Severity.MEDIUM, Severity.HIGH, Severity.CRITICAL]
    worst = Severity.LOW
    for m in metrics:
        if m.severity and severity_order.index(m.severity) > severity_order.index(worst):
            worst = m.severity

    # ── Recommendations ─────────────────────────────────────────
    recommendations = _generate_flood_recommendations(worst, area_km2, pct, builtup_km2, clusters)

    # ── Confidence ──────────────────────────────────────────────
    confidence = flood_stats.get("confidence", "medium")
    if area_km2 == 0:
        confidence = "no_flood_detected"

    return DecisionOutput(
        analysis_type="flood_impact",
        overall_severity=worst,
        metrics=metrics,
        recommendations=recommendations,
        limitations=limitations,
        confidence=confidence,
    )


def _generate_flood_recommendations(
    severity: Severity,
    area_km2: float,
    pct: float,
    builtup_km2: float,
    clusters: int,
) -> list[str]:
    """Generate actionable recommendations based on severity."""
    recs = []

    if severity == Severity.CRITICAL:
        recs.append("IMMEDIATE: Large-scale flooding detected. Prioritize evacuation and emergency response.")
        if builtup_km2 > 2.0:
            recs.append("Urban areas significantly affected — coordinate with municipal disaster management.")
        recs.append("Deploy SAR-based continuous monitoring for flood extent evolution.")
    elif severity == Severity.HIGH:
        recs.append("Significant flooding detected. Activate flood response protocols.")
        if clusters >= 3:
            recs.append("Multiple high-impact zones identified — prioritize resource allocation to largest clusters.")
        recs.append("Monitor river gauge stations and upstream Sentinel-1 acquisitions.")
    elif severity == Severity.MEDIUM:
        recs.append("Moderate flooding detected. Monitor situation for escalation.")
        recs.append("Verify ground truth with local reports or IoT sensor networks.")
    else:
        recs.append("Minimal or no flooding detected. Continue routine monitoring.")

    if pct > 10:
        recs.append(f"Over {pct:.1f}% of the study area is affected — assess regional infrastructure impacts.")

    return recs


# ══════════════════════════════════════════════════════════════════
# Urban Expansion Decision Intelligence
# ══════════════════════════════════════════════════════════════════

def assess_urban_impact(
    urban_stats: dict[str, Any],
    thresholds: Optional[UrbanThresholds] = None,
) -> DecisionOutput:
    """
    Produce decision intelligence from urban expansion analysis.

    Args:
        urban_stats: Output containing:
            - ndbi_change_mean
            - urban_expansion_area_km2
            - total_aoi_km2
            - expansion_pct
            - confidence
    """
    t = thresholds or DEFAULT_URBAN_THRESHOLDS
    metrics: list[DecisionMetric] = []
    limitations: list[str] = []

    # ── NDBI change magnitude ───────────────────────────────────
    ndbi_change = urban_stats.get("ndbi_change_mean", 0.0)
    ndbi_severity = t.classify_ndbi(abs(ndbi_change))
    metrics.append(DecisionMetric(
        name="ndbi_change_magnitude",
        value=round(ndbi_change, 4),
        unit="NDBI units",
        source_analysis="NDBI (Normalized Difference Built-up Index) temporal differencing",
        method="(SWIR - NIR) / (SWIR + NIR) computed for T1 and T2, then differenced",
        threshold=f"LOW < {t.low_ndbi_change}, MEDIUM < {t.medium_ndbi_change}, HIGH < {t.high_ndbi_change}",
        severity=ndbi_severity,
    ))

    # ── Expansion area ──────────────────────────────────────────
    area_km2 = urban_stats.get("urban_expansion_area_km2", 0.0)
    area_severity = t.classify_area(area_km2)
    metrics.append(DecisionMetric(
        name="urban_expansion_area",
        value=round(area_km2, 3),
        unit="km²",
        source_analysis="Thresholded NDBI change map",
        method="Binary thresholding on NDBI difference, connected components, area calculation",
        threshold=f"LOW < {t.low_area_km2} km², MEDIUM < {t.medium_area_km2} km², HIGH < {t.high_area_km2} km²",
        severity=area_severity,
    ))

    # ── Expansion percentage ────────────────────────────────────
    pct = urban_stats.get("expansion_pct", 0.0)
    if pct > 0:
        if pct >= t.high_pct:
            pct_sev = Severity.CRITICAL
        elif pct >= t.medium_pct:
            pct_sev = Severity.HIGH
        elif pct >= t.low_pct:
            pct_sev = Severity.MEDIUM
        else:
            pct_sev = Severity.LOW

        metrics.append(DecisionMetric(
            name="expansion_pct_of_aoi",
            value=round(pct, 2),
            unit="%",
            source_analysis="Urban expansion area / total AOI area",
            method="Division of thresholded expansion area by study area",
            severity=pct_sev,
        ))
    else:
        limitations.append("Expansion percentage not computed (AOI area unknown)")

    # ── Overall severity ────────────────────────────────────────
    severity_order = [Severity.LOW, Severity.MEDIUM, Severity.HIGH, Severity.CRITICAL]
    worst = Severity.LOW
    for m in metrics:
        if m.severity and severity_order.index(m.severity) > severity_order.index(worst):
            worst = m.severity

    # ── Recommendations ─────────────────────────────────────────
    recommendations = []
    if worst == Severity.CRITICAL:
        recommendations.append("RAPID URBANIZATION: Significant built-up expansion detected.")
        recommendations.append("Assess impact on agricultural land, water bodies, and green spaces.")
        recommendations.append("Recommend urban planning review and infrastructure capacity assessment.")
    elif worst == Severity.HIGH:
        recommendations.append("Notable urban expansion detected. Monitor for continued growth.")
        recommendations.append("Cross-reference with land use policy and zoning regulations.")
    elif worst == Severity.MEDIUM:
        recommendations.append("Moderate urban expansion. Track over multi-year time series.")
    else:
        recommendations.append("Minimal urban change detected. Continue periodic monitoring.")

    return DecisionOutput(
        analysis_type="urban_expansion",
        overall_severity=worst,
        metrics=metrics,
        recommendations=recommendations,
        limitations=limitations,
        confidence=urban_stats.get("confidence", "medium"),
    )


# ══════════════════════════════════════════════════════════════════
# Vegetation Change Decision Intelligence
# ══════════════════════════════════════════════════════════════════

def assess_vegetation_impact(
    veg_stats: dict[str, Any],
    thresholds: Optional[VegetationThresholds] = None,
) -> DecisionOutput:
    """
    Produce decision intelligence from vegetation change analysis.
    """
    t = thresholds or DEFAULT_VEGETATION_THRESHOLDS
    metrics: list[DecisionMetric] = []
    limitations: list[str] = []

    # ── NDVI change ─────────────────────────────────────────────
    ndvi_change = veg_stats.get("ndvi_change_mean", 0.0)
    ndvi_severity = t.classify_ndvi(ndvi_change)
    metrics.append(DecisionMetric(
        name="ndvi_change_magnitude",
        value=round(ndvi_change, 4),
        unit="NDVI units",
        source_analysis="NDVI temporal differencing (T2 - T1)",
        method="(NIR - Red) / (NIR + Red) computed for T1 and T2, then differenced",
        threshold=f"LOW > {t.low_ndvi_change}, MEDIUM > {t.medium_ndvi_change}, HIGH > {t.high_ndvi_change} (more negative = worse)",
        severity=ndvi_severity,
    ))

    # ── Degradation area ────────────────────────────────────────
    area_km2 = veg_stats.get("degradation_area_km2", 0.0)
    if area_km2 > 0:
        if area_km2 >= t.high_area_km2:
            area_sev = Severity.CRITICAL
        elif area_km2 >= t.medium_area_km2:
            area_sev = Severity.HIGH
        elif area_km2 >= t.low_area_km2:
            area_sev = Severity.MEDIUM
        else:
            area_sev = Severity.LOW

        metrics.append(DecisionMetric(
            name="vegetation_degradation_area",
            value=round(area_km2, 3),
            unit="km²",
            source_analysis="Thresholded NDVI change map (negative changes only)",
            method="Binary thresholding on NDVI difference, connected components, area calculation",
            severity=area_sev,
        ))
    else:
        limitations.append("Degradation area not computed (requires full raster analysis)")

    # ── Overall severity ────────────────────────────────────────
    severity_order = [Severity.LOW, Severity.MEDIUM, Severity.HIGH, Severity.CRITICAL]
    worst = Severity.LOW
    for m in metrics:
        if m.severity and severity_order.index(m.severity) > severity_order.index(worst):
            worst = m.severity

    # ── Recommendations ─────────────────────────────────────────
    recommendations = []
    if worst in (Severity.CRITICAL, Severity.HIGH):
        recommendations.append("Significant vegetation loss detected. Investigate causes (deforestation, drought, fire).")
        recommendations.append("Cross-reference with forest cover databases and fire detection products.")
        recommendations.append("Recommend field verification and ground-truth data collection.")
    elif worst == Severity.MEDIUM:
        recommendations.append("Moderate vegetation change. Monitor for seasonal vs. permanent change.")
        recommendations.append("Compare with multi-year NDVI climatology to distinguish natural variation.")
    else:
        recommendations.append("Vegetation health stable. Continue routine monitoring.")

    return DecisionOutput(
        analysis_type="vegetation_change",
        overall_severity=worst,
        metrics=metrics,
        recommendations=recommendations,
        limitations=limitations,
        confidence=veg_stats.get("confidence", "medium"),
    )


# ══════════════════════════════════════════════════════════════════
# Generic Dispatcher
# ══════════════════════════════════════════════════════════════════

def assess_impact(
    analysis_type: str,
    stats: dict[str, Any],
    custom_thresholds: Optional[dict] = None,
) -> DecisionOutput:
    """
    Generic dispatcher for decision intelligence.

    Routes to the appropriate assessor based on analysis_type.
    """
    if analysis_type == "flood_impact":
        t = FloodThresholds(**custom_thresholds) if custom_thresholds else None
        return assess_flood_impact(stats, t)
    elif analysis_type == "urban_expansion":
        t = UrbanThresholds(**custom_thresholds) if custom_thresholds else None
        return assess_urban_impact(stats, t)
    elif analysis_type == "vegetation_change":
        t = VegetationThresholds(**custom_thresholds) if custom_thresholds else None
        return assess_vegetation_impact(stats, t)
    else:
        # Return a generic output
        return DecisionOutput(
            analysis_type=analysis_type,
            overall_severity=Severity.LOW,
            limitations=[f"No decision rules configured for analysis type '{analysis_type}'"],
            confidence="unknown",
        )
