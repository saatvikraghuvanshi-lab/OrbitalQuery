/**
 * Integration tests for Node → Python analysis gateway.
 *
 * Requires: Node backend (3001) + Python service (8000) running.
 * Run: node tests/analysis.integration.test.js
 */

const NODE_URL = 'http://localhost:3001';

let passed = 0;
let failed = 0;

async function post(path, body, timeoutMs = 120000) {
  const res = await fetch(`${NODE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json();
  return { status: res.status, data, headers: res.headers };
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${b}, got ${a}`);
}

function assertDefined(val, msg) {
  if (val === undefined || val === null) throw new Error(msg || 'Expected defined value');
}

async function run() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Node → Python Analysis Integration Tests');
  console.log('═══════════════════════════════════════════════════\n');

  // ── Search Scenes ──────────────────────────────────────────

  console.log('POST /api/analysis/search-scenes');

  await test('returns scenes for valid bbox + date range', async () => {
    const { status, data } = await post('/api/analysis/search-scenes', {
      bbox: [75.5, 26.5, 76.0, 27.0],
      start_date: '2024-03-01',
      end_date: '2024-03-31',
      collection: 'sentinel-2-l2a',
      max_cloud_cover: 20,
      limit: 3,
    });
    assertEqual(status, 200, `Expected 200, got ${status}`);
    assertEqual(data.status, 'ok');
    assertDefined(data.requestId);
    assertEqual(data.collection, 'sentinel-2-l2a');
    assert(Array.isArray(data.items), 'items should be array');
    assert(data.items.length <= 3, 'should have <= 3 items');
    if (data.items.length > 0) {
      assertDefined(data.items[0].id);
      assertEqual(data.items[0].collection, 'sentinel-2-l2a');
    }
  });

  await test('returns 400 for missing bbox', async () => {
    const { status, data } = await post('/api/analysis/search-scenes', {
      start_date: '2024-03-01',
      end_date: '2024-03-31',
    });
    assertEqual(status, 400);
    assertEqual(data.code, 'MISSING_BBOX');
  });

  await test('returns 400 for invalid bbox (inverted)', async () => {
    const { status, data } = await post('/api/analysis/search-scenes', {
      bbox: [76.0, 27.0, 75.5, 26.5],
      start_date: '2024-03-01',
      end_date: '2024-03-31',
    });
    assertEqual(status, 400);
    assertEqual(data.code, 'INVALID_BBOX');
  });

  await test('returns 400 for missing dates', async () => {
    const { status, data } = await post('/api/analysis/search-scenes', {
      bbox: [75.5, 26.5, 76.0, 27.0],
    });
    assertEqual(status, 400);
    assertEqual(data.code, 'MISSING_DATE');
  });

  await test('returns 400 for invalid collection', async () => {
    const { status, data } = await post('/api/analysis/search-scenes', {
      bbox: [75.5, 26.5, 76.0, 27.0],
      start_date: '2024-03-01',
      end_date: '2024-03-31',
      collection: 'fake-collection',
    });
    assertEqual(status, 400);
    assertEqual(data.code, 'INVALID_COLLECTION');
  });

  await test('returns X-Request-ID header', async () => {
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
    assertDefined(res.headers.get('x-request-id'));
  });

  // ── Preview ────────────────────────────────────────────────

  console.log('\nPOST /api/analysis/preview');

  await test('returns raster stats for valid request', async () => {
    const { status, data } = await post('/api/analysis/preview', {
      bbox: [75.7, 26.8, 75.9, 27.0],
      start_date: '2024-03-01',
      end_date: '2024-03-31',
      collection: 'sentinel-2-l2a',
      max_cloud_cover: 20,
      limit: 1,
    });
    assertEqual(status, 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
    assertEqual(data.status, 'ok');
    assertDefined(data.requestId);
    assertDefined(data.scene);
    assertDefined(data.scene.itemId);
    assertEqual(data.scene.collection, 'sentinel-2-l2a');
    assertDefined(data.scene.assetUsed);
    assertEqual(data.scene.signedHref, undefined, 'signed_href must not be exposed');
    assertDefined(data.windowShape);
    assert(Array.isArray(data.bandStats));
    assertDefined(data.crs);
    assertEqual(data.readMethod, 'windowed');
  });

  await test('returns 400 for missing bbox', async () => {
    const { status, data } = await post('/api/analysis/preview', {
      start_date: '2024-03-01',
      end_date: '2024-03-31',
    });
    assertEqual(status, 400);
    assertEqual(data.code, 'INVALID_BBOX');
  });

  await test('returns 400 for missing dates', async () => {
    const { status, data } = await post('/api/analysis/preview', {
      bbox: [75.7, 26.8, 75.9, 27.0],
    });
    assertEqual(status, 400);
    assertEqual(data.code, 'MISSING_DATE');
  });

  await test('returns 400 for inverted date range', async () => {
    const { status, data } = await post('/api/analysis/preview', {
      bbox: [75.7, 26.8, 75.9, 27.0],
      start_date: '2024-06-01',
      end_date: '2024-01-01',
    });
    assertEqual(status, 400);
    assertEqual(data.code, 'INVALID_DATE_RANGE');
  });

  // ── Timeseries ────────────────────────────────────────────

  console.log('\nPOST /api/analysis/timeseries');

  await test('returns datacube metadata for valid request', async () => {
    const { status, data } = await post('/api/analysis/timeseries', {
      bbox: [75.7, 26.8, 75.9, 27.0],
      start_date: '2024-03-01',
      end_date: '2024-03-31',
      collection: 'sentinel-2-l2a',
      max_cloud_cover: 30,
      max_scenes: 5,
      bands: ['B04', 'B03', 'B02'],
    });
    assertEqual(status, 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
    assertDefined(data.analysisId);
    assertEqual(data.status, 'ok');
    assert(data.scenesDiscovered > 0, 'should discover scenes');
    assert(data.scenesSelected > 0, 'should select scenes');
    assert(data.scenesSelected <= 5, 'should respect max_scenes');
    assert(Array.isArray(data.cubeShape), 'cubeShape should be array');
    assertEqual(data.cubeShape.length, 4, 'cube should be 4D (time, band, y, x)');
    assert(Array.isArray(data.acquisitionDates), 'acquisitionDates should be array');
    assert(Array.isArray(data.processingSteps), 'processingSteps should be array');
    assert(data.processingSteps.length >= 5, 'should have at least 5 processing steps');
    assertDefined(data.diagnostics);
    assert(Array.isArray(data.selectedScenes));
    assert(data.selectedScenes.length > 0);
    assertDefined(data.selectedScenes[0].itemId);
    assertDefined(data.selectedScenes[0].cloudCover);
    assert(typeof data.selectedScenes[0].score === 'number');
  });

  await test('returns 400 for missing bbox', async () => {
    const { status, data } = await post('/api/analysis/timeseries', {
      start_date: '2024-03-01',
      end_date: '2024-03-31',
    });
    assertEqual(status, 400);
    assertEqual(data.code, 'INVALID_BBOX');
  });

  await test('returns 400 for inverted date range', async () => {
    const { status, data } = await post('/api/analysis/timeseries', {
      bbox: [75.7, 26.8, 75.9, 27.0],
      start_date: '2024-06-01',
      end_date: '2024-01-01',
    });
    assertEqual(status, 400);
    assertEqual(data.code, 'INVALID_DATE_RANGE');
  });

  // ── Preprocess ────────────────────────────────────────────

  console.log('\nPOST /api/analysis/preprocess');

  await test('returns preprocessing report for valid request', async () => {
    const { status, data } = await post('/api/analysis/preprocess', {
      bbox: [75.7, 26.8, 75.9, 27.0],
      start_date: '2024-03-01',
      end_date: '2024-03-31',
      collection: 'sentinel-2-l2a',
      max_cloud_cover: 30,
      max_scenes: 5,
      bands: ['B04', 'B03', 'B02'],
      target_crs: 'EPSG:32643',
      target_resolution: 10,
    });
    assertEqual(status, 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
    assertDefined(data.status);
    assertDefined(data.targetCrs);
    assert(typeof data.scenesTotal === 'number');
    assert(typeof data.scenesSuitable === 'number');
    assert(typeof data.scenesUnsuitable === 'number');
    assert(Array.isArray(data.scenes));
    assert(data.scenes.length > 0);
    assertDefined(data.comparability);
    assert(typeof data.comparability.comparable === 'boolean');
    assert(Array.isArray(data.warnings));
    // Check scene structure
    const scene = data.scenes[0];
    assertDefined(scene.itemId);
    assertDefined(scene.acquisitionDate);
    assert(typeof scene.cloudCover === 'number');
    assertDefined(scene.crs);
    assert(typeof scene.resolutionMeters === 'number');
    assert(typeof scene.spatialCoveragePct === 'number');
    assert(typeof scene.suitable === 'boolean');
    assert(Array.isArray(scene.preprocessingSteps));
    assert(scene.preprocessingSteps.length > 0);
    assert(Array.isArray(scene.rejectionReasons));
  });

  await test('returns 400 for missing bbox', async () => {
    const { status, data } = await post('/api/analysis/preprocess', {
      start_date: '2024-03-01', end_date: '2024-03-31',
    });
    assertEqual(status, 400);
    assertEqual(data.code, 'INVALID_BBOX');
  });

  await test('returns 400 for inverted date range', async () => {
    const { status, data } = await post('/api/analysis/preprocess', {
      bbox: [75.7, 26.8, 75.9, 27.0],
      start_date: '2024-06-01', end_date: '2024-01-01',
    });
    assertEqual(status, 400);
    assertEqual(data.code, 'INVALID_DATE_RANGE');
  });

  // ── Health ─────────────────────────────────────────────────

  console.log('\nGET /api/analysis/health');

  await test('returns combined health status', async () => {
    const res = await fetch(`${NODE_URL}/api/analysis/health`);
    const data = await res.json();
    assertEqual(res.status, 200);
    assertEqual(data.node, 'ok');
    assert(['ok', 'unavailable'].includes(data.python), `python status: ${data.python}`);
    assertDefined(data.pythonUrl);
  });

  // ── Request correlation ────────────────────────────────────

  console.log('\nRequest Correlation');

  await test('preserves client X-Request-ID', async () => {
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
    assertEqual(res.headers.get('x-request-id'), testId);
  });

  // ── Existing routes unaffected ─────────────────────────────

  console.log('\nExisting Routes (must not break)');

  await test('GET /api/health still works', async () => {
    const res = await fetch(`${NODE_URL}/api/health`);
    const data = await res.json();
    assertEqual(data.status, 'ok');
    assertEqual(data.service, 'orbital-query-backend');
  });

  await test('POST /api/search still works', async () => {
    const res = await fetch(`${NODE_URL}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'sentinel', limit: 2 }),
    });
    const data = await res.json();
    assertDefined(data.results);
    assertDefined(data.total);
  });

  // ── Summary ────────────────────────────────────────────────

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
