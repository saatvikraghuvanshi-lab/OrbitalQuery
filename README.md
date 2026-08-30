# OrbitalQuery

**Semantic discovery and analysis of Earth Observation datasets.**

> ⚠️ **Disclaimer:** OrbitalQuery is a research and exploration tool. It is **not intended for operational disaster response** or mission-critical decision-making. Always verify dataset accuracy and suitability through official sources before making policy or operational decisions.

---

## What It Does

A researcher asks:

> "How much did Hyderabad expand between 2021 and 2025?"

OrbitalQuery understands the question, finds the right satellite data, runs the analysis, and presents a result with visual evidence — all in one flow.

No manual STAC browsing. No GIS software. No coding.

---

## Architecture

```
                    USER QUERY
                        │
                        ▼
              ┌──────────────────┐
              │ SEMANTIC ENGINE  │
              │ Query parsing    │
              │ Expansion        │
              │ Dataset ranking  │
              └────────┬─────────┘
                       │
                       ▼
              ┌──────────────────┐
              │ EO DATA LAYER    │
              │ Planetary        │
              │ Computer STAC    │
              │ Sentinel-2       │
              │ Landsat · S-1    │
              └────────┬─────────┘
                       │
                       ▼
              ┌──────────────────┐
              │ ANALYSIS ENGINE  │
              │ Spectral indices │
              │ Change detection │
              │ Temporal compare │
              └────────┬─────────┘
                       │
                       ▼
              ┌──────────────────┐
              │ GIS EXPERIENCE   │
              │ Before / After   │
              │ Swipe compare    │
              │ Difference map   │
              │ Insight report   │
              └──────────────────┘
```

### How It Works

**1. Semantic Engine** — Understands natural language queries. Extracts phenomenon (urban expansion, deforestation, flood), location (Hyderabad, Assam), and time range (2021–2025). Expands terms: "deforestation" → "forest loss, tree cover, vegetation change". Ranks candidate datasets by relevance.

**2. EO Data Layer** — Searches satellite archives via STAC APIs. Primary source: Microsoft Planetary Computer (Sentinel-2 L2A, Landsat C2 L2, Sentinel-1 GRD). No API keys required for read access. Returns scene metadata, bounding boxes, cloud cover, and tile URLs.

**3. Analysis Engine** — Retrieves satellite observations for both time periods. Computes spectral indices (NDVI, NDWI, NDBI, NBR, NDSI). Runs change detection between periods. Generates metrics, explanations, and visual evidence URLs.

**4. GIS Experience** — Presents results as interactive satellite maps. Before/After side-by-side view. Swipe comparison with draggable divider. Difference visualization with change regions. Insight-first summary with primary metric, confidence, and data sources.

---

## Data Sources

| Source | Status | Role |
|--------|--------|------|
| **Planetary Computer** (Microsoft) | ✅ Active, primary | Sentinel-2 L2A, Landsat C2 L2, Sentinel-1 GRD |
| **AWS Earth Search** | ✅ Available | Additional EO collections |
| **NASA Earthdata** | ✅ Available | MODIS, VIIRS, Landsat |
| **Copernicus** | ✅ Available | Sentinel family |

### Sentinel-2 L2A (Primary)

- **Resolution:** 10m multispectral
- **Revisit:** 5 days
- **Bands:** Coastal, Blue, Green, Red, Red Edge ×3, NIR, NIR Narrow, Water Vapour, SWIR ×2
- **Indices:** NDVI, NDWI, MNDWI, NDBI, NBR, NDSI, EVI, SAVI
- **Coverage:** Global

### Landsat Collection 2 L2 (Demonstrated)

- **Resolution:** 30m multispectral + thermal
- **Revisit:** 16 days
- **Bands:** Coastal, Blue, Green, Red, NIR, SWIR ×2, Thermal
- **Coverage:** Global

### Sentinel-1 GRD (Demonstrated)

- **Resolution:** 10m SAR
- **Revisit:** 6 days
- **Bands:** VV, VH (all-weather imaging)
- **Coverage:** Global

---

## Features

**Ask** — Natural language query → full analysis pipeline → insight report with visual evidence.

**Discover** — Draw a bounding box, search available datasets, view grouped availability by collection with best-match scoring.

**Showcase** — Pre-built analysis queries demonstrating key capabilities.

### Analysis Capabilities

| Capability | Description |
|-----------|-------------|
| Temporal comparison | Before/After, Swipe, Difference views |
| Change detection | NDVI differencing, threshold-based region labeling |
| Spectral indices | NDVI, NDWI, NDBI, NBR, NDSI |
| Yearly trends | Multi-year index analysis with trend direction |
| Scene selection | Automatic best-scene selection by cloud cover and AOI coverage |

---

## Quick Start

No API keys, no external database, no complex setup.

```bash
# Clone
git clone https://github.com/saatvikraghuvanshi-lab/OrbitalQuery.git
cd OrbitalQuery

# Backend
cd backend && npm install && cd ..

# Frontend
cd frontend && npm install && cd ..

# Run backend (Terminal 1)
cd backend && npm run dev

# Run frontend (Terminal 2)
cd frontend && npm run dev
```

Open http://localhost:3000

---

## Deployment

| Service | Platform | URL |
|---------|----------|-----|
| Frontend | Vercel | orbital-query.vercel.app |
| Backend (Node.js) | Render | orbitalquery-backend.onrender.com |
| Analysis (Python) | Render | orbitalquery.onrender.com |

---

## Project Structure

```
OrbitalQuery/
├── frontend/          # Next.js + TypeScript + Tailwind + Leaflet
├── backend/           # Node.js + Express + Prisma + SQLite
├── analysis-service/  # Python + FastAPI + Rasterio + Xarray
├── n8n/               # Workflow automation (optional)
└── docs/              # Documentation and screenshots
```

---

## Screenshots

<table>
<tr>
<td align="center"><b>Ask — Natural Language Query</b><br/><img src="docs/screenshots/OQ2.png" width="400"/></td>
<td align="center"><b>Discover — Dataset Browser</b><br/><img src="docs/screenshots/OQ4.png" width="400"/></td>
</tr>
<tr>
<td align="center"><b>Before / After Comparison</b><br/><img src="docs/screenshots/OQ6.png" width="400"/></td>
<td align="center"><b>Insight Report</b><br/><img src="docs/screenshots/OQ8.png" width="400"/></td>
</tr>
</table>

---

## How It Differs

| Approach | What You Get |
|----------|-------------|
| STAC Browser | Browse metadata. No analysis. |
| Google Earth Engine | Write code. Steep learning curve. |
| Sentinel Hub | Beautiful maps. No semantic search. |
| **OrbitalQuery** | **Ask a question. Get an answer.** |

---

## License

MIT License
