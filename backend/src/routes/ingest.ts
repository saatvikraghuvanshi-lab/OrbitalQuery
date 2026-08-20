import { Router, Request, Response } from 'express';
import { ingestFromPlanetaryComputer } from '../services/ingestion';
import { buildEmbeddings } from '../services/embeddings';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth';
import { ingestLimiter } from '../middleware/rate-limit';

const router = Router();

/**
 * POST /api/ingest/planetary-computer
 * Trigger real data ingestion from Planetary Computer STAC API (admin only)
 */
router.post('/planetary-computer', requireAuth, requireAdmin, ingestLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { collections, maxItems = 100, bbox } = req.body;
    const result = await ingestFromPlanetaryComputer({
      collections: collections || ['sentinel-2-l2a', 'landsat-c2-l2'],
      maxItems,
      bbox,
    });
    res.json({ message: 'Ingestion complete', triggeredBy: req.user!.email, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ingest/real
 * Quick ingestion endpoint for development — no auth required
 * Fetches real STAC data from Planetary Computer
 */
router.post('/real', ingestLimiter, async (req: Request, res: Response) => {
  try {
    const { collections, maxItems = 50 } = req.body;
    const result = await ingestFromPlanetaryComputer({
      collections: collections || ['sentinel-2-l2a', 'landsat-c2-l2'],
      maxItems,
    });
    res.json({ message: 'Real data ingestion complete', ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ingest/embeddings
 * Build search index from stored datasets (admin only)
 */
router.post('/embeddings', requireAuth, requireAdmin, ingestLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const result = await buildEmbeddings();
    res.json({ message: 'Embeddings built successfully', triggeredBy: req.user!.email, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ingest/sample
 * Load sample datasets (admin only)
 */
router.post('/sample', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { execSync } = require('child_process');
    const output = execSync('npx ts-node src/scripts/ingest-sample.ts', {
      cwd: __dirname + '/../../',
      timeout: 60000,
    }).toString();
    res.json({ message: 'Sample data loaded', output: output.slice(-500) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
