"""
Decision Intelligence — Configurable thresholds and rules.

All thresholds are stored here, not hardcoded throughout the codebase.
Every rule produces a structured output with value, unit, source, method, threshold, confidence.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional


# ── Severity Levels ─────────────────────────────────────────────

class Severity(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


# ── Flood Decision Rules ────────────────────────────────────────

@dataclass
class FloodThresholds:
    """Configurable thresholds for flood impact assessment."""

    # Area thresholds (km²)
    low_area_km2: float = 1.0
    medium_area_km2: float = 10.0
    high_area_km2: float = 50.0
    # Above high = CRITICAL

    # Percentage of AOI thresholds
    low_pct: float = 1.0
    medium_pct: float = 5.0
    high_pct: float = 15.0

    # Built-up area thresholds (km²)
    low_builtup_km2: float = 0.5
    medium_builtup_km2: float = 2.0
    high_builtup_km2: float = 10.0

    # Cluster thresholds (number of high-impact zones)
    low_clusters: int = 1
    medium_clusters: int = 3
    high_clusters: int = 5

    def classify_area(self, area_km2: float) -> Severity:
        if area_km2 >= self.high_area_km2:
            return Severity.CRITICAL
        if area_km2 >= self.medium_area_km2:
            return Severity.HIGH
        if area_km2 >= self.low_area_km2:
            return Severity.MEDIUM
        return Severity.LOW

    def classify_pct(self, pct: float) -> Severity:
        if pct >= self.high_pct:
            return Severity.CRITICAL
        if pct >= self.medium_pct:
            return Severity.HIGH
        if pct >= self.low_pct:
            return Severity.MEDIUM
        return Severity.LOW

    def classify_builtup(self, builtup_km2: float) -> Severity:
        if builtup_km2 >= self.high_builtup_km2:
            return Severity.CRITICAL
        if builtup_km2 >= self.medium_builtup_km2:
            return Severity.HIGH
        if builtup_km2 >= self.low_builtup_km2:
            return Severity.MEDIUM
        return Severity.LOW


# ── Urban Expansion Decision Rules ──────────────────────────────

@dataclass
class UrbanThresholds:
    """Configurable thresholds for urban expansion assessment."""

    # NDBI change thresholds
    low_ndbi_change: float = 0.05
    medium_ndbi_change: float = 0.15
    high_ndbi_change: float = 0.30

    # Area thresholds (km²)
    low_area_km2: float = 0.5
    medium_area_km2: float = 5.0
    high_area_km2: float = 25.0

    # Percentage thresholds
    low_pct: float = 0.5
    medium_pct: float = 2.0
    high_pct: float = 8.0

    def classify_ndbi(self, change: float) -> Severity:
        if change >= self.high_ndbi_change:
            return Severity.CRITICAL
        if change >= self.medium_ndbi_change:
            return Severity.HIGH
        if change >= self.low_ndbi_change:
            return Severity.MEDIUM
        return Severity.LOW

    def classify_area(self, area_km2: float) -> Severity:
        if area_km2 >= self.high_area_km2:
            return Severity.CRITICAL
        if area_km2 >= self.medium_area_km2:
            return Severity.HIGH
        if area_km2 >= self.low_area_km2:
            return Severity.MEDIUM
        return Severity.LOW


# ── Vegetation Change Decision Rules ────────────────────────────

@dataclass
class VegetationThresholds:
    """Configurable thresholds for vegetation change assessment."""

    # NDVI change thresholds
    low_ndvi_change: float = -0.1
    medium_ndvi_change: float = -0.25
    high_ndvi_change: float = -0.40

    # Area thresholds (km²)
    low_area_km2: float = 1.0
    medium_area_km2: float = 10.0
    high_area_km2: float = 50.0

    def classify_ndvi(self, change: float) -> Severity:
        """More negative = more severe degradation."""
        if change <= self.high_ndvi_change:
            return Severity.CRITICAL
        if change <= self.medium_ndvi_change:
            return Severity.HIGH
        if change <= self.low_ndvi_change:
            return Severity.MEDIUM
        return Severity.LOW


# ── Global Defaults ─────────────────────────────────────────────

DEFAULT_FLOOD_THRESHOLDS = FloodThresholds()
DEFAULT_URBAN_THRESHOLDS = UrbanThresholds()
DEFAULT_VEGETATION_THRESHOLDS = VegetationThresholds()


# ── Decision Output Schema ──────────────────────────────────────

@dataclass
class DecisionMetric:
    """A single decision metric with full provenance."""
    name: str
    value: Any
    unit: str
    source_analysis: str
    method: str
    threshold: Optional[str] = None
    severity: Optional[Severity] = None
    confidence: str = "derived"

    def to_dict(self) -> dict:
        d = {
            "name": self.name,
            "value": self.value,
            "unit": self.unit,
            "source_analysis": self.source_analysis,
            "method": self.method,
            "confidence": self.confidence,
        }
        if self.threshold:
            d["threshold"] = self.threshold
        if self.severity:
            d["severity"] = self.severity.value
        return d


@dataclass
class DecisionOutput:
    """Complete decision intelligence output."""
    analysis_type: str
    overall_severity: Severity
    metrics: list[DecisionMetric] = field(default_factory=list)
    recommendations: list[str] = field(default_factory=list)
    limitations: list[str] = field(default_factory=list)
    confidence: str = "medium"
    method: str = "deterministic_threshold"

    def to_dict(self) -> dict:
        return {
            "analysis_type": self.analysis_type,
            "overall_severity": self.overall_severity.value,
            "metrics": [m.to_dict() for m in self.metrics],
            "recommendations": self.recommendations,
            "limitations": self.limitations,
            "confidence": self.confidence,
            "method": self.method,
        }
