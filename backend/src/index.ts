import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import searchRouter from './routes/search';
import datasetsRouter from './routes/datasets';
import ingestRouter from './routes/ingest';
import authRouter from './routes/auth';
import { apiLimiter } from './middleware/rate-limit';

dotenv.config({ path: __dirname + '/../.env' });

export const prisma = new PrismaClient();

const app = express();
const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';

// ─── Security Headers ────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://*.tile.openstreetmap.org", "https://planetarycomputer.microsoft.com"],
      connectSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ─── CORS ────────────────────────────────────────────────────────────
app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400, // Preflight cache: 24 hours
}));

// ─── Body Parsing ────────────────────────────────────────────────────
app.use(express.json({ limit: '5mb' }));

// ─── Global Rate Limiting ────────────────────────────────────────────
app.use('/api/', apiLimiter);

// ─── Trust proxy (for rate limiting behind reverse proxies) ──────────
app.set('trust proxy', 1);

// ─── Security: Remove X-Powered-By ───────────────────────────────────
app.disable('x-powered-by');

// ─── Health Check (no rate limit) ────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'orbital-query-backend',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    security: {
      rateLimiting: true,
      helmet: true,
      cors: true,
    },
  });
});

// ─── API Routes ──────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/search', searchRouter);
app.use('/api/datasets', datasetsRouter);
app.use('/api/ingest', ingestRouter);

// ─── 404 Handler ─────────────────────────────────────────────────────
app.use('/api/*', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// ─── Error Handler ───────────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);

  // Don't leak error details in production
  const isProduction = process.env.NODE_ENV === 'production';

  res.status(err.status || 500).json({
    error: isProduction ? 'Internal server error' : err.message,
    ...(isProduction ? {} : { stack: err.stack }),
  });
});

// ─── Start Server ────────────────────────────────────────────────────
async function main() {
  try {
    await prisma.$connect();
    console.log('✅ Connected to PostgreSQL via Prisma');
  } catch (error: any) {
    console.error('⚠️  Database connection failed:', error.message);
    console.log('   Server will start but database operations will fail.');
    console.log('   Make sure PostgreSQL is running and DATABASE_URL is correct.');
  }

  app.listen(PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════════╗');
    console.log('  ║  🛰️  OrbitalQuery Backend                    ║');
    console.log(`  ║  🌐 http://localhost:${PORT}                     ║`);
    console.log('  ║  📋 GET  /api/health                         ║');
    console.log('  ║  🔐 POST /api/auth/login                     ║');
    console.log('  ║  🔍 POST /api/search                         ║');
    console.log('  ║  📊 GET  /api/datasets                       ║');
    console.log('  ╚══════════════════════════════════════════════╝');
    console.log('');
    console.log('  Security: Helmet ✓ | Rate Limiting ✓ | CORS ✓ | Sanitization ✓');
    console.log('');
  });
}

main().catch((e) => {
  console.error('❌ Failed to start server:', e);
  process.exit(1);
});
