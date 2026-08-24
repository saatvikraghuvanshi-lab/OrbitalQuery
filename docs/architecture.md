# OrbitalQuery — Architecture & Workflow

---

## 🏗️ Project Structure

```
OrbitalQuery/
├── frontend/                    # Next.js 18 + TypeScript
│   ├── app/                     # App Router (pages)
│   │   ├── page.tsx             # Landing / Ask page
│   │   ├── showcase/            # Showcase tab
│   │   └── discover/            # Dataset browser tab
│   ├── components/              # React components
│   │   ├── SearchBar.tsx        # Natural language search input
│   │   ├── MapView.tsx          # Leaflet.js interactive map
│   │   ├── DatasetCard.tsx      # Dataset result cards
│   │   └── AnalysisPanel.tsx    # Analysis results display
│   ├── hooks/                   # Custom React hooks
│   ├── lib/                     # Utilities & API client
│   ├── public/                  # Static assets
│   ├── next.config.js           # Next.js config + API rewrites
│   ├── vercel.json              # Vercel deployment config
│   └── package.json
│
├── backend/                     # Node.js + Express + TypeScript
│   ├── src/
│   │   ├── index.ts             # Express server entry point
│   │   ├── routes/
│   │   │   ├── search.ts        # POST /api/search (semantic TF-IDF)
│   │   │   ├── datasets.ts      # GET /api/datasets (SQLite CRUD)
│   │   │   ├── auth.ts          # JWT authentication
│   │   │   ├── ingest.ts        # Dataset ingestion endpoints
│   │   │   └── analysis.ts      # Python service gateway routes
│   │   ├── services/
│   │   │   ├── python-client.ts # HTTP client for Python service
│   │   │   ├── stac-search.ts   # STAC catalog search logic
│   │   │   └── semantic.ts      # TF-IDF semantic search engine
│   │   ├── middleware/
│   │   │   ├── auth.ts          # JWT verification middleware
│   │   │   ├── rate-limit.ts    # Express rate limiter
│   │   │   └── request-id.ts    # Request ID tracking
│   │   └── scripts/
│   │       ├── ingest-real.ts   # Ingest from live STAC APIs
│   │       └── ingest-sample.ts # Seed sample datasets
│   ├── prisma/
│   │   ├── schema.prisma        # Database schema (User, EODataset, SearchLog)
│   │   ├── migrations/          # SQLite migration files
│   │   └── dev.db               # Local SQLite database
│   └── package.json
│
├── analysis-service/            # Python 3 + FastAPI
│   ├── app/
│   │   ├── main.py              # FastAPI app entry point
│   │   ├── routes/
│   │   │   ├── stac.py          # /stac/search — STAC catalog queries
│   │   │   ├── timeseries.py    # /analysis/timeseries — temporal datacubes
│   │   │   ├── change.py        # /analysis/change-detect — change detection
│   │   │   ├── preprocess.py    # /analysis/preprocess — data preprocessing
│   │   │   ├── spectral.py      # /analysis/index — spectral indices (NDVI, NDWI, etc.)
│   │   │   ├── flood.py         # /analysis/flood/assess — flood impact
│   │   │   ├── explain.py       # /analysis/explain — deterministic explanations
│   │   │   ├── query.py         # /analysis/query/plan — NL query → analysis plan
│   │   │   └── health.py        # /health — service health check
│   │   ├── services/
│   │   │   ├── stac_client.py   # Planetary Computer / STAC API client
│   │   │   ├── raster.py        # rasterio / rioxarray operations
│   │   │   ├── change_detection.py # NDVI differencing, thresholding
│   │   │   ├── spectral_indices.py # Band math for indices
│   │   │   └── temporal.py      # Time series construction
│   │   └── models/              # Pydantic request/response models
│   └── requirements.txt
│
└── docs/
    ├── architecture.md          # This file
    └── ORBITALQUERY_RESEARCH_REPORT.docx
```

---

## 🔄 System Workflow Diagram

```mermaid
graph TB
    subgraph User["👤 User"]
        U[Browser]
    end

    subgraph Vercel["☁️ Vercel — Frontend"]
        FE["Next.js App<br/>orbital-query.vercel.app"]
    end

    subgraph Render_BE["☁️ Render — Node.js Backend"]
        API["Express API<br/>orbitalquery-backend.onrender.com"]
        SEARCH["Semantic Search<br/>TF-IDF Engine"]
        AUTH["JWT Auth"]
        DB[("SQLite<br/>Prisma ORM")]
    end

    subgraph Render_PY["☁️ Render — Python Analysis"]
        PY["FastAPI<br/>orbitalquery.onrender.com"]
        STAC["STAC Client<br/>Planetary Computer"]
        RASTER["Raster Engine<br/>rasterio + rioxarray"]
        CHANGE["Change Detection<br/>NDVI Differencing"]
        SPECTRAL["Spectral Indices<br/>NDVI / NDWI / NBR"]
    end

    subgraph External["🌐 External APIs"]
        PC["Microsoft Planetary Computer<br/>STAC API"]
        AWS["AWS Earth Search<br/>STAC API"]
        NASA["NASA CMR<br/>STAC API"]
    end

    U -->|Natural Language Query| FE
    FE -->|POST /api/search| API
    FE -->|POST /api/analysis/*| API

    API --> SEARCH
    API --> AUTH
    API --> DB

    SEARCH -->|"query: 'deforestation near Assam'"| DB
    DB -->|Dataset Results| API
    API -->|JSON Response| FE

    API -->|"Analysis requests"| PY
    PY --> STAC
    PY --> RASTER
    PY --> CHANGE
    PY --> SPECTRAL

    STAC --> PC
    STAC --> AWS
    STAC --> NASA

    PY -->|"Analysis Results"| API
    API -->|JSON Response| FE
    FE -->|Map + Charts + Results| U
```

---

## 🔍 Search Workflow (Semantic TF-IDF)

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend
    participant BE as Node Backend
    participant DB as SQLite
    participant PY as Python Service

    User->>FE: "deforestation near Assam 2015-2020"
    FE->>BE: POST /api/search

    Note over BE: 1. Tokenize query<br/>2. Remove stop words<br/>3. Expand terms:<br/>  "deforestation" → "forest loss, tree cover"<br/>  "Assam" → "Brahmaputra, NE India"

    BE->>DB: TF-IDF cosine similarity
    DB-->>BE: Ranked datasets with scores

    Note over BE: Score = Core TF-IDF 40%<br/>       + Expanded terms 40%<br/>       + Title match 20%

    BE-->>FE: { results: [...], total, latencyMs }
    FE-->>User: Map pins + dataset cards
```

---

## 🛰️ Analysis Workflow (Python Service)

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend
    participant BE as Node Backend
    participant PY as Python Service
    participant STAC as Planetary Computer

    User->>FE: Draw bbox on map + select date range
    FE->>BE: POST /api/analysis/search-scenes
    BE->>PY: POST /stac/search

    PY->>STAC: Query STAC catalog<br/>(bbox, dates, collection, cloud cover)
    STAC-->>PY: Scene results

    PY-->>BE: { items: [...], total }
    BE-->>FE: Filtered scene list

    User->>FE: Click "Analyze"
    FE->>BE: POST /api/analysis/timeseries
    BE->>PY: POST /analysis/timeseries

    Note over PY: 1. Fetch raster data (rioxarray)<br/>2. Compute spectral indices<br/>3. Build temporal datacube<br/>4. Calculate statistics

    PY-->>BE: { cube_shape, band_stats, dates }
    BE-->>FE: Time series chart + metrics

    User->>FE: "Compare 2018 vs 2024"
    FE->>BE: POST /api/analysis/change-detect
    BE->>PY: POST /analysis/change-detect

    Note over PY: 1. NDVI differencing<br/>2. Thresholding (0.2)<br/>3. Region labeling<br/>4. Area calculation

    PY-->>BE: { changed_pct, regions, stats }
    BE-->>FE: Change map + decision insights
```

---

## 🗄️ Database Schema

```mermaid
erDiagram
    USER {
        uuid id PK
        string email UK
        string password
        string name
        string role "researcher | admin"
        datetime created_at
        datetime updated_at
    }

    EO_DATASET {
        uuid id PK
        string stac_id UK
        string title
        string description
        string provider
        string collection
        string platform
        string instrument
        float gsd
        float cloud_cover
        string geometry "GeoJSON"
        string bbox "JSON array"
        float centroid_lat
        float centroid_lng
        string start_date
        string end_date
        string assets "JSON"
        string capabilities "JSON"
        bool has_embedding
        datetime created_at
        datetime updated_at
    }

    SEARCH_LOG {
        uuid id PK
        string query
        string filters "JSON"
        int result_count
        int latency_ms
        string user_id FK
        string ip_address
        datetime created_at
    }

    USER ||--o{ SEARCH_LOG : "searches"
    EO_DATASET ||--o{ SEARCH_LOG : "returns"
```

---

## 🌍 Deployment Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        DEPLOYMENT MAP                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐     ┌──────────────────┐                   │
│  │     Vercel       │     │     Render        │                   │
│  │                  │     │                   │                   │
│  │  ┌────────────┐ │     │  ┌──────────────┐ │                   │
│  │  │  Next.js    │ │────▶│  │  Node.js     │ │                   │
│  │  │  Frontend   │ │     │  │  Express API │ │                   │
│  │  │  Port 3000  │ │     │  │  Port 3001   │ │                   │
│  │  └────────────┘ │     │  └──────┬───────┘ │                   │
│  └─────────────────┘     │         │         │                   │
│                          │  ┌──────▼───────┐ │                   │
│                          │  │  Python      │ │                   │
│                          │  │  FastAPI     │ │                   │
│                          │  │  Port 8000   │ │                   │
│                          │  └──────┬───────┘ │                   │
│                          │         │         │                   │
│                          │  ┌──────▼───────┐ │                   │
│                          │  │  SQLite DB   │ │                   │
│                          │  │  (Prisma)    │ │                   │
│                          │  └──────────────┘ │                   │
│                          └──────────────────┘                   │
│                                  │                               │
│                          ┌───────▼────────┐                     │
│                          │  External APIs  │                     │
│                          │  • Planetary    │                     │
│                          │    Computer     │                     │
│                          │  • AWS Earth    │                     │
│                          │    Search       │                     │
│                          │  • NASA CMR     │                     │
│                          └────────────────┘                     │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```
