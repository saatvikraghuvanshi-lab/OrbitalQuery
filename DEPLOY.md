# OrbitalQuery — Deployment Guide

## Option A: Vercel + Railway (Default)

See the original Railway deployment below. Note: Railway free tier has 512MB RAM and sleeps after 15 minutes of inactivity.

## Option B: Vercel + Render + HuggingFace Spaces (Recommended for Free Tier)

**This is the recommended deployment for free hosting.** HuggingFace Spaces provides 2vCPU + 16GB RAM and never sleeps.

See **[DEPLOY_HF.md](./DEPLOY_HF.md)** for the full step-by-step guide.

Quick overview:
1. Deploy Python analysis service to **HuggingFace Spaces** (Docker space, 16GB RAM, no sleep)
2. Deploy Node.js backend to **Render** (free tier)
3. Deploy frontend to **Vercel** (free tier)
4. Update backend `PYTHON_SERVICE_URL` to point to HuggingFace Space

---

# OrbitalQuery — Vercel + Railway Deployment Guide

## Architecture

```
Vercel (Frontend)          Railway (Backend)         Railway (Python)
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│  Next.js :3000  │──────▶│  Node.js :3001  │──────▶│  FastAPI :8000  │
│  orbitalquery-  │ proxy │  Express API    │ call  │  STAC + Analysis│
│  frontend.vercel│       │  SQLite + Auth  │       │  EO Providers   │
└─────────────────┘       └─────────────────┘       └─────────────────┘
```

## Prerequisites

- GitHub account
- Vercel account (free tier works)
- Railway account (free tier: $5/month credit)

---

## STEP 1: Push to GitHub

```bash
cd OrbitalQuery
git add -A
git commit -m "Production deployment"
git push origin main
```

---

## STEP 2: Deploy Python Analysis Service (Railway)

### 2a. Create Railway Project

1. Go to **railway.app** → Sign in with GitHub
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select your `OrbitalQuery` repository
4. Railway will detect the monorepo — when prompted, set **Root Directory** to `analysis-service`

### 2b. Configure Build Settings

Railway should auto-detect Python. If not, set:

- **Root Directory:** `analysis-service`
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

### 2c. Set Environment Variables

In Railway → your service → **Variables** tab:

```
STAC_API_URL=https://planetarycomputer.microsoft.com/api/stac/v1
```

### 2d. Deploy

Click **"Deploy"**. Wait for the build to complete.

### 2e. Get Service URL

After deployment, Railway gives you a URL like:
```
https://orbitalquery-analysis-xxxx.up.railway.app
```

**Copy this URL** — you'll need it for the backend.

### 2f. Verify

```bash
curl https://orbitalquery-analysis-xxxx.up.railway.app/health
# Should return: {"status": "ok", ...}
```

---

## STEP 3: Deploy Node.js Backend (Railway)

### 3a. Add New Service

1. In the same Railway project, click **"+ New"** → **"GitHub Repo"**
2. Select the same `OrbitalQuery` repository
3. Set **Root Directory** to `backend`

### 3b. Configure Build Settings

- **Root Directory:** `backend`
- **Build Command:** `npm install && npx prisma generate && npx tsc`
- **Start Command:** `node dist/index.js`

### 3c. Set Environment Variables

In Railway → this service → **Variables** tab:

```
PORT=3001
CORS_ORIGIN=https://orbitalquery-frontend.vercel.app
JWT_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
PYTHON_SERVICE_URL=https://orbitalquery-analysis-xxxx.up.railway.app
DATABASE_URL=file:./prisma/prod.db
STAC_API_URL=https://planetarycomputer.microsoft.com/api/stac/v1
```

> ⚠️ Replace `orbitalquery-frontend.vercel.app` with your actual Vercel URL (from Step 4).
> ⚠️ Replace `orbitalquery-analysis-xxxx` with your actual Python service URL (from Step 2e).
> ⚠️ Generate a real JWT_SECRET — never use the default.

### 3d. Deploy

Click **"Deploy"**. Wait for build.

### 3e. Get Service URL

Railway gives you a URL like:
```
https://orbitalquery-backend-xxxx.up.railway.app
```

**Copy this URL** — you'll need it for Vercel.

### 3f. Verify

```bash
curl https://orbitalquery-backend-xxxx.up.railway.app/api/health
# Should return: {"status":"ok","service":"orbital-query-backend",...}
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
NEXT_PUBLIC_BACKEND_URL=https://orbitalquery-backend-xxxx.up.railway.app
```

> ⚠️ `NEXT_PUBLIC_API_URL` should be **empty** — the Vercel rewrites in `vercel.json` proxy `/api/*` to Railway.

### 4c. Update vercel.json

Before deploying, update the rewrite URL in `frontend/vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://orbitalquery-backend-xxxx.up.railway.app/api/:path*"
    }
  ]
}
```

> ⚠️ Replace with your actual Railway backend URL.

### 4d. Deploy

Click **"Deploy"**. Vercel builds and deploys automatically.

### 4e. Get Your App URL

Vercel gives you:
```
https://orbitalquery-frontend.vercel.app
```

**This is your live app!**

### 4f. Update Backend CORS

Go back to Railway backend → Variables → update:

```
CORS_ORIGIN=https://orbitalquery-frontend.vercel.app
```

Redeploy the backend service.

---

## STEP 5: Final Verification

### 5a. Configure Keep-Alive Secrets (GitHub Actions)
The keep-alive workflow needs your actual Render/Railway service URLs to ping them every 10 minutes and prevent cold starts.

1. Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Add:
   - Name: `PYTHON_SERVICE_URL`
     Value: `https://<your-python-service-url>` (without trailing slash)
   - Name: `BACKEND_SERVICE_URL`
     Value: `https://<your-backend-service-url>` (without trailing slash)
4. Save both secrets

The workflow will now ping the correct services instead of hardcoded placeholder URLs.

### 5b. Test the full pipeline:

```bash
# 1. Frontend loads
curl -o /dev/null -w "%{http_code}" https://orbitalquery-frontend.vercel.app
# Should return: 200

# 2. Backend health
curl https://orbitalquery-backend-xxxx.up.railway.app/api/health
# Should return: {"status":"ok",...}

# 3. Python health
curl https://orbitalquery-analysis-xxxx.up.railway.app/health
# Should return: {"status":"ok",...}

# 4. Auth flow (register)
curl -X POST https://orbitalquery-frontend.vercel.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123","name":"Test User"}'

# 5. Temporal comparison (the hero feature)
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
| Frontend shows "Backend is unreachable" | Check `NEXT_PUBLIC_BACKEND_URL` matches Railway URL |
| CORS error in browser | Update `CORS_ORIGIN` in Railway to match Vercel URL exactly |
| Python service timeout / 503 | Ensure `PYTHON_SERVICE_URL` and `BACKEND_SERVICE_URL` GitHub secrets are set for keep-alive workflow |
| Auth "Network error" | Check Railway backend logs: Railway → Service → Deployments → Logs |
| Build fails on Railway | Check Node version — add `NODE_VERSION=18` to env vars |
| Prisma error | Ensure `npx prisma generate` is in the build command |
| Map tiles not loading | Check if CARTO/OSM tile URLs are accessible from your network |

---

## Cost Estimate

| Service | Tier | Cost |
|---|---|---|
| Vercel (Frontend) | Hobby | **Free** |
| Railway (Backend) | Hobby | **$5/month credit** (covers light usage) |
| Railway (Python) | Hobby | Shares the $5 credit |
| **Total** | | **~$0-5/month** |

---

## Updating After Deploy

```bash
# Just push to GitHub — both Vercel and Railway auto-deploy on push
git add -A
git commit -m "Update feature"
git push origin main
# Wait 1-2 minutes for both services to rebuild and deploy
```

---

## Architecture Diagram

```
                         USER
                          │
                          ▼
              ┌───────────────────────┐
              │   Vercel (Frontend)   │
              │   Next.js + React     │
              │   Leaflet Maps        │
              │   ShaderGradient      │
              └───────────┬───────────┘
                          │ /api/* rewrite
                          ▼
              ┌───────────────────────┐
              │  Railway (Backend)    │
              │  Express + Prisma     │
              │  Auth (JWT)           │
              │  SQLite Database      │
              └───────────┬───────────┘
                          │ HTTP
                          ▼
              ┌───────────────────────┐
              │  Railway (Python)     │
              │  FastAPI              │
              │  STAC Search          │
              │  Spectral Indices     │
              │  Change Detection     │
              └───────────┬───────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │   EO Providers        │
              │   Planetary Computer  │
              │   AWS Earth Search    │
              │   Copernicus CDSE     │
              │   NASA CMR            │
              └───────────────────────┘
```
