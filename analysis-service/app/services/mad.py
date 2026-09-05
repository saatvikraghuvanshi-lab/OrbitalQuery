"""
Iteratively Reweighted Multivariate Alteration Detection (IR-MAD).

References:
  - Nielsen et al., "Multivariate Alteration Detection (MAD) and MAF
    Postprocessing in Multispectral, Bitemporal Image Data," RSE 64:1-19, 1998.
  - Nielsen, "The Regularized Iteratively Reweighted MAD Method for Change
    Detection in Multi- and Hyperspectral Data," IEEE TIP 16(2):463-478, 2007.

Architecture:
  1. Center both images (subtract mean)
  2. Compute Canonical Correlation Analysis (CCA) to find projections that
     maximize the variance of the difference
  3. Compute MAD variates — uncorrelated difference components
  4. Apply chi-squared test: pixels with high chi-squared are changed
  5. Iteratively reweight outliers and repeat for robustness
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Optional

import numpy as np
from scipy import stats as scipy_stats

logger = logging.getLogger(__name__)


# ── Data classes ────────────────────────────────────────────────────

@dataclass
class MADResult:
    """Complete result of IR-MAD analysis."""
    status: str
    algorithm: str

    # MAD variates (uncorrelated difference components)
    mad_variates: np.ndarray      # (N_bands, H, W)
    mad_std: np.ndarray           # Standard deviation of each variate

    # Chi-squared statistic and p-value
    chi2: np.ndarray              # (H, W) chi-squared statistic
    p_value: np.ndarray           # (H, W) p-value

    # Thresholded binary mask
    change_mask: np.ndarray       # (H, W) True = changed
    significance_level: float     # e.g., 0.01 for 99% confidence

    # Statistics
    total_pixels: int
    changed_pixels: int
    changed_pct: float
    mean_chi2: float
    max_chi2: float

    # Iteration info
    n_iterations: int
    converged: bool

    # Processing metadata
    processing_steps: list[dict[str, str]] = field(default_factory=list)


# ── Core MAD computation ───────────────────────────────────────────

def _compute_mad_variates(
    X1: np.ndarray,
    X2: np.ndarray,
    weights: Optional[np.ndarray] = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Compute MAD variates from two multi-band images.

    MAD = projection(T2 - T1) where projection maximizes variance of the difference.

    Args:
        X1: Baseline image, shape (N_bands, H*W) or (N_bands, H, W)
        X2: Comparison image, shape (N_bands, H*W) or (N_bands, H, W)
        weights: Per-pixel weights (H*W), used in IR-MAD iterations

    Returns:
        mad_variates: (N_bands, H*W) uncorrelated difference components
        mad_stds: (N_bands,) standard deviation of each variate
        projection: (N_bands, N_bands) projection matrix
    """
    n_bands = X1.shape[0]

    # Reshape to (N_bands, N_pixels)
    if X1.ndim == 3:
        h, w = X1.shape[1], X1.shape[2]
        X1_flat = X1.reshape(n_bands, -1).astype(np.float64)
        X2_flat = X2.reshape(n_bands, -1).astype(np.float64)
    else:
        h, w = X1.shape[1], 1
        X1_flat = X1.astype(np.float64)
        X2_flat = X2.astype(np.float64)

    n_pixels = X1_flat.shape[1]

    # Handle NaN: replace with 0 for computation, track mask
    valid = np.isfinite(X1_flat).all(axis=0) & np.isfinite(X2_flat).all(axis=0)
    if weights is not None:
        valid = valid & (weights > 0)

    if valid.sum() < n_bands + 1:
        logger.warning("[MAD] Too few valid pixels (%d) for CCA", valid.sum())
        return (np.zeros((n_bands, n_pixels)),
                np.ones(n_bands),
                np.eye(n_bands))

    X1_v = X1_flat[:, valid]
    X2_v = X2_flat[:, valid]

    # Apply weights if provided (for IR-MAD iterations)
    if weights is not None:
        w = weights[valid].astype(np.float64)
        w = w / w.sum()  # Normalize
        W = np.diag(w)
    else:
        W = np.eye(X1_v.shape[1])

    # Center the data
    X1_mean = X1_v.mean(axis=1, keepdims=True)
    X2_mean = X2_v.mean(axis=1, keepdims=True)
    X1_c = X1_v - X1_mean
    X2_c = X2_v - X2_mean

    # Covariance matrices
    C11 = X1_c @ W @ X1_c.T / max(np.sum(w) if weights is not None else 1, 1)
    C22 = X2_c @ W @ X2_c.T / max(np.sum(w) if weights is not None else 1, 1)
    C12 = X1_c @ W @ X2_c.T / max(np.sum(w) if weights is not None else 1, 1)

    # Add small regularization for numerical stability
    reg = 1e-8 * np.eye(n_bands)
    C11 += reg
    C22 += reg

    # Solve generalized eigenvalue problem for CCA
    # C11^-1 C12 C22^-1 C21 a = lambda a
    try:
        C11_inv = np.linalg.inv(C11)
        C22_inv = np.linalg.inv(C22)
    except np.linalg.LinAlgError:
        C11_inv = np.linalg.pinv(C11)
        C22_inv = np.linalg.pinv(C22)

    C21 = C12.T
    A = C11_inv @ C12 @ C22_inv @ C21

    # Eigendecomposition
    eigenvalues, eigenvectors = np.linalg.eigh(A)

    # Sort by eigenvalue descending (most correlated first)
    idx = np.argsort(eigenvalues)[::-1]
    eigenvalues = eigenvalues[idx]
    eigenvectors = eigenvectors[:, idx]

    # MAD projection: a_i = (eigenvector_i for X1 - eigenvector_i for X2)
    # Simplified: use the eigenvectors directly as the projection
    projection = eigenvectors  # (N_bands, N_bands)

    # Compute MAD variates: Z = a^T (X1 - X2)
    delta = X1_c - X2_c  # difference in centered space
    mad_flat = projection.T @ delta  # (N_bands, N_valid_pixels)

    # Compute std of each MAD variate
    mad_stds = np.std(mad_flat, axis=1)
    mad_stds[mad_stds < 1e-10] = 1e-10  # prevent division by zero

    # Reconstruct full image
    mad_full = np.zeros((n_bands, n_pixels), dtype=np.float64)
    mad_full[:, valid] = mad_flat

    return mad_full, mad_stds, projection


def _chi2_test(
    mad_variates: np.ndarray,
    mad_stds: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Compute chi-squared statistic from MAD variates.

    Under H0 (no change), each MAD variate ~ N(0, sigma_i).
    The sum of squared standardized variates ~ chi-squared(n_bands).

    Returns:
        chi2: (H*W) chi-squared statistic
        p_value: (H*W) p-value from chi-squared distribution
    """
    n_bands, n_pixels = mad_variates.shape

    # Standardize each variate by its std
    standardized = mad_variates / mad_stds[:, np.newaxis]

    # Chi-squared statistic = sum of squared standardized variates
    chi2 = np.nansum(standardized ** 2, axis=0)  # (N_pixels,)

    # P-value from chi-squared distribution with n_bands degrees of freedom
    p_value = 1.0 - scipy_stats.chi2.cdf(chi2, df=n_bands)

    return chi2, p_value


def run_ir_mad(
    bands_t1: np.ndarray,
    bands_t2: np.ndarray,
    max_iterations: int = 10,
    convergence_threshold: float = 0.01,
    significance_level: float = 0.01,
) -> MADResult:
    """
    Run Iteratively Reweighted MAD change detection.

    Args:
        bands_t1: Baseline bands (N_bands, H, W)
        bands_t2: Comparison bands (N_bands, H, W)
        max_iterations: Maximum IR-MAD iterations
        convergence_threshold: Stop when < this fraction of pixels change classification
        significance_level: Chi-squared significance level (0.01 = 99% confidence)

    Returns:
        MADResult with change mask, chi-squared statistics, and variates
    """
    processing_steps = []

    # Ensure 3D
    if bands_t1.ndim == 2:
        bands_t1 = bands_t1[np.newaxis, ...]
        bands_t2 = bands_t2[np.newaxis, ...]

    n_bands, h, w = bands_t1.shape
    n_pixels = h * w

    processing_steps.append({
        "step": "input_validation",
        "detail": f"bands_t1={bands_t1.shape}, bands_t2={bands_t2.shape}, n_bands={n_bands}",
    })

    # ── Step 1: Standard MAD (unweighted) ─────────────────────────
    mad_variates, mad_stds, projection = _compute_mad_variates(bands_t1, bands_t2)
    chi2, p_value = _chi2_test(mad_variates, mad_stds)

    # Initial change mask
    change_mask = p_value < significance_level

    processing_steps.append({
        "step": "initial_mad",
        "detail": f"n_bands={n_bands}, initial_changed={int(np.sum(change_mask))}/{n_pixels}",
    })

    # ── Step 2: Iterative reweighting ─────────────────────────────
    weights = np.ones(n_pixels, dtype=np.float64)
    prev_mask = change_mask.copy()
    converged = False

    for iteration in range(max_iterations):
        # Reweight: down-weight pixels that are likely changed
        # Using chi-squared-based weight: w_i = min(1, chi2_threshold / chi2_i)
        chi2_threshold = scipy_stats.chi2.ppf(1 - significance_level, df=n_bands)
        w_new = np.minimum(1.0, chi2_threshold / np.maximum(chi2, 1e-10))
        # Smooth weights to avoid instability
        weights = 0.5 * weights + 0.5 * w_new

        # Recompute MAD with weights
        mad_variates, mad_stds, projection = _compute_mad_variates(
            bands_t1, bands_t2, weights
        )
        chi2, p_value = _chi2_test(mad_variates, mad_stds)
        change_mask = p_value < significance_level

        # Check convergence
        n_changed = int(np.sum(change_mask != prev_mask))
        change_frac = n_changed / n_pixels if n_pixels > 0 else 0

        processing_steps.append({
            "step": f"ir_mad_iteration_{iteration + 1}",
            "detail": f"changed={int(np.sum(change_mask))}/{n_pixels}, "
                      f"flipped={n_changed} ({change_frac:.4f})",
        })

        if change_frac < convergence_threshold:
            converged = True
            logger.info("[IR-MAD] Converged after %d iterations (flipped %.4f)", iteration + 1, change_frac)
            break

        prev_mask = change_mask.copy()

    if not converged:
        logger.warning("[IR-MAD] Did not converge after %d iterations", max_iterations)

    # ── Step 3: Statistics ────────────────────────────────────────
    changed_pixels = int(np.sum(change_mask))
    changed_pct = (changed_pixels / n_pixels * 100) if n_pixels > 0 else 0.0

    processing_steps.append({
        "step": "final_statistics",
        "detail": f"changed={changed_pixels}/{n_pixels} ({changed_pct:.2f}%), "
                  f"converged={converged}, iterations={iteration + 1}",
    })

    logger.info(
        "[IR-MAD] changed=%d/%d (%.2f%%), converged=%s, iterations=%d, "
        "significance=%.3f",
        changed_pixels, n_pixels, changed_pct, converged, iteration + 1,
        significance_level,
    )

    # Reshape outputs to (H, W)
    mad_variates_hw = mad_variates.reshape(n_bands, h, w)

    return MADResult(
        status="ok",
        algorithm="ir_mad",
        mad_variates=mad_variates_hw,
        mad_std=mad_stds,
        chi2=chi2.reshape(h, w),
        p_value=p_value.reshape(h, w),
        change_mask=change_mask.reshape(h, w),
        significance_level=significance_level,
        total_pixels=n_pixels,
        changed_pixels=changed_pixels,
        changed_pct=round(changed_pct, 4),
        mean_chi2=round(float(np.nanmean(chi2)), 4),
        max_chi2=round(float(np.nanmax(chi2)), 4),
        n_iterations=iteration + 1,
        converged=converged,
        processing_steps=processing_steps,
    )
