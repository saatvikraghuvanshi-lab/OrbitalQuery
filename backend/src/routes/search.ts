import { Router, Request, Response } from 'express';
import { SemanticSearchEngine } from '../services/search-engine';
import { prisma } from '../index';
import { sanitizeSearchQuery } from '../middleware/sanitize';
import { searchLimiter } from '../middleware/rate-limit';
import { optionalAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const searchEngine = new SemanticSearchEngine();

/**
 * Parse JSON string fields from SQLite into objects
 */
function parseDatasetJson(dataset: any) {
  return {
    ...dataset,
    geometry: dataset.geometry ? JSON.parse(dataset.geometry) : null,
    bbox: dataset.bbox ? JSON.parse(dataset.bbox) : null,
    assets: dataset.assets ? JSON.parse(dataset.assets) : null,
  };
}

/**
 * POST /api/search
 */
router.post('/', searchLimiter, sanitizeSearchQuery, optionalAuth, async (req: AuthRequest, res: Response) => {
  const startTime = Date.now();

  try {
    const {
      query,
      bbox,
      startDate,
      endDate,
      provider,
      collection,
      limit = 20,
      offset = 0,
    } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      res.status(400).json({ error: 'Query string is required' });
      return;
    }

    // Build Prisma where clause
    const where: any = {};

    if (provider) where.provider = provider;
    if (collection) where.collection = collection;

    // Spatial filter
    if (bbox && Array.isArray(bbox) && bbox.length === 4) {
      const [west, south, east, north] = bbox;
      where.centroidLng = { gte: west, lte: east };
      where.centroidLat = { gte: south, lte: north };
    }

    // Date filters
    if (startDate || endDate) {
      where.AND = [];
      if (startDate) where.AND.push({ endDate: { gte: startDate } });
      if (endDate) where.AND.push({ startDate: { lte: endDate } });
    }

    const candidates = await prisma.eODataset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    // Parse JSON fields from SQLite strings and score
    const parsed = candidates.map(parseDatasetJson);
    let results = await searchEngine.search(query, parsed, Math.min(limit, 100));

    // Results already have parsed geometry from the search engine
    // No need to parse again

    const total = results.length;
    results = results.slice(offset, offset + limit);

    const latencyMs = Date.now() - startTime;

    // Log search
    prisma.searchLog.create({
      data: {
        query,
        filters: JSON.stringify({ bbox, startDate, endDate, provider, collection }),
        resultCount: total,
        latencyMs,
        userId: req.user?.id || null,
        ipAddress: (req.ip || null) as string,
      },
    }).catch(() => {});

    res.json({ results, total, limit, offset, latencyMs });
  } catch (error: any) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed', message: error.message });
  }
});

/**
 * GET /api/search/providers
 */
router.get('/providers', async (_req: Request, res: Response) => {
  try {
    const providers = await prisma.eODataset.findMany({
      select: { provider: true },
      distinct: ['provider'],
      orderBy: { provider: 'asc' },
    });
    res.json(providers.map(p => p.provider));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/search/collections
 */
router.get('/collections', async (_req: Request, res: Response) => {
  try {
    const collections = await prisma.eODataset.findMany({
      select: { collection: true },
      distinct: ['collection'],
      orderBy: { collection: 'asc' },
    });
    res.json(collections.map(c => c.collection).filter(Boolean));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
