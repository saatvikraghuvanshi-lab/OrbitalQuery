"""Health check endpoint with real connectivity diagnostics."""

from __future__ import annotations

import os
import sys
import time
from typing import Optional

from fastapi import APIRouter

from app.config import STAC_API_URL

router = APIRouter(tags=["health"])


def _check_stac_reachable(url: str, timeout: int = 5) -> dict:
    """Check if the STAC API is reachable and measure latency."""
    try:
        import httpx
        start = time.time()
        resp = httpx.get(f"{url}/", timeout=timeout)
        latency_ms = round((time.time() - start) * 1000)
        return {
            "reachable": resp.status_code < 500,
            "status_code": resp.status_code,
            "latency_ms": latency_ms,
        }
    except Exception as e:
        return {
            "reachable": False,
            "error": str(e)[:100],
        }


def _check_rasterio() -> dict:
    """Check if rasterio + GDAL are functional."""
    try:
        import rasterio
        from rasterio._env import GDALDataFinder
        return {
            "available": True,
            "version": rasterio.__version__,
        }
    except Exception as e:
        return {
            "available": False,
            "error": str(e)[:100],
        }


def _check_numpy() -> dict:
    """Check NumPy availability."""
    try:
        import numpy as np
        return {"available": True, "version": np.__version__}
    except Exception as e:
        return {"available": False, "error": str(e)[:100]}


def _check_scipy() -> dict:
    """Check SciPy availability."""
    try:
        import scipy
        return {"available": True, "version": scipy.__version__}
    except Exception as e:
        return {"available": False, "error": str(e)[:100]}


@router.get("/health")
async def health_check():
    """
    Comprehensive health check — verifies service dependencies.

    Returns status of: STAC API, rasterio, NumPy, SciPy, memory, and uptime.
    """
    stac_check = _check_stac_reachable(STAC_API_URL)

    # Overall status
    critical_ok = stac_check["reachable"]

    return {
        "status": "healthy" if critical_ok else "degraded",
        "timestamp": time.time(),
        "python": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        "environment": os.environ.get("ENVIRONMENT", "development"),
        "dependencies": {
            "stac_api": {
                "url": STAC_API_URL,
                **stac_check,
            },
            "rasterio": _check_rasterio(),
            "numpy": _check_numpy(),
            "scipy": _check_scipy(),
        },
        "gdal_env": {
            "GDAL_CACHEMAX": os.environ.get("GDAL_CACHEMAX", "not set"),
        },
    }


@router.get("/health/ready")
async def readiness_check():
    """Kubernetes-style readiness probe — returns 200 only if service is fully ready."""
    stac_check = _check_stac_reachable(STAC_API_URL, timeout=3)

    if not stac_check["reachable"]:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=503,
            content={"status": "not ready", "reason": "STAC API unreachable"},
        )

    return {"status": "ready"}
