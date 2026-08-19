import fetch from 'node-fetch';
import { prisma } from '../index';

const STAC_API = process.env.STAC_API_URL || 'https://planetarycomputer.microsoft.com/api/stac/v1';

interface IngestOptions {
  collections: string[];
  maxItems: number;
  bbox?: [number, number, number, number];
}

interface STACItem {
  id: string;
  stac_version: string;
  type: string;
  geometry: any;
  bbox?: number[];
  properties: Record<string, any>;
  assets?: Record<string, { href: string; title?: string; type?: string; roles?: string[] }>;
  collection?: string;
}

function stacItemToDataset(item: STACItem): Record<string, any> {
  const props = item.properties;

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
    }
  }

  const startDate = props.datetime || props['datetime:start'] || null;
  const endDate = props['datetime:end'] || props.datetime || null;

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
    geometry: JSON.stringify(item.geometry || { type: 'Point', coordinates: [centroidLng, centroidLat] }),
    bbox: item.bbox ? JSON.stringify(item.bbox) : null,
    centroidLat,
    centroidLng,
    startDate: startDate ? new Date(startDate).toISOString() : null,
    endDate: endDate ? new Date(endDate).toISOString() : null,
    assets: item.assets ? JSON.stringify(item.assets) : null,
    stacLink: `${STAC_API}/../items/${item.id}`,
  };
}

function inferProvider(item: STACItem): string {
  const collection = item.collection || '';
  const id = item.id || '';
  if (collection.includes('sentinel') || id.includes('S2')) return 'Copernicus/ESA';
  if (collection.includes('landsat') || id.includes('LC08') || id.includes('LC09')) return 'USGS/NASA';
  if (collection.includes('modis') || collection.includes('ASTER')) return 'NASA';
  return 'Planetary Computer';
}

async function searchSTAC(params: {
  collections: string[];
  maxItems: number;
  bbox?: [number, number, number, number];
}): Promise<STACItem[]> {
  const body: any = {
    collections: params.collections,
    limit: Math.min(params.maxItems, 100),
  };
  if (params.bbox) body.bbox = params.bbox;

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

export async function ingestFromPlanetaryComputer(options: IngestOptions) {
  const { collections, maxItems, bbox } = options;
  let totalIngested = 0;
  let totalSkipped = 0;
  const errors: string[] = [];

  console.log(`🛰️  Starting ingestion from Planetary Computer...`);

  for (const collection of collections) {
    try {
      const items = await searchSTAC({ collections: [collection], maxItems, bbox });
      console.log(`   ${collection}: ${items.length} items found`);

      for (const item of items) {
        try {
          const data = stacItemToDataset(item);
          const existing = await prisma.eODataset.findUnique({ where: { stacId: item.id } });
          if (existing) { totalSkipped++; continue; }
          await prisma.eODataset.create({ data: data as any });
          totalIngested++;
        } catch (e: any) {
          errors.push(`Item ${item.id}: ${e.message}`);
        }
      }
    } catch (e: any) {
      errors.push(`Collection ${collection}: ${e.message}`);
    }
  }

  return { totalIngested, totalSkipped, collections, errors: errors.slice(0, 10) };
}
