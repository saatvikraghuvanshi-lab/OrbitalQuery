/**
 * Integration tests for Node → Python analysis gateway.
 *
 * These tests require both the Node backend (port 3001) and
 * the Python analysis service (port 8000) to be running.
 *
 * Run: npx jest tests/analysis.integration.test.ts --forceExit
 */

const NODE_URL = 'http://localhost:3001';

// ── Helper ──────────────────────────────────────────────────────────

async function post(path: string, body: any) {
  const res = await fetch(`${NODE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data, headers: res.headers };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('POST /api/analysis/search-scenes', () => {
  it('returns scenes for a valid bbox + date range', async () => {
    const { status, data } = await post('/api/analysis/search-scenes', {
      bbox: [75.5, 26.5, 76.0, 27.0],
      start_date: '2024-03-01',
      end_date: '2024-03-31',
      collection: 'sentinel-2-l2a',
      max_cloud_cover: 20,
      limit: 3,
    });

    expect(status).toBe(200);
    expect(data.status).toBe('ok');
    expect(data.requestId).toBeDefined();
    expect(data.collection).toBe('sentinel-2-l2a');
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items.length).toBeLessThanOrEqual(3);

    if (data.items.length > 0) {
      const item = data.items[0];
      expect(item.id).toBeDefined();
      expect(item.collection).toBe('sentinel-2-l2a');
      expect(item.bbox).toHaveLength(4);
      expect(item.geometry).toBeDefined();
      expect(item.properties.datetime).toBeDefined();
    }
  });

  it('returns 400 for missing bbox', async () => {
    const { status, data } = await post('/api/analysis/search-scenes', {
      start_date: '2024-03-01',
      end_date: '2024-03-31',
    });

    expect(status).toBe(400);
    expect(data.code).toBe('MISSING_BBOX');
  });

  it('returns 400 for invalid bbox', async () => {
    const { status, data } = await post('/api/analysis/search-scenes', {
      bbox: [76.0, 27.0, 75.5, 26.5], // inverted
      start_date: '2024-03-01',
      end_date: '2024-03-31',
    });

    expect(status).toBe(400);
    expect(data.code).toBe('INVALID_BBOX');
  });

  it('returns 400 for missing dates', async () => {
    const { status, data } = await post('/api/analysis/search-scenes', {
      bbox: [75.5, 26.5, 76.0, 27.0],
    });

    expect(status).toBe(400);
    expect(data.code).toBe('MISSING_DATE');
  });

  it('returns 400 for invalid collection', async () => {
    const { status, data } = await post('/api/analysis/search-scenes', {
      bbox: [75.5, 26.5, 76.0, 27.0],
      start_date: '2024-03-01',
      end_date: '2024-03-31',
      collection: 'fake-collection',
    });

    expect(status).toBe(400);
    expect(data.code).toBe('INVALID_COLLECTION');
  });

  it('returns requestId in response header', async () => {
    const res = await fetch(`${NODE_URL}/api/analysis/search-scenes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bbox: [75.5, 26.5, 76.0, 27.0],
        start_date: '2024-03-01',
        end_date: '2024-03-31',
        limit: 1,
      }),
    });

    expect(res.headers.get('x-request-id')).toBeDefined();
  });
});

describe('POST /api/analysis/preview', () => {
  it('returns raster stats for a valid request', async () => {
    const { status, data } = await post('/api/analysis/preview', {
      bbox: [75.7, 26.8, 75.9, 27.0],
      start_date: '2024-03-01',
      end_date: '2024-03-31',
      collection: 'sentinel-2-l2a',
      max_cloud_cover: 20,
      limit: 1,
    });

    expect(status).toBe(200);
    expect(data.status).toBe('ok');
    expect(data.requestId).toBeDefined();
    expect(data.aoiBbox).toEqual([75.7, 26.8, 75.9, 27.0]);
    expect(data.scene).toBeDefined();
    expect(data.scene.itemId).toBeDefined();
    expect(data.scene.collection).toBe('sentinel-2-l2a');
    expect(data.scene.assetUsed).toBeDefined();
    // signed_href must NOT be exposed
    expect(data.scene.signedHref).toBeUndefined();
    expect(data.windowShape).toBeDefined();
    expect(Array.isArray(data.bandStats)).toBe(true);
    expect(data.crs).toBeDefined();
    expect(data.readMethod).toBe('windowed');
  });

  it('returns 400 for missing bbox', async () => {
    const { status, data } = await post('/api/analysis/preview', {
      start_date: '2024-03-01',
      end_date: '2024-03-31',
    });

    expect(status).toBe(400);
    expect(data.code).toBe('INVALID_BBOX');
  });

  it('returns 400 for missing dates', async () => {
    const { status, data } = await post('/api/analysis/preview', {
      bbox: [75.7, 26.8, 75.9, 27.0],
    });

    expect(status).toBe(400);
    expect(data.code).toBe('MISSING_DATE');
  });

  it('returns 400 for inverted date range', async () => {
    const { status, data } = await post('/api/analysis/preview', {
      bbox: [75.7, 26.8, 75.9, 27.0],
      start_date: '2024-06-01',
      end_date: '2024-01-01',
    });

    expect(status).toBe(400);
    expect(data.code).toBe('INVALID_DATE_RANGE');
  });
});

describe('GET /api/analysis/health', () => {
  it('returns combined health status', async () => {
    const res = await fetch(`${NODE_URL}/api/analysis/health`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.node).toBe('ok');
    expect(['ok', 'unavailable']).toContain(data.python);
    expect(data.pythonUrl).toBeDefined();
  });
});

describe('Request correlation', () => {
  it('preserves X-Request-ID when sent by client', async () => {
    const testId = 'test-req-12345';
    const res = await fetch(`${NODE_URL}/api/analysis/search-scenes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': testId,
      },
      body: JSON.stringify({
        bbox: [75.5, 26.5, 76.0, 27.0],
        start_date: '2024-03-01',
        end_date: '2024-03-31',
        limit: 1,
      }),
    });

    expect(res.headers.get('x-request-id')).toBe(testId);
  });
});

describe('Existing routes unaffected', () => {
  it('GET /api/health still works', async () => {
    const res = await fetch(`${NODE_URL}/api/health`);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.service).toBe('orbital-query-backend');
  });

  it('POST /api/search still works', async () => {
    const res = await fetch(`${NODE_URL}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'sentinel', limit: 2 }),
    });
    const data = await res.json();
    expect(data.results).toBeDefined();
    expect(data.total).toBeDefined();
  });
});
