import { Router, Request, Response } from 'express';
import { SemanticSearchEngine } from '../services/search-engine';
import { prisma } from '../index';
import { sanitizeSearchQuery } from '../middleware/sanitize';
import { searchLimiter } from '../middleware/rate-limit';
import { optionalAuth, AuthRequest } from '../middleware/auth';
import { callPythonService } from '../services/python-client';

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
      max_cloud_cover,
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

    // ── SQLite search (sample data) ──────────────────────────
    const candidates = await prisma.eODataset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const parsed = candidates.map(parseDatasetJson);
    let sqliteResults = await searchEngine.search(query, parsed, Math.min(limit, 100));

    // ── STAC provider search (real data from Bhoonidhi/Copernicus) ──
    let stacResults: any[] = [];
    try {
      // Determine bbox for STAC search
      let stacBbox = bbox;
      if (!stacBbox) {
        // Default: India bounding box for Indian users
        stacBbox = [68.0, 6.0, 97.5, 37.5];
      }

      // Determine collection for STAC search
      const stacCollection = collection || 'sentinel-2-l2a';

      // Build datetime range
      let datetime = '';
      if (startDate && endDate) {
        datetime = `${startDate}T00:00:00Z/${endDate}T23:59:59Z`;
      } else if (startDate) {
        datetime = `${startDate}T00:00:00Z/..`;
      } else if (endDate) {
        datetime = `../${endDate}T23:59:59Z`;
      } else {
        // Default: last 2 years
        const now = new Date();
        const twoYearsAgo = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());
        datetime = `${twoYearsAgo.toISOString().split('T')[0]}T00:00:00Z/${now.toISOString().split('T')[0]}T23:59:59Z`;
      }

      const stacBody: any = {
        bbox: stacBbox,
        collection: stacCollection,
        datetime,
        limit: Math.min(limit, 50),
      };
      if (max_cloud_cover !== undefined) stacBody.max_cloud_cover = max_cloud_cover;

      // Try default provider first, then fallback to Planetary Computer
      let stacResult = await callPythonService('POST', '/stac/search', stacBody, 'search-stac');

      // If default provider failed (e.g. collection not available), try Planetary Computer
      if (!stacResult.ok && stacBody.collection === 'sentinel-2-l2a') {
        console.log('[search] Default provider failed for sentinel-2-l2a, trying Planetary Computer...');
        const pcBody = { ...stacBody, provider: 'planetary_computer' };
        stacResult = await callPythonService('POST', '/stac/search', pcBody, 'search-stac-pc');
      }

      if (stacResult.ok && stacResult.data?.items) {
        stacResults = stacResult.data.items.map((item: any) => ({
          id: item.id,
          stacId: item.id,
          title: item.properties?.title || `${item.collection} - ${item.id?.substring(0, 40)}`,
          description: item.properties?.description || `${item.collection} satellite imagery`,
          provider: item.properties?.platform ? `${item.properties.platform} (${item.collection})` : item.collection,
          collection: item.collection,
          platform: item.properties?.platform || 'Unknown',
          instrument: item.properties?.['eo:instrument'] || 'Unknown',
          resolution_m: item.properties?.['eo:gsd'] || null,
          cloud_cover_pct: item.properties?.['eo:cloud_cover'] ?? null,
          centroid_lat: item.bbox ? (item.bbox[1] + item.bbox[3]) / 2 : null,
          centroid_lng: item.bbox ? (item.bbox[0] + item.bbox[2]) / 2 : null,
          start_date: item.properties?.datetime?.split('T')[0] || null,
          end_date: item.properties?.datetime?.split('T')[0] || null,
          geometry: item.geometry || null,
          bbox: item.bbox || null,
          relevance_score: 0.95,
          stacLink: (Array.isArray(item.links) ? item.links.find((l: any) => l.rel === 'self')?.href : item.links?.self?.href) || null,
          previewUrl: item.assets?.thumbnail?.href || item.assets?.visual?.href || null,
          source: 'stac',
        }));
      }
    } catch (err: any) {
      console.error('[search] STAC search failed (non-fatal):', err.message);
    }

    // ── Merge SQLite + STAC results ─────────────────────────────
    let allResults = [...stacResults, ...sqliteResults];

    const total = allResults.length;
    allResults = allResults.slice(offset, offset + limit);

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

    res.json({ results: allResults, total, limit, offset, latencyMs });
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
    // Get providers from SQLite + STAC
    const dbProviders = await prisma.eODataset.findMany({
      select: { provider: true },
      distinct: ['provider'],
      orderBy: { provider: 'asc' },
    });
    const sqliteProviders = dbProviders.map(p => p.provider);

    // Get STAC providers from Python service
    let stacProviders: string[] = [];
    try {
      const result = await callPythonService('GET', '/analysis/providers', undefined, 'providers');
      if (result.ok && result.data?.providers) {
        stacProviders = result.data.providers.map((p: any) => p.name);
      }
    } catch {}

    const allProviders = [...new Set([...stacProviders, ...sqliteProviders])];
    res.json(allProviders);
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
