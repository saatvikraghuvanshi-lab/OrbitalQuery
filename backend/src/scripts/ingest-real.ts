/**
 * Ingest REAL datasets from Planetary Computer STAC API.
 * 
 * Collections fetched:
 *   - sentinel-2-l2a (Copernicus/ESA) — 10m multispectral
 *   - landsat-c2-l2 (USGS/NASA) — 30m multispectral
 *   - sentinel-1-grd (Copernicus/ESA) — SAR
 *   - naip (USDA) — aerial imagery
 * 
 * Usage:
 *   npx ts-node src/scripts/ingest-real.ts [--limit 100] [--collection sentinel-2-l2a]
 *   npx ts-node src/scripts/ingest-real.ts --all
 */
import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';
import * as path from 'path';

const prisma = new PrismaClient({
  datasources: { db: { url: `file:${path.join(__dirname, '../../prisma/dev.db')}` } },
});

const PC_STAC_API = 'https://planetarycomputer.microsoft.com/api/stac/v1';

// Collections to fetch from Planetary Computer
const COLLECTIONS = [
  {
    id: 'sentinel-2-l2a',
    provider: 'Copernicus/ESA',
    platform: 'Sentinel-2',
    instrument: 'MSI',
    gsd: 10,
    description: 'Sentinel-2 Level-2A bottom-of-atmosphere reflectance',
  },
  {
    id: 'landsat-c2-l2',
    provider: 'USGS/NASA',
    platform: 'Landsat',
    instrument: 'OLI',
    gsd: 30,
    description: 'Landsat Collection 2 Level-2 surface reflectance',
  },
  {
    id: 'sentinel-1-grd',
    provider: 'Copernicus/ESA',
    platform: 'Sentinel-1',
    instrument: 'C-SAR',
    gsd: 10,
    description: 'Sentinel-1 Ground Range Detected SAR',
  },
  {
    id: 'naip',
    provider: 'USDA',
    platform: 'Aerial',
    instrument: 'Digital Camera',
    gsd: 0.6,
    description: 'National Agriculture Imagery Program aerial imagery',
  },
];

interface STACSearchResult {
  features: any[];
  next?: string;
  numberMatched?: number;
  numberReturned?: number;
}

async function searchSTAC(
  collectionId: string,
  limit: number = 100,
  bbox?: [number, number, number, number],
  datetime?: string,
  signal?: AbortSignal,
): Promise<any[]> {
  const body: any = {
    collections: [collectionId],
    limit,
  };
  if (bbox) body.bbox = bbox;
  if (datetime) body.datetime = datetime;

  const res = await fetch(`${PC_STAC_API}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`STAC search failed (${res.status}): ${text}`);
  }

  const data = await res.json() as STACSearchResult;
  return data.features || [];
}

function extractCentroid(geometry: any): { lat: number; lng: number } {
  if (!geometry) return { lat: 0, lng: 0 };

  if (geometry.type === 'Point') {
    return { lat: geometry.coordinates[1], lng: geometry.coordinates[0] };
  }

  if (geometry.type === 'Polygon' && geometry.coordinates?.[0]) {
    const coords = geometry.coordinates[0];
    const lng = coords.reduce((s: number, c: number[]) => s + c[0], 0) / coords.length;
    const lat = coords.reduce((s: number, c: number[]) => s + c[1], 0) / coords.length;
    return { lat, lng };
  }

  if (geometry.type === 'MultiPolygon' && geometry.coordinates?.[0]?.[0]) {
    const coords = geometry.coordinates[0][0];
    const lng = coords.reduce((s: number, c: number[]) => s + c[0], 0) / coords.length;
    const lat = coords.reduce((s: number, c: number[]) => s + c[1], 0) / coords.length;
    return { lat, lng };
  }

  return { lat: 0, lng: 0 };
}

function getPreviewUrl(item: any): string | null {
  if (!item.assets) return null;

  // Try common preview/thumbnail asset keys
  const previewKeys = ['rendered_preview', 'thumbnail', 'preview', 'visual', 'browse'];
  for (const key of previewKeys) {
    if (item.assets[key]?.href) {
      return item.assets[key].href;
    }
  }
  return null;
}

function getSTACLink(item: any): string {
  // Planetary Computer signed item link
  if (item.links?.self?.href) {
    return item.links.self.href;
  }
  if (item.links?.item?.href) {
    return item.links.item.href;
  }
  return `${PC_STAC_API}/../collections/${item.collection}/items/${item.id}`;
}

async function ingestCollection(
  collectionId: string,
  collectionMeta: typeof COLLECTIONS[0],
  maxItems: number,
  existingStacIds: Set<string>,
): Promise<{ ingested: number; skipped: number; errors: string[] }> {
  let ingested = 0;
  let skipped = 0;
  const errors: string[] = [];

  try {
    const items = await searchSTAC(collectionId, Math.min(maxItems, 100));
    console.log(`   📦 ${collectionId}: ${items.length} items fetched from STAC`);

    for (const item of items) {
      // Skip if already in database
      if (existingStacIds.has(item.id)) {
        skipped++;
        continue;
      }

      try {
        const props = item.properties || {};
        const { lat, lng } = extractCentroid(item.geometry);
        const startDate = props.datetime || null;
        const endDate = props['datetime:end'] || props.datetime || null;

        const dataset = {
          stacId: item.id,
          title: props.title || item.id,
          description: props.description || `${collectionMeta.description} - ${item.id}`,
          provider: collectionMeta.provider,
          collection: collectionId,
          platform: props.platform || collectionMeta.platform,
          instrument: props.instruments?.join(', ') || collectionMeta.instrument,
          gsd: props.gsd || collectionMeta.gsd,
          cloudCover: props['eo:cloud_cover'] ?? null,
          geometry: JSON.stringify(item.geometry || { type: 'Point', coordinates: [lng, lat] }),
          bbox: item.bbox ? JSON.stringify(item.bbox) : null,
          centroidLat: lat,
          centroidLng: lng,
          startDate: startDate ? new Date(startDate).toISOString() : null,
          endDate: endDate ? new Date(endDate).toISOString() : null,
          previewUrl: getPreviewUrl(item),
          stacLink: getSTACLink(item),
        };

        await prisma.eODataset.create({ data: dataset as any });
        existingStacIds.add(item.id);
        ingested++;
        process.stdout.write('.');
      } catch (e: any) {
        errors.push(`${item.id}: ${e.message}`);
      }
    }
  } catch (e: any) {
    errors.push(`Collection ${collectionId}: ${e.message}`);
  }

  return { ingested, skipped, errors };
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const maxPerCollection = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) || 50 : 50;
  const collectionIdx = args.indexOf('--collection');
  const singleCollection = collectionIdx >= 0 ? args[collectionIdx + 1] : null;
  const fetchAll = args.includes('--all');

  const collectionsToFetch = singleCollection
    ? COLLECTIONS.filter(c => c.id === singleCollection)
    : fetchAll
    ? COLLECTIONS
    : COLLECTIONS.slice(0, 2); // Default: Sentinel-2 + Landsat

  console.log('🛰️  OrbitalQuery — Real Data Ingestion');
  console.log('━'.repeat(55));
  console.log(`📡 Source: Planetary Computer STAC API`);
  console.log(`📦 Collections: ${collectionsToFetch.map(c => c.id).join(', ')}`);
  console.log(`🔢 Max per collection: ${maxPerCollection}`);
  console.log();

  await prisma.$connect();
  console.log('✅ Connected to SQLite database');

  // Get existing stac IDs to avoid duplicates
  const existingRecords = await prisma.eODataset.findMany({ select: { stacId: true } });
  const existingStacIds = new Set(existingRecords.map(r => r.stacId).filter((id): id is string => id !== null));
  console.log(`📋 ${existingStacIds.size} existing datasets in database`);

  let totalIngested = 0;
  let totalSkipped = 0;
  const allErrors: string[] = [];

  for (const collection of collectionsToFetch) {
    console.log(`\n🔍 Fetching ${collection.id}...`);
    const result = await ingestCollection(collection.id, collection, maxPerCollection, existingStacIds);
    totalIngested += result.ingested;
    totalSkipped += result.skipped;
    allErrors.push(...result.errors);
    console.log(`\n   ✅ ${collection.id}: ${result.ingested} ingested, ${result.skipped} skipped`);
  }

  // Summary
  console.log('\n' + '━'.repeat(55));
  console.log('📊 Ingestion Summary:');
  console.log(`   🆕 Ingested: ${totalIngested} new datasets`);
  console.log(`   ⏭️  Skipped: ${totalSkipped} (already in database)`);
  console.log(`   ❌ Errors: ${allErrors.length}`);

  if (allErrors.length > 0) {
    console.log('\n⚠️  First 5 errors:');
    allErrors.slice(0, 5).forEach(e => console.log(`   ${e}`));
  }

  // Stats by provider
  const stats = await prisma.eODataset.groupBy({ by: ['provider'], _count: true });
  console.log('\n📊 Datasets by Provider:');
  for (const stat of stats) {
    console.log(`   ${stat.provider}: ${stat._count}`);
  }

  // Total count
  const totalCount = await prisma.eODataset.count();
  console.log(`\n📈 Total datasets in database: ${totalCount}`);

  console.log('\n🎯 Sample search queries:');
  console.log('   • "deforestation near Assam 2015-2020"');
  console.log('   • "urban expansion in Jaipur"');
  console.log('   • "glacier retreat in Himalayas"');
  console.log('   • "ocean temperature Indian Ocean"');
  console.log('   • "forest fire detection"');

  await prisma.$disconnect();
  console.log('\n✅ Done!');
}

main().catch((e) => {
  console.error('❌ Fatal error:', e);
  process.exit(1);
});
