import { Router, Request, Response } from 'express';
import { prisma } from '../index';
import { sanitizeSearchQuery } from '../middleware/sanitize';
import { searchLimiter } from '../middleware/rate-limit';
import { optionalAuth, AuthRequest } from '../middleware/auth';
import { callPythonService } from '../services/python-client';
import { coverageAwareSearch } from '../services/coverage-aware-search';
import type { BBox } from '../services/eo-types';

const router = Router();

/**
 * Extract a bounding box from query text by matching known locations.
 * Returns a tight bbox around the location for targeted STAC search.
 */
function extractLocationBbox(query: string): BBox {
  const q = query.toLowerCase();

  // Indian cities and regions with tight bboxes [west, south, east, north]
  const locations: Record<string, BBox> = {
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
 * POST /api/search
 *
 * Coverage-aware search:
 *  1. Searches local SQLite catalog
 *  2. Computes spatial coverage of local results against the AOI
 *  3. If coverage is insufficient, queries live STAC providers (AWS + Planetary Computer)
 *  4. Deduplicates across providers
 *  5. Caches live results for future queries
 *  6. Ranks results using semantic + spatial + temporal + quality scoring
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

    // Determine bbox: use provided, or extract from query
    let searchBbox: BBox | undefined;
    if (bbox && Array.isArray(bbox) && bbox.length === 4) {
      searchBbox = bbox as BBox;
    } else {
      searchBbox = extractLocationBbox(query);
    }

    // Run coverage-aware search
    const result = await coverageAwareSearch(
      {
        query,
        bbox: searchBbox,
        startDate,
        endDate,
        provider,
        collection,
        maxCloudCover: max_cloud_cover,
        limit: Math.min(limit, 100),
        offset,
      },
      prisma as any,
    );

    // Format results for API compatibility
    const formattedResults = result.results.map((item) => ({
      id: item.id,
      stacId: item.id,
      title: item.title,
      description: item.description,
      provider: item.provider,
      collection: item.collection,
      platform: item.platform,
      instrument: item.instrument,
      resolution_m: item.resolutionM,
      cloud_cover_pct: item.cloudCover,
      centroid_lat: item.centroid?.lat ?? null,
      centroid_lng: item.centroid?.lng ?? null,
      start_date: item.datetime?.split('T')[0] || null,
      end_date: item.datetime?.split('T')[0] || null,
      geometry: item.geometry,
      bbox: item.bbox,
      score: item.score,
      score_breakdown: item.scoreBreakdown,
      aoi_overlap: item.aoiOverlap,
      stacLink: item.stacLink,
      previewUrl: item.previewUrl,
      tilejsonUrl: item.tilejsonUrl,
      source: item.source,
    }));

    const latencyMs = Date.now() - startTime;

    // Log search
    prisma.searchLog.create({
      data: {
        query,
        filters: JSON.stringify({
          bbox: searchBbox,
          startDate,
          endDate,
          provider,
          collection,
        }),
        resultCount: result.total,
        latencyMs,
        userId: req.user?.id || null,
        ipAddress: (req.ip || null) as string,
      },
    }).catch(() => {});

    res.json({
      results: formattedResults,
      total: result.total,
      limit,
      offset,
      latencyMs,
      coverage: result.coverage,
      providers: result.providers,
    });
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
    // Get providers from SQLite
    const dbProviders = await prisma.eODataset.findMany({
      select: { provider: true },
      distinct: ['provider'],
      orderBy: { provider: 'asc' },
    });
    const sqliteProviders = dbProviders.map((p: any) => p.provider);

    // Get STAC providers from Python service (short timeout — don't block)
    let stacProviders: string[] = [];
    try {
      const result = await callPythonService('GET', '/analysis/providers', undefined, 'providers', 5000);
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
    res.json(collections.map((c: any) => c.collection).filter(Boolean));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
