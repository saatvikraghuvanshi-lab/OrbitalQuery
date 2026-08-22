"""OrbitalQuery EO Analysis Service — main FastAPI application."""

from __future__ import annotations

import logging
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import HOST, PORT, STAC_API_URL
from app.routes import analysis, change, evidence, explain, flood, health, index, preprocess, query, sensor, stac, timeseries

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
