---
title: OrbitalQuery Analysis Service
emoji: 🛰️
colorFrom: green
colorTo: blue
sdk: docker
app_port: 8080
---

# OrbitalQuery EO Analysis Service

FastAPI microservice for Earth Observation analysis:
- STAC catalog search (Planetary Computer, AWS Earth Search, Copernicus CDSE, NASA CMR)
- Spectral index computation (NDVI, NDWI, NDBI, NDSI, NBR, etc.)
- Temporal comparison / change detection
- Raster windowed reads via rasterio

This space is the backend analysis engine for the [OrbitalQuery](https://github.com/saatvikraghuvanshi-lab/OrbitalQuery) platform.

## Endpoints

- `GET /health` — health check
- `POST /stac/search` — search STAC catalogs
- `POST /analysis/temporal-compare` — temporal comparison
- `POST /analysis/index` — compute spectral index
- `POST /analysis/change-detect` — change detection
- `GET /analysis/indices` — list supported indices

## Environment

- `STAC_API_URL` — default STAC API endpoint (Planetary Computer)
- `COPERNICUS_TOKEN` — optional Copernicus Data Space token
- `BHOONIDHI_USER` / `BHOONIDHI_PASS` — optional ISRO Bhoonidhi credentials
- `CORS_ORIGINS` — comma-separated allowed origins (default: `*`)
- `PORT` — port number (set by HuggingFace Spaces automatically)
