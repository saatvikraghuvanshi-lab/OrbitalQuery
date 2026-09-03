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
PORT = int(os.getenv("PORT", "8080"))

# Allowed collections (Planetary Computer + Bhoonidhi + Copernicus)
ALLOWED_COLLECTIONS = [
    # Planetary Computer / Copernicus
    "sentinel-2-l2a",
    "landsat-c2-l2",
    "sentinel-1-grd",
    "naip",
    "io-lulc-annual-v02",
    # Copernicus CDSE
    "ccm-optical",
    "ccm-sar",
    # Bhoonidhi / ISRO
    "ResourceSat-2A_AWIFS_L2",
    "ResourceSat-2A_AWIFS_BOA",
    "ResourceSat-2A_LISS3_L2",
    "ResourceSat-2A_LISS3_BOA",
    "ResourceSat-2A_LISS4-MX70_L2",
    "ResourceSat-2_AWIFS_L2",
    "ResourceSat-2_AWIFS_BOA",
    "ResourceSat-2_LISS3_L2",
    "ResourceSat-2_LISS3_BOA",
    "ResourceSat-2_LISS4-MX70_L2",
    "EOS-04_SAR-MRS_L2A",
    "EOS-04_SAR-MRS_L2B",
    "EOS-04_SAR-CRS_L2A",
    "EOS-06_OCM-LAC_L1C",
    "EOS-06_OCM-GAC_L1C",
    "Sentinel-1A_SAR-IW_GRD",
    "Sentinel-1A_SAR-IW_SLC",
    "CartoSat-1_PAN_CartoDEM_30m",
    "NISAR_SSAR_RSLC",
    "NISAR_SSAR_GCOV",
]

# Date range limits
MIN_DATE = "2015-01-01"
MAX_DATE = "2026-12-31"

# AOI limits (bounding box)
MIN_BBOX = [-180.0, -90.0, 180.0, 90.0]
MAX_AREA_DEGREES_SQ = 100.0  # max bbox area in degrees²
# Analysis pipeline configuration
ANALYSIS_SCENE_SEARCH_LIMIT = int(os.getenv("ANALYSIS_SCENE_SEARCH_LIMIT", "8"))
ANALYSIS_CLOUD_THRESHOLD_DEFAULT = int(os.getenv("ANALYSIS_CLOUD_THRESHOLD_DEFAULT", "20"))
ANALYSIS_MIN_REGION_PIXELS = int(os.getenv("ANALYSIS_MIN_REGION_PIXELS", "50"))
ANALYSIS_CHANGE_THRESHOLD_MIN = float(os.getenv("ANALYSIS_CHANGE_THRESHOLD_MIN", "0.12"))
ANALYSIS_CHANGE_THRESHOLD_MAX = float(os.getenv("ANALYSIS_CHANGE_THRESHOLD_MAX", "0.25"))
ANALYSIS_WIDEN_WINDOW_DAYS = int(os.getenv("ANALYSIS_WIDEN_WINDOW_DAYS", "45"))
ANALYSIS_RASTER_TIMEOUT_S = int(os.getenv("ANALYSIS_RASTER_TIMEOUT_S", "30"))
