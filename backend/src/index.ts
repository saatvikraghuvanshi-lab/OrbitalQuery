import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import searchRouter from './routes/search';
import datasetsRouter from './routes/datasets';
import ingestRouter from './routes/ingest';
import authRouter from './routes/auth';
import analysisRouter from './routes/analysis';
import { apiLimiter } from './middleware/rate-limit';
import { requestIdMiddleware } from './middleware/request-id';

// Load .env from backend directory
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });

const DB_PATH = path.join(__dirname, '../prisma/dev.db');

export const prisma = new PrismaClient({
  datasources: { db: { url: `file:${DB_PATH}` } },
});

const app = express();
const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';

// ─── Security ─────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '5mb' }));
// Rate limiter applied per-route (not globally) to avoid blocking analysis gateway
// Analysis routes bypass this since Python service has its own validation
app.set('trust proxy', 1);
app.disable('x-powered-by');

// ─── Root Landing ─────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({
    name: 'OrbitalQuery Backend',
    version: '1.0.0',
    docs: {
      health: 'GET /api/health',
      search: 'POST /api/search',
      providers: 'GET /api/search/providers',
      collections: 'GET /api/search/collections',
      datasets: 'GET /api/datasets',
      analysisSearch: 'POST /api/analysis/search-scenes',
      analysisPreview: 'POST /api/analysis/preview',
      analysisHealth: 'GET /api/analysis/health',
      register: 'POST /api/auth/register',
      login: 'POST /api/auth/login',
    },
    frontend: 'http://localhost:3000',
    github: 'https://github.com/saatvikraghuvanshi-lab/OrbitalQuery',
  });
});

// ─── Health Check ─────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'orbital-query-backend',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    database: 'sqlite',
  });
});

// ─── Request ID (applied to all routes) ───────────────────────────────
app.use(requestIdMiddleware);

// ─── API Routes ───────────────────────────────────────────────────────
app.use('/api/auth', apiLimiter, authRouter);
app.use('/api/search', apiLimiter, searchRouter);
app.use('/api/datasets', datasetsRouter);
app.use('/api/ingest', apiLimiter, ingestRouter);
app.use('/api/analysis', analysisRouter);

// ─── 404 ──────────────────────────────────────────────────────────────
app.use('/api/*', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// ─── Error Handler ────────────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ─── Start ────────────────────────────────────────────────────────────
async function main() {
  try {
    await prisma.$connect();
    console.log('✅ Connected to SQLite database');
  } catch (error: any) {
    console.error('❌ Database error:', error.message);
    process.exit(1);
  }

  const datasetCount = await prisma.eODataset.count();
  console.log(`   📊 ${datasetCount} datasets loaded`);

  // Auto-seed if database is empty
  if (datasetCount === 0) {
    console.log('   🌱 Database empty — seeding sample datasets...');
    const SAMPLE_DATASETS = [
      { stacId: 'S2A_MSIL2A_20240315_Assam', title: 'Sentinel-2 L2A - Assam Flood Monitoring (March 2024)', description: 'Multispectral satellite imagery covering the Brahmaputra river basin in Assam, India.', provider: 'Copernicus/ESA', collection: 'sentinel-2-l2a', platform: 'Sentinel-2A', instrument: 'MSI', gsd: 10, cloudCover: 12.5, geometry: JSON.stringify({ type: 'Polygon', coordinates: [[[91.0, 26.0], [92.5, 26.0], [92.5, 27.5], [91.0, 27.5], [91.0, 26.0]]] }), bbox: JSON.stringify([91.0, 26.0, 92.5, 27.5]), centroidLat: 26.75, centroidLng: 91.75, startDate: '2024-03-15', endDate: '2024-03-15' },
      { stacId: 'S2B_MSIL2A_20240110_Himalaya', title: 'Sentinel-2 L2A - Himalayan Snow Cover (January 2024)', description: 'High-resolution multispectral imagery of the central Himalayan region.', provider: 'Copernicus/ESA', collection: 'sentinel-2-l2a', platform: 'Sentinel-2B', instrument: 'MSI', gsd: 10, cloudCover: 5.2, geometry: JSON.stringify({ type: 'Polygon', coordinates: [[[84.0, 27.5], [86.0, 27.5], [86.0, 29.5], [84.0, 29.5], [84.0, 27.5]]] }), bbox: JSON.stringify([84.0, 27.5, 86.0, 29.5]), centroidLat: 28.5, centroidLng: 85.0, startDate: '2024-01-10', endDate: '2024-01-10' },
      { stacId: 'S2A_MSIL2A_20230820_Jaipur', title: 'Sentinel-2 L2A - Jaipur Urban Expansion (August 2023)', description: 'Multispectral imagery covering the Jaipur metropolitan area.', provider: 'Copernicus/ESA', collection: 'sentinel-2-l2a', platform: 'Sentinel-2A', instrument: 'MSI', gsd: 10, cloudCover: 8.3, geometry: JSON.stringify({ type: 'Polygon', coordinates: [[[75.5, 26.7], [76.2, 26.7], [76.2, 27.1], [75.5, 27.1], [75.5, 26.7]]] }), bbox: JSON.stringify([75.5, 26.7, 76.2, 27.1]), centroidLat: 26.9, centroidLng: 75.85, startDate: '2023-08-20', endDate: '2023-08-20' },
      { stacId: 'LC08_L2_20230615_Gangetic', title: 'Landsat 8 OLI - Gangetic Plain Agriculture', description: 'Landsat 8 multispectral imagery over the Indo-Gangetic plain.', provider: 'USGS/NASA', collection: 'landsat-c2-l2', platform: 'Landsat 8', instrument: 'OLI', gsd: 30, cloudCover: 15.8, geometry: JSON.stringify({ type: 'Polygon', coordinates: [[[78.0, 25.0], [82.0, 25.0], [82.0, 28.0], [78.0, 28.0], [78.0, 25.0]]] }), bbox: JSON.stringify([78.0, 25.0, 82.0, 28.0]), centroidLat: 26.5, centroidLng: 80.0, startDate: '2023-06-15', endDate: '2023-06-15' },
      { stacId: 'MODIS_Terra_LST_20240301', title: 'MODIS Terra Land Surface Temperature - Global Daily', description: 'Daily land surface temperature from MODIS Terra sensor at 1km resolution.', provider: 'NASA', collection: 'modis-terra-lst', platform: 'Terra', instrument: 'MODIS', gsd: 1000, cloudCover: 0, geometry: JSON.stringify({ type: 'Polygon', coordinates: [[[-180, -60], [180, -60], [180, 80], [-180, 80], [-180, -60]]] }), bbox: JSON.stringify([-180, -60, 180, 80]), centroidLat: 10.0, centroidLng: 0.0, startDate: '2024-03-01', endDate: '2024-03-01' },
      { stacId: 'SENTINEL1_IW_20240201_Sahara', title: 'Sentinel-1 SAR - Sahara Desert Soil Moisture', description: 'SAR imagery of the Sahara Desert for soil moisture estimation.', provider: 'Copernicus/ESA', collection: 'sentinel-1-grd', platform: 'Sentinel-1A', instrument: 'C-SAR', gsd: 10, cloudCover: 0, geometry: JSON.stringify({ type: 'Polygon', coordinates: [[[0.0, 18.0], [10.0, 18.0], [10.0, 28.0], [0.0, 28.0], [0.0, 18.0]]] }), bbox: JSON.stringify([0.0, 18.0, 10.0, 28.0]), centroidLat: 23.0, centroidLng: 5.0, startDate: '2024-02-01', endDate: '2024-02-01' },
      { stacId: 'LC09_L2_20240601_Glaciers', title: 'Landsat 9 - Karakoram Glacier Retreat Monitoring', description: 'Landsat 9 imagery of the Karakoram range glaciers.', provider: 'USGS/NASA', collection: 'landsat-c2-l2', platform: 'Landsat 9', instrument: 'OLI-2', gsd: 30, cloudCover: 25.0, geometry: JSON.stringify({ type: 'Polygon', coordinates: [[[74.0, 35.0], [77.0, 35.0], [77.0, 37.5], [74.0, 37.5], [74.0, 35.0]]] }), bbox: JSON.stringify([74.0, 35.0, 77.0, 37.5]), centroidLat: 36.25, centroidLng: 75.5, startDate: '2024-06-01', endDate: '2024-06-01' },
      { stacId: 'S2B_MSIL2A_20231201_Thar', title: 'Sentinel-2 L2A - Thar Desert Land Degradation', description: 'Dry season imagery of the Thar Desert region.', provider: 'Copernicus/ESA', collection: 'sentinel-2-l2a', platform: 'Sentinel-2B', instrument: 'MSI', gsd: 10, cloudCover: 2.1, geometry: JSON.stringify({ type: 'Polygon', coordinates: [[[69.0, 24.0], [72.0, 24.0], [72.0, 27.0], [69.0, 27.0], [69.0, 24.0]]] }), bbox: JSON.stringify([69.0, 24.0, 72.0, 27.0]), centroidLat: 25.5, centroidLng: 70.5, startDate: '2023-12-01', endDate: '2023-12-01' },
      { stacId: 'LC08_L2_20180101_Sundarbans', title: 'Landsat 8 - Sundarbans Mangrove Monitoring', description: 'Landsat imagery of the Sundarbans mangrove forest.', provider: 'USGS/NASA', collection: 'landsat-c2-l2', platform: 'Landsat 8', instrument: 'OLI', gsd: 30, cloudCover: 18.9, geometry: JSON.stringify({ type: 'Polygon', coordinates: [[[88.0, 21.0], [90.0, 21.0], [90.0, 23.0], [88.0, 23.0], [88.0, 21.0]]] }), bbox: JSON.stringify([88.0, 21.0, 90.0, 23.0]), centroidLat: 22.0, centroidLng: 89.0, startDate: '2018-01-01', endDate: '2018-01-01' },
      { stacId: 'VIIRS_DNB_202401_NightLights', title: 'VIIRS Nighttime Lights - Monthly Composite (Jan 2024)', description: 'VIIRS nighttime lights composite for urbanization mapping.', provider: 'NASA', collection: 'viirs-dnb', platform: 'Suomi NPP', instrument: 'VIIRS', gsd: 500, cloudCover: 0, geometry: JSON.stringify({ type: 'Polygon', coordinates: [[[-180, -65], [180, -65], [180, 75], [-180, 75], [-180, -65]]] }), bbox: JSON.stringify([-180, -65, 180, 75]), centroidLat: 5.0, centroidLng: 0.0, startDate: '2024-01-01', endDate: '2024-01-31' },
    ];
    for (const data of SAMPLE_DATASETS) {
      try { await prisma.eODataset.create({ data }); } catch (e: any) { console.error(`   ❌ ${data.stacId}: ${e.message}`); }
    }
    const newCount = await prisma.eODataset.count();
    console.log(`   ✅ Seeded ${newCount} datasets`);
  }

  app.listen(PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════════╗');
    console.log('  ║  🛰️  OrbitalQuery Backend                    ║');
    console.log(`  ║  🌐 http://localhost:${PORT}                     ║`);
    console.log('  ╚══════════════════════════════════════════════╝');
    console.log('');
  });
}

main().catch((e) => {
  console.error('❌ Failed to start:', e);
  process.exit(1);
});
