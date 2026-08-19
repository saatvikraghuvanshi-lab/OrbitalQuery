import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import searchRouter from './routes/search';
import datasetsRouter from './routes/datasets';
import ingestRouter from './routes/ingest';
import authRouter from './routes/auth';
import { apiLimiter } from './middleware/rate-limit';

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
app.use('/api/', apiLimiter);
app.set('trust proxy', 1);
app.disable('x-powered-by');

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

// ─── API Routes ───────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/search', searchRouter);
app.use('/api/datasets', datasetsRouter);
app.use('/api/ingest', ingestRouter);

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
