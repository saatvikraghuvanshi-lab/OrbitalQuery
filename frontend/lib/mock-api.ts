/**
 * Mock API responses for frontend development without backend.
 * Activates when NEXT_PUBLIC_USE_MOCKS=true or backend is unreachable.
 *
 * Usage in .env.local:
 *   NEXT_PUBLIC_USE_MOCKS=true
 */

const MOCK_DATASETS = [
  {
    id: 'mock-001',
    stacId: 'S2A_MSIL2A_20240315_Assam',
    title: 'Sentinel-2 L2A - Assam Flood Monitoring (March 2024)',
    description: 'Multispectral satellite imagery covering the Brahmaputra river basin in Assam, India. Useful for flood monitoring, vegetation analysis, and land cover mapping. 10m resolution with 13 spectral bands.',
    provider: 'Copernicus/ESA',
    collection: 'sentinel-2-l2a',
    platform: 'Sentinel-2A',
    instrument: 'MSI',
    gsd: 10,
    cloudCover: 12.5,
    geometry: { type: 'Polygon', coordinates: [[[91.0, 26.0], [92.5, 26.0], [92.5, 27.5], [91.0, 27.5], [91.0, 26.0]]] },
    bbox: [91.0, 26.0, 92.5, 27.5],
    centroidLat: 26.75,
    centroidLng: 91.75,
    startDate: '2024-03-15T00:00:00.000Z',
    endDate: '2024-03-15T00:00:00.000Z',
    previewUrl: null,
    stacLink: 'https://planetarycomputer.microsoft.com/api/stac/v1',
    score: 0.92,
  },
  {
    id: 'mock-002',
    stacId: 'S2B_MSIL2A_20240110_Himalaya',
    title: 'Sentinel-2 L2A - Himalayan Snow Cover (January 2024)',
    description: 'High-resolution multispectral imagery of the central Himalayan region including Nepal and northern India. Ideal for glacier monitoring, snow cover analysis, and glacial lake detection.',
    provider: 'Copernicus/ESA',
    collection: 'sentinel-2-l2a',
    platform: 'Sentinel-2B',
    instrument: 'MSI',
    gsd: 10,
    cloudCover: 5.2,
    geometry: { type: 'Polygon', coordinates: [[[84.0, 27.5], [86.0, 27.5], [86.0, 29.5], [84.0, 29.5], [84.0, 27.5]]] },
    bbox: [84.0, 27.5, 86.0, 29.5],
    centroidLat: 28.5,
    centroidLng: 85.0,
    startDate: '2024-01-10T00:00:00.000Z',
    endDate: '2024-01-10T00:00:00.000Z',
    previewUrl: null,
    stacLink: 'https://planetarycomputer.microsoft.com/api/stac/v1',
    score: 0.87,
  },
  {
    id: 'mock-003',
    stacId: 'S2A_MSIL2A_20230820_Jaipur',
    title: 'Sentinel-2 L2A - Jaipur Urban Expansion (August 2023)',
    description: 'Multispectral imagery covering the Jaipur metropolitan area in Rajasthan, India. Captures urban growth patterns, peri-urban agriculture, and Aravalli hill range. 10m resolution.',
    provider: 'Copernicus/ESA',
    collection: 'sentinel-2-l2a',
    platform: 'Sentinel-2A',
    instrument: 'MSI',
    gsd: 10,
    cloudCover: 8.3,
    geometry: { type: 'Polygon', coordinates: [[[75.5, 26.7], [76.2, 26.7], [76.2, 27.1], [75.5, 27.1], [75.5, 26.7]]] },
    bbox: [75.5, 26.7, 76.2, 27.1],
    centroidLat: 26.9,
    centroidLng: 75.85,
    startDate: '2023-08-20T00:00:00.000Z',
    endDate: '2023-08-20T00:00:00.000Z',
    previewUrl: null,
    stacLink: 'https://planetarycomputer.microsoft.com/api/stac/v1',
    score: 0.95,
  },
  {
    id: 'mock-004',
    stacId: 'LC08_L2_20230615_Gangetic',
    title: 'Landsat 8 OLI - Gangetic Plain Agriculture',
    description: 'Landsat 8 multispectral imagery over the Indo-Gangetic plain, India. 30m resolution capturing agricultural patterns, crop cycles, and irrigation networks during monsoon season.',
    provider: 'USGS/NASA',
    collection: 'landsat-c2-l2',
    platform: 'Landsat 8',
    instrument: 'OLI',
    gsd: 30,
    cloudCover: 15.8,
    geometry: { type: 'Polygon', coordinates: [[[78.0, 25.0], [82.0, 25.0], [82.0, 28.0], [78.0, 28.0], [78.0, 25.0]]] },
    bbox: [78.0, 25.0, 82.0, 28.0],
    centroidLat: 26.5,
    centroidLng: 80.0,
    startDate: '2023-06-15T00:00:00.000Z',
    endDate: '2023-06-15T00:00:00.000Z',
    previewUrl: null,
    stacLink: 'https://planetarycomputer.microsoft.com/api/stac/v1',
    score: 0.78,
  },
  {
    id: 'mock-005',
    stacId: 'LC09_L2_20240210_Amazon',
    title: 'Landsat 9 - Amazon Deforestation Monitoring',
    description: 'Landsat 9 OLI-2 imagery of the Brazilian Amazon basin. Critical for monitoring deforestation, forest degradation, and land use change. 30m resolution with thermal bands.',
    provider: 'USGS/NASA',
    collection: 'landsat-c2-l2',
    platform: 'Landsat 9',
    instrument: 'OLI-2',
    gsd: 30,
    cloudCover: 22.4,
    geometry: { type: 'Polygon', coordinates: [[[-60.0, -5.0], [-55.0, -5.0], [-55.0, 0.0], [-60.0, 0.0], [-60.0, -5.0]]] },
    bbox: [-60.0, -5.0, -55.0, 0.0],
    centroidLat: -2.5,
    centroidLng: -57.5,
    startDate: '2024-02-10T00:00:00.000Z',
    endDate: '2024-02-10T00:00:00.000Z',
    previewUrl: null,
    stacLink: 'https://planetarycomputer.microsoft.com/api/stac/v1',
    score: 0.82,
  },
  {
    id: 'mock-006',
    stacId: 'MODIS_Terra_LST_20240301',
    title: 'MODIS Terra Land Surface Temperature - Global Daily',
    description: 'Daily land surface temperature (LST) from MODIS Terra sensor. 1km resolution global coverage. Essential for climate studies, urban heat island analysis, and agricultural monitoring.',
    provider: 'NASA',
    collection: 'modis-terra-lst',
    platform: 'Terra',
    instrument: 'MODIS',
    gsd: 1000,
    cloudCover: 0,
    geometry: { type: 'Polygon', coordinates: [[[-180, -60], [180, -60], [180, 80], [-180, 80], [-180, -60]]] },
    bbox: [-180, -60, 180, 80],
    centroidLat: 10.0,
    centroidLng: 0.0,
    startDate: '2024-03-01T00:00:00.000Z',
    endDate: '2024-03-01T00:00:00.000Z',
    previewUrl: null,
    stacLink: 'https://planetarycomputer.microsoft.com/api/stac/v1',
    score: 0.65,
  },
  {
    id: 'mock-007',
    stacId: 'S2A_MSIL2A_20230715_Reef',
    title: 'Sentinel-2 - Great Barrier Reef Coral Health',
    description: 'High-resolution multispectral data over the Great Barrier Reef, Australia. Used for coral bleaching detection, reef health assessment, and marine ecosystem monitoring.',
    provider: 'Copernicus/ESA',
    collection: 'sentinel-2-l2a',
    platform: 'Sentinel-2A',
    instrument: 'MSI',
    gsd: 10,
    cloudCover: 3.1,
    geometry: { type: 'Polygon', coordinates: [[[146.0, -18.5], [148.0, -18.5], [148.0, -16.5], [146.0, -16.5], [146.0, -18.5]]] },
    bbox: [146.0, -18.5, 148.0, -16.5],
    centroidLat: -17.5,
    centroidLng: 147.0,
    startDate: '2023-07-15T00:00:00.000Z',
    endDate: '2023-07-15T00:00:00.000Z',
    previewUrl: null,
    stacLink: 'https://planetarycomputer.microsoft.com/api/stac/v1',
    score: 0.71,
  },
  {
    id: 'mock-008',
    stacId: 'S2B_MSIL2A_20240301_Fire',
    title: 'Sentinel-2 - Western Ghats Forest Fire Detection',
    description: 'Multispectral imagery for wildfire detection and burned area mapping in the Western Ghats biodiversity hotspot, India. Includes SWIR bands for fire scar identification.',
    provider: 'Copernicus/ESA',
    collection: 'sentinel-2-l2a',
    platform: 'Sentinel-2B',
    instrument: 'MSI',
    gsd: 10,
    cloudCover: 15.0,
    geometry: { type: 'Polygon', coordinates: [[[73.0, 9.0], [76.0, 9.0], [76.0, 15.0], [73.0, 15.0], [73.0, 9.0]]] },
    bbox: [73.0, 9.0, 76.0, 15.0],
    centroidLat: 12.0,
    centroidLng: 74.5,
    startDate: '2024-03-01T00:00:00.000Z',
    endDate: '2024-03-01T00:00:00.000Z',
    previewUrl: null,
    stacLink: 'https://planetarycomputer.microsoft.com/api/stac/v1',
    score: 0.88,
  },
];

const MOCK_PROVIDERS = ['Copernicus/ESA', 'USGS/NASA', 'NASA'];
const MOCK_COLLECTIONS = ['sentinel-2-l2a', 'landsat-c2-l2', 'modis-terra-lst'];

/**
 * Simulate semantic search by filtering mock datasets based on query keywords
 */
function mockSearch(body: any) {
  const query = (body.query || '').toLowerCase();
  const startTime = Date.now();

  let filtered = [...MOCK_DATASETS];

  // Keyword-based relevance scoring
  const scored = filtered.map(dataset => {
    const text = `${dataset.title} ${dataset.description} ${dataset.collection}`.toLowerCase();
    let score = 0.3; // base score

    const words = query.split(/\s+/);
    for (const word of words) {
      if (word.length < 3) continue;
      if (text.includes(word)) score += 0.15;
    }

    // Boost provider matches
    if (body.provider && dataset.provider === body.provider) score += 0.2;
    // Boost collection matches
    if (body.collection && dataset.collection === body.collection) score += 0.2;

    return { ...dataset, score: Math.min(score, 1.0) };
  });

  // Sort by score
  scored.sort((a, b) => b.score - a.score);

  // Filter by bbox if provided
  let results = scored;
  if (body.bbox && Array.isArray(body.bbox) && body.bbox.length === 4) {
    const [west, south, east, north] = body.bbox;
    results = results.filter(d => {
      if (!d.centroidLng || !d.centroidLat) return false;
      return d.centroidLng >= west && d.centroidLng <= east &&
             d.centroidLat >= south && d.centroidLat <= north;
    });
  }

  // Filter by provider
  if (body.provider) {
    results = results.filter(d => d.provider === body.provider);
  }

  // Filter by collection
  if (body.collection) {
    results = results.filter(d => d.collection === body.collection);
  }

  const limit = Math.min(body.limit || 20, results.length);
  const offset = body.offset || 0;

  return {
    results: results.slice(offset, offset + limit),
    total: results.length,
    limit,
    offset,
    latencyMs: Date.now() - startTime + Math.floor(Math.random() * 15) + 5, // Simulate latency
  };
}

/**
 * Install mock API handlers on the window for development.
 * Intercepts fetch calls to /api/* when backend is not running.
 */
export function installMockHandlers() {
  if (typeof window === 'undefined') return;

  const originalFetch = window.fetch;

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    // Only intercept /api/ calls when mocks are enabled
    if (!url.startsWith('/api/') && !url.startsWith('http://localhost:3001/api/')) {
      return originalFetch.call(window, input, init);
    }

    try {
      // Try real backend first
      return await originalFetch.call(window, input, init);
    } catch {
      // Backend unreachable — use mock responses
      console.warn(`🎭 Mock API: Backend unreachable, using mock data for ${url}`);

      const apiPath = url.replace(/.*\/api\//, '/api/');

      // Mock search endpoint
      if (apiPath === '/search' && init?.method === 'POST') {
        const body = JSON.parse(init.body as string || '{}');
        const data = mockSearch(body);
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Mock providers
      if (apiPath === '/search/providers') {
        return new Response(JSON.stringify(MOCK_PROVIDERS), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Mock collections
      if (apiPath === '/search/collections') {
        return new Response(JSON.stringify(MOCK_COLLECTIONS), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Mock datasets list
      if (apiPath === '/datasets' && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify({
          datasets: MOCK_DATASETS,
          total: MOCK_DATASETS.length,
          limit: 20,
          offset: 0,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Mock health check
      if (apiPath === '/health') {
        return new Response(JSON.stringify({
          status: 'ok',
          service: 'orbital-query-backend (mock)',
          timestamp: new Date().toISOString(),
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Default mock response
      return new Response(JSON.stringify({ error: 'Mock endpoint not implemented', path: apiPath }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  };
}
