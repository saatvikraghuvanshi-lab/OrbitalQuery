"""
Multi-Signal Change Evidence Engine.

Combines multiple spectral indices to produce robust change evidence
instead of relying on a single index threshold.

Key principle from the research:
  "Don't interpret NDBI increase = definitely urban expansion."
  Use multiple signals and spatial consistency.

Architecture:
  BEFORE bands + AFTER bands
    → compute spectral indices (NDVI, NDBI, NDWI, NBR, NDSI)
    → compute temporal differences
    → apply multi-signal rules per phenomenon
    → produce per-pixel evidence mask + confidence
    → spatial filtering (morphological + connected components)
    → change regions with statistics

Supported phenomena and their signal combinations:
  URBAN_EXPANSION: NDBI↑ + NDVI↓ (built-up gain + vegetation loss)
  VEGETATION_CHANGE: NDVI↓ or NDVI↑
  WATER_CHANGE: NDWI↑ or NDWI↓
  BURN_CHANGE: NBR↓ (dNBR = NBR_before - NBR_after)
  SNOW_CHANGE: NDSI↑ or NDSI↓

All thresholds are configurable. Nothing is hard-coded as "truth".
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

import numpy as np
from scipy import ndimage

logger = logging.getLogger(__name__)


# ── Enums ──────────────────────────────────────────────────────────

class ChangeDirection(str, Enum):
    LOSS = "loss"
    GAIN = "gain"
    STABLE = "stable"


class Phenomenon(str, Enum):
    URBAN_EXPANSION = "urban_expansion"
    VEGETATION_CHANGE = "vegetation_change"
    WATER_CHANGE = "water_change"
    BURN_CHANGE = "burn_change"
    SNOW_CHANGE = "snow_change"


# ── Threshold Configuration ────────────────────────────────────────

@dataclass
class SignalThreshold:
    """Configurable threshold for a single spectral signal."""
    index_name: str           # e.g. "NDBI", "NDVI"
    direction: str            # "increase" or "decrease"
    min_delta: float          # minimum absolute change to consider
    context_index: Optional[str] = None   # supporting index (e.g. NDVI for urban)
    context_direction: Optional[str] = None  # "increase" or "decrease"
    context_min_delta: Optional[float] = None
    min_valid_pct: float = 0.3   # minimum fraction of valid pixels in region
    description: str = ""


@dataclass
class PhenomenonConfig:
    """Configuration for a change detection phenomenon."""
    phenomenon: Phenomenon
    primary_index: str
    signals: list[SignalThreshold]
    min_region_pixels: int = 25
    morphological_iterations: int = 1
    description: str = ""


# ── Default Configurations ─────────────────────────────────────────

DEFAULT_CONFIGS: dict[Phenomenon, PhenomenonConfig] = {
    Phenomenon.URBAN_EXPANSION: PhenomenonConfig(
        phenomenon=Phenomenon.URBAN_EXPANSION,
        primary_index="NDBI",
        signals=[
            SignalThreshold(
                index_name="NDBI", direction="increase", min_delta=0.05,
                context_index="NDVI", context_direction="decrease", context_min_delta=0.03,
                description="NDBI increase with concurrent NDVI decrease",
            ),
        ],
        min_region_pixels=25,
        description="Urban expansion: built-up index increase + vegetation decrease",
    ),
    Phenomenon.VEGETATION_CHANGE: PhenomenonConfig(
        phenomenon=Phenomenon.VEGETATION_CHANGE,
        primary_index="NDVI",
        signals=[
            SignalThreshold(
                index_name="NDVI", direction="decrease", min_delta=0.10,
                description="Vegetation loss (NDVI decrease)",
            ),
            SignalThreshold(
                index_name="NDVI", direction="increase", min_delta=0.10,
                description="Vegetation gain (NDVI increase)",
            ),
        ],
        min_region_pixels=25,
        description="Vegetation change: NDVI increase or decrease",
    ),
    Phenomenon.WATER_CHANGE: PhenomenonConfig(
        phenomenon=Phenomenon.WATER_CHANGE,
        primary_index="NDWI",
        signals=[
            SignalThreshold(
                index_name="NDWI", direction="increase", min_delta=0.10,
                description="Water body expansion (NDWI increase)",
            ),
            SignalThreshold(
                index_name="NDWI", direction="decrease", min_delta=0.10,
                description="Water body shrinkage (NDWI decrease)",
            ),
        ],
        min_region_pixels=20,
        description="Water change: NDWI increase or decrease",
    ),
    Phenomenon.BURN_CHANGE: PhenomenonConfig(
        phenomenon=Phenomenon.BURN_CHANGE,
        primary_index="NBR",
        signals=[
            SignalThreshold(
                index_name="NBR", direction="decrease", min_delta=0.15,
                description="Burn damage (NBR decrease / dNBR increase)",
            ),
        ],
        min_region_pixels=20,
        description="Burn change: NBR decrease indicates fire damage",
    ),
    Phenomenon.SNOW_CHANGE: PhenomenonConfig(
        phenomenon=Phenomenon.SNOW_CHANGE,
        primary_index="NDSI",
        signals=[
            SignalThreshold(
                index_name="NDSI", direction="increase", min_delta=0.10,
                description="Snow/ice increase",
            ),
            SignalThreshold(
                index_name="NDSI", direction="decrease", min_delta=0.10,
                description="Snow/ice retreat",
            ),
        ],
        min_region_pixels=20,
        description="Snow change: NDSI increase or decrease",
    ),
}


# ── Spectral Index Computation ─────────────────────────────────────

def compute_index(
    band_a: np.ndarray,
    band_b: np.ndarray,
    index_name: str,
) -> np.ndarray:
    """
    Compute a normalized difference spectral index.

    Args:
        band_a: Numerator band (e.g. NIR for NDVI)
        band_b: Denominator band (e.g. RED for NDVI)
        index_name: For logging only

    Returns:
        Index array with same shape as inputs, NaN where invalid
    """
    a = band_a.astype(np.float32)
    b = band_b.astype(np.float32)
    denom = a + b
    # Avoid division by zero
    valid = np.abs(denom) > 1e-10
    result = np.full_like(denom, np.nan, dtype=np.float32)
    result[valid] = (a[valid] - b[valid]) / denom[valid]
    return result


# Sentinel-2 band mapping for common indices
# Key: index name → (numerator_band, denominator_band)
INDEX_BAND_MAP: dict[str, tuple[str, str]] = {
    "NDVI": ("B08", "B04"),   # (NIR - RED) / (NIR + RED)
    "NDBI": ("B11", "B08"),   # (SWIR - NIR) / (SWIR + NIR)
    "NDWI": ("B03", "B08"),   # (GREEN - NIR) / (GREEN + NIR)
    "NBR":  ("B08", "B12"),   # (NIR - SWIR2) / (NIR + SWIR2)
    "NDSI": ("B03", "B11"),   # (GREEN - SWIR1) / (GREEN + SWIR1)
    "NDMI": ("B08", "B11"),   # (NIR - SWIR1) / (NIR + SWIR1)
}


def compute_all_indices(
    bands: dict[str, np.ndarray],
) -> dict[str, np.ndarray]:
    """
    Compute all supported spectral indices from available bands.

    Args:
        bands: Dict mapping band name → 2D array (H, W)
               e.g. {"B03": array, "B04": array, "B08": array, ...}

    Returns:
        Dict mapping index name → 2D array
    """
    indices = {}
    for idx_name, (band_a_name, band_b_name) in INDEX_BAND_MAP.items():
        if band_a_name in bands and band_b_name in bands:
            indices[idx_name] = compute_index(
                bands[band_a_name], bands[band_b_name], idx_name,
            )
            valid_pct = np.mean(np.isfinite(indices[idx_name])) * 100
            logger.debug("[MultiSignal] Computed %s: %.1f%% valid pixels", idx_name, valid_pct)
        else:
            logger.debug("[MultiSignal] Skipping %s — missing bands %s or %s",
                        idx_name, band_a_name, band_b_name)
    return indices


# ── Evidence Computation ───────────────────────────────────────────

@dataclass
class SignalEvidence:
    """Evidence from a single spectral signal."""
    index_name: str
    direction: str
    threshold: float
    delta: np.ndarray          # temporal difference (H, W)
    evidence_mask: np.ndarray  # True where signal is satisfied (H, W)
    mean_delta_changed: float  # mean delta in changed pixels
    pixel_count: int


@dataclass
class MultiSignalResult:
    """Combined multi-signal change evidence."""
    status: str
    phenomenon: str

    # Per-signal evidence
    signals: list[SignalEvidence]

    # Combined evidence
    combined_mask: np.ndarray      # True where change is detected
    confidence: np.ndarray         # 0-1 confidence per pixel
    direction_mask: np.ndarray     # Per-pixel: 1=loss, 2=gain, 0=stable

    # Change direction (aggregate)
    overall_direction: ChangeDirection
    loss_pixels: int
    gain_pixels: int

    # Statistics
    total_valid_pixels: int
    changed_pixels: int
    changed_pct: float
    mean_magnitude: float

    # Region filtering results
    filtered_mask: np.ndarray      # After morphological + size filtering
    n_regions: int
    region_areas: list[int]

    # Metadata
    method: str
    threshold_used: dict[str, Any]
    processing_steps: list[dict[str, str]] = field(default_factory=list)


def compute_signal_evidence(
    index_t1: np.ndarray,
    index_t2: np.ndarray,
    signal: SignalThreshold,
    valid_mask: Optional[np.ndarray] = None,
) -> SignalEvidence:
    """
    Compute evidence from a single spectral signal.

    Returns evidence mask where the signal's criteria are satisfied.
    """
    delta = index_t2.astype(np.float32) - index_t1.astype(np.float32)

    # Apply direction
    if signal.direction == "increase":
        evidence = delta > signal.min_delta
    else:
        evidence = delta < -signal.min_delta

    # Apply valid mask
    if valid_mask is not None:
        evidence = evidence & valid_mask

    # Remove NaN
    evidence = evidence & np.isfinite(delta)

    pixel_count = int(np.sum(evidence))
    mean_delta = float(np.nanmean(delta[evidence])) if pixel_count > 0 else 0.0

    return SignalEvidence(
        index_name=signal.index_name,
        direction=signal.direction,
        threshold=signal.min_delta,
        delta=delta,
        evidence_mask=evidence,
        mean_delta_changed=mean_delta,
        pixel_count=pixel_count,
    )


def compute_multi_signal_evidence(
    indices_t1: dict[str, np.ndarray],
    indices_t2: dict[str, np.ndarray],
    config: PhenomenonConfig,
    valid_mask: Optional[np.ndarray] = None,
) -> MultiSignalResult:
    """
    Compute multi-signal change evidence for a phenomenon.

    Each signal produces an evidence mask. The combined mask requires
    the primary signal AND all context signals to be satisfied.

    Args:
        indices_t1: Baseline spectral indices (index_name → 2D array)
        indices_t2: Comparison spectral indices
        config: Phenomenon configuration with signal thresholds
        valid_mask: Per-pixel validity mask (True = valid)

    Returns:
        MultiSignalResult with evidence masks, statistics, and regions
    """
    processing_steps = []
    h, w = next(iter(indices_t1.values())).shape if indices_t1 else (0, 0)

    processing_steps.append({
        "step": "input_validation",
        "detail": f"phenomenon={config.phenomenon.value}, shape=({h},{w}), "
                  f"indices_t1={list(indices_t1.keys())}, indices_t2={list(indices_t2.keys())}",
    })

    # ── Compute per-signal evidence ───────────────────────────────
    all_signals = []
    primary_evidence = None

    for signal in config.signals:
        if signal.index_name not in indices_t1 or signal.index_name not in indices_t2:
            logger.warning("[MultiSignal] Missing index %s for %s", signal.index_name, config.phenomenon)
            continue

        evidence = compute_signal_evidence(
            indices_t1[signal.index_name],
            indices_t2[signal.index_name],
            signal,
            valid_mask,
        )
        all_signals.append(evidence)

        if signal.index_name == config.primary_index:
            primary_evidence = evidence

        processing_steps.append({
            "step": f"signal_{signal.index_name}_{signal.direction}",
            "detail": f"threshold={signal.min_delta}, changed={evidence.pixel_count}",
        })

    if primary_evidence is None and all_signals:
        primary_evidence = all_signals[0]

    # ── Combine signals ───────────────────────────────────────────
    if primary_evidence is None or not all_signals:
        # No signals computed — return empty result
        return MultiSignalResult(
            status="no_data",
            phenomenon=config.phenomenon.value,
            signals=[],
            combined_mask=np.zeros((h, w), dtype=bool),
            confidence=np.zeros((h, w), dtype=np.float32),
            direction_mask=np.zeros((h, w), dtype=np.uint8),
            overall_direction=ChangeDirection.STABLE,
            loss_pixels=0, gain_pixels=0,
            total_valid_pixels=0, changed_pixels=0, changed_pct=0.0,
            mean_magnitude=0.0,
            filtered_mask=np.zeros((h, w), dtype=bool),
            n_regions=0, region_areas=[],
            method="multi_signal",
            threshold_used={},
            processing_steps=processing_steps,
        )

    # Strategy: start with OR of all primary signals (alternative detection)
    # Then apply AND for context signals (supporting evidence required)
    combined = np.zeros((h, w), dtype=bool)
    for sig in all_signals:
        combined = combined | sig.evidence_mask

    # Context signals: require ALL context signals to also be satisfied
    for signal in config.signals:
        if signal.context_index and signal.context_direction and signal.context_min_delta is not None:
            if signal.context_index in indices_t1 and signal.context_index in indices_t2:
                ctx_delta = indices_t2[signal.context_index].astype(np.float32) - indices_t1[signal.context_index].astype(np.float32)
                if signal.context_direction == "increase":
                    ctx_evidence = ctx_delta > signal.context_min_delta
                else:
                    ctx_evidence = ctx_delta < -signal.context_min_delta

                if valid_mask is not None:
                    ctx_evidence = ctx_evidence & valid_mask
                ctx_evidence = ctx_evidence & np.isfinite(ctx_delta)

                combined = combined & ctx_evidence

                processing_steps.append({
                    "step": f"context_{signal.context_index}_{signal.context_direction}",
                    "detail": f"threshold={signal.context_min_delta}, satisfied={int(np.sum(ctx_evidence))}",
                })

    # ── Confidence computation ────────────────────────────────────
    # Confidence = fraction of signals that are satisfied at each pixel
    n_signals = len(all_signals)
    if n_signals > 0:
        vote_count = np.zeros((h, w), dtype=np.float32)
        for sig in all_signals:
            vote_count += sig.evidence_mask.astype(np.float32)
        confidence = vote_count / n_signals
    else:
        confidence = np.zeros((h, w), dtype=np.float32)

    # ── Direction classification ──────────────────────────────────
    direction_mask = np.zeros((h, w), dtype=np.uint8)  # 0=stable, 1=loss, 2=gain
    direction_mask[combined] = 1  # Default to loss for primary evidence

    # For indices where direction is clear, classify properly
    if config.primary_index in ("NDVI", "NBR", "NDSI"):
        # These indices: decrease = loss, increase = gain
        if indices_t1.get(config.primary_index) is not None and indices_t2.get(config.primary_index) is not None:
            primary_delta = indices_t2[config.primary_index] - indices_t1[config.primary_index]
            gain_cond = combined & (primary_delta > 0)
            loss_cond = combined & (primary_delta < 0)
            direction_mask[gain_cond] = 2
            direction_mask[loss_cond] = 1

    loss_pixels = int(np.sum(direction_mask == 1))
    gain_pixels = int(np.sum(direction_mask == 2))
    overall_direction = ChangeDirection.LOSS if loss_pixels > gain_pixels * 1.5 else \
                        ChangeDirection.GAIN if gain_pixels > loss_pixels * 1.5 else \
                        ChangeDirection.STABLE

    processing_steps.append({
        "step": "signal_combination",
        "detail": f"primary={config.primary_index}, signals={n_signals}, "
                  f"combined_changed={int(np.sum(combined))}",
    })

    # ── Spatial filtering ─────────────────────────────────────────
    filtered = combined.copy()

    # Morphological opening: remove isolated noise pixels
    struct = ndimage.generate_binary_structure(2, 1)  # 4-connectivity
    for _ in range(config.morphological_iterations):
        filtered = ndimage.binary_opening(filtered, structure=struct)

    # Connected component labeling + size filtering
    labeled, n_raw = ndimage.label(filtered)
    region_areas = []
    for i in range(1, n_raw + 1):
        area = int(np.sum(labeled == i))
        if area >= config.min_region_pixels:
            region_areas.append(area)
        else:
            filtered[labeled == i] = False  # Remove small regions

    # Recount after filtering
    labeled_final, n_regions = ndimage.label(filtered)

    processing_steps.append({
        "step": "spatial_filtering",
        "detail": f"min_region={config.min_region_pixels}px, raw_regions={n_raw}, "
                  f"filtered_regions={n_regions}, "
                  f"removed={int(np.sum(combined)) - int(np.sum(filtered))} pixels",
    })

    # ── Final statistics ──────────────────────────────────────────
    total_valid = int(np.sum(valid_mask)) if valid_mask is not None else h * w
    changed_pixels = int(np.sum(filtered))
    changed_pct = (changed_pixels / total_valid * 100) if total_valid > 0 else 0.0

    # Mean magnitude of change in changed pixels
    if primary_evidence is not None and changed_pixels > 0:
        mean_mag = float(np.nanmean(np.abs(primary_evidence.delta[filtered])))
    else:
        mean_mag = 0.0

    # Build threshold metadata
    threshold_used = {
        "phenomenon": config.phenomenon.value,
        "primary_index": config.primary_index,
        "signals": [
            {
                "index": s.index_name,
                "direction": s.direction,
                "min_delta": s.min_delta,
                "context": f"{s.context_index} {s.context_direction} {s.context_min_delta}" if s.context_index else None,
            }
            for s in config.signals
        ],
        "min_region_pixels": config.min_region_pixels,
    }

    processing_steps.append({
        "step": "final_statistics",
        "detail": f"changed={changed_pixels}/{total_valid} ({changed_pct:.2f}%), "
                  f"loss={loss_pixels}, gain={gain_pixels}, direction={overall_direction.value}",
    })

    logger.info(
        "[MultiSignal] %s: changed=%d/%d (%.2f%%), regions=%d, direction=%s",
        config.phenomenon.value, changed_pixels, total_valid, changed_pct,
        n_regions, overall_direction.value,
    )

    return MultiSignalResult(
        status="ok",
        phenomenon=config.phenomenon.value,
        signals=all_signals,
        combined_mask=combined,
        confidence=confidence,
        direction_mask=direction_mask,
        overall_direction=overall_direction,
        loss_pixels=loss_pixels,
        gain_pixels=gain_pixels,
        total_valid_pixels=total_valid,
        changed_pixels=changed_pixels,
        changed_pct=round(changed_pct, 4),
        mean_magnitude=round(mean_mag, 6),
        filtered_mask=filtered,
        n_regions=n_regions,
        region_areas=sorted(region_areas, reverse=True),
        method="multi_signal",
        threshold_used=threshold_used,
        processing_steps=processing_steps,
    )


# ── Region Extraction ──────────────────────────────────────────────

@dataclass
class ChangeRegion:
    """A single detected change region with full metadata."""
    region_id: int
    area_pixels: int
    area_pct: float
    bbox_pixels: list[int]        # [min_row, min_col, max_row, max_col]
    centroid_pixels: list[float]  # [row, col]
    direction: str                # "loss", "gain", "stable"
    mean_delta: float
    mean_confidence: float
    index_name: str


def extract_regions(
    result: MultiSignalResult,
    delta: Optional[np.ndarray] = None,
    confidence: Optional[np.ndarray] = None,
) -> list[ChangeRegion]:
    """
    Extract individual change regions from the filtered mask.

    Returns a list of ChangeRegion objects with per-region statistics.
    """
    if result.n_regions == 0:
        return []

    labeled, _ = ndimage.label(result.filtered_mask)
    regions = []

    for i in range(1, labeled.max() + 1):
        region_mask = labeled == i
        area = int(np.sum(region_mask))

        # Bounding box
        rows, cols = np.where(region_mask)
        bbox = [int(rows.min()), int(cols.min()), int(rows.max()), int(cols.max())]
        centroid = [float(rows.mean()), float(cols.mean())]

        # Direction
        dir_vals = result.direction_mask[region_mask]
        dir_counts = {1: int(np.sum(dir_vals == 1)), 2: int(np.sum(dir_vals == 2))}
        direction = "loss" if dir_counts[1] > dir_counts[2] else "gain" if dir_counts[2] > dir_counts[1] else "mixed"

        # Mean delta from primary signal
        if delta is not None:
            mean_delta = float(np.nanmean(delta[region_mask]))
        else:
            mean_delta = 0.0

        # Mean confidence
        if confidence is not None:
            mean_conf = float(np.nanmean(confidence[region_mask]))
        else:
            mean_conf = 1.0

        regions.append(ChangeRegion(
            region_id=i,
            area_pixels=area,
            area_pct=round(area / result.total_valid_pixels * 100, 4) if result.total_valid_pixels > 0 else 0,
            bbox_pixels=bbox,
            centroid_pixels=centroid,
            direction=direction,
            mean_delta=round(mean_delta, 6),
            mean_confidence=round(mean_conf, 4),
            index_name=result.signals[0].index_name if result.signals else "unknown",
        ))

    return regions


def regions_to_geojson(regions: list[ChangeRegion], bbox: list[float], h: int, w: int) -> dict:
    """
    Convert change regions to GeoJSON FeatureCollection.

    Pixel coordinates are converted to geographic coordinates using the bbox.
    """
    features = []
    for r in regions:
        # Convert pixel bbox to geographic bbox
        row_scale = (bbox[3] - bbox[1]) / h  # lat per pixel
        col_scale = (bbox[2] - bbox[0]) / w  # lon per pixel

        min_lon = bbox[0] + r.bbox_pixels[1] * col_scale
        min_lat = bbox[1] + r.bbox_pixels[0] * row_scale
        max_lon = bbox[0] + (r.bbox_pixels[3] + 1) * col_scale
        max_lat = bbox[1] + (r.bbox_pixels[2] + 1) * row_scale

        # Polygon from bounding box
        polygon = [[
            [min_lon, min_lat],
            [max_lon, min_lat],
            [max_lon, max_lat],
            [min_lon, max_lat],
            [min_lon, min_lat],
        ]]

        features.append({
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": polygon},
            "properties": {
                "region_id": r.region_id,
                "area_pixels": r.area_pixels,
                "area_pct": r.area_pct,
                "direction": r.direction,
                "mean_delta": r.mean_delta,
                "mean_confidence": r.mean_confidence,
                "index": r.index_name,
            },
        })

    return {
        "type": "FeatureCollection",
        "features": features,
    }
