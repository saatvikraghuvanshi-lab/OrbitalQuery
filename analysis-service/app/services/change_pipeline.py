"""
Unified Change Detection Pipeline.

Orchestrates the full flow:
  BEFORE bands + AFTER bands
    → common grid alignment
    → cloud/shadow/nodata masking
    → spectral index computation
    → temporal difference
    → multi-signal evidence
    → spatial filtering
    → connected components
    → change regions
    → statistics + GeoJSON

Memory-safe for Render free tier (512MB):
  - Lazy imports (numpy, scipy loaded only when pipeline runs)
  - Small array operations (no full-scene loads)
  - Explicit cleanup of intermediate arrays

No ML models. Pure spectral analysis with configurable thresholds.
"""

from __future__ import annotations

import gc
import logging
from dataclasses import dataclass, field
from typing import Any, Optional

import numpy as np

logger = logging.getLogger(__name__)


# ── Lazy heavy imports ─────────────────────────────────────────────

_scipy_ndimage = None


def _lazy_scipy():
    global _scipy_ndimage
    if _scipy_ndimage is None:
        from scipy import ndimage
        _scipy_ndimage = ndimage
    return _scipy_ndimage


# ── Pipeline Configuration ─────────────────────────────────────────

@dataclass
class PipelineConfig:
    """Configuration for the change detection pipeline."""
    phenomenon: str                           # e.g. "vegetation_change"
    index_name: str                           # Primary index: NDVI, NDBI, etc.
    bands_t1: dict[str, np.ndarray]           # Baseline bands
    bands_t2: dict[str, np.ndarray]           # Comparison bands
    bbox: list[float]                         # [west, south, east, north]
    valid_mask: Optional[np.ndarray] = None   # Pre-computed validity mask
    threshold_override: Optional[dict] = None # Override default thresholds
    min_region_pixels: int = 25
    resolution_m: float = 10.0


@dataclass
class PipelineResult:
    """Complete result of the change detection pipeline."""
    status: str
    phenomenon: str

    # Change mask
    change_mask: np.ndarray            # (H, W) bool — final filtered change
    confidence: np.ndarray             # (H, W) float32 — 0-1 confidence
    direction_mask: np.ndarray         # (H, W) uint8 — 0=stable, 1=loss, 2=gain

    # Continuous difference (for visualization)
    delta: np.ndarray                  # (H, W) float32 — index difference
    delta_normalized: np.ndarray       # (H, W) float32 — normalized to [-1, 1]

    # Region data
    change_geojson: dict               # GeoJSON FeatureCollection
    regions: list[dict]                # List of region metadata dicts
    n_regions: int

    # Statistics
    total_pixels: int
    valid_pixels: int
    changed_pixels: int
    changed_pct: float
    changed_area_km2: float
    valid_area_km2: float
    loss_pixels: int
    gain_pixels: int
    loss_area_km2: float
    gain_area_km2: float
    overall_direction: str             # "loss", "gain", "stable"

    # Quality flags
    valid_coverage_pct: float          # What % of the AOI has valid data
    cloud_affected_pct: float          # What % was masked as cloud/nodata
    min_observation_count: int         # Minimum valid observations per pixel

    # Metadata
    method: str
    index_used: str
    threshold_used: dict
    resolution_m: float
    processing_steps: list[dict[str, str]] = field(default_factory=list)


# ── Pipeline Implementation ────────────────────────────────────────

def run_change_pipeline(config: PipelineConfig) -> PipelineResult:
    """
    Run the full change detection pipeline.

    Memory-safe: operates on numpy arrays already loaded into memory.
    Does NOT read from disk — bands must be pre-loaded.
    """
    ndimage = _lazy_scipy()
    processing_steps = []

    bands_t1 = config.bands_t1
    bands_t2 = config.bands_t2
    bbox = config.bbox

    # Get array shape from any band
    sample_band = next(iter(bands_t1.values()))
    h, w = sample_band.shape

    processing_steps.append({
        "step": "input_validation",
        "detail": f"phenomenon={config.phenomenon}, shape=({h},{w}), "
                  f"bands_t1={list(bands_t1.keys())}, bands_t2={list(bands_t2.keys())}",
    })

    # ── Step 1: Compute validity mask ─────────────────────────────
    if config.valid_mask is not None:
        valid = config.valid_mask
    else:
        # Default: pixel is valid if ALL bands in t1 and t2 are finite and non-zero
        valid = np.ones((h, w), dtype=bool)
        for band_name in bands_t1:
            if band_name in bands_t2:
                v1 = np.isfinite(bands_t1[band_name]) & (bands_t1[band_name] != 0)
                v2 = np.isfinite(bands_t2[band_name]) & (bands_t2[band_name] != 0)
                valid = valid & v1 & v2

    total_pixels = h * w
    valid_pixels = int(np.sum(valid))
    valid_coverage_pct = (valid_pixels / total_pixels * 100) if total_pixels > 0 else 0.0
    cloud_affected_pct = 100.0 - valid_coverage_pct

    processing_steps.append({
        "step": "validity_mask",
        "detail": f"valid={valid_pixels}/{total_pixels} ({valid_coverage_pct:.1f}%), "
                  f"cloud_affected={cloud_affected_pct:.1f}%",
    })

    # ── Step 2: Compute spectral indices ──────────────────────────
    from app.services.multi_signal import (
        compute_index, compute_all_indices,
        compute_multi_signal_evidence, extract_regions, regions_to_geojson,
        Phenomenon, DEFAULT_CONFIGS, ChangeDirection,
    )

    indices_t1 = compute_all_indices(bands_t1)
    indices_t2 = compute_all_indices(bands_t2)

    processing_steps.append({
        "step": "index_computation",
        "detail": f"computed={list(indices_t1.keys())}",
    })

    # ── Step 3: Get phenomenon config ─────────────────────────────
    try:
        phenomenon = Phenomenon(config.phenomenon)
    except ValueError:
        phenomenon = Phenomenon.VEGETATION_CHANGE

    # Override thresholds if provided
    if config.threshold_override:
        # Build a custom config with overridden thresholds
        base_config = DEFAULT_CONFIGS.get(phenomenon, DEFAULT_CONFIGS[Phenomenon.VEGETATION_CHANGE])
        from app.services.multi_signal import SignalThreshold, PhenomenonConfig
        new_signals = []
        for sig in base_config.signals:
            override = config.threshold_override.get(f"{sig.index_name}_{sig.direction}", {})
            new_signals.append(SignalThreshold(
                index_name=sig.index_name,
                direction=sig.direction,
                min_delta=override.get("min_delta", sig.min_delta),
                context_index=sig.context_index,
                context_direction=sig.context_direction,
                context_min_delta=override.get("context_min_delta", sig.context_min_delta),
                description=sig.description,
            ))
        pipeline_config_obj = PhenomenonConfig(
            phenomenon=phenomenon,
            primary_index=config.index_name or base_config.primary_index,
            signals=new_signals,
            min_region_pixels=config.min_region_pixels,
            morphological_iterations=base_config.morphological_iterations,
            description=base_config.description,
        )
    else:
        pipeline_config_obj = DEFAULT_CONFIGS.get(phenomenon, DEFAULT_CONFIGS[Phenomenon.VEGETATION_CHANGE])
        # Use config.index_name if provided
        if config.index_name:
            pipeline_config_obj.primary_index = config.index_name

    processing_steps.append({
        "step": "phenomenon_config",
        "detail": f"phenomenon={phenomenon.value}, primary={pipeline_config_obj.primary_index}, "
                  f"signals={len(pipeline_config_obj.signals)}",
    })

    # ── Step 4: Multi-signal evidence ─────────────────────────────
    evidence = compute_multi_signal_evidence(
        indices_t1, indices_t2, pipeline_config_obj, valid,
    )

    processing_steps.extend(evidence.processing_steps)

    # ── Step 5: Compute continuous delta for visualization ─────────
    primary_idx = pipeline_config_obj.primary_index
    if primary_idx in indices_t1 and primary_idx in indices_t2:
        delta = indices_t2[primary_idx].astype(np.float32) - indices_t1[primary_idx].astype(np.float32)
    else:
        delta = np.zeros((h, w), dtype=np.float32)

    # Normalize delta to [-1, 1] for visualization
    abs_max = np.nanpercentile(np.abs(delta[np.isfinite(delta)]), 99) if np.any(np.isfinite(delta)) else 1.0
    if abs_max > 0:
        delta_normalized = np.clip(delta / abs_max, -1, 1)
    else:
        delta_normalized = np.zeros_like(delta)

    # ── Step 6: Extract regions + GeoJSON ─────────────────────────
    regions = extract_regions(evidence, delta, evidence.confidence)
    change_geojson = regions_to_geojson(regions, bbox, h, w)

    # Convert regions to dicts
    region_dicts = []
    for r in regions:
        region_dicts.append({
            "region_id": r.region_id,
            "area_pixels": r.area_pixels,
            "area_pct": r.area_pct,
            "bbox_pixels": r.bbox_pixels,
            "centroid_pixels": r.centroid_pixels,
            "direction": r.direction,
            "mean_delta": r.mean_delta,
            "mean_confidence": r.mean_confidence,
            "index": r.index_name,
        })

    # ── Step 7: Area calculations ─────────────────────────────────
    pixel_area_km2 = (config.resolution_m ** 2) / 1e6
    changed_area_km2 = evidence.changed_pixels * pixel_area_km2
    valid_area_km2 = valid_pixels * pixel_area_km2
    loss_area_km2 = evidence.loss_pixels * pixel_area_km2
    gain_area_km2 = evidence.gain_pixels * pixel_area_km2

    processing_steps.append({
        "step": "area_calculation",
        "detail": f"changed={changed_area_km2:.2f}km², valid={valid_area_km2:.2f}km², "
                  f"loss={loss_area_km2:.2f}km², gain={gain_area_km2:.2f}km²",
    })

    # ── Cleanup intermediate arrays ───────────────────────────────
    del indices_t1, indices_t2
    gc.collect()

    # ── Build result ──────────────────────────────────────────────
    return PipelineResult(
        status="ok",
        phenomenon=config.phenomenon,
        change_mask=evidence.filtered_mask,
        confidence=evidence.confidence,
        direction_mask=evidence.direction_mask,
        delta=delta,
        delta_normalized=delta_normalized,
        change_geojson=change_geojson,
        regions=region_dicts,
        n_regions=evidence.n_regions,
        total_pixels=total_pixels,
        valid_pixels=valid_pixels,
        changed_pixels=evidence.changed_pixels,
        changed_pct=evidence.changed_pct,
        changed_area_km2=round(changed_area_km2, 4),
        valid_area_km2=round(valid_area_km2, 4),
        loss_pixels=evidence.loss_pixels,
        gain_pixels=evidence.gain_pixels,
        loss_area_km2=round(loss_area_km2, 4),
        gain_area_km2=round(gain_area_km2, 4),
        overall_direction=evidence.overall_direction.value,
        valid_coverage_pct=round(valid_coverage_pct, 1),
        cloud_affected_pct=round(cloud_affected_pct, 1),
        min_observation_count=1,
        method=evidence.method,
        index_used=pipeline_config_obj.primary_index,
        threshold_used=evidence.threshold_used,
        resolution_m=config.resolution_m,
        processing_steps=processing_steps,
    )
