/**
 * Live STAC Provider Layer.
 *
 * Queries external STAC APIs directly from Node.js (no Python dependency).
 * Normalises every provider's response into NormalizedDataset.
 *
 * Supported providers:
 *  - AWS Earth Search (free, no auth)
 *  - Microsoft Planetary Computer (free, no auth for search + tilejson)
 *
 * Provider failures are non-fatal: a timeout or 5xx on one provider
 * does not prevent results from other providers.
 */

import type { NormalizedDataset, BBox } from './eo-types';
import { extractCentroid } from './coverage-calculator';

// ── Provider definitions ─────────────────────────────────────────────

interface ProviderConfig {
  name: string;
  searchUrl: string;
  /** Collections to query if none specified. */
  defaultCollections: string[];
  timeoutMs: number;
}

const PROVIDERS: ProviderConfig[] = [
  {
    name: 'AWS Earth Search',
    searchUrl: 'https://earth-search.aws.element84.com/v1/search',
    defaultCollections: ['sentinel-2-l2a', 'landsat-c2-l2'],
    timeoutMs: 12_000,
  },
  {
    name: 'Planetary Computer',
    searchUrl: 'https://planetarycomputer.microsoft.com/api/stac/v1/search',
    defaultCollections: ['sentinel-2-l2a', 'landsat-c2-l2'],
    timeoutMs: 12_000,
  },
];

// ── Raw STAC item shape ──────────────────────────────────────────────

interface RawSTACItem {
  id: string;
  collection?: string;
  bbox?: number[];
  geometry?: GeoJSON.Geometry;
  properties?: Record<string, any>;
  assets?: Record<string, { href: string; type?: string; [k: string]: any }>;
  links?: Array<{ rel: string; href: string }>;
}

interface RawSTACResponse {
  features: RawSTACItem[];
  numberMatched?: number;
  numberReturned?: number;
}

// ── Search request ───────────────────────────────────────────────────

export interface STACSearchRequest {
  bbox: BBox;
  datetime?: string; // e.g. "2020-01-01/2025-12-31"
  collections?: string[];
  maxCloudCover?: number;
  limit?: number;
}

// ── Search result ────────────────────────────────────────────────────

export interface STACSearchResult {
  provider: string;
  items: NormalizedDataset[];
  totalMatched: number;
  latencyMs: number;
  error?: string;
}

// ── Normalizer ───────────────────────────────────────────────────────

function normalizeItem(
  raw: RawSTACItem,
  providerName: string,
  source: 'live',
): NormalizedDataset {
  const props = raw.properties || {};

  const previewUrl =
    raw.assets?.rendered_preview?.href ||
    raw.assets?.thumbnail?.href ||
    raw.assets?.visual?.href ||
    raw.assets?.preview?.href ||
    null;

  const tilejsonUrl = raw.assets?.tilejson?.href || null;

  const stacLink =
    raw.links?.find((l) => l.rel === 'self')?.href || null;

  // Build asset map (keyed by asset name)
  const assets: NormalizedDataset['assets'] = {};
  if (raw.assets) {
    for (const [key, asset] of Object.entries(raw.assets)) {
      assets[key] = { href: asset.href, mediaType: asset.type };
    }
  }

  const centroid = extractCentroid(raw.geometry || null);

  return {
    id: raw.id,
    provider: providerName,
    collection: raw.collection || 'unknown',
    title: props.title || `${raw.collection || 'item'} – ${raw.id?.substring(0, 50)}`,
    description: props.description || null,
    datetime: props.datetime || '',
    geometry: raw.geometry || null,
    bbox: raw.bbox || null,
    cloudCover: props['eo:cloud_cover'] ?? null,
    resolutionM: props['eo:gsd'] ?? null,
    platform: props.platform || null,
    instrument: Array.isArray(props.instruments)
      ? props.instruments.join(', ')
      : props.instruments || null,
    assets,
    previewUrl,
    stacLink,
    tilejsonUrl,
    source,
    aoiOverlap: null, // computed later
    centroid,
  };
}

// ── Provider query ───────────────────────────────────────────────────

async function queryProvider(
  config: ProviderConfig,
  request: STACSearchRequest,
): Promise<STACSearchResult> {
  const start = Date.now();

  const body: Record<string, any> = {
    bbox: request.bbox,
    limit: request.limit || 50,
  };

  // datetime
  if (request.datetime) {
    body.datetime = request.datetime;
  }

  // collections
  const collections = request.collections?.length
    ? request.collections
    : config.defaultCollections;
  if (collections.length === 1) {
    body.collections = collections;
  }
  // If multiple collections, STAC spec says omit collections field
  // and filter client-side, or make separate requests.
  // For simplicity we query the first collection and note the others.

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    const res = await fetch(config.searchUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        provider: config.name,
        items: [],
        totalMatched: 0,
        latencyMs: Date.now() - start,
        error: `HTTP ${res.status}: ${text.substring(0, 100)}`,
      };
    }

    const data: RawSTACResponse = await res.json();
    const rawItems = data.features || [];

    // Filter by cloud cover if specified
    let filtered = rawItems;
    if (request.maxCloudCover !== undefined) {
      filtered = rawItems.filter((item) => {
        const cc = item.properties?.['eo:cloud_cover'];
        return cc == null || cc <= request.maxCloudCover!;
      });
    }

    const normalized = filtered.map((item) =>
      normalizeItem(item, config.name, 'live'),
    );

    return {
      provider: config.name,
      items: normalized,
      totalMatched: data.numberMatched ?? rawItems.length,
      latencyMs: Date.now() - start,
    };
  } catch (err: any) {
    const isAbort =
      err.name === 'AbortError' || err.name === 'TimeoutError';
    return {
      provider: config.name,
      items: [],
      totalMatched: 0,
      latencyMs: Date.now() - start,
      error: isAbort
        ? `Timeout after ${config.timeoutMs}ms`
        : err.message || 'Unknown error',
    };
  }
}

// ── Parallel multi-provider search ───────────────────────────────────

/**
 * Query all configured STAC providers in parallel.
 * Returns results from every provider that responded — failures are
 * isolated and returned as errors, never thrown.
 */
export async function searchLiveSTAC(
  request: STACSearchRequest,
): Promise<STACSearchResult[]> {
  const promises = PROVIDERS.map((config) => queryProvider(config, request));
  const results = await Promise.allSettled(promises);

  return results.map((r) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      provider: 'unknown',
      items: [],
      totalMatched: 0,
      latencyMs: 0,
      error: r.reason?.message || 'Provider query failed',
    };
  });
}

// ── Deduplication ────────────────────────────────────────────────────

/**
 * Deduplicate NormalizedDatasets across providers.
 * Two items are duplicates if they share the same STAC item id.
 * When duplicated, prefer the one with more metadata (e.g. preview URL).
 */
export function deduplicateItems(
  items: NormalizedDataset[],
): NormalizedDataset[] {
  const byId = new Map<string, NormalizedDataset>();

  for (const item of items) {
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
    } else {
      // Keep the one with more metadata
      const existingScore = metadataScore(existing);
      const newScore = metadataScore(item);
      if (newScore > existingScore) {
        byId.set(item.id, item);
      }
    }
  }

  return Array.from(byId.values());
}

function metadataScore(item: NormalizedDataset): number {
  let score = 0;
  if (item.previewUrl) score += 2;
  if (item.tilejsonUrl) score += 2;
  if (item.stacLink) score += 1;
  if (item.geometry) score += 1;
  if (item.description) score += 1;
  if (item.assets && Object.keys(item.assets).length > 3) score += 1;
  return score;
}

// ── Convenience: build datetime string ────────────────────────────────

export function buildDatetimeRange(
  startDate?: string,
  endDate?: string,
): string | undefined {
  if (startDate && endDate) {
    return `${startDate}T00:00:00Z/${endDate}T23:59:59Z`;
  }
  if (startDate) return `${startDate}T00:00:00Z/..`;
  if (endDate) return `../${endDate}T23:59:59Z`;
  return undefined;
}
