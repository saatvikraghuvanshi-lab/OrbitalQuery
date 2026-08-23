# 🛰️ OrbitalQuery — Semantic EO Dataset Explorer

A platform that enables researchers and decision-makers to **semantically query Earth Observation (EO) datasets** using natural language, geospatial filters, and time ranges. Combines semantic AI search with GIS visualization to make EO archives accessible without manual browsing.

![Next.js](https://img.shields.io/badge/Next.js-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-blue)
![SQLite](https://img.shields.io/badge/SQLite-3-blue)
![Prisma](https://img.shields.io/badge/Prisma-5-blue)
![Leaflet](https://img.shields.io/badge/Leaflet-1.9-green)

---

> ⚠️ **Disclaimer:** OrbitalQuery is a research and exploration tool. It is **not intended for operational disaster response** or mission-critical decision-making. Always verify dataset accuracy and suitability through official sources before making policy or operational decisions.

---

## 🔗 Working Links

### Local Development

| Service | URL | Description |
|---------|-----|-------------|
| **Frontend (UI)** | http://localhost:3000 | Main application — search bar, map, results |
| **Backend (API)** | http://localhost:3001 | REST API — search, auth, datasets |
| **Backend API Docs** | http://localhost:3001/ | API documentation landing page |
| **Full Stack** | http://localhost:3000 | Frontend proxies API calls to backend |

### GitHub Repository

| Link | URL |
|------|-----|
| **Repository** | https://github.com/saatvikraghuvanshi-lab/OrbitalQuery |
| **Main Branch** | https://github.com/saatvikraghuvanshi-lab/OrbitalQuery/tree/main |
| **Stage 1 (Prototype)** | https://github.com/saatvikraghuvanshi-lab/OrbitalQuery/tree/stage-1 |
| **Stage 2 (Enhancement)** | https://github.com/saatvikraghuvanshi-lab/OrbitalQuery/tree/stage-2 |
| **Stage 3 (Dashboard)** | https://github.com/saatvikraghuvanshi-lab/OrbitalQuery/tree/stage-3 |

### API Endpoints (all verified working)

| Endpoint | Method | URL | Status |
|----------|--------|-----|--------|
| Health Check | GET | http://localhost:3001/api/health | ✅ |
| Semantic Search | POST | http://localhost:3001/api/search | ✅ |
| List Providers | GET | http://localhost:3001/api/search/providers | ✅ |
| List Collections | GET | http://localhost:3001/api/search/collections | ✅ |
| List Datasets | GET | http://localhost:3001/api/datasets | ✅ |
| Dataset Stats | GET | http://localhost:3001/api/datasets/stats/overview | ✅ |
| Register User | POST | http://localhost:3001/api/auth/register | ✅ |
| Login | POST | http://localhost:3001/api/auth/login | ✅ |
| Get Profile | GET | http://localhost:3001/api/auth/me | ✅ |

---

## ✨ Features

- **🔍 Semantic Search** — Query datasets using natural language (e.g., "deforestation near Assam 2015–2020")
- **🗺️ Interactive Map** — Leaflet.js map with dataset footprints and bounding box drawing
- **📅 Temporal Filters** — Filter by date ranges to find time-specific imagery
- **🛰️ Multi-Source** — Sentinel-2, Landsat-8/9, MODIS, VIIRS, and more
- **📊 Real-time Results** — Ranked results with relevance scores and metadata
- **🎯 Spatial Filtering** — Draw bounding boxes on the map to filter by geography
- **🔐 Authentication** — JWT-based user authentication with role-based access
- **🛡️ Security** — Rate limiting, input sanitization, Helmet headers, CORS hardening
- **🌙 Dark Theme** — Beautiful space-themed dark UI with glass morphism effects
- **🎭 Mock Mode** — Frontend works standalone with mock data when backend is offline
---
Research Document: [ORBITALQUERY_RESEARCH_REPORT.docx](https://github.com/user-attachments/files/31349935/ORBITALQUERY_RESEARCH_REPORT.docx)
                 ( credits: Priya Patel )
---
🚨 ORBITALQUERY CONTRIBUTION RULES

1. NEVER push directly to main.

2. NEVER force push to main.

3. NEVER delete main.

4. NEVER rewrite existing repository history.

5. NEVER modify existing APIs, URLs, datasets, architecture,
   environment variables, or configuration without documenting
   the reason.

6. NEVER remove existing functionality simply to make a new
   feature work.

7. NEVER replace a working implementation without first
   understanding its dependencies.

8. NEVER commit secrets, API keys, tokens, passwords,
   credentials, .env files, or private data.

9. NEVER commit large satellite datasets or generated imagery
   unless explicitly approved.

10. NEVER blindly merge AI-generated code.

11. Every AI-generated change must be reviewed by a human.

12. Every feature must be developed on its own branch.

13. Every branch must be submitted through a Pull Request.

14. Every Pull Request must explain:
    - What changed
    - Why it changed
    - Files affected
    - Dependencies added
    - APIs/datasets affected
    - How it was tested
    - Known limitations

15. If a change could break existing functionality,
    discuss it before merging.

16. If unsure, DO NOT delete or overwrite.
    Ask the repository owner first.

---
## ACTION LIST 
🔴 IMMEDIATELY
 Keep the existing OrbitalQuery frontend/backend.
 Create analysis-engine Python service.
 Add pystac-client.
 Add Planetary Computer access.
 Retrieve actual Sentinel-2 assets.
 Read COGs using rasterio/rioxarray.
 Test a real AOI in India.
🟠 NEXT
 Add stackstac.
 Build temporal cube.
 Add cloud filtering.
 Add spatial alignment.
 Implement NDVI.
 Implement NDWI.
 Implement NDBI.
 Implement NBR.
🟡 THEN
 Build generic change-detection engine.
 Add scene ranking.
 Add area statistics.
 Generate change polygons.
 Add before/after map.
 Add timeline.
🟢 THEN
 Add Sentinel-1.
 Build flood-impact workflow.
 Add pre/post analysis.
 Add multi-sensor evidence.
🔵 THEN
 Integrate Prithvi.
 Test pretrained flood/damage segmentation.
 Add ML confidence.
 Compare classical vs ML result.
🟣 THEN
 Apply for Bhoonidhi API.
 Add Bhoonidhi provider.
 Investigate NISAR integration.
 Add India-specific EO sources.
⚫ FINALLY
 Evidence chain.
 Provenance.
 Decision report.
 Confidence/limitations.
 Beautiful demo workflow.
## 🚀 Quick Start (Zero Config)

No API keys, no external database, no complex setup. Just Node.js.

### Prerequisites
- Node.js 18+ (`node --version`)
- npm (`npm --version`)

### 1. Install & Run

```bash
# Clone
git clone https://github.com/saatvikraghuvanshi-lab/OrbitalQuery.git
cd OrbitalQuery

# Install backend
cd backend && npm install && cd ..

# Install frontend
cd frontend && npm install && cd ..

# Start backend (Terminal 1)
cd backend && npm run dev

# Start frontend (Terminal 2)
cd frontend && npm run dev
```

### 2. Open the App

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001/api/health

### 3. Load Real Data (216+ datasets from live STAC APIs)

```bash
# Ingest 216 real datasets from AWS Earth Search (Sentinel-2, Landsat, Sentinel-1, NAIP)
cd backend && npx ts-node src/scripts/ingest-real.ts --all --limit 50

# Or load sample data (16 curated datasets)
cd backend && npx ts-node src/scripts/ingest-sample.ts
```

### 4. Try It Out

Open http://localhost:3000 and click any demo query:
- "Deforestation near Assam 2015–2020"
- "Urban expansion in Jaipur"
- "Glacier retreat in Himalayas"
- "Ocean temperature Indian Ocean"

---

## 🔧 How to Run (Step by Step)

### Backend (alone)
```bash
cd backend
npm install
npm run dev
# Server starts on http://localhost:3001
# Verify: curl http://localhost:3001/api/health
```

### Frontend (alone)
```bash
cd frontend
npm install
npm run dev
# Server starts on http://localhost:3000
# Frontend auto-enables mock mode if backend is down
```

### Backend + Frontend Together
```bash
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev

# Open http://localhost:3000
# Frontend proxies /api/* calls to backend on port 3001
```

---

## 🔐 Authentication

### Register
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "researcher@university.edu", "password": "securepass123", "name": "Dr. Smith"}'
```

### Login
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "researcher@university.edu", "password": "securepass123"}'
```

### Use Token
```bash
curl -X GET http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Roles
- **researcher** — Search datasets, view results (default)
- **admin** — Also trigger data ingestion and build embeddings

---

## 📡 API Reference

### POST /api/search
```json
{
  "query": "deforestation near Assam",
  "bbox": [91.0, 26.0, 92.5, 27.5],
  "startDate": "2020-01-01",
  "endDate": "2024-12-31",
  "provider": "Copernicus/ESA",
  "limit": 20
}
```

### Response
```json
{
  "results": [...],
  "total": 5,
  "limit": 20,
  "offset": 0,
  "latencyMs": 8
}
```

---

## 🧠 Semantic Search Engine

| Step | Description |
|------|-------------|
| 1 | Tokenize query → remove stop words |
| 2 | Expand terms: "deforestation" → "forest loss, tree cover, vegetation loss" |
| 3 | Geographic expansion: "Himalayas" → "glacier, snow cover, Nepal" |
| 4 | TF-IDF cosine similarity against dataset corpus |
| 5 | Title matches weighted 1.5x higher |
| 6 | Combined: Core TF-IDF (40%) + Expanded (40%) + Title (20%) |

---

## 🌍 Data Sources

### Live Datasets (ingested from AWS Earth Search STAC API)

| Collection | Resolution | Provider | Coverage |
|-----------|-----------|----------|----------|
| sentinel-2-l2a | 10m multispectral | Copernicus/ESA | Global, 5-day revisit |
| landsat-c2-l2 | 30m multispectral | USGS/NASA | Global, 16-day revisit |
| sentinel-1-grd | 10m SAR | Copernicus/ESA | Global, 6-day revisit |
| naip | 0.6m aerial | USDA | USA only |

### Additional Sources Available

| Source | Resolution | Provider |
|--------|-----------|----------|
| MODIS Terra/Aqua | 1km | NASA |
| VIIRS DNB | 500m | NASA |
| Sentinel-3 SLSTR | 1km | Copernicus/ESA |

### ✅ Trusted Data Sources (Used in OrbitalQuery)

All dataset metadata is ingested exclusively from these verified, trusted sources:

| Source | API | Auth Required | Status |
|--------|-----|---------------|--------|
| **AWS Earth Search** | STAC API v1 | ❌ No key needed | ✅ Active — primary source |
| **NASA Earthdata** | CMR STAC | ❌ (optional token) | ✅ Available |
| **Copernicus Open Access Hub** | OData API | ❌ (free registration) | ✅ Available |
| **ISRO Bhuvan** | WMS/WFS | ❌ | ✅ Available |

### STAC API References
- **STAC Specification** — https://stacspec.org
- **AWS Earth Search STAC** — https://earth-search.aws.element84.com/v1
- **AWS Earth Search Collections** — https://earth-search.aws.element84.com/v1/collections
- **STAC Browser** — https://radiantearth.github.io/stac-browser/

### Platform References
- **NASA Earthdata Search** — https://search.earthdata.nasa.gov
- **Copernicus Open Access Hub** — https://scihub.copernicus.eu
- **ISRO Bhuvan Portal** — https://bhuvan.nrsc.gov.in
- **USGS EarthExplorer** — https://earthexplorer.usgs.gov

### GitHub Repositories Referenced
- **sat-search** — https://github.com/sat-utils/sat-search (STAC search utility)
- **stac-fastapi** — https://github.com/stac-utils/stac-fastapi (STAC API server)
- **weaviate-examples** — https://github.com/weaviate/weaviate-examples (vector DB examples)
- **stac-rs** — https://github.com/stac-rs/stac-rs (Rust STAC implementation)

---

## 🛡️ Security

| Feature | Implementation |
|---------|---------------|
| Authentication | JWT + bcrypt (12 rounds) |
| Rate Limiting | 100 req/15min (API), 30 searches/5min |
| Input Sanitization | SQL injection + XSS prevention |
| Security Headers | Helmet.js (CSP, HSTS) |
| CORS | Restricted origin with preflight caching |
| Error Handling | Stack traces hidden in production |

---

## 🧪 Testing

### Stress Test (k6)
```bash
# Install k6: https://k6.io/docs/get-started/installation/
cd backend
k6 run stress-test/k6-search.js
```

### Postman Collection
Import `backend/stress-test/postman-collection.json` into Postman for 15 pre-configured API tests.

---

## 📁 Project Structure

```
OrbitalQuery/
├── backend/
│   ├── prisma/schema.prisma       # SQLite schema
│   ├── prisma/dev.db              # SQLite database
│   ├── src/
│   │   ├── index.ts               # Express server
│   │   ├── middleware/            # Auth, rate-limit, sanitize
│   │   ├── routes/                # search, datasets, auth, ingest
│   │   ├── services/              # search-engine, ingestion, embeddings
│   │   └── scripts/               # ingest-sample.ts, ingest-real.ts
│   └── stress-test/               # k6 + Postman tests
├── frontend/
│   ├── app/page.tsx               # Main search + map page
│   ├── components/                # Header, SearchBar, MapView, etc.
│   └── lib/mock-api.ts            # Mock API for standalone mode
└── README.md
```

---

## 🚢 Deployment

### Backend (Render)
1. Push to GitHub
2. Create Web Service on https://render.com
3. Build: `cd backend && npm install && npx prisma generate`
4. Start: `cd backend && node dist/index.js`
5. Set env: `JWT_SECRET`, `CORS_ORIGIN`

### Frontend (Vercel)
1. Push to GitHub
2. Import on https://vercel.com
3. Root directory: `frontend`
4. Set env: `NEXT_PUBLIC_API_URL=<your-backend-url>`

---

## 📜 License

MIT License

