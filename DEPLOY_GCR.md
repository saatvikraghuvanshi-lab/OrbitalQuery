# OrbitalQuery — Google Cloud Run + Render Deployment Guide

## Architecture

```
Vercel (Frontend)          Render (Backend)         Google Cloud Run (Python)
┌─────────────────┐       ┌─────────────────┐       ┌──────────────────────┐
│  Next.js :3000  │──────▶│  Node.js :3001  │──────▶│  FastAPI :8000        │
│  orbitalquery-  │ proxy │  Express API    │ call  │  STAC + Analysis      │
│  frontend.vercel│       │  SQLite + Auth  │       │  EO Providers         │
└─────────────────┘       └─────────────────┘       └──────────────────────┘
```

## Why Google Cloud Run?

- **Free tier:** 2M requests/month, 1 vCPU, 512MB RAM, 1GB egress
- **No sleep** — always warm
- **Docker-based** — uses the existing `analysis-service/Dockerfile`
- **Auto-scaling** — scales to zero when idle, scales up on demand
- **No credit card required** for the free tier

---

## Prerequisites

- GitHub account
- Vercel account (free)
- Render account (free)
- Google Cloud account (free tier — no credit card needed for initial setup)

---

## STEP 1: Push to GitHub

```bash
cd OrbitalQuery
git add -A
git commit -m "Production deployment"
git push origin main
```

---

## STEP 2: Deploy Python Analysis Service (Google Cloud Run)

### 2a. Create a Google Cloud Project

1. Go to https://console.cloud.google.com
2. Sign in with your Google account
3. Click the project dropdown → **New Project**
4. Name it `orbitalquery-analysis`
5. Click **Create**

### 2b. Enable Required APIs

In the Google Cloud Console, enable these APIs:
1. Go to **APIs & Services** → **Library**
2. Search for and enable:
   - **Cloud Build API**
   - **Cloud Run API**
   - **Container Registry API**
3. Click **Enable** for each

### 2c. Deploy Using Google Cloud CLI

Install the Google Cloud CLI from https://cloud.google.com/sdk/docs/install

Then run these commands in your terminal:

```bash
# 1. Login to Google Cloud
gcloud auth login

# 2. Set your project ID (replace with your actual project ID from 2a)
gcloud config set project orbitalquery-analysis

# 3. Build and deploy the analysis service
gcloud run deploy orbitalquery-analysis \
  --source analysis-service \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300s \
  --max-instances 1 \
  --set-env-vars "STAC_API_URL=https://planetarycomputer.microsoft.com/api/stac/v1,ENVIRONMENT=production"
```

### 2d. Get Service URL

After deployment completes, you'll see output like:
```
Service URL: https://orbitalquery-analysis-xxxxxx-uc.a.run.app
```

**Copy this URL** — you'll need it for the backend.

### 2e. Verify

```bash
curl https://orbitalquery-analysis-xxxxxx-uc.a.run.app/health
# Should return: {"status":"ok",...}
```

---

## STEP 3: Deploy Node.js Backend (Render)

### 3a. Create Render Service

1. Go to **render.com** → Sign in with GitHub
2. Click **"New"** → **"Web Service"**
3. Select your `OrbitalQuery` repository
4. Set **Root Directory** to `backend`

### 3b. Configure Build Settings

- **Root Directory:** `backend`
- **Build Command:** `npm install && npx prisma generate && npx tsc`
- **Start Command:** `node dist/index.js`

### 3c. Set Environment Variables

In Render → your service → **Environment** tab:

```
PORT=3001
CORS_ORIGIN=https://orbitalquery-frontend.vercel.app
JWT_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
PYTHON_SERVICE_URL=https://orbitalquery-analysis-xxxxxx-uc.a.run.app
DATABASE_URL=file:./prisma/prod.db
STAC_API_URL=https://planetarycomputer.microsoft.com/api/stac/v1
```

> ⚠️ Replace `orbitalquery-analysis-xxxxxx-uc.a.run.app` with your actual Cloud Run URL from Step 2d.

### 3d. Deploy

Click **"Create Web Service"**. Wait for build.

### 3e. Get Service URL

Render gives you a URL like:
```
https://orbitalquery-backend.onrender.com
```

---

## STEP 4: Deploy Frontend (Vercel)

### 4a. Import Project

1. Go to **vercel.com** → Sign in with GitHub
2. Click **"Add New..."** → **"Project"**
3. Import your `OrbitalQuery` repository
4. Configure:
   - **Framework Preset:** Next.js
   - **Root Directory:** `frontend`
   - **Build Command:** `npm run build`
   - **Output Directory:** `.next`

### 4b. Set Environment Variables

In Vercel → your project → **Settings** → **Environment Variables**:

```
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_USE_MOCKS=false
NEXT_PUBLIC_BACKEND_URL=https://orbitalquery-backend.onrender.com
```

> ⚠️ `NEXT_PUBLIC_API_URL` should be **empty** — the Vercel rewrites in `vercel.json` proxy `/api/*` to Render.

### 4c. Update vercel.json

Before deploying, update the rewrite URL in `frontend/vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://orbitalquery-backend.onrender.com/api/:path*"
    }
  ]
}
```

> ⚠️ Replace with your actual Render backend URL.

### 4d. Deploy

Click **"Deploy"**. Vercel builds and deploys automatically.

### 4e. Update Backend CORS

Go back to Render backend → Environment → update:

```
CORS_ORIGIN=https://orbitalquery-frontend.vercel.app
```

Redeploy the backend service.

---

## STEP 5: Final Verification

### Test the full pipeline:

```bash
# 1. Frontend loads
curl -o /dev/null -w "%{http_code}" https://orbitalquery-frontend.vercel.app
# Should return: 200

# 2. Backend health
curl https://orbitalquery-backend.onrender.com/api/health
# Should return: {"status":"ok",...}

# 3. Python health
curl https://orbitalquery-analysis-xxxxxx-uc.a.run.app/health
# Should return: {"status":"ok",...}

# 4. Temporal comparison (the hero feature)
curl -X POST https://orbitalquery-frontend.vercel.app/api/analysis/temporal-compare \
  -H "Content-Type: application/json" \
  -d '{"query":"Hyderabad urban expansion 2021 vs 2025"}'
```

### Test in browser:

1. Open `https://orbitalquery-frontend.vercel.app`
2. See the animated ShaderGradient background
3. Click "Showcase" → pick "Hyderabad urban expansion 2021 vs 2025"
4. See real satellite imagery, before/after maps, change metrics
5. Click "Discover" → draw a bbox on the map → see STAC results

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Frontend shows "Backend is unreachable" | Check `NEXT_PUBLIC_BACKEND_URL` matches Render URL |
| CORS error in browser | Update `CORS_ORIGIN` in Render to match Vercel URL exactly |
| Cloud Run returns 502/504 | Increase timeout in Cloud Run: `gcloud run services update ... --timeout 300s` |
| Python service cold start | Cloud Run free tier doesn't sleep; first request may take 30-60s to build |
| Backend cannot reach Cloud Run | Check `PYTHON_SERVICE_URL` in Render env vars |
| Prisma error | Ensure `npx prisma generate` is in the build command |
| Map tiles not loading | Check if CARTO/OSM tile URLs are accessible from your network |

---

## Cost Estimate

| Service | Tier | Cost |
|---|---|---|
| Vercel (Frontend) | Hobby | **Free** |
| Render (Backend) | Free | **Free** |
| Google Cloud Run (Python) | Free tier | **Free** (2M requests/month, 1 vCPU, 512MB RAM) |
| **Total** | | **$0/month** |

---

## Updating After Deploy

```bash
# Push to GitHub — Vercel and Render auto-deploy on push
git add -A
git commit -m "Update feature"
git push origin main

# For Cloud Run updates, redeploy manually:
gcloud run deploy orbitalquery-analysis \
  --source analysis-service \
  --region us-central1 \
  --platform managed
```
