/**
 * Coverage-Aware EO Search Orchestrator.
 *
 * Flow:
 *   1. Search existing SQLite catalog for the AOI + time range.
 *   2. Compute spatial coverage of local results against the AOI.
 *   3. If coverage is insufficient → query live STAC providers in parallel.
 *   4. Normalize + deduplicate all results.
 *   5. Cache live results into SQLite for future queries.
 *   6. Rank combined results using semantic + spatial + temporal + quality scoring.
 *   7. Return the merged result set.
 *
 * Provider failures are non-fatal — a timeout on AWS does not prevent
 * Planetary Computer results from being returned.
 */

import type { NormalizedDataset, BBox } from './eo-types';
import {
  computeCollectiveCoverage,
  isCoverageSufficient,
  bboxAreaDeg2,
} from './coverage-calculator';
import { searchLiveSTAC, deduplicateItems, buildDatetimeRange } from './stac-providers';
import { SemanticSearchEngine } from './search-engine';

// ── Types ────────────────────────────────────────────────────────────

export interface SearchRequest {
  query: string;
  bbox?: BBox;
  startDate?: string;
  endDate?: string;
  provider?: string;
  collection?: string;
  maxCloudCover?: number;
  limit?: number;
  offset?: number;
}

export interface CoverageAwareResult {
  results: ScoredResult[];
  total: number;
  coverage: {
    localScenes: number;
    liveScenes: number;
    deduplicated: number;
    coverageRatio: number | null;
    sufficient: boolean;
  };
  providers: Array<{
    name: string;
    itemCount: number;
    latencyMs: number;
    error?: string;
  }>;
  latencyMs: number;
}

export interface ScoredResult extends NormalizedDataset {
  /** Combined relevance score (0–1). */
  score: number;
  /** Breakdown of scoring components. */
  scoreBreakdown: {
    semantic: number;
    spatial: number;
    temporal: number;
    quality: number;
  };
}

// ── Coverage threshold ───────────────────────────────────────────────

const COVERAGE_THRESHOLD = 0.5; // 50% of AOI must be covered locally

// ── Main orchestrator ────────────────────────────────────────────────

/**
 * Prisma client type — we accept it as a parameter to avoid circular deps.
 */
interface PrismaLike {
  eODataset: {
    findMany: (args: any) => Promise<any[]>;
  };
  cachedSTACItem: {
    findMany: (args: any) => Promise<any[]>;
    create: (args: any) => Promise<any>;
    deleteMany: (args: any) => Promise<any>;
    count: (args: any) => Promise<number>;
  };
}

const searchEngine = new SemanticSearchEngine();

export async function coverageAwareSearch(
  request: SearchRequest,
  prisma: PrismaLike,
): Promise<CoverageAwareResult> {
  const startTime = Date.now();
  const limit = request.limit || 20;
  const offset = request.offset || 0;
  const aoiBbox = request.bbox;

  const providers: CoverageAwareResult['providers'] = [];

  // ── Step 1: Search local SQLite catalog ──────────────────────────
  const localWhere: any = {};
  if (request.provider) localWhere.provider = request.provider;
  if (request.collection) localWhere.collection = request.collection;
  if (aoiBbox && aoiBbox.length === 4) {
    const [west, south, east, north] = aoiBbox;
    localWhere.centroidLng = { gte: west, lte: east };
    localWhere.centroidLat = { gte: south, lte: north };
  }
  if (request.startDate || request.endDate) {
    localWhere.AND = [];
    if (request.startDate) localWhere.AND.push({ endDate: { gte: request.startDate } });
    if (request.endDate) localWhere.AND.push({ startDate: { lte: request.endDate } });
  }

  const localRows = await prisma.eODataset.findMany({
    where: localWhere,
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  // Convert SQLite rows to NormalizedDataset
  const localItems: NormalizedDataset[] = localRows.map((row: any) => ({
    id: row.stacId || row.id,
    provider: row.provider,
    collection: row.collection || 'unknown',
    title: row.title,
    description: row.description || null,
    datetime: row.startDate || '',
    geometry: row.geometry ? safeParse(row.geometry) : null,
    bbox: row.bbox ? safeParse(row.bbox) : null,
    cloudCover: row.cloudCover ?? null,
    resolutionM: row.gsd ?? null,
    platform: row.platform || null,
    instrument: row.instrument || null,
    assets: row.assets ? safeParse(row.assets) : null,
    previewUrl: row.previewUrl || null,
    stacLink: row.stacLink || null,
    tilejsonUrl: null,
    source: 'sqlite' as const,
    aoiOverlap: null,
    centroid: row.centroidLat != null && row.centroidLng != null
      ? { lat: row.centroidLat, lng: row.centroidLng }
      : null,
  }));

  // ── Step 2: Compute local coverage ───────────────────────────────
  let liveItems: NormalizedDataset[] = [];
  let coverageRatio: number | null = null;
  let sufficient = false;

  if (aoiBbox && aoiBbox.length === 4) {
    const sceneBboxes = localItems
      .filter((item) => item.bbox && item.bbox.length === 4)
      .map((item) => ({ id: item.id, bbox: item.bbox as BBox }));

    if (sceneBboxes.length > 0) {
      const coverage = computeCollectiveCoverage(aoiBbox, sceneBboxes);
      coverageRatio = coverage.coverageRatio;
      sufficient = isCoverageSufficient(coverage, COVERAGE_THRESHOLD);
    }
  } else {
    // No AOI specified — local results are sufficient if any exist
    sufficient = localItems.length > 0;
  }

  // ── Step 3: Query live STAC if coverage is insufficient ──────────
  if (!sufficient && aoiBbox && aoiBbox.length === 4) {
    // Also check cached STAC items
    const cachedItems = await searchCachedSTAC(prisma, aoiBbox, request);
    if (cachedItems.length > 0) {
      liveItems.push(...cachedItems);
    }

    // Compute coverage including cached items
    if (liveItems.length > 0 && aoiBbox) {
      const combinedBboxes = [
        ...localItems.filter((i) => i.bbox).map((i) => ({ id: i.id, bbox: i.bbox as BBox })),
        ...liveItems.filter((i) => i.bbox).map((i) => ({ id: i.id, bbox: i.bbox as BBox })),
      ];
      if (combinedBboxes.length > 0) {
        const combinedCoverage = computeCollectiveCoverage(aoiBbox, combinedBboxes);
        coverageRatio = combinedCoverage.coverageRatio;
        sufficient = isCoverageSufficient(combinedCoverage, COVERAGE_THRESHOLD);
      }
    }

    // If still insufficient, query live STAC providers
    if (!sufficient) {
      const datetime = buildDatetimeRange(request.startDate, request.endDate);
      const collections = request.collection
        ? [request.collection]
        : undefined;

      const liveResults = await searchLiveSTAC({
        bbox: aoiBbox,
        datetime,
        collections,
        maxCloudCover: request.maxCloudCover,
        limit: 50,
      });

      for (const result of liveResults) {
        providers.push({
          name: result.provider,
          itemCount: result.items.length,
          latencyMs: result.latencyMs,
          error: result.error,
        });

        if (result.items.length > 0) {
          liveItems.push(...result.items);
        }
      }

      // Cache live results
      await cacheSTACItems(prisma, liveItems);

      // Recompute coverage with all data
      const allBboxes = [...localItems, ...liveItems]
        .filter((i) => i.bbox)
        .map((i) => ({ id: i.id, bbox: i.bbox as BBox }));

      if (allBboxes.length > 0 && aoiBbox) {
        const finalCoverage = computeCollectiveCoverage(aoiBbox, allBboxes);
        coverageRatio = finalCoverage.coverageRatio;
      }
    }
  }

  // ── Step 4: Merge + deduplicate ──────────────────────────────────
  const allItems = deduplicateItems([...localItems, ...liveItems]);
  const totalBeforeDedup = localItems.length + liveItems.length;

  // ── Step 5: Compute AOI overlap for each item ────────────────────
  if (aoiBbox && aoiBbox.length === 4) {
    for (const item of allItems) {
      if (item.bbox && item.bbox.length === 4) {
        const sceneBbox = item.bbox as BBox;
        const sceneArea = bboxAreaDeg2(sceneBbox);
        const aoiArea = bboxAreaDeg2(aoiBbox);
        if (sceneArea > 0 && aoiArea > 0) {
          // Simple bbox overlap approximation
          const west = Math.max(sceneBbox[0], aoiBbox[0]);
          const south = Math.max(sceneBbox[1], aoiBbox[1]);
          const east = Math.min(sceneBbox[2], aoiBbox[2]);
          const north = Math.min(sceneBbox[3], aoiBbox[3]);
          if (west < east && south < north) {
            const intersection = (east - west) * (north - south);
            item.aoiOverlap = Math.min(1, intersection / aoiArea);
          } else {
            item.aoiOverlap = 0;
          }
        }
      }
    }
  }

  // ── Step 6: Score + rank ─────────────────────────────────────────
  const scored = await scoreResults(request.query, allItems);

  // ── Step 7: Paginate ─────────────────────────────────────────────
  const paginated = scored.slice(offset, offset + limit);

  const total = scored.length;
  const latencyMs = Date.now() - startTime;

  return {
    results: paginated,
    total,
    coverage: {
      localScenes: localItems.length,
      liveScenes: liveItems.length,
      deduplicated: totalBeforeDedup - total + total, // show how many survived dedup
      coverageRatio,
      sufficient,
    },
    providers,
    latencyMs,
  };
}

// ── Cached STAC search ──────────────────────────────────────────────

async function searchCachedSTAC(
  prisma: PrismaLike,
  aoiBbox: BBox,
  request: SearchRequest,
): Promise<NormalizedDataset[]> {
  const now = new Date();
  const where: any = {
    expiresAt: { gt: now },
  };

  if (request.collection) where.collection = request.collection;

  // Spatial filter using centroid
  const [west, south, east, north] = aoiBbox;
  where.centroidLng = { gte: west, lte: east };
  where.centroidLat = { gte: south, lte: north };

  const rows = await prisma.cachedSTACItem.findMany({
    where,
    take: 200,
  });

  return rows.map((row: any) => ({
    id: row.stacId,
    provider: row.provider,
    collection: row.collection,
    title: row.title || `${row.collection} – ${row.stacId}`,
    description: row.description || null,
    datetime: row.datetime || '',
    geometry: row.geometry ? safeParse(row.geometry) : null,
    bbox: row.bbox ? safeParse(row.bbox) : null,
    cloudCover: row.cloudCover ?? null,
    resolutionM: row.resolutionM ?? null,
    platform: row.platform || null,
    instrument: row.instrument || null,
    assets: row.assets ? safeParse(row.assets) : null,
    previewUrl: row.previewUrl || null,
    stacLink: row.stacLink || null,
    tilejsonUrl: row.tilejsonUrl || null,
    source: 'live' as const,
    aoiOverlap: null,
    centroid: row.centroidLat != null && row.centroidLng != null
      ? { lat: row.centroidLat, lng: row.centroidLng }
      : null,
  }));
}

// ── Cache live STAC results ──────────────────────────────────────────

const CACHE_TTL_HOURS = 24;

async function cacheSTACItems(
  prisma: PrismaLike,
  items: NormalizedDataset[],
): Promise<void> {
  const expiresAt = new Date(Date.now() + CACHE_TTL_HOURS * 3600 * 1000);

  for (const item of items) {
    if (item.source !== 'live') continue;

    try {
      await prisma.cachedSTACItem.create({
        data: {
          stacId: item.id,
          provider: item.provider,
          collection: item.collection,
          title: item.title,
          description: item.description,
          datetime: item.datetime,
          geometry: item.geometry ? JSON.stringify(item.geometry) : null,
          bbox: item.bbox ? JSON.stringify(item.bbox) : null,
          cloudCover: item.cloudCover,
          resolutionM: item.resolutionM,
          platform: item.platform,
          instrument: item.instrument,
          assets: item.assets ? JSON.stringify(item.assets) : null,
          previewUrl: item.previewUrl,
          stacLink: item.stacLink,
          tilejsonUrl: item.tilejsonUrl,
          centroidLat: item.centroid?.lat ?? null,
          centroidLng: item.centroid?.lng ?? null,
          expiresAt,
        },
      });
    } catch {
      // Duplicate stacId — ignore (another thread cached it)
    }
  }
}

// ── Scoring ──────────────────────────────────────────────────────────

async function scoreResults(query: string, items: NormalizedDataset[]): Promise<ScoredResult[]> {
  if (items.length === 0) return [];

  // Get semantic scores from existing search engine
  const candidates = items.map((item) => ({
    ...item,
    description: item.description || '',
  }));

  const semanticResults = await searchEngine.search(query, candidates, items.length);

  // Build score map
  const semanticScores = new Map<string, number>();
  for (const r of semanticResults) {
    semanticScores.set(r.id, r.score);
  }

  // Score each item with combined components
  const scored: ScoredResult[] = items.map((item) => {
    const semantic = semanticScores.get(item.id) || 0;

    // Spatial score: how well does this scene overlap the AOI?
    const spatial = item.aoiOverlap ?? 0.5; // default if no AOI

    // Temporal score: prefer recent imagery
    const temporal = computeTemporalScore(item.datetime);

    // Quality score: prefer lower cloud cover, higher resolution
    const quality = computeQualityScore(item.cloudCover, item.resolutionM);

    // Weighted combination
    const score = semantic * 0.4 + spatial * 0.25 + temporal * 0.15 + quality * 0.2;

    return {
      ...item,
      score: Math.round(score * 1000) / 1000,
      scoreBreakdown: {
        semantic: Math.round(semantic * 1000) / 1000,
        spatial: Math.round(spatial * 1000) / 1000,
        temporal: Math.round(temporal * 1000) / 1000,
        quality: Math.round(quality * 1000) / 1000,
      },
    };
  });

  return scored.sort((a, b) => b.score - a.score);
}

function computeTemporalScore(datetime: string): number {
  if (!datetime) return 0.3;
  try {
    const date = new Date(datetime);
    const now = new Date();
    const yearsDiff = (now.getTime() - date.getTime()) / (365.25 * 24 * 3600 * 1000);
    // Recent = higher score, but not zero for older imagery
    return Math.max(0, Math.min(1, 1 - yearsDiff * 0.1));
  } catch {
    return 0.3;
  }
}

function computeQualityScore(
  cloudCover: number | null,
  resolutionM: number | null,
): number {
  let score = 0.5;

  // Cloud cover: lower is better
  if (cloudCover != null) {
    if (cloudCover <= 5) score += 0.3;
    else if (cloudCover <= 10) score += 0.2;
    else if (cloudCover <= 20) score += 0.1;
    else if (cloudCover > 50) score -= 0.2;
  }

  // Resolution: lower GSD is better
  if (resolutionM != null) {
    if (resolutionM <= 10) score += 0.2;
    else if (resolutionM <= 30) score += 0.1;
    else if (resolutionM > 100) score -= 0.1;
  }

  return Math.max(0, Math.min(1, score));
}

// ── Helpers ──────────────────────────────────────────────────────────

function safeParse(json: string): any {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
