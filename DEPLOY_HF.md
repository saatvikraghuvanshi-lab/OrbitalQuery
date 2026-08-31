# OrbitalQuery — HuggingFace Spaces + Render Deployment Guide

## Architecture

```
Vercel (Frontend)          Render (Backend)         HuggingFace Spaces (Python)
┌─────────────────┐       ┌─────────────────┐       ┌──────────────────────┐
│  Next.js :3000  │──────▶│  Node.js :3001  │──────▶│  FastAPI :8000        │
│  orbitalquery-  │ proxy │  Express API    │ call  │  STAC + Analysis      │
│  frontend.vercel│       │  SQLite + Auth  │       │  EO Providers         │
└─────────────────┘       └─────────────────┘       └──────────────────────┘
```

## Prerequisites

- GitHub account
- Vercel account (free tier works)
- Render account (free tier works)
- HuggingFace account (free tier works — 2vCPU, 16GB RAM, no sleep)

---

## STEP 1: Push to GitHub

```bash
cd OrbitalQuery
git add -A
git commit -m "Production deployment"
git push origin main
```

---

## STEP 2: Deploy Python Analysis Service (HuggingFace Spaces)

### 2a. Create HuggingFace Space

1. Go to **huggingface.co** → Sign in with GitHub
2. Click your profile → **New Space**
3. Fill in:
   - **Space name:** `orbitalquery-analysis`
   - **License:** MIT
   - **Select template:** `Docker`
4. Click **Create Space**

### 2b. Connect GitHub Repository

1. In your new Space → **Settings** → **Git repository**
2. Connect the same `OrbitalQuery` GitHub repository
3. Set **Root directory** to `analysis-service`
4. Click **Save**

> **Note:** The `analysis-service` folder already contains:
> - `Dockerfile` — builds the FastAPI service
> - `README.md` — HuggingFace Space configuration with `sdk: docker`
> - `requirements.txt` — Python dependencies

### 2c. Set Environment Variables

In HuggingFace Space → **Settings** → **Variables and secrets**:

```
STAC_API_URL=https://planetarycomputer.microsoft.com/api/stac/v1
```

Optional (if you have credentials):
```
COPERNICUS_TOKEN=<your-token>
BHOONIDHI_USER=<your-user>
BHOONIDHI_PASS=<your-pass>
```

### 2d. Deploy

1. Go to the **"Build & Debug"** tab
2. HuggingFace will automatically build the Docker image (takes 3-5 minutes on first build)
3. Wait for the build to complete and the status to show **Running**

### 2e. Get Service URL

After deployment, HuggingFace gives you a URL like:
```
https://saatvikraghuvanshi-orbitalquery-analysis.hf.space
```

**Copy this URL** — you'll need it for the backend.

### 2f. Verify

```bash
curl https://saatvikraghuvanshi-orbitalquery-analysis.hf.space/health
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
PYTHON_SERVICE_URL=https://saatvikraghuvanshi-orbitalquery-analysis.hf.space
DATABASE_URL=file:./prisma/prod.db
STAC_API_URL=https://planetarycomputer.microsoft.com/api/stac/v1
```

> ⚠️ Replace `saatvikraghuvanshi-orbitalquery-analysis` with your actual HuggingFace Space username and name.

### 3d. Deploy

Click **"Create Web Service"**. Wait for build.

### 3e. Get Service URL

Render gives you a URL like:
```
https://orbitalquery-backend.onrender.com
```

**Copy this URL** — you'll need it for Vercel.

### 3f. Verify

```bash
curl https://orbitalquery-backend.onrender.com/api/health
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

### 4e. Get Your App URL

Vercel gives you:
```
https://orbitalquery-frontend.vercel.app
```

**This is your live app!**

### 4f. Update Backend CORS

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
curl https://saatvikraghuvanshi-orbitalquery-analysis.hf.space/health
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
| Frontend shows "Backend is unreachable" | Check `NEXT_PUBLIC_BACKEND_URL` matches Render URL |
| CORS error in browser | Update `CORS_ORIGIN` in Render to match Vercel URL exactly |
| Python service timeout | HF Spaces has 5-min timeout — check space logs if queries are larger |
| HuggingFace build fails | Check Space logs → Build tab for pip install errors |
| Backend cannot reach HF Space | Check `PYTHON_SERVICE_URL` in Render env vars |
| Prisma error | Ensure `npx prisma generate` is in the build command |
| Map tiles not loading | Check if CARTO/OSM tile URLs are accessible from your network |

---

## Cost Estimate

| Service | Tier | Cost |
|---|---|---|
| Vercel (Frontend) | Hobby | **Free** |
| Render (Backend) | Free | **Free** |
| HuggingFace Spaces (Python) | Free CPU | **Free** (2vCPU, 16GB RAM) |
| **Total** | | **$0/month** |

---

## Why HuggingFace Spaces?

Render free tier:
- 512MB RAM → OOM crashes on raster processing
- Sleeps after 15 minutes of inactivity → cold start 503s
- Process killed if request takes > 60s

HuggingFace Spaces free tier:
- 2vCPU + 16GB RAM → no OOM for Sentinel-2 windows
- Never sleeps → no cold starts
- 5-minute timeout → enough for most analysis queries
- Docker-based → full control over environment

---

## Updating After Deploy

```bash
# Push to GitHub — Vercel, Render, and HuggingFace auto-deploy on push
git add -A
git commit -m "Update feature"
git push origin main
# Wait 2-5 minutes for all services to rebuild
```
