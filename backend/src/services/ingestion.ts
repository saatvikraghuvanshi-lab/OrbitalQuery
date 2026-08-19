import fetch from 'node-fetch';
import { prisma } from '../index';

const STAC_API = process.env.STAC_API_URL || 'https://planetarycomputer.microsoft.com/api/stac/v1';

interface IngestOptions {
  collections: string[];
  maxItems: number;
  bbox?: [number, number, number, number]; // [west, south, east, north]
}

interface STACItem {
  id: string;
  stac_version: string;
  type: string;
  geometry: any;
  bbox?: number[];
  properties: {
    title?: string;
    description?: string;
    datetime?: string;
    'datetime:start'?: string;
    'datetime:end'?: string;
    'eo:cloud_cover'?: number;
    'gsd'?: number;
    'platform'?: string;
    'instruments'?: string[];
    [key: string]: any;
  };
  assets?: Record<string, {
    href: string;
    title?: string;
    type?: string;
    roles?: string[];
  }>;
  links?: any[];
  collection?: string;
}

interface STACCollection {
  id: string;
  title?: string;
  description?: string;
  providers?: { name: string; [key: string]: any }[];
}

/**
 * Fetch collections available from the STAC API
 */
async function fetchCollections(): Promise<STACCollection[]> {
  const res = await fetch(`${STAC_API}/collections`);
  if (!res.ok) throw new Error(`Failed to fetch collections: ${res.status}`);
  const data = await res.json() as any;
  return data.collections || [];
}

/**
 * Search for items using STAC search endpoint
 */
async function searchSTAC(params: {
  collections: string[];
  maxItems: number;
  bbox?: [number, number, number, number];
  datetime?: string;
}): Promise<STACItem[]> {
  const body: any = {
    collections: params.collections,
    limit: Math.min(params.maxItems, 100), // STAC API max per page
  };

  if (params.bbox) {
    body.bbox = params.bbox;
  }

  if (params.datetime) {
    body.datetime = params.datetime;
  }

  const res = await fetch(`${STAC_API}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`STAC search failed (${res.status}): ${text}`);
  }

  const data = await res.json() as any;
  return data.features || [];
}

/**
 * Convert STAC item to Prisma-compatible EO dataset
 */
function stacItemToDataset(item: STACItem): Record<string, any> {
  const props = item.properties;

  // Extract geometry centroid
  let centroidLat = 0;
  let centroidLng = 0;

  if (item.geometry) {
    if (item.geometry.type === 'Point' && item.geometry.coordinates) {
      centroidLng = item.geometry.coordinates[0];
      centroidLat = item.geometry.coordinates[1];
    } else if (item.geometry.type === 'Polygon' && item.geometry.coordinates?.[0]) {
      const coords = item.geometry.coordinates[0];
      centroidLng = coords.reduce((s: number, c: number[]) => s + c[0], 0) / coords.length;
      centroidLat = coords.reduce((s: number, c: number[]) => s + c[1], 0) / coords.length;
    } else if (item.geometry.type === 'MultiPolygon' && item.geometry.coordinates?.[0]?.[0]) {
      const coords = item.geometry.coordinates[0][0];
      centroidLng = coords.reduce((s: number, c: number[]) => s + c[0], 0) / coords.length;
      centroidLat = coords.reduce((s: number, c: number[]) => s + c[1], 0) / coords.length;
    }
  }

  // Extract date range
  const startDate = props.datetime || props['datetime:start'] || null;
  const endDate = props['datetime:end'] || props.datetime || null;

  // Extract preview/thumbnail
  let previewUrl: string | null = null;
  if (item.assets) {
    const thumb = item.assets['thumbnail'] || item.assets['rendered_preview'] || item.assets['visual'];
    if (thumb) previewUrl = thumb.href;
  }

  // Extract download links
  const assets = item.assets ? Object.entries(item.assets).reduce((acc, [key, val]) => {
    acc[key] = { href: val.href, title: val.title, type: val.type };
    return acc;
  }, {} as Record<string, any>) : null;

  return {
    stacId: item.id,
    title: props.title || item.id,
    description: props.description || null,
    provider: inferProvider(item),
    collection: item.collection || null,
    platform: props.platform || null,
    instrument: props.instruments?.join(', ') || null,
    gsd: props.gsd || null,
    cloudCover: props['eo:cloud_cover'] ?? null,
    geometry: item.geometry || { type: 'Point', coordinates: [centroidLng, centroidLat] },
    bbox: item.bbox || null,
    centroidLat,
    centroidLng,
    startDate: startDate ? new Date(startDate) : null,
    endDate: endDate ? new Date(endDate) : null,
    assets: assets ? JSON.stringify(assets) : null,
    stacLink: `${STAC_API}/../items/${item.id}`,
    previewUrl,
  };
}

function inferProvider(item: STACItem): string {
  const collection = item.collection || '';
  const id = item.id || '';

  if (collection.includes('sentinel') || id.includes('S2')) return 'Copernicus/ESA';
  if (collection.includes('landsat') || id.includes('LC08') || id.includes('LC09')) return 'USGS/NASA';
  if (collection.includes('modis') || collection.includes('ASTER')) return 'NASA';
  if (collection.includes('naip')) return 'USDA';
  return 'Planetary Computer';
}

/**
 * Main ingestion function
 */
export async function ingestFromPlanetaryComputer(options: IngestOptions) {
  const { collections, maxItems, bbox } = options;
  let totalIngested = 0;
  let totalSkipped = 0;
  const errors: string[] = [];

  console.log(`🛰️  Starting ingestion from Planetary Computer...`);
  console.log(`   Collections: ${collections.join(', ')}`);
  console.log(`   Max items: ${maxItems}`);

  for (const collection of collections) {
    try {
      console.log(`\n📦 Fetching collection: ${collection}`);

      const items = await searchSTAC({
        collections: [collection],
        maxItems,
        bbox,
      });

      console.log(`   Found ${items.length} items`);

      for (const item of items) {
        try {
          const data = stacItemToDataset(item);

          // Upsert by stacId
          const existing = await prisma.eODataset.findUnique({
            where: { stacId: item.id },
          });

          if (existing) {
            totalSkipped++;
            continue;
          }

          await prisma.eODataset.create({ data: data as any });
          totalIngested++;
        } catch (e: any) {
          errors.push(`Item ${item.id}: ${e.message}`);
        }
      }
    } catch (e: any) {
      console.error(`   ❌ Error ingesting ${collection}: ${e.message}`);
      errors.push(`Collection ${collection}: ${e.message}`);
    }
  }

  console.log(`\n✅ Ingestion complete: ${totalIngested} new, ${totalSkipped} skipped`);

  return {
    totalIngested,
    totalSkipped,
    collections,
    errors: errors.slice(0, 10), // Limit error output
  };
}
