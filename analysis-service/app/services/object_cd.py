"""
Object-Based Multi-Scale Change Detection.

References:
  - Blaschke et al., "Object Based Image Analysis," ISPRS J. Photogramm.
    Remote Sens., 2010.
  - Chen et al., "Change Detection in Remote Sensing Images: Object-Based
    Image Analysis Approaches," ISPRS Int. J. Geo-Inf., 2021.

Architecture:
  1. Multi-scale Gaussian analysis: computes NDVI change at multiple spatial
     scales (10m, 20m, 40m, 80m) using Gaussian smoothing.
  2. Per-scale thresholding: each scale produces an independent change mask.
  3. Object labeling: connected-component analysis at each scale groups
     neighboring changed pixels into coherent objects.
  4. Multi-scale voting: pixels detected at more scales get higher confidence.
  5. Final mask: pixels with confidence >= 0.5 (detected at 2+ scales) are changed.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Optional

import numpy as np
from scipy import ndimage

logger = logging.getLogger(__name__)


# ── Data classes ────────────────────────────────────────────────────

@dataclass
class ObjectCDResult:
    """Complete result of object-based multi-scale change detection."""
    status: str
    algorithm: str

    # Confidence map (0-1) from multi-scale voting
    confidence: np.ndarray          # (H, W) float, 0=no change, 1=high confidence

    # Thresholded binary mask
    change_mask: np.ndarray         # (H, W) bool
    confidence_threshold: float     # Minimum confidence to classify as changed

    # Per-scale results
    scale_masks: list[np.ndarray]   # List of binary masks, one per scale
    scale_sigmas: list[float]       # Gaussian sigma for each scale

    # Object statistics
    n_objects: int                  # Number of connected change objects
    object_areas: list[int]         # Area (pixels) of each object

    # Statistics
    total_pixels: int
    changed_pixels: int
    changed_pct: float
    mean_confidence: float
    max_confidence: float

    # Processing metadata
    processing_steps: list[dict[str, str]] = field(default_factory=list)


# ── Multi-scale analysis ───────────────────────────────────────────

def _compute_multiscale_change(
    delta: np.ndarray,
    sigmas: list[float],
    threshold_method: str = "adaptive",
) -> tuple[list[np.ndarray], list[float]]:
    """
    Compute change masks at multiple spatial scales.

    At each scale, Gaussian smoothing suppresses noise and reveals
    changes at that spatial scale.

    Args:
        delta: 2D difference array (H, W)
        sigmas: List of Gaussian sigma values (in pixels)
        threshold_method: "adaptive" or "percentile"

    Returns:
        masks: List of binary change masks, one per scale
        thresholds: List of thresholds used at each scale
    """
    masks = []
    thresholds = []

    for sigma in sigmas:
        # Smooth the difference at this scale
        if sigma > 0:
            smoothed = ndimage.gaussian_filter(delta, sigma=sigma)
        else:
            smoothed = delta.copy()

        # Compute magnitude (absolute change)
        magnitude = np.abs(smoothed)

        # Adaptive threshold at this scale
        valid = magnitude[np.isfinite(magnitude)]
        if len(valid) > 0:
            if threshold_method == "adaptive":
                # Use median absolute deviation (MAD) as robust scale estimator
                med = np.median(valid)
                mad = np.median(np.abs(valid - med))
                # Threshold at 2 * MAD (conservative) scaled by the scale factor
                # Larger scales need lower thresholds (changes are smoother)
                scale_factor = max(0.5, 1.0 / (1.0 + sigma * 0.1))
                threshold = med + 2.0 * mad * scale_factor
            else:
                threshold = float(np.percentile(valid, 90))

            mask = magnitude > threshold
        else:
            mask = np.zeros_like(delta, dtype=bool)

        masks.append(mask)
        thresholds.append(threshold)

        logger.debug(
            "[ObjectCD] scale=sigma=%.1f, threshold=%.4f, changed=%d",
            sigma, threshold, int(np.sum(mask)),
        )

    return masks, thresholds


def _label_objects(mask: np.ndarray, min_size: int = 10) -> tuple[int, list[int]]:
    """
    Label connected components and filter by minimum size.

    Returns:
        n_objects: Number of objects after filtering
        areas: List of object areas (pixels)
    """
    if not mask.any():
        return 0, []

    labeled, n_raw = ndimage.label(mask)
    areas = []
    for i in range(1, n_raw + 1):
        area = int(np.sum(labeled == i))
        if area >= min_size:
            areas.append(area)

    areas.sort(reverse=True)
    return len(areas), areas


def _multi_scale_voting(
    masks: list[np.ndarray],
    min_agreement: int = 2,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Combine per-scale masks via majority voting.

    Args:
        masks: List of binary masks, one per scale
        min_agreement: Minimum number of scales that must agree

    Returns:
        confidence: (H, W) float in [0, 1], fraction of scales detecting change
        combined: (H, W) bool, True where confidence >= min_agreement / n_scales
    """
    n_scales = len(masks)
    if n_scales == 0:
        h, w = 0, 0
        return np.array([]), np.array([])

    h, w = masks[0].shape
    vote_count = np.zeros((h, w), dtype=np.float32)

    for mask in masks:
        # Resize mask if dimensions differ (shouldn't happen, but safety)
        if mask.shape == (h, w):
            vote_count += mask.astype(np.float32)
        else:
            resized = ndimage.zoom(mask.astype(np.float32), (h / mask.shape[0], w / mask.shape[1]), order=0)
            vote_count += resized[:h, :w]

    confidence = vote_count / n_scales

    # Minimum agreement threshold (as fraction of scales)
    threshold_frac = min_agreement / n_scales
    combined = confidence >= threshold_frac

    return confidence, combined


# ── Main pipeline ───────────────────────────────────────────────────

def run_object_cd(
    delta: np.ndarray,
    scale_sigmas: Optional[list[float]] = None,
    min_agreement: int = 2,
    min_object_size: int = 10,
    confidence_threshold: float = 0.4,
) -> ObjectCDResult:
    """
    Run object-based multi-scale change detection.

    Args:
        delta: 2D difference array (H, W) — e.g., NDVI_t2 - NDVI_t1
        scale_sigmas: Gaussian sigma values for each scale (in pixels).
                      Default: [0, 1.5, 3.0, 6.0] for 10m/20m/40m/80m at 10m resolution.
        min_agreement: Minimum number of scales that must detect a pixel as changed
        min_object_size: Minimum object size in pixels to keep
        confidence_threshold: Minimum confidence to classify as changed

    Returns:
        ObjectCDResult with confidence map, change mask, and per-scale results
    """
    processing_steps = []

    if scale_sigmas is None:
        scale_sigmas = [0.0, 1.5, 3.0, 6.0]  # pixel-scale: 0=raw, 1.5=15m, 3=30m, 6=60m

    h, w = delta.shape
    total_pixels = h * w

    processing_steps.append({
        "step": "input_validation",
        "detail": f"delta={delta.shape}, scales={len(scale_sigmas)}, "
                  f"sigmas={scale_sigmas}",
    })

    # ── Step 1: Multi-scale change detection ──────────────────────
    scale_masks, scale_thresholds = _compute_multiscale_change(delta, scale_sigmas)

    for i, (sigma, mask, thresh) in enumerate(zip(scale_sigmas, scale_masks, scale_thresholds)):
        processing_steps.append({
            "step": f"scale_{i}_sigma_{sigma}",
            "detail": f"sigma={sigma}, threshold={thresh:.4f}, "
                      f"changed={int(np.sum(mask))}/{total_pixels}",
        })

    # ── Step 2: Multi-scale voting ────────────────────────────────
    confidence, combined = _multi_scale_voting(scale_masks, min_agreement)

    processing_steps.append({
        "step": "multiscale_voting",
        "detail": f"min_agreement={min_agreement}/{len(scale_sigmas)}, "
                  f"combined_changed={int(np.sum(combined))}/{total_pixels}",
    })

    # ── Step 3: Apply confidence threshold ────────────────────────
    change_mask = confidence >= confidence_threshold

    processing_steps.append({
        "step": "confidence_threshold",
        "detail": f"threshold={confidence_threshold}, "
                  f"changed={int(np.sum(change_mask))}/{total_pixels}",
    })

    # ── Step 4: Object labeling and filtering ─────────────────────
    n_objects, object_areas = _label_objects(change_mask, min_size=min_object_size)

    # Filter objects by size — always run, even if n_objects=0 after filtering
    if change_mask.any():
        labeled, n_raw = ndimage.label(change_mask)
        filtered_mask = np.zeros_like(change_mask)
        for i in range(1, n_raw + 1):
            area = int(np.sum(labeled == i))
            if area >= min_object_size:
                filtered_mask[labeled == i] = True
        change_mask = filtered_mask
        # Recount after filtering
        n_objects, object_areas = _label_objects(change_mask, min_size=1)

    processing_steps.append({
        "step": "object_filtering",
        "detail": f"min_size={min_object_size}, objects_after_filter={n_objects}, "
                  f"areas={object_areas[:5]}{'...' if len(object_areas) > 5 else ''}",
    })

    # ── Step 5: Statistics ────────────────────────────────────────
    changed_pixels = int(np.sum(change_mask))
    changed_pct = (changed_pixels / total_pixels * 100) if total_pixels > 0 else 0.0
    mean_conf = float(np.mean(confidence)) if confidence.size > 0 else 0.0
    max_conf = float(np.max(confidence)) if confidence.size > 0 else 0.0

    processing_steps.append({
        "step": "final_statistics",
        "detail": f"changed={changed_pixels}/{total_pixels} ({changed_pct:.2f}%), "
                  f"n_objects={n_objects}, mean_confidence={mean_conf:.4f}",
    })

    logger.info(
        "[ObjectCD] changed=%d/%d (%.2f%%), n_objects=%d, scales=%d, "
        "min_agreement=%d",
        changed_pixels, total_pixels, changed_pct, n_objects,
        len(scale_sigmas), min_agreement,
    )

    return ObjectCDResult(
        status="ok",
        algorithm="object_multiscale",
        confidence=confidence,
        change_mask=change_mask,
        confidence_threshold=confidence_threshold,
        scale_masks=scale_masks,
        scale_sigmas=scale_sigmas,
        n_objects=n_objects,
        object_areas=object_areas,
        total_pixels=total_pixels,
        changed_pixels=changed_pixels,
        changed_pct=round(changed_pct, 4),
        mean_confidence=round(mean_conf, 6),
        max_confidence=round(max_conf, 6),
        processing_steps=processing_steps,
    )
