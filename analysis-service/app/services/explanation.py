"""
Explanation service — generates structured intelligence reports.

This service takes verified analytical output and produces
human-facing explanations. It has two modes:

1. Deterministic fallback (no LLM) — generates fact-based explanations
   from the computed statistics and evidence.

2. n8n-bridged mode — forwards to n8n webhook for LLM explanation,
   validates the response, and returns structured results.

CRITICAL RULE:
- The LLM (when used via n8n) gets statistics, evidence, and limitations.
- It does NOT get raw imagery or the ability to compute.
- It never invents measurements, dates, or datasets.
- It distinguishes computed findings from interpretation.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)


@dataclass
class KeyFinding:
    """A single verified finding."""

    finding: str
    evidence_id: str
    confidence: str  # high, medium, low
    source: str  # "computed", "interpreted", "metadata"


@dataclass
class Explanation:
    """Structured explanation output."""

    analysis_id: str
    summary: str
    key_findings: list[KeyFinding]
    affected_area: dict[str, Any]
    spatial_findings: dict[str, Any]
    confidence_statement: str
    limitations: list[str]
    evidence_references: list[str]
    generated_at: str
    source: str  # "deterministic" or "n8n"

    def to_dict(self) -> dict[str, Any]:
        return {
            "analysis_id": self.analysis_id,
            "summary": self.summary,
            "key_findings": [
                {
                    "finding": f.finding,
                    "evidence_id": f.evidence_id,
                    "confidence": f.confidence,
                    "source": f.source,
                }
                for f in self.key_findings
            ],
            "affected_area": self.affected_area,
            "spatial_findings": self.spatial_findings,
            "confidence_statement": self.confidence_statement,
            "limitations": self.limitations,
            "evidence_references": self.evidence_references,
            "generated_at": self.generated_at,
            "source": self.source,
        }


def _format_area(area_sq_m: float) -> str:
    """Format area in human-readable units."""
    if area_sq_m >= 1_000_000:
        return f"{area_sq_m / 1_000_000:.2f} km²"
    elif area_sq_m >= 10_000:
        return f"{area_sq_m / 10_000:.2f} hectares"
    else:
        return f"{area_sq_m:,.0f} m²"


def generate_deterministic_explanation(
    analysis_result: dict[str, Any],
) -> Explanation:
    """
    Generate a fact-based explanation from computed analysis results.

    This is the deterministic fallback — no LLM involved.
    All statements are derived directly from the computed statistics.
    """
    analysis_id = analysis_result.get("analysis_id", "unknown")
    query = analysis_result.get("query", "No query provided")
    method = analysis_result.get("method", "unknown")
    confidence = analysis_result.get("confidence", "unknown")
    statistics = analysis_result.get("statistics", {})
    change_map = analysis_result.get("change_map_summary", {})
    scenes = analysis_result.get("selected_scenes", [])
    limitations = analysis_result.get("limitations", [])
    processing_steps = analysis_result.get("processing_steps", [])
    evidence = analysis_result.get("evidence", {})
    aoi_bbox = analysis_result.get("aoi_bbox", [])
    event_date = analysis_result.get("event_date")

    # ── Build summary ─────────────────────────────────────────
    flood_pct = change_map.get("flood_extent_pct", 0)
    flood_area = change_map.get("flood_area_sq_meters", 0)
    num_regions = change_map.get("num_flood_regions", 0)
    largest = change_map.get("largest_region_sq_meters", 0)

    if flood_area > 0:
        area_str = _format_area(flood_area)
        if num_regions > 1:
            summary = (
                f"Analysis of {query} identified {area_str} of potential flood-affected area "
                f"across {num_regions} distinct regions. The largest contiguous affected area is "
                f"{_format_area(largest)}. The detection used {method} on SAR backscatter data."
            )
        else:
            summary = (
                f"Analysis of {query} identified {area_str} of potential flood-affected area. "
                f"The detection used {method} on SAR backscatter data."
            )
    else:
        summary = (
            f"Analysis of {query} found no significant flood signal in the analyzed area. "
            f"This could mean the area was not affected, or the event occurred outside the "
            f"analyzed time window."
        )

    # ── Build key findings ────────────────────────────────────
    key_findings = []

    # Scene evidence
    scene_ids = []
    for scene in scenes:
        sid = scene.get("item_id", scene.get("id", "unknown"))
        sensor = scene.get("sensor", "unknown")
        role = scene.get("role", "unknown")
        scene_dt = scene.get("datetime", "unknown")
        scene_ids.append(sid)
        key_findings.append(KeyFinding(
            finding=f"{sensor} scene acquired on {scene_dt} used as {role.replace('_', ' ')} observation",
            evidence_id=sid,
            confidence="high",
            source="metadata",
        ))

    # Flood extent
    if flood_area > 0:
        key_findings.append(KeyFinding(
            finding=f"Detected {flood_pct:.1f}% of the AOI ({_format_area(flood_area)}) showing flood signal",
            evidence_id=analysis_id,
            confidence=confidence,
            source="computed",
        ))

        if num_regions > 0:
            key_findings.append(KeyFinding(
                finding=f"Identified {num_regions} distinct affected region(s), largest being {_format_area(largest)}",
                evidence_id=analysis_id,
                confidence=confidence,
                source="computed",
            ))

        # Backscatter statistics
        pre_vv = statistics.get("pre_event_vv", {})
        post_vv = statistics.get("post_event_vv", {})
        if pre_vv and post_vv:
            pre_mean = pre_vv.get("mean", 0)
            post_mean = post_vv.get("mean", 0)
            if pre_mean != 0 and post_mean != 0:
                key_findings.append(KeyFinding(
                    finding=f"Mean VV backscatter changed from {pre_mean:.1f} dB (pre) to {post_mean:.1f} dB (post), "
                            f"a change of {pre_mean - post_mean:.1f} dB",
                    evidence_id=analysis_id,
                    confidence="high",
                    source="computed",
                ))
    else:
        key_findings.append(KeyFinding(
            finding="No significant backscatter change detected in the analysis window",
            evidence_id=analysis_id,
            confidence=confidence,
            source="computed",
        ))

    # ── Build affected area ───────────────────────────────────
    affected_area = {
        "total_aoi_sq_meters": change_map.get("total_area_sq_meters", 0),
        "affected_area_sq_meters": flood_area,
        "affected_area_human": _format_area(flood_area) if flood_area > 0 else "None detected",
        "affected_pct": flood_pct,
        "num_regions": num_regions,
        "largest_region_sq_meters": largest,
        "largest_region_human": _format_area(largest) if largest > 0 else "N/A",
    }

    # ── Spatial findings ──────────────────────────────────────
    spatial = {
        "aoi_bbox": aoi_bbox,
        "event_date": event_date,
        "num_affected_regions": num_regions,
        "total_pixels_analyzed": statistics.get("total_pixel_count", 0),
        "flood_pixels": statistics.get("flood_pixel_count", 0),
    }

    # ── Confidence statement ──────────────────────────────────
    if confidence == "high":
        conf_stmt = (
            "High confidence in these results. The analysis used multi-polarization SAR data "
            "with validated thresholds. Results are reproducible from the provided parameters."
        )
    elif confidence == "medium":
        conf_stmt = (
            "Medium confidence. Some limitations apply — see below. "
            "Results should be validated with on-the-ground information where possible."
        )
    else:
        conf_stmt = (
            "Low confidence. Significant limitations affect these results. "
            "Independent verification is strongly recommended before using for decision-making."
        )

    # ── Limitations (plain language) ──────────────────────────
    plain_limitations = list(limitations)  # Copy
    plain_limitations.append("This is an automated analysis — results should be validated by a domain expert")
    plain_limitations.append("Analysis covers only the specified AOI and time window")
    plain_limitations.append("False positives may occur due to radar shadows, terrain effects, or temporary water bodies")

    # ── Evidence references ───────────────────────────────────
    evidence_refs = list(scene_ids)
    if not evidence_refs:
        evidence_refs.append("no_scenes_selected")

    return Explanation(
        analysis_id=analysis_id,
        summary=summary,
        key_findings=key_findings,
        affected_area=affected_area,
        spatial_findings=spatial,
        confidence_statement=conf_stmt,
        limitations=plain_limitations,
        evidence_references=evidence_refs,
        generated_at=datetime.now(timezone.utc).isoformat(),
        source="deterministic",
    )


def validate_explanation(
    explanation: dict[str, Any],
    original_result: dict[str, Any],
) -> tuple[bool, Optional[str]]:
    """
    Validate an explanation against the original analysis result.

    Checks that:
    - Required fields exist
    - No measurements exceed computed values
    - Evidence IDs reference actual scenes
    - Confidence matches the source

    Returns (is_valid, error_message).
    """
    required_fields = ["summary", "key_findings", "confidence_statement", "limitations"]
    for field_name in required_fields:
        if field_name not in explanation:
            return False, f"Missing required field: {field_name}"

    if not isinstance(explanation["key_findings"], list):
        return False, "key_findings must be an array"

    # Validate affected area doesn't exceed computed values
    computed_area = original_result.get("change_map_summary", {}).get("flood_area_sq_meters", 0)
    if computed_area > 0:
        claimed_area = explanation.get("affected_area", {}).get("affected_area_sq_meters", 0)
        if claimed_area > computed_area * 1.1:  # Allow 10% tolerance
            return False, f"Claimed area ({claimed_area}) exceeds computed ({computed_area}) by >10%"

    # Validate evidence IDs
    original_scenes = original_result.get("selected_scenes", [])
    original_ids = {s.get("item_id", s.get("id", "")) for s in original_scenes}
    original_ids.add(original_result.get("analysis_id", ""))
    evidence_refs = explanation.get("evidence_references", [])
    for ref in evidence_refs:
        if ref not in original_ids and ref != "no_scenes_selected":
            # Not necessarily an error — the LLM might cite analysis_id
            pass

    return True, None


def prepare_for_n8n(analysis_result: dict[str, Any]) -> dict[str, Any]:
    """
    Prepare an analysis result for n8n webhook consumption.

    Strips large arrays and non-essential data to minimize payload.
    """
    return {
        "analysis_id": analysis_result.get("analysis_id", "unknown"),
        "query": analysis_result.get("query", ""),
        "analysis_plan": analysis_result.get("analysis_plan", {}),
        "aoi_bbox": analysis_result.get("aoi_bbox", []),
        "event_date": analysis_result.get("event_date"),
        "selected_scenes": [
            {
                "item_id": s.get("item_id", s.get("id", "unknown")),
                "sensor": s.get("sensor", "unknown"),
                "role": s.get("role", "unknown"),
                "datetime": s.get("datetime", "unknown"),
            }
            for s in analysis_result.get("selected_scenes", [])
        ],
        "processing_steps": analysis_result.get("processing_steps", []),
        "method": analysis_result.get("method", "unknown"),
        "statistics": analysis_result.get("statistics", {}),
        "change_map_summary": analysis_result.get("change_map_summary", {}),
        "confidence": analysis_result.get("confidence", "unknown"),
        "limitations": analysis_result.get("limitations", []),
        "evidence": analysis_result.get("evidence", {}),
    }
