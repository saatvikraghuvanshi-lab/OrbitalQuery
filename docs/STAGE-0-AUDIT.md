# Stage 0 — Engineering Audit Report

**Date:** 2026-08-21
**Branch:** `feature/orbitalquery-2`
**Baseline Tag:** `baseline-pre-eo-analysis`
**Auditor:** Buffy (Codebuff)

---

## A. Current Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    ORBITALQUERY                          │
│                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────┐ │
│  │   Frontend    │    │   Backend    │    │  SQLite   │ │
│  │  Next.js 14   │◄──►│  Express.js  │◄──►│  Prisma   │ │
│  │  React 18     │    │  TypeScript  │    │  dev.db   │ │
│  │  Tailwind CSS │    │  Node.js    │    │           │ │
│  └──────┬───────┘    └──────┬───────┘    └───────────┘ │
│         │                    │                           │
│    ┌────┴────┐          ┌───┴────┐                      │
│    │ Leaflet │          │ STAC   │                      │
│    │ react-  │          │ Engine │                      │
│    │ leaflet │          │        │                      │
│    └────┬────┘          └───┬────┘                      │
│         │                    │                           │
│    ┌────┴────┐          ┌───┴─────────────┐             │
│    │ Map Tiles│         │ AWS Earth Search │             │
│    │ CARTO/OSM│         │ STAC API v1      │             │
│    │ Esri     │         │ (Free, no key)   │             │
│    └──────────┘         └─────────────────┘             │
└─────────────────────────────────────────────────────────┘
```

---

## B. Current Request Flow

```
User types query → SearchBar component
  → handleSearch() in page.tsx
    → POST /api/search (via Next.js proxy to localhost:3001)
      → Express route: search.ts
        → sanitize middleware (SQL injection, XSS, length limits)
        → optionalAuth middleware (JWT if provided)
        → searchLimiter (30 req/5min)
        → Prisma: findMany with WHERE clause (provider, collection, bbox, dates)
        → SemanticSearchEngine.search(query, candidates, limit)
          → Tokenize query → expand synonyms → compute TF-IDF scores
          → Score each dataset → sort by relevance → return top N
        → Log search to SearchLog table (async)
      → Return JSON { results, total, limit, offset, latencyMs }
    → Frontend: setResults(data)
  → MapView renders GeoJSON footprints
  → ResultsList renders ranked cards
```

---

## C. Existing Data Flow

```
Data Ingestion (CLI script or API endpoint):
  ingest-real.ts (or POST /api/ingest/real)
    → Fetch from AWS Earth Search STAC API
    → Parse STAC items → extract geometry, metadata, preview URLs
    → Store in SQLite via Prisma EODataset model
    → Index: stacId (unique), provider, collection, centroidLat/Lng

Search-time:
  SQLite query → filter by bbox, provider, collection, dates
    → Fetch up to 500 candidates
    → Parse JSON fields (geometry, bbox, assets)
    → TF-IDF semantic scoring in-memory
    → Return scored results
```

---

## D. Existing STAC Flow

```
1. User runs ingestion script or API endpoint
2. Script calls STAC search endpoint:
   POST https://earth-search.aws.element84.com/v1/search
   Body: { collections: ["sentinel-2-l2a"], limit: 50 }
3. STAC API returns GeoJSON FeatureCollection
4. For each Feature:
   - Extract: id, geometry, bbox, properties (datetime, cloud_cover, etc.)
   - Extract: assets (rendered_preview, thumbnail URLs)
   - Map to EODataset schema
   - Store in SQLite via Prisma
5. Frontend displays results from SQLite (NOT live STAC)
```

**Key insight:** STAC data is ingested once into SQLite. Search is against SQLite, not live STAC API.

---

## E. Important Files and Responsibilities

### Backend

| File | Responsibility |
|------|---------------|
| `backend/src/index.ts` | Express server setup, middleware chain, route mounting, startup |
| `backend/src/routes/search.ts` | POST /api/search, GET /providers, GET /collections |
| `backend/src/routes/datasets.ts` | GET /api/datasets, GET /datasets/:id, GET /datasets/stats |
| `backend/src/routes/ingest.ts` | POST /ingest/real, /ingest/sample, /ingest/embeddings |
| `backend/src/routes/auth.ts` | POST /register, /login, GET /me, POST /refresh |
| `backend/src/services/search-engine.ts` | TF-IDF + synonym expansion semantic search |
| `backend/src/services/embeddings.ts` | TF-IDF vectorizer, index build/query |
| `backend/src/services/ingestion.ts` | STAC API client → Prisma ingestion |
| `backend/src/middleware/auth.ts` | JWT generation/verification, bcrypt, requireAuth/optionalAuth/requireAdmin |
| `backend/src/middleware/rate-limit.ts` | 4 rate limiters (api, search, auth, ingest) |
| `backend/src/middleware/sanitize.ts` | SQL injection/XSS prevention, bbox/date validation |
| `backend/src/scripts/ingest-real.ts` | CLI: ingest from AWS Earth Search STAC API |
| `backend/src/scripts/ingest-sample.ts` | CLI: load 16 curated sample datasets |
| `backend/prisma/schema.prisma` | Database schema: User, EODataset, SearchLog |
| `backend/stress-test/k6-search.js` | k6 load test: 1000+ queries |
| `backend/stress-test/postman-collection.json` | Postman collection with 15 pre-configured tests |

### Frontend

| File | Responsibility |
|------|---------------|
| `frontend/app/page.tsx` | Main page: state management, search orchestration, export, compare mode |
| `frontend/app/layout.tsx` | Root layout, metadata, Leaflet CSS CDN link |
| `frontend/app/globals.css` | Tailwind imports, glass morphism, starfield, scrollbar, shimmer |
| `frontend/components/SearchBar.tsx` | Search input, autocomplete suggestions (60+ pre-built queries), keyboard nav |
| `frontend/components/FilterPanel.tsx` | Date range, provider, collection filters |
| `frontend/components/MapView.tsx` | Leaflet map: 5 tile styles, GeoJSON footprints, draw BBOX, zoom-to-selected |
| `frontend/components/ResultsList.tsx` | Ranked dataset cards, detail view, prev/next navigation |
| `frontend/components/DatasetDetail.tsx` | Metadata/preview/download tabs, external links to data portals |
| `frontend/components/StatsBar.tsx` | Result count, latency display |
| `frontend/components/Header.tsx` | App header with logo, nav, status indicator |
| `frontend/components/MockInitializer.tsx` | Installs mock API interceptors |
| `frontend/lib/mock-api.ts` | Mock API: 8 sample datasets, intercepts fetch when backend offline |
| `frontend/next.config.js` | Image domains, API proxy rewrites to backend:3001 |

---

## F. Existing APIs

### Public (no auth required)

| Endpoint | Method | Description | Rate Limit |
|----------|--------|-------------|------------|
| `/api/health` | GET | Health check | 100/15min |
| `/api/search` | POST | Semantic search | 30/5min |
| `/api/search/providers` | GET | List distinct providers | 100/15min |
| `/api/search/collections` | GET | List distinct collections | 100/15min |
| `/api/datasets` | GET | List datasets (paginated) | 100/15min |
| `/api/datasets/:id` | GET | Get single dataset | 100/15min |
| `/api/datasets/stats/overview` | GET | Aggregation stats | 100/15min |
| `/api/auth/register` | POST | Create account | 100/15min |
| `/api/auth/login` | POST | Login (get JWT) | 10/15min |
| `/api/ingest/real` | POST | Trigger ingestion (dev) | 5/hour |

### Auth Required (JWT Bearer token)

| Endpoint | Method | Description | Role |
|----------|--------|-------------|------|
| `/api/auth/me` | GET | Get current user | any |
| `/api/auth/refresh` | POST | Refresh token | any |
| `/api/ingest/planetary-computer` | POST | Trigger ingestion | admin |
| `/api/ingest/embeddings` | POST | Build search index | admin |
| `/api/ingest/sample` | POST | Load sample data | admin |

---

## G. Existing External Services

| Service | Purpose | Auth Required | Status |
|---------|---------|---------------|--------|
| AWS Earth Search STAC API | Data ingestion | ❌ No | ✅ Active |
| CARTO basemaps | Map tiles (dark, voyager) | ❌ No | ✅ Active |
| OpenStreetMap | Map tiles (streets) | ❌ No | ✅ Active |
| Esri World Imagery | Map tiles (satellite) | ❌ No | ✅ Active |
| Copernicus Browser | Dataset browsing links | ❌ No (browse) | ✅ Links only |
| USGS EarthExplorer | Landsat download links | ❌ No (browse) | ✅ Links only |
| Google Fonts (Inter, JetBrains Mono) | Typography | ❌ No | ✅ Active |

---

## H. Existing Technical Debt

1. **Stale Planetary Computer references** — `ingestion.ts` service still uses `STAC_API = process.env.STAC_API_URL || 'planetarycomputer.microsoft.com/...'` but `ingest-real.ts` CLI uses AWS Earth Search. The API endpoints in `ingest.ts` route still reference `ingestFromPlanetaryComputer()`.

2. **TF-IDF only, no vector embeddings** — The "embeddings" service is actually TF-IDF vectors, not true embeddings. The FAISS index is a JSON file with brute-force cosine similarity. No sentence-transformers, no ONNX, no Python integration.

3. **No Python EO analysis** — Currently only searches metadata. No spectral analysis, no NDVI computation, no time-series analysis, no change detection.

4. **Geometry stored as JSON strings** — SQLite stores geometry/bbox as TEXT fields with JSON.stringify/parse. Not spatial-query-optimized (no R-tree, no spatial index).

5. **In-memory search limit** — Search fetches max 500 candidates from SQLite, then scores in JS. With large datasets, this becomes a bottleneck.

6. **No unit/integration tests** — Only k6 stress test and Postman collection exist. No Jest/Mocha/Vitest tests.

7. **No Docker/CI** — No Dockerfile, no GitHub Actions, no CI pipeline.

8. **SearchLog writes fire-and-forget** — `prisma.searchLog.create(...)` is called without await, errors silently swallowed.

9. **Map tile issue** — User-reported persistent issue with Leaflet tiles rendering in patches. Root cause: Tailwind preflight CSS interfering with Leaflet's internal layout.

10. **No GeoTIFF/spectral preview** — Can't visualize actual band compositions, only metadata thumbnails.

---

## I. Risks for Adding Python EO Analysis Service

| Risk | Severity | Mitigation |
|------|----------|------------|
| Python ↔ Node.js communication overhead | Medium | Use HTTP REST or Unix sockets, not stdin/stdout |
| GDAL/rasterio binary dependencies on Windows | High | Use Docker for Python service, or conda |
| Large raster data transfer | High | Process near data (same server), stream results |
| Python process management in production | Medium | Use process manager (PM2, systemd) or containerize |
| Memory usage for large rasters | High | Use Dask/xarray for chunked processing |
| Security: Python eval/code execution | Medium | Sandboxed endpoints, no arbitrary code execution |
| SQLite limitations for spatial queries | Medium | Consider PostGIS for production |
| Dual runtime maintenance (Node + Python) | Medium | Clear API boundary, separate repos or dirs |

---

## J. Recommended Integration Boundary

```
┌─────────────────────────────────────────────────────────┐
│                    PROPOSED ARCHITECTURE                  │
│                                                         │
│  ┌──────────┐     HTTP/REST      ┌──────────────┐      │
│  │  Node.js  │◄─────────────────►│   Python     │      │
│  │  Backend  │   /api/eo/*       │   EO Service │      │
│  │           │                   │   (FastAPI)   │      │
│  │  - Auth   │                   │   Port 8000   │      │
│  │  - Search │                   │               │      │
│  │  - STAC   │                   │  - NDVI calc  │      │
│  │  - CRUD   │                   │  - Change det │      │
│  │           │                   │  - Band math  │      │
│  └─────┬─────┘                   │  - Rasterio   │      │
│        │                         │  - xarray     │      │
│   ┌────┴────┐                    │  - Dask       │      │
│   │ SQLite  │                    └───────┬──────┘      │
│   │ (metadata)                           │              │
│   └────────┘                    ┌────────┴────────┐    │
│                                 │  COG / STAC     │    │
│                                 │  (data access)  │    │
│                                 └─────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

**Integration contract:**
- Node.js calls Python via `POST /api/eo/analyze`
- Python service exposes FastAPI endpoints
- Python reads COG data from S3/STAC asset URLs (no copy needed)
- Results returned as JSON (statistics, thumbnails, GeoJSON)

---

## K. Files That MUST NOT Be Modified Unnecessarily

| File | Reason |
|------|--------|
| `backend/src/middleware/auth.ts` | Security-critical, working correctly |
| `backend/src/middleware/rate-limit.ts` | Security-critical, configured correctly |
| `backend/src/middleware/sanitize.ts` | Security-critical, tested |
| `backend/prisma/schema.prisma` | Schema migrations are destructive |
| `frontend/next.config.js` | Proxy config, image domains — break easily |
| `frontend/app/layout.tsx` | Root layout, breaks entire app if wrong |
| `backend/src/index.ts` | Server entry point — only add routes, don't restructure |

---

## L. Files That Are Safe Extension Points

| File | Safe to extend |
|------|---------------|
| `backend/src/routes/` | Add new route files (e.g., `eo-analysis.ts`) |
| `backend/src/services/` | Add new service files (e.g., `eo-processor.ts`) |
| `backend/src/scripts/` | Add new CLI scripts |
| `frontend/components/` | Add new components |
| `frontend/app/page.tsx` | Add new state/props (carefully) |
| `backend/.env` | Add new env vars |
| `frontend/.env.local` | Add new env vars |
| `README.md` | Documentation |
| `package.json` (root) | Add new scripts |

---

## Audit Summary

**What exists:**
- A working semantic EO dataset search platform
- SQLite + Prisma for metadata storage (~216+ datasets)
- TF-IDF semantic search with synonym expansion
- Leaflet map with 5 tile providers, GeoJSON footprints, draw BBOX
- JWT authentication with role-based access
- Rate limiting, input sanitization, security headers
- Frontend: Next.js 14 + React 18 + Tailwind CSS
- Backend: Express.js + TypeScript
- Mock mode for offline development
- Autocomplete with 60+ pre-built EO queries
- k6 stress test and Postman collection

**What's missing (for EO analysis):**
- No spectral index computation (NDVI, NDWI, EVI)
- No change detection algorithms
- No time-series analysis
- No GeoTIFF/raster processing
- No Python integration
- No real-time STAC search (only pre-ingested data)
- No unit tests
- No CI/CD pipeline

---

## Proposed Future Architecture

```
Phase 1: Python EO Service (FastAPI)
  - NDVI computation from Sentinel-2 bands
  - Change detection (pre/post comparison)
  - Band math operations
  - Health: GET /health
  - Analyze: POST /analyze { type: "ndvi", bbox, dates }

Phase 2: Enhanced STAC Integration
  - Live STAC search (not just pre-ingested)
  - COG (Cloud-Optimized GeoTIFF) streaming
  - STAC item browser

Phase 3: Advanced Visualization
  - Band composition viewer (RGB, false color)
  - Time-series chart component
  - Change detection overlay on map
  - NDVI heatmap layer

Phase 4: Production Hardening
  - Docker containerization
  - GitHub Actions CI/CD
  - Unit/integration tests (Jest + pytest)
  - PostgreSQL migration (with PostGIS)
  - Kubernetes deployment
```

---

## Explicit Assumptions

1. **SQLite is sufficient** for the current scale (< 10,000 datasets). For 100K+ datasets, migrate to PostgreSQL with PostGIS.

2. **Python service will run as a separate process** on the same machine, communicating via HTTP (localhost:8000).

3. **No API keys needed** for core functionality. AWS Earth Search, CARTO, OSM, Esri are all free for this use case.

4. **Google Maps API key in .env.local** is for future use only. Current map uses Leaflet with free tile providers.

5. **The user wants Python EO analysis** added next (NDVI, change detection, band math). This audit prepares for that integration.

6. **Frontend remains Next.js** with React. No framework migration planned.

7. **Backend remains Express.js** with TypeScript. No rewrite to FastAPI (Python service is separate).

8. **Database schema may need additions** (new fields for analysis results) but won't be restructured.

9. **Map tiles issue** (patchy rendering) is a known Leaflet + Tailwind CSS conflict. May need to override Tailwind preflight for Leaflet containers.

10. **Baseline tag `baseline-pre-eo-analysis`** marks the exact state before any EO analysis code is added.

---

## Baseline Test Results (2026-08-21)

| Test | Status |
|------|--------|
| Backend health check | ✅ 200 OK |
| Semantic search | ✅ Returns ranked results |
| Provider list | ✅ 4 providers |
| Collection list | ✅ 7 collections |
| Frontend loads | ✅ 200 OK |
| Map renders | ⚠️ Tile patches (known Leaflet issue) |
| Auth register | ✅ 201 Created |
| Auth login | ✅ Returns JWT |

---

*This audit is the foundation for Stage 1: Python EO Analysis Service integration.*
