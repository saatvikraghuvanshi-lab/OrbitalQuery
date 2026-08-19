import { Router, Request, Response } from 'express';
import { SemanticSearchEngine } from '../services/search-engine';
import { prisma } from '../index';
import { sanitizeSearchQuery } from '../middleware/sanitize';
import { searchLimiter } from '../middleware/rate-limit';
import { optionalAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const searchEngine = new SemanticSearchEngine();

/**
 * POST /api/search
 * Semantic search with optional spatial + temporal filters
 */
router.post('/', searchLimiter, sanitizeSearchQuery, optionalAuth, async (req: AuthRequest, res: Response) => {
  const startTime = Date.now();

  try {
    const {
      query,
      bbox,           // [west, south, east, north]
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

    // Build Prisma where clause for non-semantic filters
    const where: any = {};

    if (provider) {
      where.provider = provider;
    }

    if (collection) {
      where.collection = collection;
    }

    if (startDate || endDate) {
      where.AND = [];
      if (startDate) {
        where.AND.push({ endDate: { gte: new Date(startDate) } });
      }
      if (endDate) {
        where.AND.push({ startDate: { lte: new Date(endDate) } });
      }
    }

    // Spatial filter: datasets whose centroid falls within bbox
    if (bbox && Array.isArray(bbox) && bbox.length === 4) {
      const [west, south, east, north] = bbox;
      where.centroidLng = { gte: west, lte: east };
      where.centroidLat = { gte: south, lte: north };
    }

    // Get candidate datasets from DB
    const candidates = await prisma.eODataset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500, // Get enough candidates for semantic ranking
    });

    // Semantic search over candidates
    let results = await searchEngine.search(query, candidates, Math.min(limit, 100));

    // Apply pagination after semantic ranking
    const total = results.length;
    results = results.slice(offset, offset + limit);

    const latencyMs = Date.now() - startTime;

    // Log the search
    await prisma.searchLog.create({
      data: {
        query,
        filters: { bbox, startDate, endDate, provider, collection },
        resultCount: total,
        latencyMs,
        userId: req.user?.id || null,
        ipAddress: req.ip || req.headers['x-forwarded-for'] as string || null,
      },
    }).catch(console.error); // Don't fail on log errors

    res.json({
      results,
      total,
      limit,
      offset,
      latencyMs,
    });
  } catch (error: any) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed', message: error.message });
  }
});

/**
 * GET /api/search/providers
 * List distinct providers
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
 * List distinct collections
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
