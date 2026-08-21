# OrbitalQuery EO Analysis Service

Standalone Python microservice for Earth Observation data analysis. Searches STAC catalogs, accesses satellite imagery via windowed reads, and computes raster statistics — all without downloading entire scenes.

## Setup

### 1. Create and activate virtual environment

```bash
cd analysis-service
python -m venv venv

# Windows PowerShell
.\venv\Scripts\Activate.ps1

# macOS/Linux
source venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure environment

```bash
cp .env.example .env
```

No API keys are required. Planetary Computer STAC API is free and open.

### 4. Run the service

```bash
# Development (auto-reload)
python run.py

# Or directly
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Service starts at **http://localhost:8000**
Swagger docs at **http://localhost:8000/docs**

### 5. Run tests

```bash
# Unit tests only (no network)
python -m pytest tests/ -v -m "not integration"

# All tests including integration
python -m pytest tests/ -v
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `STAC_API_URL` | `https://planetarycomputer.microsoft.com/api/stac/v1` | STAC API endpoint |
| `DEFAULT_COLLECTION` | `sentinel-2-l2a` | Default STAC collection |
| `DEFAULT_MAX_CLOUD_COVER` | `30` | Max cloud cover percentage (0-100) |
| `DEFAULT_LIMIT` | `10` | Default result limit |
| `HOST` | `0.0.0.0` | Server host |
| `PORT` | `8000` | Server port |

## API Endpoints

### GET /health

Health check with STAC API connectivity status.

```bash
curl http://localhost:8000/health
```

**Response:**
```json
{
  "status": "ok",
  "service": "orbitalquery-analysis",
  "version": "0.1.0",
  "stac_api": "https://planetarycomputer.microsoft.com/api/stac/v1",
  "stac_api_reachable": true,
  "python_version": "3.14.4",
  "packages": {
    "fastapi": "0.141.1",
    "numpy": "2.5.2",
    "rasterio": "1.5.1",
    ...
  }
}
```

---

### POST /stac/search

Search the STAC catalog for satellite scenes.

```bash
curl -X POST http://localhost:8000/stac/search \
  -H "Content-Type: application/json" \
  -d '{
    "bbox": [75.5, 26.5, 76.0, 27.0],
    "start_date": "2024-03-01",
    "end_date": "2024-03-31",
    "collection": "sentinel-2-l2a",
    "max_cloud_cover": 20,
    "limit": 5
  }'
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `bbox` | `[float, float, float, float]` | Yes* | `[west, south, east, north]` in WGS-84 |
| `geometry` | `GeoJSON` | Yes* | GeoJSON geometry (alternative to bbox) |
| `start_date` | `date` | No | Start date (inclusive), e.g. `2024-01-01` |
| `end_date` | `date` | No | End date (inclusive), e.g. `2024-06-30` |
| `datetime` | `string` | No | ISO 8601 interval (overrides start/end) |
| `collection` | `string` | No | Collection ID (default: `sentinel-2-l2a`) |
| `max_cloud_cover` | `int` | No | Max cloud % (0-100, default: 30) |
| `limit` | `int` | No | Max results (1-50, default: 10) |

**Supported collections:** `sentinel-2-l2a`, `landsat-c2-l2`, `sentinel-1-grd`, `naip`, `io-lulc-annual-v02`

**Response:**
```json
{
  "status": "ok",
  "collection": "sentinel-2-l2a",
  "total_matches": 12,
  "returned": 5,
  "items": [
    {
      "id": "S2A_MSIL2A_20240315T052011_...",
      "collection": "sentinel-2-l2a",
      "bbox": [75.12, 26.34, 76.45, 27.18],
      "properties": {
        "datetime": "2024-03-15T05:20:11Z",
        "eo:cloud_cover": 8.2
      },
      "assets": { ... }
    }
  ]
}
```

---

### POST /analysis/preview

Search for a scene and read a raster window for the given AOI. Returns band statistics without downloading the full scene.

```bash
curl -X POST http://localhost:8000/analysis/preview \
  -H "Content-Type: application/json" \
  -d '{
    "bbox": [75.7, 26.8, 75.9, 27.0],
    "start_date": "2024-03-01",
    "end_date": "2024-03-31",
    "collection": "sentinel-2-l2a",
    "max_cloud_cover": 20,
    "limit": 1,
    "bands": ["B04", "B08"]
  }'
```

**Additional request fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `bands` | `[string]` | No | Specific bands to read (default: first 3) |
| `limit` | `int` | No | Number of scenes to preview (1-10) |

**Response:**
```json
{
  "status": "ok",
  "aoi_bbox": [75.7, 26.8, 75.9, 27.0],
  "scene": {
    "item_id": "S2A_MSIL2A_20240315T052011_...",
    "collection": "sentinel-2-l2a",
    "datetime": "2024-03-15T05:20:11Z",
    "cloud_cover": 8.2,
    "bbox": [75.12, 26.34, 76.45, 27.18],
    "assets_available": ["B02", "B03", "B04", "B08", "visual", ...],
    "asset_used": "B04",
    "signed_href": "https://sentinel2..."
  },
  "window_shape": [2, 220, 220],
  "bands_loaded": ["B04", "B08"],
  "band_stats": [
    {
      "band": "B04",
      "dtype": "uint16",
      "shape": [220, 220],
      "min": 412.0,
      "max": 2890.0,
      "mean": 856.3,
      "std": 342.1,
      "nodata_count": 0
    },
    {
      "band": "B08",
      "dtype": "uint16",
      "shape": [220, 220],
      "min": 523.0,
      "max": 3201.0,
      "mean": 1245.7,
      "std": 478.2,
      "nodata_count": 0
    }
  ],
  "resolution_meters": 10.0,
  "crs": "EPSG:32643",
  "read_method": "windowed"
}
```

## Architecture

```
analysis-service/
├── app/
│   ├── main.py              # FastAPI application entry point
│   ├── config.py             # Environment variables and defaults
│   ├── models/
│   │   └── requests.py       # Pydantic request/response models
│   ├── routes/
│   │   ├── health.py         # GET /health
│   │   ├── stac.py           # POST /stac/search
│   │   └── analysis.py       # POST /analysis/preview
│   └── services/
│       ├── stac_service.py   # pystac-client + planetary-computer
│       └── raster_service.py # rasterio windowed reads
├── tests/
│   ├── test_aoi.py           # AOI validation tests
│   ├── test_dates.py         # Date validation tests
│   ├── test_stac_params.py   # STAC parameter tests
│   ├── test_cloud_cover.py   # Cloud cover filter tests
│   ├── test_asset_selection.py # Asset selection tests
│   └── test_integration.py   # Live Planetary Computer tests
├── requirements.txt
├── pyproject.toml
├── .env.example
├── run.py
└── README.md
```

## Request Flow

```
Client → POST /analysis/preview
         │
         ├── 1. Validate request (Pydantic)
         ├── 2. STAC search (pystac-client → Planetary Computer)
         ├── 3. Sign assets (planetary-computer)
         ├── 4. Select best asset (visual > B04 > first)
         ├── 5. Read raster window (rasterio)
         └── 6. Compute band stats (numpy)
         │
         ← Response with metadata + statistics
```

## Known Limitations

- **CRS mismatch**: Windowed reads assume the AOI bbox is in the raster's native CRS. For Sentinel-2 (UTM zones), a coordinate transformation step is needed for full accuracy.
- **Large AOIs**: Very large bboxes may cause memory issues. The service caps bbox area at 100 deg².
- **Asset type detection**: The service assumes rasterio-compatible assets (GeoTIFF). JPEG/PNG thumbnails are skipped.
- **No caching**: Each request hits the STAC API and fetches fresh data. No result caching is implemented.

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| fastapi | 0.141.1 | Web framework |
| uvicorn | 0.52.4 | ASGI server |
| pydantic | 2.13.4 | Data validation |
| pystac-client | 0.9.0 | STAC API client |
| planetary-computer | 1.0.0 | Asset signing |
| rasterio | 1.5.1 | Raster I/O |
| rioxarray | 0.23.0 | xarray+rasterio |
| xarray | 2026.7.0 | N-dimensional arrays |
| numpy | 2.5.2 | Array math |
| pandas | 2.3.3 | Data manipulation |
| geopandas | 1.1.4 | Geospatial dataframes |
| shapely | 2.1.2 | Geometry operations |
| pyproj | 3.7.2 | CRS transformations |
| stackstac | 0.5.1 | STAC → xarray |
