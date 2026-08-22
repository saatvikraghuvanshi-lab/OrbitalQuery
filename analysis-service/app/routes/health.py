"""Health check endpoint."""

from __future__ import annotations

import sys

from fastapi import APIRouter, HTTPException

from app.config import STAC_API_URL
from app.models.requests import HealthResponse
from app.services.stac_service import check_stac_api_reachable

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint.

    Returns service status, Python version, package versions,
    and whether the STAC API is reachable.
    """
    try:
        stac_reachable = check_stac_api_reachable()
    except Exception:
        stac_reachable = False

    # Collect package versions
    packages = {}
    for name in [
        "fastapi", "uvicorn", "pydantic", "pystac_client",
        "planetary_computer", "rasterio", "rioxarray", "xarray",
        "numpy", "pandas", "geopandas", "shapely", "pyproj", "stackstac",
    ]:
        try:
            mod = __import__(name)
            packages[name] = getattr(mod, "__version__", "unknown")
        except ImportError:
            packages[name] = "not installed"

    return HealthResponse(
        status="ok",
        stac_api=STAC_API_URL,
        stac_api_reachable=stac_reachable,
        python_version=f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        packages=packages,
    )
