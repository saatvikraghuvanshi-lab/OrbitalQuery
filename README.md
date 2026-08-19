# 🛰️ OrbitalQuery — Semantic EO Dataset Explorer

A platform that enables researchers and decision-makers to **semantically query Earth Observation (EO) datasets** using natural language, geospatial filters, and time ranges. Combines semantic AI search with GIS visualization to make EO archives accessible without manual browsing.

![Next.js](https://img.shields.io/badge/Next.js-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-blue)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue)
![Prisma](https://img.shields.io/badge/Prisma-5-blue)
![Leaflet](https://img.shields.io/badge/Leaflet-1.9-green)

---

> ⚠️ **Disclaimer:** OrbitalQuery is a research and exploration tool. It is **not intended for operational disaster response** or mission-critical decision-making. Always verify dataset accuracy and suitability through official sources before making policy or operational decisions.

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

---

## 📁 Project Structure

```
OrbitalQuery/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma          # Database schema (User, EODataset, SearchLog)
│   ├── src/
│   │   ├── index.ts               # Express server with security middleware
│   │   ├── middleware/
│   │   │   ├── auth.ts            # JWT authentication (login, register, refresh)
│   │   │   ├── rate-limit.ts      # Rate limiting (API, search, auth, ingestion)
│   │   │   └── sanitize.ts        # Query sanitization & input validation
│   │   ├── routes/
│   │   │   ├── auth.ts            # POST /api/auth/register, /login, /me, /refresh
│   │   │   ├── search.ts          # POST /api/search (semantic + spatial + temporal)
│   │   │   ├── datasets.ts        # GET /api/datasets, /:id, /stats
│   │   │   └── ingest.ts          # POST /api/ingest/* (admin-only)
│   │   ├── services/
│   │   │   ├── search-engine.ts   # TF-IDF + semantic expansion search
│   │   │   ├── ingestion.ts       # STAC API data ingestion
│   │   │   └── embeddings.ts      # Vector embeddings + TF-IDF index
│   │   └── scripts/
│   │       └── ingest-sample.ts   # 17 curated sample EO datasets
│   └── .env                       # Environment variables
├── frontend/
│   ├── app/
│   │   ├── layout.tsx             # Root layout with starfield
│   │   ├── page.tsx               # Main search + map + results page
│   │   └── globals.css            # Global styles + Leaflet overrides
│   ├── components/
│   │   ├── Header.tsx             # Navigation header
│   │   ├── SearchBar.tsx          # Search input with filter toggle
│   │   ├── FilterPanel.tsx        # Temporal + provider filters
│   │   ├── MapView.tsx            # Interactive Leaflet map
│   │   ├── ResultsList.tsx        # Dataset result cards
│   │   └── StatsBar.tsx           # Search metrics display
│   └── next.config.js             # Next.js config with API proxy
├── package.json                   # Root monorepo
├── .env.example                   # Environment template
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/OrbitalQuery.git
cd OrbitalQuery

# Install all dependencies
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

### 2. Database Setup

```bash
# Create PostgreSQL database
createdb orbital_query

# Configure environment
cp .env.example backend/.env
# Edit backend/.env with your PostgreSQL credentials

# Push schema to database
cd backend && npx prisma db push && npx prisma generate && cd ..
```

### 3. Load Sample Data

```bash
cd backend && npx ts-node src/scripts/ingest-sample.ts && cd ..
```

This loads 17 sample EO datasets covering:
- Sentinel-2 imagery (Assam floods, Himalayan snow, Jaipur urban, Thar desert, Western Ghats fire, coral reef, ocean pollution)
- Landsat-8/9 (Gangetic agriculture, Amazon deforestation, Sundarbans mangrove, Nepal earthquake, Karakoram glaciers)
- MODIS/VIIRS (global temperature, nighttime lights)
- Specialized (SAR, sea surface temperature)

### 4. Run Development Servers

```bash
# From root — runs both frontend + backend
npm run dev
```

Or separately:
```bash
# Terminal 1: Backend (http://localhost:3001)
cd backend && npm run dev

# Terminal 2: Frontend (http://localhost:3000)
cd frontend && npm run dev
```

### 5. Open the App

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001/api/health

---

## 🔐 Authentication

### Register a new account

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

### Use the token for protected endpoints

```bash
curl -X GET http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Roles
- **researcher** — Can search datasets, view results (default)
- **admin** — Can also trigger data ingestion and build embeddings

---

## 📡 API Reference

### POST /api/search

Semantic search with spatial and temporal filters.

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

### GET /api/datasets

List all datasets with pagination.

### GET /api/datasets/stats/overview

Dataset statistics by provider and collection.

### POST /api/auth/register / POST /api/auth/login

User authentication endpoints.

### POST /api/ingest/planetary-computer (admin only)

Trigger ingestion from Planetary Computer STAC API.

### POST /api/ingest/embeddings (admin only)

Build TF-IDF embeddings for semantic search.

---

## 🛡️ Security

| Feature | Implementation |
|---------|---------------|
| **Authentication** | JWT tokens with bcrypt password hashing (12 rounds) |
| **Rate Limiting** | 100 req/15min (API), 30 searches/5min, 10 logins/15min, 5 ingest/hour |
| **Input Sanitization** | SQL injection prevention, XSS filtering, field length limits |
| **Security Headers** | Helmet.js with CSP, HSTS, X-Frame-Options |
| **CORS** | Restricted to configured origin with preflight caching |
| **Query Validation** | Bounding box bounds checking, date range validation |
| **Error Handling** | Stack traces hidden in production mode |
| **Trust Proxy** | Configured for deployment behind reverse proxies |

---

## 🧠 Semantic Search Engine

The search engine uses **TF-IDF with semantic expansion**:

1. **Tokenization** — Queries and documents tokenized with stop-word removal
2. **Semantic Expansion** — 30+ synonym groups (e.g., "deforestation" → "forest loss, tree cover, vegetation loss")
3. **Geographic Expansion** — Location-aware (e.g., "Himalayas" → "glacier, snow cover, mountains, Nepal")
4. **TF-IDF Scoring** — Cosine similarity between expanded query and document vectors
5. **Title Boost** — Title matches weighted 1.5x higher
6. **Combined Ranking** — Core TF-IDF (40%) + Expanded (40%) + Title (20%)

For production, swap in HuggingFace sentence-transformers via ONNX Runtime or use Weaviate/FAISS for vector search at scale.

---

## 🌍 Data Sources

| Source | Resolution | Coverage | Provider |
|--------|-----------|----------|----------|
| Sentinel-2 L2A | 10m | Global | Copernicus/ESA |
| Landsat-8/9 | 30m | Global | USGS/NASA |
| MODIS Terra/Aqua | 1km | Global | NASA |
| VIIRS DNB | 500m | Global | NASA |
| Sentinel-1 SAR | 10m | Global | Copernicus/ESA |

### Trusted APIs & References

- **STAC (SpatioTemporal Asset Catalog)** — [stacspec.org](https://stacspec.org)
- **Microsoft Planetary Computer STAC API** — [planetarycomputer.microsoft.com](https://planetarycomputer.microsoft.com/api/stac/v1)
- **NASA Earthdata Search API** — [search.earthdata.nasa.gov](https://search.earthdata.nasa.gov)
- **Copernicus Open Access Hub** — [scihub.copernicus.eu](https://scihub.copernicus.eu)
- **ISRO Bhuvan Portal** — [bhuvan.nrsc.gov.in](https://bhuvan.nrsc.gov.in)

### GitHub Repositories Used

- **sat-search** — [github.com/sat-utils/sat-search](https://github.com/sat-utils/sat-search)
- **earth-search** — [github.com/planetarycomputer/planetary-computer-apis](https://github.com/planetarycomputer/planetary-computer-apis)
- **stac-fastapi** — [github.com/stac-utils/stac-fastapi](https://github.com/stac-utils/stac-fastapi)
- **weaviate-examples** — [github.com/weaviate/weaviate-examples](https://github.com/weaviate/weaviate-examples)

---

## 🎯 Demo Queries

| Query | What it finds |
|-------|--------------|
| `Deforestation near Assam 2015–2020` | Sentinel-2 imagery of the Brahmaputra basin |
| `Urban expansion in Jaipur` | High-res imagery of Rajasthan's capital |
| `Glacier retreat in Himalayas` | Snow/ice monitoring datasets |
| `Forest fire detection Western Ghats` | SWIR fire scar imagery |
| `Coral reef health monitoring` | Sentinel-2 Great Barrier Reef data |
| `Ocean temperature Indian Ocean` | MODIS SST maps |
| `Nighttime city lights` | VIIRS DNB composites |
| `Flood monitoring river basin` | Sentinel-2/Landsat flood imagery |

---

## 🚢 Deployment

### Backend (Render)
1. Push to GitHub
2. Create a new Web Service on [Render](https://render.com)
3. Set build command: `cd backend && npm install && npx prisma generate`
4. Set start command: `cd backend && node dist/index.js`
5. Add environment variables (DATABASE_URL, JWT_SECRET, CORS_ORIGIN)
6. Enable HTTPS (automatic on Render)

### Frontend (Vercel)
1. Push to GitHub
2. Import project on [Vercel](https://vercel.com)
3. Set root directory to `frontend`
4. Add environment variable: `NEXT_PUBLIC_API_URL=<your-backend-url>`

### Post-Deployment Checklist
- [ ] Set strong JWT_SECRET in production
- [ ] Configure CORS_ORIGIN to your Vercel domain
- [ ] Create admin user for ingestion
- [ ] Run sample data ingestion
- [ ] Build embeddings index
- [ ] Verify rate limiting is active
- [ ] Test authentication flow

---

## 📊 Usage Flow

```
┌─────────────────────────────────────────────────────────┐
│  User Input: "urban expansion near Jaipur"              │
├─────────────────────────────────────────────────────────┤
│  1. Query Sanitization (SQL injection, XSS prevention)  │
│  2. Rate Limit Check (30 searches per 5 min)            │
│  3. Tokenization → ["urban", "expansion", "jaipur"]     │
│  4. Semantic Expansion → +["city growth", "built-up",   │
│     "rajasthan", "semi-arid", "india"]                  │
│  5. TF-IDF Vector Similarity against dataset corpus     │
│  6. Spatial Filter (if bbox provided)                   │
│  7. Temporal Filter (if dates provided)                 │
│  8. Ranked Results with relevance scores                │
│  9. Map Visualization with dataset footprints           │
│  10. Search logged with user ID and IP                  │
└─────────────────────────────────────────────────────────┘
```

---

## 📜 License

MIT License — Use freely for research and commercial purposes.

---

## 👥 Intended Users

- **Researchers** — Quick discovery of EO datasets for studies
- **Students** — Learning remote sensing with accessible data
- **Disaster Management Teams** — Rapid assessment of available imagery
- **Policy Makers** — Evidence-based environmental monitoring

> ⚠️ **Not for operational disaster response.** Always cross-reference with official agency portals (NASA Earthdata, Copernicus, ISRO Bhuvan) for critical decisions.

---

Built with ❤️ for Earth observation researchers and environmental decision-makers.
