"""OrbitalQuery EO Analysis Service — main FastAPI application."""

from __future__ import annotations

import logging
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import HOST, PORT, STAC_API_URL
from app.routes import analysis, change, decision, evidence, explain, flood, health, index, preprocess, providers, query, sensor, stac, timeseries
from app.services.eo_provider import init_default_provider, register_provider, CopernicusProvider, BhoonidhiProvider

# ── Logging ──────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("orbitalquery-analysis")

# ── App ──────────────────────────────────────────────────────────

app = FastAPI(
    title="OrbitalQuery EO Analysis Service",
    description=(
        "Earth Observation analysis microservice. "
        "Search STAC catalogs, access satellite imagery, "
        "and compute raster statistics for areas of interest."
    ),
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — allow the Node.js backend to call this service
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Initialize EO Providers ───────────────────────────────────

import os

# 1. Planetary Computer (lowest priority — registered first, overridden by others)
init_default_provider(api_url=STAC_API_URL)
logger.info("EO Provider initialized: planetary_computer (fallback only)")

# 2. Copernicus CDSE (secondary — works without token)
copernicus_token = os.environ.get("COPERNICUS_TOKEN")
copernicus_provider = CopernicusProvider(token=copernicus_token)
register_provider(copernicus_provider, default=False)
logger.info("EO Provider registered: copernicus_cdse (secondary)")

# 3. Bhoonidhi / ISRO (PRIMARY — registered last to override defaults)
bhoonidhi_user = os.environ.get("BHOONIDHI_USER")
bhoonidhi_pass = os.environ.get("BHOONIDHI_PASS")
if bhoonidhi_user and bhoonidhi_pass:
    bhoonidhi_provider = BhoonidhiProvider(user_id=bhoonidhi_user, password=bhoonidhi_pass)
    register_provider(bhoonidhi_provider, default=True)  # Bhoonidhi is primary
    logger.info("EO Provider registered: bhoonidhi (DEFAULT — ISRO data)")
else:
    logger.info("Bhoonidhi skipped (set BHOONIDHI_USER + BHOONIDHI_PASS to enable)")

# ── Routes ───────────────────────────────────────────────────────

app.include_router(health.router)
app.include_router(stac.router)
app.include_router(analysis.router)
app.include_router(preprocess.router)
app.include_router(timeseries.router)
app.include_router(index.router)
app.include_router(change.router)
app.include_router(evidence.router)
app.include_router(explain.router)
app.include_router(sensor.router)
app.include_router(flood.router)
app.include_router(query.router)
app.include_router(providers.router)
app.include_router(decision.router)


@app.get("/", tags=["root"])
async def root():
    """Root endpoint — service info."""
    return {
        "service": "OrbitalQuery EO Analysis Service",
        "version": "0.1.0",
        "docs": "/docs",
        "stac_api": STAC_API_URL,
        "endpoints": {
            "health": "GET /health",
            "stac_search": "POST /stac/search",
            "analysis_preview": "POST /analysis/preview",
            "preprocess": "POST /analysis/preprocess",
            "indices": "GET /analysis/indices",
            "index": "POST /analysis/index",
            "change_detect": "POST /analysis/change-detect",
            "timeseries": "POST /analysis/timeseries",
            "evidence": "POST /analysis/evidence/select",
            "sensors": "GET /analysis/sensors",
            "sentinel1_search": "POST /analysis/sentinel1/search",
            "flood_assess": "POST /analysis/flood/assess",
            "explain": "POST /analysis/explain",
        },
    }


# ── Run ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    logger.info("Starting EO Analysis Service on %s:%d", HOST, PORT)
    uvicorn.run("app.main:app", host=HOST, port=PORT, reload=True)
