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

  // ── Change Detection ──────────────────────────────────────

  console.log('\nPOST /api/analysis/change-detect');

  await test('detects change in known 10x10 block', async () => {
    // Create synthetic arrays: baseline=0.5, comparison=0.5 except 10x10 block=0.9
    const size = 50;
    const baseline = Array.from({length: size}, () => Array(size).fill(0.5));
    const comparison = Array.from({length: size}, () => Array(size).fill(0.5));
    for (let r = 20; r < 30; r++) {
      for (let c = 20; c < 30; c++) {
        comparison[r][c] = 0.9;
      }
    }

    const { status, data } = await post('/api/analysis/change-detect', {
      baseline, comparison,
      index_name: 'NDVI',
      aoi_bbox: [75.7, 26.8, 75.9, 27.0],
      threshold: 0.2,
      min_region_size: 1,
      baseline_date: '2024-01-01',
      comparison_date: '2024-06-01',
    });
    assertEqual(status, 200, `Expected 200: ${JSON.stringify(data)}`);
    assertEqual(data.status, 'ok');
    assertEqual(data.algorithm, 'difference_threshold');
    assertEqual(data.changedPixels, 100); // 10x10 block
    assertEqual(data.numRegions, 1);
    assertDefined(data.largestRegion);
    assertEqual(data.largestRegion.areaPixels, 100);
    assert(typeof data.changedPct === 'number');
    assert(data.changedPct > 0);
    assert(Array.isArray(data.processingSteps));
    assert(data.processingSteps.length >= 6);
    assertDefined(data.reproducibility);
    assertEqual(data.reproducibility.deterministic, true);
  });

  await test('detects no change in identical arrays', async () => {
    const size = 20;
    const arr = Array.from({length: size}, () => Array(size).fill(0.5));
    const { status, data } = await post('/api/analysis/change-detect', {
      baseline: arr, comparison: arr,
      index_name: 'NDVI',
      aoi_bbox: [75.7, 26.8, 75.9, 27.0],
      threshold: 0.2,
    });
    assertEqual(status, 200);
    assertEqual(data.changedPixels, 0);
    assertEqual(data.numRegions, 0);
  });

  await test('returns 400 for missing arrays', async () => {
    const { status, data } = await post('/api/analysis/change-detect', {
      index_name: 'NDVI',
      aoi_bbox: [75.7, 26.8, 75.9, 27.0],
    });
    assertEqual(status, 400);
    assertEqual(data.code, 'MISSING_ARRAYS');
  });

  // ── Spectral Indices ──────────────────────────────────────

  console.log('\nGET /api/analysis/indices');

  await test('returns all available indices', async () => {
    const res = await fetch(`${NODE_URL}/api/analysis/indices`);
    const data = await res.json();
    assertEqual(res.status, 200);
    assertEqual(data.status, 'ok');
    assert(Array.isArray(data.indices));
    assertEqual(data.indices.length, 5);
    const names = data.indices.map(i => i.short_name).sort();
    assert(names.includes('NDVI'));
    assert(names.includes('NDWI'));
    assert(names.includes('NDBI'));
    assert(names.includes('NBR'));
    assert(names.includes('NDSI'));
    assertEqual(names.length, 5);
    assert(Array.isArray(data.supportedSensors));
    assert(data.supportedSensors.includes('sentinel-2-l2a'));
  });

  console.log('\nPOST /api/analysis/index');

  await test('validates NDVI for Sentinel-2', async () => {
    const { status, data } = await post('/api/analysis/index', {
      index_name: 'NDVI',
      sensor: 'sentinel-2-l2a',
    });
    assertEqual(status, 200);
    assertEqual(data.status, 'ok');
    assert(data.formula.includes('NIR'));
    assert(data.formula.includes('RED'));
    assertDefined(data.bandsUsed);
    assert(Array.isArray(data.validation));
    assertEqual(data.validation.length, 0);
    assert(data.supportedSensors.includes('sentinel-2-l2a'));
  });

  await test('validates NDVI for Landsat', async () => {
    const { status, data } = await post('/api/analysis/index', {
      index_name: 'NDVI',
      sensor: 'landsat-c2-l2',
    });
    assertEqual(status, 200);
    assertEqual(data.status, 'ok');
    assertDefined(data.bandsUsed);
  });

  await test('returns 400 for missing index_name', async () => {
    const { status, data } = await post('/api/analysis/index', {
      sensor: 'sentinel-2-l2a',
    });
    assertEqual(status, 400);
    assertEqual(data.code, 'MISSING_INDEX');
  });

  await test('returns 400 for missing sensor', async () => {
    const { status, data } = await post('/api/analysis/index', {
      index_name: 'NDVI',
    });
    assertEqual(status, 400);
    assertEqual(data.code, 'MISSING_SENSOR');
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

  // ── Evidence Ranking ──────────────────────────────────────

  console.log('\nPOST /api/analysis/evidence/select');

  await test('ranks scenes by suitability', async () => {
    const perfectScene = {
      id: 'PERFECT_001', bbox: [75.5, 26.5, 76.0, 27.0], collection: 'sentinel-2-l2a',
      properties: { datetime: '2024-03-15T10:30:00Z', 'eo:cloud_cover': 2.0, gsd: 10.0 },
      assets: { B02: {}, B03: {}, B04: {}, B08: {} },
    };
    const cloudyScene = {
      id: 'CLOUDY_001', bbox: [75.5, 26.5, 76.0, 27.0], collection: 'sentinel-2-l2a',
      properties: { datetime: '2024-03-15T10:30:00Z', 'eo:cloud_cover': 85.0, gsd: 10.0 },
      assets: { B02: {}, B03: {}, B04: {}, B08: {} },
    };
    const { status, data } = await post('/api/analysis/evidence/select', {
      scenes: [cloudyScene, perfectScene],
      aoi_bbox: [75.7, 26.8, 75.9, 27.0],
      target_start: '2024-03-01',
      target_end: '2024-03-31',
    });
    assertEqual(status, 200, `Expected 200: ${JSON.stringify(data)}`);
    assertEqual(data.status, 'ok');
    assertEqual(data.total_scenes, 2);
    assertDefined(data.best_scene);
    assertEqual(data.best_scene.item_id, 'PERFECT_001');
    assert(typeof data.best_scene.overall_score === 'number');
    assert(Array.isArray(data.rankings));
    assertEqual(data.rankings.length, 2);
    // Perfect should rank higher than cloudy
    assert(data.rankings[0].overall_score > data.rankings[1].overall_score);
    assertDefined(data.weights);
    assert(Array.isArray(data.processing_steps));
  });

  await test('returns 400 for missing scenes', async () => {
    const { status, data } = await post('/api/analysis/evidence/select', {
      aoi_bbox: [75.7, 26.8, 75.9, 27.0],
    });
    assertEqual(status, 400);
  });

  // ── Sensor Registry ───────────────────────────────────────

  console.log('\nGET /api/analysis/sensors');

  await test('lists all registered sensors', async () => {
    const res = await fetch(`${NODE_URL}/api/analysis/sensors`);
    const data = await res.json();
    assertEqual(res.status, 200);
    assertEqual(data.status, 'ok');
    assert(typeof data.count === 'number');
    assert(data.count >= 3, 'Should have at least 3 sensors');
    assert(Array.isArray(data.sensors));
    assert(Array.isArray(data.optical_sensors));
    assert(Array.isArray(data.sar_sensors));
    assert(data.sar_sensors.includes('sentinel-1-grd'));
  });

  await test('returns sentinel-2 detail', async () => {
    const res = await fetch(`${NODE_URL}/api/analysis/sensors/sentinel-2-l2a`);
    const data = await res.json();
    assertEqual(res.status, 200);
    assertEqual(data.status, 'ok');
    assertEqual(data.name, 'sentinel-2-l2a');
    assert(data.is_optical === true);
    assert(data.is_sar === false);
    assert(typeof data.bands === 'object');
    assert(Object.keys(data.bands).length >= 10);
  });

  await test('returns sentinel-1 detail', async () => {
    const res = await fetch(`${NODE_URL}/api/analysis/sensors/sentinel-1-grd`);
    const data = await res.json();
    assertEqual(res.status, 200);
    assertEqual(data.status, 'ok');
    assert(data.is_sar === true);
    assert(data.is_optical === false);
    assert(Array.isArray(data.polarizations));
    assert(data.polarizations.includes('VV'));
    assert(data.polarizations.includes('VH'));
  });

  await test('returns 404 for unknown sensor', async () => {
    const res = await fetch(`${NODE_URL}/api/analysis/sensors/nonexistent`);
    assertEqual(res.status, 404);
  });

  // ── Sentinel-1 Search ─────────────────────────────────────

  console.log('\nPOST /api/analysis/sentinel1/search');

  await test('searches Sentinel-1 scenes', async () => {
    const { status, data } = await post('/api/analysis/sentinel1/search', {
      bbox: [75.5, 26.5, 76.0, 27.0],
      start_date: '2024-03-01',
      end_date: '2024-03-31',
      limit: 3,
    });
    assertEqual(status, 200, `Expected 200: ${JSON.stringify(data)}`);
    assertEqual(data.status, 'ok');
    assertEqual(data.collection, 'sentinel-1-grd');
    assert(typeof data.totalMatches === 'number');
    assert(Array.isArray(data.scenes));
    if (data.scenes.length > 0) {
      assertDefined(data.scenes[0].itemId);
      assert(Array.isArray(data.scenes[0].polarization));
    }
    assert(Array.isArray(data.processingSteps));
  });

  await test('returns 400 for missing bbox', async () => {
    const { status, data } = await post('/api/analysis/sentinel1/search', {
      start_date: '2024-03-01', end_date: '2024-03-31',
    });
    assertEqual(status, 400);
    assertEqual(data.code, 'INVALID_BBOX');
  });

  // ── Flood Impact Intelligence ────────────────────────────

  console.log('\nPOST /api/analysis/flood/assess');

  await test('runs flood assessment with synthetic data', async () => {
    // Create synthetic pre/post VV backscatter (50x50)
    const size = 50;
    const pre_vv = Array.from({length: size}, () => Array(size).fill(-12.0));
    const post_vv = Array.from({length: size}, () => Array(size).fill(-12.0));
    // 10x10 flood region: VV drops to -22 dB
    for (let r = 15; r < 25; r++) {
      for (let c = 15; c < 25; c++) {
        post_vv[r][c] = -22.0;
      }
    }

    const { status, data } = await post('/api/analysis/flood/assess', {
      query: 'Assess flood impact in Jaipur from August 2024',
      aoi_bbox: [75.7, 26.8, 75.9, 27.0],
      event_date: '2024-08-15',
      pre_vv_db: pre_vv,
      post_vv_db: post_vv,
      resolution_meters: 10.0,
    });
    assertEqual(status, 200, `Expected 200: ${JSON.stringify(data)}`);
    assert(data.analysis_id.startsWith('flood-'));
    assertEqual(data.status, 'ok');
    assert(typeof data.method === 'string');
    assert(typeof data.confidence === 'string');
    assert(Array.isArray(data.processing_steps));
    assert(data.processing_steps.length > 3);
    assert(typeof data.change_map_summary === 'object');
    assert(typeof data.change_map_summary.flood_area_sq_meters === 'number');
    assert(typeof data.evidence === 'object');
    assert(Array.isArray(data.limitations));
  });

  await test('returns metadata-only when no backscatter arrays', async () => {
    const { status, data } = await post('/api/analysis/flood/assess', {
      query: 'Flood assessment in Jaipur August 2024',
      aoi_bbox: [75.7, 26.8, 75.9, 27.0],
      event_date: '2024-08-15',
    });
    assertEqual(status, 200);
    assert(data.analysis_id.startsWith('flood-'));
    assert(Array.isArray(data.selected_scenes));
    assert(Array.isArray(data.processing_steps));
  });

  await test('returns 400 for missing query', async () => {
    const { status, data } = await post('/api/analysis/flood/assess', {
      aoi_bbox: [75.7, 26.8, 75.9, 27.0],
    });
    assertEqual(status, 400);
    assertEqual(data.code, 'MISSING_QUERY');
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
