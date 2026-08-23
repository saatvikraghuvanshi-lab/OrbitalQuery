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
 * Extract a bounding box from query text by matching known locations.
 * Returns a tight bbox around the location for targeted STAC search.
 */
function extractLocationBbox(query: string): number[] {
  const q = query.toLowerCase();

  // Indian cities and regions with tight bboxes [west, south, east, north]
  const locations: Record<string, number[]> = {
    // Major cities
    'jaipur': [75.7, 26.8, 75.95, 27.05],
    'mumbai': [72.75, 18.85, 73.05, 19.15],
    'delhi': [77.0, 28.4, 77.4, 28.75],
    'new delhi': [77.0, 28.4, 77.4, 28.75],
    'bangalore': [77.4, 12.85, 77.75, 13.1],
    'bengaluru': [77.4, 12.85, 77.75, 13.1],
    'chennai': [80.05, 12.9, 80.35, 13.15],
    'kolkata': [88.25, 22.45, 88.45, 22.65],
    'hyderabad': [78.3, 17.3, 78.6, 17.55],
    'ahmedabad': [72.5, 22.95, 72.75, 23.15],
    'pune': [73.75, 18.45, 74.0, 18.65],
    'lucknow': [80.85, 26.75, 81.1, 26.95],
    'bhopal': [77.35, 23.2, 77.55, 23.4],
    'patna': [85.05, 25.55, 85.25, 25.7],
    'guwahati': [91.65, 26.1, 91.8, 26.25],
    'cherrapunji': [91.65, 25.25, 91.75, 25.35],
    'thar desert': [69.0, 24.0, 74.0, 28.0],
    'jaisalmer': [70.5, 26.7, 71.1, 27.0],
    'sundarbans': [88.5, 21.6, 89.2, 22.1],
    'kashmir': [73.5, 33.0, 77.5, 36.5],
    'himalayas': [77.0, 28.0, 80.0, 35.0],
    'lassa': [78.5, 27.5, 79.0, 28.0],
    // Indian states/regions
    'rajasthan': [69.5, 23.0, 76.5, 30.5],
    'assam': [89.5, 24.0, 96.0, 28.0],
    'uttarakhand': [77.5, 28.5, 81.0, 31.5],
    'karnataka': [74.0, 11.5, 78.5, 18.5],
    'tamil nadu': [76.0, 7.5, 80.5, 13.5],
    'odisha': [81.0, 17.5, 87.5, 22.5],
    'madhya pradesh': [74.0, 21.0, 82.5, 26.5],
    'maharashtra': [72.5, 15.5, 80.5, 22.0],
    'andhra pradesh': [77.0, 12.5, 84.5, 19.5],
    'kerala': [74.8, 8.0, 77.5, 12.8],
    // International
    'amazon': [-75.0, -15.0, -45.0, 5.0],
    'tokyo': [139.5, 35.4, 140.0, 35.9],
    'london': [-0.5, 51.3, 0.3, 51.7],
    'cairo': [31.0, 29.8, 31.5, 30.2],
    'sydney': [150.5, -34.2, 151.5, -33.6],
  };

  // Check for exact location match
  for (const [loc, bbox] of Object.entries(locations)) {
    if (q.includes(loc)) {
      console.log(`[search] Extracted location '${loc}' from query`);
      return bbox;
    }
  }

  // Default: India bounding box
  return [68.0, 6.0, 97.5, 37.5];
}

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
        // Extract location from query text
        stacBbox = extractLocationBbox(query);
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
