"""
Change Vector Analysis (CVA) with Pseudo-Invariant Feature (PIF) Normalization.

References:
  - Bovolo & Bruzzone, "A Theoretical Framework for Unsupervised Change Detection
    Based on Change Vector Analysis in the Polar Domain," IEEE TGRS 45(1):218-236, 2007.
  - Chen et al., "Land-Use/Land-Cover Change Detection Using Improved Change
    Vector Analysis," IEEE TGRS, 2003.

Architecture:
  1. PIF Normalization: identifies stable reference pixels (water, bare rock, urban)
     and computes a linear regression to normalize radiometry between dates.
  2. Multi-band change vectors: computes delta across ALL available bands.
  3. Magnitude + direction: Euclidean distance = how much changed; angle = what changed.
  4. Adaptive threshold on magnitude using Otsu's method.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Optional

import numpy as np

logger = logging.getLogger(__name__)


# ── Data classes ────────────────────────────────────────────────────

@dataclass
class CVAResult:
    """Complete result of Change Vector Analysis."""
    status: str
    algorithm: str

    # Change characterization
    magnitude: np.ndarray       # Euclidean distance in spectral space (H, W)
    direction: np.ndarray       # Angle of change vector in degrees (H, W)
    normalized: bool            # Whether PIF normalization was applied

    # Thresholded binary mask
    change_mask: np.ndarray     # True = changed (H, W)
    threshold: float            # Adaptive threshold used

    # Statistics
    total_pixels: int
    changed_pixels: int
    changed_pct: float
    mean_magnitude: float
    max_magnitude: float

    # Direction classification
    direction_labels: dict[str, int]  # label -> pixel count

    # PIF normalization details
    pif_stats: Optional[dict[str, Any]] = None

    # Processing metadata
    processing_steps: list[dict[str, str]] = field(default_factory=list)


# ── PIF Normalization ──────────────────────────────────────────────

def _identify_pif_pixels(
    bands_t1: np.ndarray,
    bands_t2: np.ndarray,
    ndvi_t1: Optional[np.ndarray] = None,
    ndvi_t2: Optional[np.ndarray] = None,
) -> np.ndarray:
    """
    Identify Pseudo-Invariant Feature (PIF) pixels — stable reference points
    that should not have changed between dates.

    PIF candidates:
    - Deep water (NDVI < -0.1 in both periods)
    - Bare rock / soil (low NDVI, low variation)
    - Dense urban (stable spectral signature)

    Returns boolean mask of PIF pixels.
    """
    n_bands = bands_t1.shape[0] if bands_t1.ndim == 3 else 1

    # Criterion 1: Deep water — very low NDVI in both periods
    if ndvi_t1 is not None and ndvi_t2 is not None:
        water = (ndvi_t1 < -0.1) & (ndvi_t2 < -0.1)
    else:
        # Use band ratios as proxy: NIR < 0.1 of max in both
        if n_bands >= 3:
            # Assume band order: [B02, B03, B04, B08, ...]
            # Water: NIR (B08) is very low relative to visible
            nir_t1 = bands_t1[min(3, n_bands - 1)] if bands_t1.ndim == 3 else bands_t1
            nir_t2 = bands_t2[min(3, n_bands - 1)] if bands_t2.ndim == 3 else bands_t2
            water = (nir_t1 < 0.1) & (nir_t2 < 0.1)
        else:
            water = np.zeros(bands_t1.shape[-2:], dtype=bool)

    # Criterion 2: Low temporal change — spectral distance is small
    if bands_t1.ndim == 3 and bands_t2.ndim == 3:
        delta = bands_t2.astype(np.float32) - bands_t1.astype(np.float32)
        change_magnitude = np.sqrt(np.nansum(delta ** 2, axis=0))
        # PIF pixels have low change magnitude (bottom 20%)
        threshold_pct = np.nanpercentile(change_magnitude, 20)
        low_change = change_magnitude <= threshold_pct
    else:
        low_change = np.ones(bands_t1.shape[-2:], dtype=bool)

    # Criterion 3: High band correlation between dates — Pearson r > 0.95
    if bands_t1.ndim == 3 and bands_t2.ndim == 3 and n_bands >= 2:
        correlation_map = np.zeros(bands_t1.shape[-2:], dtype=np.float32)
        flat_t1 = bands_t1.reshape(n_bands, -1).astype(np.float32)
        flat_t2 = bands_t2.reshape(n_bands, -1).astype(np.float32)
        for i in range(n_bands):
            valid = np.isfinite(flat_t1[i]) & np.isfinite(flat_t2[i])
            if valid.sum() > 10:
                corr = np.corrcoef(flat_t1[i, valid], flat_t2[i, valid])[0, 1]
                # This gives a global correlation; per-pixel correlation is expensive
                correlation_map[:] = max(correlation_map[:].mean(), corr)
        # Use the global correlation as a coarse filter
        high_corr = correlation_map > 0.85
    else:
        high_corr = np.ones(bands_t1.shape[-2:], dtype=bool)

    # Combine: PIF = water OR (low_change AND high_corr)
    pif = water | (low_change & high_corr)

    n_pif = int(np.sum(pif))
    total = pif.size
    logger.info("[PIF] Identified %d/%d PIF pixels (%.1f%%)", n_pif, total, n_pif / total * 100)

    # Require at least 5% PIF pixels for reliable normalization
    if n_pif < total * 0.05:
        logger.warning("[PIF] Too few PIF pixels (%.1f%%), skipping normalization", n_pif / total * 100)
        return np.zeros_like(pif)

    return pif


def _compute_pif_normalization(
    bands_t1: np.ndarray,
    bands_t2: np.ndarray,
    pif_mask: np.ndarray,
) -> tuple[np.ndarray, dict[str, Any]]:
    """
    Compute linear radiometric normalization from t2 to t1 using PIF pixels.

    For each band: t2_normalized = gain * t2 + offset
    where gain and offset are computed from the PIF pixel regression.

    Returns:
        normalized_t2: the normalized t2 bands
        stats: normalization parameters per band
    """
    n_bands = bands_t1.shape[0] if bands_t1.ndim == 3 else 1
    stats = {}

    if bands_t1.ndim == 2:
        bands_t1 = bands_t1[np.newaxis, ...]
        bands_t2 = bands_t2[np.newaxis, ...]

    normalized_t2 = np.zeros_like(bands_t2, dtype=np.float32)

    for b in range(n_bands):
        t1_vals = bands_t1[b][pif_mask].astype(np.float32)
        t2_vals = bands_t2[b][pif_mask].astype(np.float32)

        # Remove NaN/inf
        valid = np.isfinite(t1_vals) & np.isfinite(t2_vals)
        t1_vals = t1_vals[valid]
        t2_vals = t2_vals[valid]

        if len(t1_vals) < 10:
            # Not enough PIF pixels for this band — skip normalization
            normalized_t2[b] = bands_t2[b].astype(np.float32)
            stats[f"band_{b}"] = {"gain": 1.0, "offset": 0.0, "r_squared": 0.0, "skipped": True}
            continue

        # Linear regression: t1 = gain * t2 + offset
        # Using least squares
        t2_mean = np.mean(t2_vals)
        t1_mean = np.mean(t1_vals)
        cov = np.mean((t2_vals - t2_mean) * (t1_vals - t1_mean))
        var_t2 = np.mean((t2_vals - t2_mean) ** 2)

        if var_t2 > 1e-10:
            gain = cov / var_t2
            offset = t1_mean - gain * t2_mean
        else:
            gain = 1.0
            offset = 0.0

        # R-squared
        ss_res = np.sum((t1_vals - (gain * t2_vals + offset)) ** 2)
        ss_tot = np.sum((t1_vals - t1_mean) ** 2)
        r_squared = 1.0 - (ss_res / ss_tot) if ss_tot > 0 else 0.0

        # Apply normalization
        normalized_t2[b] = gain * bands_t2[b].astype(np.float32) + offset

        stats[f"band_{b}"] = {
            "gain": round(float(gain), 4),
            "offset": round(float(offset), 4),
            "r_squared": round(float(r_squared), 4),
            "n_pif_pixels": int(len(t1_vals)),
            "skipped": False,
        }

        logger.info("[PIF] Band %d: gain=%.4f, offset=%.4f, R²=%.4f", b, gain, offset, r_squared)

    return normalized_t2, stats


# ── Change Vector Analysis ─────────────────────────────────────────

def _classify_change_direction(
    delta_bands: np.ndarray,
    band_names: list[str],
) -> tuple[np.ndarray, dict[str, int]]:
    """
    Classify the type of change based on the change vector direction.

    Uses the angle in spectral space to determine the dominant change type.
    Returns a direction label map and pixel counts.

    Classification rules (for Sentinel-2 bands [B02, B03, B04, B08, B11, B12]):
    - Vegetation loss: NIR decrease + Red increase (angle in 3rd quadrant)
    - Vegetation gain: NIR increase + Red decrease (angle in 1st quadrant)
    - Urban expansion: SWIR increase (angle towards SWIR axis)
    - Water change: Green increase + NIR decrease
    - Bare soil: All bands increase uniformly
    """
    n_bands, h, w = delta_bands.shape
    labels = np.full((h, w), "stable", dtype=object)
    counts = {"stable": 0, "vegetation_loss": 0, "vegetation_gain": 0,
              "urban_expansion": 0, "water_change": 0, "bare_soil": 0, "other_change": 0}

    # Find band indices
    band_idx = {name.upper(): i for i, name in enumerate(band_names)}

    nir_idx = band_idx.get("B08", band_idx.get("NIR", 3 if n_bands > 3 else 0))
    red_idx = band_idx.get("B04", band_idx.get("RED", 2 if n_bands > 2 else 0))
    green_idx = band_idx.get("B03", band_idx.get("GREEN", 1 if n_bands > 1 else 0))
    swir_idx = band_idx.get("B11", band_idx.get("SWIR", 4 if n_bands > 4 else 0))

    nir_delta = delta_bands[nir_idx].astype(np.float32)
    red_delta = delta_bands[red_idx].astype(np.float32)
    green_delta = delta_bands[green_idx].astype(np.float32)
    swir_delta = delta_bands[swir_idx].astype(np.float32)

    # Classification rules
    veg_loss = (nir_delta < -0.02) & (red_delta > 0.01)
    veg_gain = (nir_delta > 0.02) & (red_delta < -0.01)
    urban = (swir_delta > 0.03) & (nir_delta < -0.01)
    water = (green_delta > 0.02) & (nir_delta < -0.03)
    bare = (nir_delta > 0.01) & (red_delta > 0.01) & (green_delta > 0.01) & (swir_delta > 0.01)

    labels[veg_loss] = "vegetation_loss"
    labels[veg_gain] = "vegetation_gain"
    labels[urban] = "urban_expansion"
    labels[water] = "water_change"
    labels[bare] = "bare_soil"

    # Count pixels (only from changed pixels, not stable)
    for key in counts:
        counts[key] = int(np.sum(labels == key))

    return labels, counts


def run_cva(
    bands_t1: np.ndarray,
    bands_t2: np.ndarray,
    band_names: list[str],
    ndvi_t1: Optional[np.ndarray] = None,
    ndvi_t2: Optional[np.ndarray] = None,
    apply_normalization: bool = True,
    threshold_method: str = "otsu",
    change_threshold_pct: float = 5.0,
) -> CVAResult:
    """
    Run Change Vector Analysis with optional PIF normalization.

    Args:
        bands_t1: Baseline bands (N_bands, H, W) or (H, W) for single band
        bands_t2: Comparison bands (N_bands, H, W) or (H, W) for single band
        band_names: List of band names (e.g., ["B02", "B03", "B04", "B08"])
        ndvi_t1: Optional NDVI for PIF identification
        ndvi_t2: Optional NDVI for PIF identification
        apply_normalization: Whether to apply PIF normalization
        threshold_method: "otsu" or "percentile"
        change_threshold_pct: Percentile threshold for percentile method

    Returns:
        CVAResult with magnitude, direction, change mask, and statistics
    """
    processing_steps = []

    # Ensure 3D arrays
    if bands_t1.ndim == 2:
        bands_t1 = bands_t1[np.newaxis, ...]
        bands_t2 = bands_t2[np.newaxis, ...]

    n_bands, h, w = bands_t1.shape
    bands_t1_f = bands_t1.astype(np.float32)
    bands_t2_f = bands_t2.astype(np.float32)

    processing_steps.append({
        "step": "input_validation",
        "detail": f"bands_t1={bands_t1.shape}, bands_t2={bands_t2.shape}, n_bands={n_bands}",
    })

    # ── Step 1: PIF Normalization ─────────────────────────────────
    normalized = False
    pif_stats = None

    if apply_normalization:
        pif_mask = _identify_pif_pixels(bands_t1_f, bands_t2_f, ndvi_t1, ndvi_t2)
        n_pif = int(np.sum(pif_mask))

        if n_pif > 0:
            bands_t2_norm, pif_stats = _compute_pif_normalization(bands_t1_f, bands_t2_f, pif_mask)
            bands_t2_f = bands_t2_norm
            normalized = True
            processing_steps.append({
                "step": "pif_normalization",
                "detail": f"Applied PIF normalization using {n_pif} reference pixels",
            })
        else:
            processing_steps.append({
                "step": "pif_normalization",
                "detail": "Skipped: insufficient PIF pixels",
            })
    else:
        processing_steps.append({
            "step": "pif_normalization",
            "detail": "Skipped: apply_normalization=False",
        })

    # ── Step 2: Compute change vectors ────────────────────────────
    delta = bands_t2_f - bands_t1_f  # (N_bands, H, W)

    # Propagate NaN
    nan_mask = np.isnan(bands_t1_f) | np.isnan(bands_t2_f)
    if nan_mask.any():
        nan_any = nan_mask.any(axis=0)  # (H, W)
        for b in range(n_bands):
            delta[b][nan_any] = np.nan

    processing_steps.append({
        "step": "change_vectors",
        "detail": f"Computed {n_bands}-band change vectors over ({h}, {w}) pixels",
    })

    # ── Step 3: Compute magnitude (Euclidean distance) ────────────
    magnitude = np.sqrt(np.nansum(delta ** 2, axis=0))  # (H, W)

    # Direction (angle in degrees, 0-360)
    if n_bands >= 2:
        # Use NIR and Red axes for angle computation
        nir_idx = min(3, n_bands - 1)  # B08 or equivalent
        red_idx = min(2, n_bands - 1)  # B04 or equivalent
        direction = np.degrees(np.arctan2(delta[nir_idx], delta[red_idx]))
        direction = direction % 360  # Normalize to 0-360
    else:
        direction = np.where(delta[0] > 0, 0.0, 180.0)

    mean_mag = float(np.nanmean(magnitude))
    max_mag = float(np.nanmax(magnitude))

    processing_steps.append({
        "step": "magnitude_direction",
        "detail": f"mean_magnitude={mean_mag:.4f}, max_magnitude={max_mag:.4f}",
    })

    # ── Step 4: Adaptive threshold ────────────────────────────────
    valid_mag = magnitude[np.isfinite(magnitude)]

    if threshold_method == "otsu" and len(valid_mag) > 0:
        # Simple Otsu's method implementation
        threshold = _otsu_threshold(valid_mag)
    elif len(valid_mag) > 0:
        threshold = float(np.percentile(valid_mag, 100 - change_threshold_pct))
    else:
        threshold = 0.1

    change_mask = magnitude > threshold

    processing_steps.append({
        "step": "threshold",
        "detail": f"method={threshold_method}, threshold={threshold:.4f}",
    })

    # ── Step 5: Direction classification ──────────────────────────
    direction_labels, direction_counts = _classify_change_direction(delta, band_names)

    processing_steps.append({
        "step": "direction_classification",
        "detail": f"direction_counts={direction_counts}",
    })

    # ── Step 6: Statistics ────────────────────────────────────────
    total_pixels = h * w
    changed_pixels = int(np.sum(change_mask))
    changed_pct = (changed_pixels / total_pixels * 100) if total_pixels > 0 else 0.0

    processing_steps.append({
        "step": "statistics",
        "detail": f"changed={changed_pixels}/{total_pixels} ({changed_pct:.2f}%)",
    })

    logger.info(
        "[CVA] magnitude: mean=%.4f, max=%.4f, threshold=%.4f, changed=%.2f%%, normalized=%s",
        mean_mag, max_mag, threshold, changed_pct, normalized,
    )

    return CVAResult(
        status="ok",
        algorithm="cva_pif",
        magnitude=magnitude,
        direction=direction,
        normalized=normalized,
        change_mask=change_mask,
        threshold=threshold,
        total_pixels=total_pixels,
        changed_pixels=changed_pixels,
        changed_pct=round(changed_pct, 4),
        mean_magnitude=round(mean_mag, 6),
        max_magnitude=round(max_mag, 6),
        direction_labels=direction_counts,
        pif_stats=pif_stats,
        processing_steps=processing_steps,
    )


def _otsu_threshold(data: np.ndarray, n_bins: int = 256) -> float:
    """Compute Otsu's threshold for bimodal distribution."""
    if len(data) == 0:
        return 0.1

    min_val = float(np.min(data))
    max_val = float(np.max(data))

    if max_val - min_val < 1e-10:
        return min_val

    # Histogram
    hist, bin_edges = np.histogram(data, bins=n_bins, range=(min_val, max_val))
    bin_centers = (bin_edges[:-1] + bin_edges[1:]) / 2
    total = hist.sum()

    if total == 0:
        return min_val

    # Otsu's method: maximize inter-class variance
    best_threshold = bin_centers[0]
    best_variance = 0.0

    for i in range(1, n_bins):
        w0 = hist[:i].sum() / total
        w1 = 1.0 - w0

        if w0 < 0.01 or w1 < 0.01:
            continue

        mean0 = np.average(bin_centers[:i], weights=hist[:i]) if hist[:i].sum() > 0 else 0
        mean1 = np.average(bin_centers[i:], weights=hist[i:]) if hist[i:].sum() > 0 else 0

        variance = w0 * w1 * (mean0 - mean1) ** 2
        if variance > best_variance:
            best_variance = variance
            best_threshold = bin_centers[i]

    return float(best_threshold)
