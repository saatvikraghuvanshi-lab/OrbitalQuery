"""Provider management endpoints."""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException

from app.services.eo_provider import (
    list_providers,
    get_provider,
    get_default_provider,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analysis/providers", tags=["providers"])


@router.get("")
async def list_all_providers():
    """List all registered EO providers with capabilities."""
    providers = list_providers()
    return {
        "status": "ok",
        "count": len(providers),
        "providers": providers,
    }


@router.get("/{name}")
async def get_provider_detail(name: str):
    """Get detailed info for a specific provider."""
    try:
        provider = get_provider(name)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Provider '{name}' not found")

    caps = provider.get_capabilities()
    return {
        "status": "ok",
        "name": name,
        "is_default": name == get_default_provider().get_name(),
        "capabilities": {
            "supports_stac": caps.supports_stac,
            "supports_cloud_hosted": caps.supports_cloud_hosted,
            "supports_signed_urls": caps.supports_signed_urls,
            "collections": caps.collections,
            "max_bbox_area_deg2": caps.max_bbox_area_deg2,
            "notes": caps.notes,
        },
    }


@router.get("/{name}/health")
async def provider_health(name: str):
    """Check if a specific provider is reachable."""
    try:
        provider = get_provider(name)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Provider '{name}' not found")

    reachable = provider.is_reachable()
    return {
        "status": "ok" if reachable else "unreachable",
        "provider": name,
        "reachable": reachable,
    }
