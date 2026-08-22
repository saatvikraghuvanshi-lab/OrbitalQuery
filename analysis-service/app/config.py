"""Configuration for the EO Analysis Service."""

import os
from dotenv import load_dotenv

load_dotenv()

# STAC Provider
STAC_API_URL = os.getenv(
    "STAC_API_URL",
    "https://planetarycomputer.microsoft.com/api/stac/v1",
)

# Default collection
DEFAULT_COLLECTION = os.getenv("DEFAULT_COLLECTION", "sentinel-2-l2a")

# Default cloud cover threshold
DEFAULT_MAX_CLOUD_COVER = int(os.getenv("DEFAULT_MAX_CLOUD_COVER", "30"))

# Maximum results per search
DEFAULT_LIMIT = int(os.getenv("DEFAULT_LIMIT", "10"))

# Server
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# Allowed collections
ALLOWED_COLLECTIONS = [
    "sentinel-2-l2a",
    "landsat-c2-l2",
    "sentinel-1-grd",
    "naip",
    "io-lulc-annual-v02",
]

# Date range limits
MIN_DATE = "2015-01-01"
MAX_DATE = "2026-12-31"

# AOI limits (bounding box)
MIN_BBOX = [-180.0, -90.0, 180.0, 90.0]
MAX_AREA_DEGREES_SQ = 100.0  # max bbox area in degrees²
