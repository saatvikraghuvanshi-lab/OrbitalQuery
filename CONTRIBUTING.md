# Contributing to OrbitalQuery

## Branch Workflow

All changes must go through a feature branch and pull request.

```
git checkout main
git pull
git checkout -b feature/your-task-name
# ... make changes ...
git add .
git commit -m "Description of change"
git push origin feature/your-task-name
# Open a PR on GitHub
```

### Branch Naming

| Prefix | Use Case |
|--------|----------|
| `feature/` | New functionality |
| `fix/` | Bug fixes |
| `chore/` | Tooling, CI, templates |
| `docs/` | Documentation only |
| `refactor/` | Code restructuring |

## Development

### Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev
```

### Backend (Node.js + Express)

```bash
cd backend
npm install
npm run dev
```

### Analysis Service (Python + FastAPI)

```bash
cd analysis-service
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Code Standards

- TypeScript strict mode for frontend
- No hardcoded API URLs (use environment variables)
- No emojis in UI components
- Use the existing OrbitalQuery color system (#050907 background, #9DFF2F accent)
- All dataset records, coordinates, dates, and percentages must come from the API, never hardcoded

## Pull Request Process

1. Create a feature branch from `main`
2. Make focused, single-purpose changes
3. Ensure builds pass before opening PR
4. Write a clear PR description explaining what and why
5. Request a review
6. Address review feedback
7. Merge after approval

## Architecture Overview

- **Frontend**: Next.js 14 + React + Leaflet maps + Tailwind CSS
- **Backend**: Node.js + Express (API gateway + STAC discovery)
- **Analysis**: Python + FastAPI + rasterio + NumPy + scipy
- **Data**: Planetary Computer STAC + Sentinel-2/Landsat imagery
