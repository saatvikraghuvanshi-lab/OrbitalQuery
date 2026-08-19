/**
 * Ingest sample EO datasets into SQLite.
 */
import { PrismaClient } from '@prisma/client';
import * as path from 'path';

const prisma = new PrismaClient({
  datasources: { db: { url: `file:${path.join(__dirname, '../../prisma/dev.db')}` } },
});

const SAMPLE_DATASETS = [
  {
    stacId: 'S2A_MSIL2A_20240315_Assam',
    title: 'Sentinel-2 L2A - Assam Flood Monitoring (March 2024)',
    description: 'Multispectral satellite imagery covering the Brahmaputra river basin in Assam, India. Useful for flood monitoring, vegetation analysis, and land cover mapping. 10m resolution with 13 spectral bands.',
    provider: 'Copernicus/ESA',
    collection: 'sentinel-2-l2a',
    platform: 'Sentinel-2A',
    instrument: 'MSI',
    gsd: 10,
    cloudCover: 12.5,
    geometry: JSON.stringify({ type: 'Polygon', coordinates: [[[91.0, 26.0], [92.5, 26.0], [92.5, 27.5], [91.0, 27.5], [91.0, 26.0]]] }),
    bbox: JSON.stringify([91.0, 26.0, 92.5, 27.5]),
    centroidLat: 26.75,
    centroidLng: 91.75,
    startDate: '2024-03-15',
    endDate: '2024-03-15',
    previewUrl: null,
  },
  {
    stacId: 'S2B_MSIL2A_20240110_Himalaya',
    title: 'Sentinel-2 L2A - Himalayan Snow Cover (January 2024)',
    description: 'High-resolution multispectral imagery of the central Himalayan region including Nepal and northern India. Ideal for glacier monitoring, snow cover analysis, and glacial lake detection.',
    provider: 'Copernicus/ESA',
    collection: 'sentinel-2-l2a',
    platform: 'Sentinel-2B',
    instrument: 'MSI',
    gsd: 10,
    cloudCover: 5.2,
    geometry: JSON.stringify({ type: 'Polygon', coordinates: [[[84.0, 27.5], [86.0, 27.5], [86.0, 29.5], [84.0, 29.5], [84.0, 27.5]]] }),
    bbox: JSON.stringify([84.0, 27.5, 86.0, 29.5]),
    centroidLat: 28.5,
    centroidLng: 85.0,
    startDate: '2024-01-10',
    endDate: '2024-01-10',
    previewUrl: null,
  },
  {
    stacId: 'S2A_MSIL2A_20230820_Jaipur',
    title: 'Sentinel-2 L2A - Jaipur Urban Expansion (August 2023)',
    description: 'Multispectral imagery covering the Jaipur metropolitan area in Rajasthan, India. Captures urban growth patterns, peri-urban agriculture, and Aravalli hill range.',
    provider: 'Copernicus/ESA',
    collection: 'sentinel-2-l2a',
    platform: 'Sentinel-2A',
    instrument: 'MSI',
    gsd: 10,
    cloudCover: 8.3,
    geometry: JSON.stringify({ type: 'Polygon', coordinates: [[[75.5, 26.7], [76.2, 26.7], [76.2, 27.1], [75.5, 27.1], [75.5, 26.7]]] }),
    bbox: JSON.stringify([75.5, 26.7, 76.2, 27.1]),
    centroidLat: 26.9,
    centroidLng: 75.85,
    startDate: '2023-08-20',
    endDate: '2023-08-20',
    previewUrl: null,
  },
  {
    stacId: 'S2B_MSIL2A_20231201_Thar',
    title: 'Sentinel-2 L2A - Thar Desert Land Degradation',
    description: 'Dry season imagery of the Thar Desert region in western Rajasthan. Useful for monitoring desertification, sand dune dynamics, and soil moisture in arid environments.',
    provider: 'Copernicus/ESA',
    collection: 'sentinel-2-l2a',
    platform: 'Sentinel-2B',
    instrument: 'MSI',
    gsd: 10,
    cloudCover: 2.1,
    geometry: JSON.stringify({ type: 'Polygon', coordinates: [[[69.0, 24.0], [72.0, 24.0], [72.0, 27.0], [69.0, 27.0], [69.0, 24.0]]] }),
    bbox: JSON.stringify([69.0, 24.0, 72.0, 27.0]),
    centroidLat: 25.5,
    centroidLng: 70.5,
    startDate: '2023-12-01',
    endDate: '2023-12-01',
    previewUrl: null,
  },
  {
    stacId: 'LC08_L2_20230615_Gangetic',
    title: 'Landsat 8 OLI - Gangetic Plain Agriculture',
    description: 'Landsat 8 multispectral imagery over the Indo-Gangetic plain, India. 30m resolution capturing agricultural patterns, crop cycles, and irrigation networks during monsoon season.',
    provider: 'USGS/NASA',
    collection: 'landsat-c2-l2',
    platform: 'Landsat 8',
    instrument: 'OLI',
    gsd: 30,
    cloudCover: 15.8,
    geometry: JSON.stringify({ type: 'Polygon', coordinates: [[[78.0, 25.0], [82.0, 25.0], [82.0, 28.0], [78.0, 28.0], [78.0, 25.0]]] }),
    bbox: JSON.stringify([78.0, 25.0, 82.0, 28.0]),
    centroidLat: 26.5,
    centroidLng: 80.0,
    startDate: '2023-06-15',
    endDate: '2023-06-15',
    previewUrl: null,
  },
  {
    stacId: 'LC09_L2_20240210_Amazon',
    title: 'Landsat 9 - Amazon Deforestation Monitoring',
    description: 'Landsat 9 OLI-2 imagery of the Brazilian Amazon basin. Critical for monitoring deforestation, forest degradation, and land use change.',
    provider: 'USGS/NASA',
    collection: 'landsat-c2-l2',
    platform: 'Landsat 9',
    instrument: 'OLI-2',
    gsd: 30,
    cloudCover: 22.4,
    geometry: JSON.stringify({ type: 'Polygon', coordinates: [[[-60.0, -5.0], [-55.0, -5.0], [-55.0, 0.0], [-60.0, 0.0], [-60.0, -5.0]]] }),
    bbox: JSON.stringify([-60.0, -5.0, -55.0, 0.0]),
    centroidLat: -2.5,
    centroidLng: -57.5,
    startDate: '2024-02-10',
    endDate: '2024-02-10',
    previewUrl: null,
  },
  {
    stacId: 'LC08_L2_20180101_Sundarbans',
    title: 'Landsat 8 - Sundarbans Mangrove Monitoring',
    description: 'Landsat imagery of the Sundarbans mangrove forest in the Bay of Bengal delta. Long-term archive data for tracking mangrove health and coastal erosion.',
    provider: 'USGS/NASA',
    collection: 'landsat-c2-l2',
    platform: 'Landsat 8',
    instrument: 'OLI',
    gsd: 30,
    cloudCover: 18.9,
    geometry: JSON.stringify({ type: 'Polygon', coordinates: [[[88.0, 21.0], [90.0, 21.0], [90.0, 23.0], [88.0, 23.0], [88.0, 21.0]]] }),
    bbox: JSON.stringify([88.0, 21.0, 90.0, 23.0]),
    centroidLat: 22.0,
    centroidLng: 89.0,
    startDate: '2018-01-01',
    endDate: '2018-01-01',
    previewUrl: null,
  },
  {
    stacId: 'MODIS_Terra_LST_20240301',
    title: 'MODIS Terra Land Surface Temperature - Global Daily',
    description: 'Daily land surface temperature from MODIS Terra sensor. 1km resolution global coverage. Essential for climate studies and urban heat island analysis.',
    provider: 'NASA',
    collection: 'modis-terra-lst',
    platform: 'Terra',
    instrument: 'MODIS',
    gsd: 1000,
    cloudCover: 0,
    geometry: JSON.stringify({ type: 'Polygon', coordinates: [[[-180, -60], [180, -60], [180, 80], [-180, 80], [-180, -60]]] }),
    bbox: JSON.stringify([-180, -60, 180, 80]),
    centroidLat: 10.0,
    centroidLng: 0.0,
    startDate: '2024-03-01',
    endDate: '2024-03-01',
    previewUrl: null,
  },
  {
    stacId: 'VIIRS_DNB_202401_NightLights',
    title: 'VIIRS Nighttime Lights - Monthly Composite (Jan 2024)',
    description: 'VIIRS nighttime lights composite. Captures city lights, gas flares, and fires at 500m resolution. Useful for urbanization mapping and economic activity estimation.',
    provider: 'NASA',
    collection: 'viirs-dnb',
    platform: 'Suomi NPP',
    instrument: 'VIIRS',
    gsd: 500,
    cloudCover: 0,
    geometry: JSON.stringify({ type: 'Polygon', coordinates: [[[-180, -65], [180, -65], [180, 75], [-180, 75], [-180, -65]]] }),
    bbox: JSON.stringify([-180, -65, 180, 75]),
    centroidLat: 5.0,
    centroidLng: 0.0,
    startDate: '2024-01-01',
    endDate: '2024-01-31',
    previewUrl: null,
  },
  {
    stacId: 'SENTINEL1_IW_20240201_Sahara',
    title: 'Sentinel-1 SAR - Sahara Desert Soil Moisture',
    description: 'Synthetic Aperture Radar imagery of the Sahara Desert. C-band SAR penetrates clouds for soil moisture estimation and sand dune mapping.',
    provider: 'Copernicus/ESA',
    collection: 'sentinel-1-grd',
    platform: 'Sentinel-1A',
    instrument: 'C-SAR',
    gsd: 10,
    cloudCover: 0,
    geometry: JSON.stringify({ type: 'Polygon', coordinates: [[[0.0, 18.0], [10.0, 18.0], [10.0, 28.0], [0.0, 28.0], [0.0, 18.0]]] }),
    bbox: JSON.stringify([0.0, 18.0, 10.0, 28.0]),
    centroidLat: 23.0,
    centroidLng: 5.0,
    startDate: '2024-02-01',
    endDate: '2024-02-01',
    previewUrl: null,
  },
  {
    stacId: 'S2A_MSIL2A_20230715_Reef',
    title: 'Sentinel-2 - Great Barrier Reef Coral Health',
    description: 'High-resolution multispectral data over the Great Barrier Reef. Used for coral bleaching detection, reef health assessment, and marine ecosystem monitoring.',
    provider: 'Copernicus/ESA',
    collection: 'sentinel-2-l2a',
    platform: 'Sentinel-2A',
    instrument: 'MSI',
    gsd: 10,
    cloudCover: 3.1,
    geometry: JSON.stringify({ type: 'Polygon', coordinates: [[[146.0, -18.5], [148.0, -18.5], [148.0, -16.5], [146.0, -16.5], [146.0, -18.5]]] }),
    bbox: JSON.stringify([146.0, -18.5, 148.0, -16.5]),
    centroidLat: -17.5,
    centroidLng: 147.0,
    startDate: '2023-07-15',
    endDate: '2023-07-15',
    previewUrl: null,
  },
  {
    stacId: 'LC08_L2_20150101_Nepal',
    title: 'Landsat 8 - Nepal Earthquake Damage Assessment (2015)',
    description: 'Pre and post-earthquake imagery of the Kathmandu Valley following the April 2015 Gorkha earthquake. Critical for building damage assessment.',
    provider: 'USGS/NASA',
    collection: 'landsat-c2-l2',
    platform: 'Landsat 8',
    instrument: 'OLI',
    gsd: 30,
    cloudCover: 10.2,
    geometry: JSON.stringify({ type: 'Polygon', coordinates: [[[85.0, 27.5], [85.8, 27.5], [85.8, 28.0], [85.0, 28.0], [85.0, 27.5]]] }),
    bbox: JSON.stringify([85.0, 27.5, 85.8, 28.0]),
    centroidLat: 27.75,
    centroidLng: 85.4,
    startDate: '2015-01-01',
    endDate: '2015-04-25',
    previewUrl: null,
  },
  {
    stacId: 'S2B_MSIL2A_20240301_Fire',
    title: 'Sentinel-2 - Western Ghats Forest Fire Detection',
    description: 'Multispectral imagery for wildfire detection and burned area mapping in the Western Ghats biodiversity hotspot, India.',
    provider: 'Copernicus/ESA',
    collection: 'sentinel-2-l2a',
    platform: 'Sentinel-2B',
    instrument: 'MSI',
    gsd: 10,
    cloudCover: 15.0,
    geometry: JSON.stringify({ type: 'Polygon', coordinates: [[[73.0, 9.0], [76.0, 9.0], [76.0, 15.0], [73.0, 15.0], [73.0, 9.0]]] }),
    bbox: JSON.stringify([73.0, 9.0, 76.0, 15.0]),
    centroidLat: 12.0,
    centroidLng: 74.5,
    startDate: '2024-03-01',
    endDate: '2024-03-01',
    previewUrl: null,
  },
  {
    stacId: 'LC09_L2_20240601_Glaciers',
    title: 'Landsat 9 - Karakoram Glacier Retreat Monitoring',
    description: 'Landsat 9 imagery of the Karakoram range glaciers in northern Pakistan. Monitoring glacier extent, ice velocity, and glacial lake outburst flood risks.',
    provider: 'USGS/NASA',
    collection: 'landsat-c2-l2',
    platform: 'Landsat 9',
    instrument: 'OLI-2',
    gsd: 30,
    cloudCover: 25.0,
    geometry: JSON.stringify({ type: 'Polygon', coordinates: [[[74.0, 35.0], [77.0, 35.0], [77.0, 37.5], [74.0, 37.5], [74.0, 35.0]]] }),
    bbox: JSON.stringify([74.0, 35.0, 77.0, 37.5]),
    centroidLat: 36.25,
    centroidLng: 75.5,
    startDate: '2024-06-01',
    endDate: '2024-06-01',
    previewUrl: null,
  },
  {
    stacId: 'S2A_MSIL2A_20240510_Ocean',
    title: 'Sentinel-2 - Bay of Bengal Marine Pollution Detection',
    description: 'Coastal multispectral imagery for detecting ocean surface pollution, algal blooms, and suspended sediment plumes in the Bay of Bengal.',
    provider: 'Copernicus/ESA',
    collection: 'sentinel-2-l2a',
    platform: 'Sentinel-2A',
    instrument: 'MSI',
    gsd: 20,
    cloudCover: 6.7,
    geometry: JSON.stringify({ type: 'Polygon', coordinates: [[[86.0, 12.0], [92.0, 12.0], [92.0, 18.0], [86.0, 18.0], [86.0, 12.0]]] }),
    bbox: JSON.stringify([86.0, 12.0, 92.0, 18.0]),
    centroidLat: 15.0,
    centroidLng: 89.0,
    startDate: '2024-05-10',
    endDate: '2024-05-10',
    previewUrl: null,
  },
  {
    stacId: 'MODIS_Aqua_SST_20240401',
    title: 'MODIS Aqua - Indian Ocean Sea Surface Temperature',
    description: 'Sea surface temperature from MODIS Aqua sensor. Daily global SST maps at 4km resolution. Essential for ocean current analysis and El Niño tracking.',
    provider: 'NASA',
    collection: 'modis-aqua-sst',
    platform: 'Aqua',
    instrument: 'MODIS',
    gsd: 4000,
    cloudCover: 0,
    geometry: JSON.stringify({ type: 'Polygon', coordinates: [[[50.0, -30.0], [100.0, -30.0], [100.0, 30.0], [50.0, 30.0], [50.0, -30.0]]] }),
    bbox: JSON.stringify([50.0, -30.0, 100.0, 30.0]),
    centroidLat: 0.0,
    centroidLng: 75.0,
    startDate: '2024-04-01',
    endDate: '2024-04-01',
    previewUrl: null,
  },
];

async function main() {
  console.log('🛰️  OrbitalQuery - Sample Data Ingestion (SQLite)');
  console.log('━'.repeat(50));

  await prisma.$connect();
  console.log('✅ Connected to SQLite database');

  const existingCount = await prisma.eODataset.count();
  if (existingCount > 0) {
    console.log(`⚠️  Clearing ${existingCount} existing datasets...`);
    await prisma.eODataset.deleteMany();
  }

  console.log(`\n📦 Inserting ${SAMPLE_DATASETS.length} sample datasets...`);

  let inserted = 0;
  for (const data of SAMPLE_DATASETS) {
    try {
      await prisma.eODataset.create({ data });
      inserted++;
      process.stdout.write('.');
    } catch (e: any) {
      console.error(`\n   ❌ ${data.stacId}: ${e.message}`);
    }
  }

  console.log(`\n\n✅ Inserted ${inserted}/${SAMPLE_DATASETS.length} datasets`);

  const stats = await prisma.eODataset.groupBy({ by: ['provider'], _count: true });
  console.log('\n📊 By Provider:');
  for (const stat of stats) {
    console.log(`   ${stat.provider}: ${stat._count} datasets`);
  }

  console.log('\n🎯 Try searching:');
  console.log('   • "deforestation near Assam 2015-2020"');
  console.log('   • "urban expansion in Jaipur"');
  console.log('   • "glacier retreat in Himalayas"');
  console.log('   • "ocean temperature Indian Ocean"');
  console.log('   • "forest fire detection Western Ghats"');

  await prisma.$disconnect();
  console.log('\n✅ Done!');
}

main().catch((e) => {
  console.error('❌ Error:', e);
  process.exit(1);
});
