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
    """Lightweight health check — no heavy imports or network calls."""
    return HealthResponse(
        status="ok",
        stac_api=STAC_API_URL,
        stac_api_reachable=False,
        python_version=f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        packages={},
    )
