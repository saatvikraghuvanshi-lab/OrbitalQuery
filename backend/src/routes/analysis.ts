/**
 * Analysis routes — Node gateway to Python EO analysis service.
 *
 * POST /api/analysis/search-scenes
 * POST /api/analysis/preview
 *
 * Validates input in Node, forwards to Python, sanitises response.
 * Existing dataset search routes are NOT modified.
 */

import { Router, Request, Response } from 'express';
import { callPythonService } from '../services/python-client';
import { optionalAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// ── Allowed collections (mirror of Python service) ─────────────────

const ALLOWED_COLLECTIONS = [
  'sentinel-2-l2a',
  'landsat-c2-l2',
  'sentinel-1-grd',
  'naip',
  'io-lulc-annual-v02',
];

// ── Input validation helpers ───────────────────────────────────────

function isValidBbox(bbox: any): boolean {
  if (!Array.isArray(bbox) || bbox.length !== 4) return false;
  const [west, south, east, north] = bbox;
  return (
    typeof west === 'number' &&
    typeof south === 'number' &&
    typeof east === 'number' &&
    typeof north === 'number' &&
    west >= -180 && west <= 180 &&
    south >= -90 && south <= 90 &&
    east >= -180 && east <= 180 &&
    north >= -90 && north <= 90 &&
    west < east &&
    south < north
  );
}

function isValidDateStr(d: any): boolean {
  if (!d || typeof d !== 'string') return false;
  const date = new Date(d);
  return !isNaN(date.getTime());
}

function isValidCollection(c: any): boolean {
  return typeof c === 'string' && ALLOWED_COLLECTIONS.includes(c);
}

// ── POST /api/analysis/search-scenes ───────────────────────────────

/**
 * Search STAC catalog via the Python analysis service.
 *
 * Request body:
 *   bbox:          [west, south, east, north]
 *   start_date:    "YYYY-MM-DD"
 *   end_date:      "YYYY-MM-DD"
 *   collection:    "sentinel-2-l2a"
 *   max_cloud_cover: 0-100
 *   limit:         1-50
 */
router.post('/search-scenes', optionalAuth, async (req: AuthRequest, res: Response) => {
  const { bbox, start_date, end_date, collection, max_cloud_cover, limit } = req.body;

  // ── Validate bbox ────────────────────────────────────────────
  if (!bbox) {
    res.status(400).json({
      error: 'bbox is required',
      code: 'MISSING_BBOX',
      detail: 'Provide a bounding box as [west, south, east, north]',
    });
    return;
  }
  if (!isValidBbox(bbox)) {
    res.status(400).json({
      error: 'Invalid bounding box',
      code: 'INVALID_BBOX',
      detail: 'Format: [west, south, east, north] in WGS-84. west < east, south < north.',
    });
    return;
  }

  // ── Validate dates ───────────────────────────────────────────
  if (!start_date && !end_date) {
    res.status(400).json({
      error: 'At least one date is required',
      code: 'MISSING_DATE',
      detail: 'Provide start_date, end_date, or both',
    });
    return;
  }
  if (start_date && !isValidDateStr(start_date)) {
    res.status(400).json({
      error: 'Invalid start_date',
      code: 'INVALID_DATE',
      detail: 'Use ISO 8601 format: YYYY-MM-DD',
    });
    return;
  }
  if (end_date && !isValidDateStr(end_date)) {
    res.status(400).json({
      error: 'Invalid end_date',
      code: 'INVALID_DATE',
      detail: 'Use ISO 8601 format: YYYY-MM-DD',
    });
    return;
  }

  // ── Validate collection ──────────────────────────────────────
  if (collection && !isValidCollection(collection)) {
    res.status(400).json({
      error: 'Invalid collection',
      code: 'INVALID_COLLECTION',
      detail: `Allowed: ${ALLOWED_COLLECTIONS.join(', ')}`,
    });
    return;
  }

  // ── Forward to Python service ────────────────────────────────
  const pythonBody: Record<string, any> = {
    bbox,
    collection: collection || 'sentinel-2-l2a',
    max_cloud_cover: max_cloud_cover ?? 30,
    limit: Math.min(Math.max(parseInt(limit) || 10, 1), 50),
  };

  // Build datetime string for Python service
  if (start_date && end_date) {
    pythonBody.start_date = start_date;
    pythonBody.end_date = end_date;
  } else if (start_date) {
    pythonBody.start_date = start_date;
  } else if (end_date) {
    pythonBody.end_date = end_date;
  }

  const result = await callPythonService(
    'POST',
    '/stac/search',
    pythonBody,
    'search-scenes',
  );

  if (!result.ok) {
    res.status(result.status || 502).json({
      error: result.error,
      code: result.code,
      requestId: result.requestId,
    });
    return;
  }

  // ── Return clean response ────────────────────────────────────
  // Strip internal Python fields — only return what the frontend needs
  const items = (result.data?.items || []).map((item: any) => ({
    id: item.id,
    collection: item.collection,
    bbox: item.bbox,
    geometry: item.geometry,
    properties: {
      datetime: item.properties?.datetime,
      'eo:cloud_cover': item.properties?.['eo:cloud_cover'],
      platform: item.properties?.platform,
    },
    assets: Object.keys(item.assets || {}),
  }));

  res.json({
    requestId: result.requestId,
    status: 'ok',
    collection: pythonBody.collection,
    totalMatches: result.data?.total_matches ?? items.length,
    returned: items.length,
    items,
    latencyMs: result.upstreamLatencyMs,
  });
});

// ── POST /api/analysis/preview ─────────────────────────────────────

/**
 * Preview analysis — search + windowed raster read via Python service.
 *
 * Request body:
 *   bbox:            [west, south, east, north]
 *   start_date:      "YYYY-MM-DD" (required)
 *   end_date:        "YYYY-MM-DD" (required)
 *   collection:      "sentinel-2-l2a"
 *   max_cloud_cover: 0-100
 *   limit:           1-10
 *   bands:           ["B04", "B08"] (optional)
 */
router.post('/preview', optionalAuth, async (req: AuthRequest, res: Response) => {
  const {
    bbox,
    start_date,
    end_date,
    collection,
    max_cloud_cover,
    limit,
    bands,
  } = req.body;

  // ── Validate bbox ────────────────────────────────────────────
  if (!bbox || !isValidBbox(bbox)) {
    res.status(400).json({
      error: 'Valid bbox is required',
      code: 'INVALID_BBOX',
      detail: 'Format: [west, south, east, north] in WGS-84',
    });
    return;
  }

  // ── Validate dates ───────────────────────────────────────────
  if (!start_date || !end_date) {
    res.status(400).json({
      error: 'Both start_date and end_date are required',
      code: 'MISSING_DATE',
      detail: 'Provide start_date and end_date in YYYY-MM-DD format',
    });
    return;
  }
  if (!isValidDateStr(start_date) || !isValidDateStr(end_date)) {
    res.status(400).json({
      error: 'Invalid date format',
      code: 'INVALID_DATE',
      detail: 'Use ISO 8601 format: YYYY-MM-DD',
    });
    return;
  }
  if (new Date(start_date) > new Date(end_date)) {
    res.status(400).json({
      error: 'start_date must be before end_date',
      code: 'INVALID_DATE_RANGE',
    });
    return;
  }

  // ── Validate collection ──────────────────────────────────────
  if (collection && !isValidCollection(collection)) {
    res.status(400).json({
      error: 'Invalid collection',
      code: 'INVALID_COLLECTION',
      detail: `Allowed: ${ALLOWED_COLLECTIONS.join(', ')}`,
    });
    return;
  }

  // ── Validate bands ───────────────────────────────────────────
  if (bands && !Array.isArray(bands)) {
    res.status(400).json({
      error: 'bands must be an array',
      code: 'INVALID_BANDS',
    });
    return;
  }

  // ── Forward to Python service ────────────────────────────────
  const pythonBody: Record<string, any> = {
    bbox,
    start_date,
    end_date,
    collection: collection || 'sentinel-2-l2a',
    max_cloud_cover: max_cloud_cover ?? 30,
    limit: Math.min(Math.max(parseInt(limit) || 1, 1), 10),
  };

  if (bands && Array.isArray(bands)) {
    pythonBody.bands = bands.slice(0, 10); // Cap at 10 bands
  }

  const result = await callPythonService(
    'POST',
    '/analysis/preview',
    pythonBody,
    'preview',
  );

  if (!result.ok) {
    res.status(result.status || 502).json({
      error: result.error,
      code: result.code,
      requestId: result.requestId,
    });
    return;
  }

  // ── Strip internal details ───────────────────────────────────
  // Never expose signed URLs, Python internals, or full asset lists
  const data = result.data;
  const cleanScene = data?.scene
    ? {
        itemId: data.scene.item_id,
        collection: data.scene.collection,
        datetime: data.scene.datetime,
        cloudCover: data.scene.cloud_cover,
        bbox: data.scene.bbox,
        assetsCount: data.scene.assets_available?.length || 0,
        assetUsed: data.scene.asset_used,
        // Do NOT expose signed_href to frontend
      }
    : undefined;

  res.json({
    requestId: result.requestId,
    status: 'ok',
    aoiBbox: data?.aoi_bbox,
    scene: cleanScene,
    windowShape: data?.window_shape,
    bandsLoaded: data?.bands_loaded,
    bandStats: data?.band_stats,
    resolutionMeters: data?.resolution_meters,
    crs: data?.crs,
    readMethod: data?.read_method,
    latencyMs: result.upstreamLatencyMs,
  });
});

// ── POST /api/analysis/timeseries ──────────────────────────────────

/**
 * Build a temporal datacube via the Python analysis service.
 *
 * Request body:
 *   bbox:              [west, south, east, north]
 *   start_date:        "YYYY-MM-DD" (required)
 *   end_date:          "YYYY-MM-DD" (required)
 *   collection:        "sentinel-2-l2a"
 *   max_cloud_cover:   0-100
 *   max_scenes:        1-50 (default 20)
 *   bands:             ["B04", "B03", "B02"]
 *   target_crs:        "EPSG:32643" (optional)
 *   target_resolution: meters (optional)
 */
router.post('/timeseries', optionalAuth, async (req: AuthRequest, res: Response) => {
  const {
    bbox,
    start_date,
    end_date,
    collection,
    max_cloud_cover,
    max_scenes,
    bands,
    target_crs,
    target_resolution,
  } = req.body;

  // ── Validate bbox ────────────────────────────────────────────
  if (!bbox || !isValidBbox(bbox)) {
    res.status(400).json({
      error: 'Valid bbox is required',
      code: 'INVALID_BBOX',
      detail: 'Format: [west, south, east, north] in WGS-84',
    });
    return;
  }

  // ── Validate dates ───────────────────────────────────────────
  if (!start_date || !end_date) {
    res.status(400).json({
      error: 'Both start_date and end_date are required',
      code: 'MISSING_DATE',
      detail: 'Provide start_date and end_date in YYYY-MM-DD format',
    });
    return;
  }
  if (!isValidDateStr(start_date) || !isValidDateStr(end_date)) {
    res.status(400).json({
      error: 'Invalid date format',
      code: 'INVALID_DATE',
      detail: 'Use ISO 8601 format: YYYY-MM-DD',
    });
    return;
  }
  if (new Date(start_date) > new Date(end_date)) {
    res.status(400).json({
      error: 'start_date must be before end_date',
      code: 'INVALID_DATE_RANGE',
    });
    return;
  }

  // ── Validate collection ──────────────────────────────────────
  if (collection && !isValidCollection(collection)) {
    res.status(400).json({
      error: 'Invalid collection',
      code: 'INVALID_COLLECTION',
      detail: `Allowed: ${ALLOWED_COLLECTIONS.join(', ')}`,
    });
    return;
  }

  // ── Validate bands ───────────────────────────────────────────
  if (bands && !Array.isArray(bands)) {
    res.status(400).json({
      error: 'bands must be an array',
      code: 'INVALID_BANDS',
    });
    return;
  }

  // ── Validate max_scenes ──────────────────────────────────────
  const scenes = max_scenes ? Math.min(Math.max(parseInt(max_scenes) || 20, 1), 50) : 20;

  // ── Forward to Python service ────────────────────────────────
  const pythonBody: Record<string, any> = {
    bbox,
    start_date,
    end_date,
    collection: collection || 'sentinel-2-l2a',
    max_cloud_cover: max_cloud_cover ?? 30,
    max_scenes: scenes,
    bands: bands || ['B04', 'B03', 'B02'],
  };

  if (target_crs) pythonBody.target_crs = target_crs;
  if (target_resolution) pythonBody.target_resolution = target_resolution;

  const result = await callPythonService(
    'POST',
    '/analysis/timeseries',
    pythonBody,
    'timeseries',
  );

  if (!result.ok) {
    res.status(result.status || 502).json({
      error: result.error,
      code: result.code,
      requestId: result.requestId,
    });
    return;
  }

  // ── Return clean response ────────────────────────────────────
  const data = result.data;
  res.json({
    requestId: result.requestId,
    status: data?.status || 'ok',
    analysisId: data?.analysis_id,
    collection: data?.collection,
    aoiBbox: data?.aoi_bbox,
    dateRange: data?.date_range,
    bands: data?.bands,
    crs: data?.crs,
    resolutionMeters: data?.resolution_meters,
    cubeShape: data?.cube_shape,
    cubeDims: data?.cube_dims,
    scenesDiscovered: data?.scenes_discovered,
    scenesRejected: data?.scenes_rejected,
    scenesSelected: data?.scenes_selected,
    selectedScenes: (data?.selected_scenes || []).map((s: any) => ({
      itemId: s.item_id,
      datetime: s.datetime,
      cloudCover: s.cloud_cover,
      bbox: s.bbox,
      coveragePct: s.coverage_pct,
      score: s.score,
      assetsCount: s.assets_count,
    })),
    acquisitionDates: data?.acquisition_dates,
    cloudCovers: data?.cloud_covers,
    processingSteps: data?.processing_steps,
    diagnostics: data?.diagnostics,
    rejectionReasons: data?.rejection_reasons,
    latencyMs: result.upstreamLatencyMs,
  });
});

// ── POST /api/analysis/preprocess ──────────────────────────────────

/**
 * Preprocess scenes for analysis-ready, comparable data.
 *
 * Request body:
 *   bbox:                  [west, south, east, north]
 *   start_date:            "YYYY-MM-DD" (required)
 *   end_date:              "YYYY-MM-DD" (required)
 *   collection:            "sentinel-2-l2a"
 *   max_cloud_cover:       0-100
 *   max_scenes:            1-50
 *   bands:                 ["B04", "B03", "B02"]
 *   target_crs:            "EPSG:32643"
 *   target_resolution:     meters
 *   max_temporal_gap_days: 30
 *   min_coverage_pct:      50
 */
router.post('/preprocess', optionalAuth, async (req: AuthRequest, res: Response) => {
  const {
    bbox, start_date, end_date, collection,
    max_cloud_cover, max_scenes, bands,
    target_crs, target_resolution,
    max_temporal_gap_days, min_coverage_pct,
  } = req.body;

  // ── Validate bbox ────────────────────────────────────────────
  if (!bbox || !isValidBbox(bbox)) {
    res.status(400).json({
      error: 'Valid bbox is required', code: 'INVALID_BBOX',
      detail: 'Format: [west, south, east, north] in WGS-84',
    });
    return;
  }

  // ── Validate dates ───────────────────────────────────────────
  if (!start_date || !end_date) {
    res.status(400).json({
      error: 'Both start_date and end_date are required',
      code: 'MISSING_DATE',
    });
    return;
  }
  if (!isValidDateStr(start_date) || !isValidDateStr(end_date)) {
    res.status(400).json({
      error: 'Invalid date format', code: 'INVALID_DATE',
      detail: 'Use ISO 8601 format: YYYY-MM-DD',
    });
    return;
  }
  if (new Date(start_date) > new Date(end_date)) {
    res.status(400).json({
      error: 'start_date must be before end_date', code: 'INVALID_DATE_RANGE',
    });
    return;
  }

  // ── Validate collection ──────────────────────────────────────
  if (collection && !isValidCollection(collection)) {
    res.status(400).json({
      error: 'Invalid collection', code: 'INVALID_COLLECTION',
      detail: `Allowed: ${ALLOWED_COLLECTIONS.join(', ')}`,
    });
    return;
  }

  // ── Forward to Python service ────────────────────────────────
  const pythonBody: Record<string, any> = {
    bbox,
    start_date,
    end_date,
    collection: collection || 'sentinel-2-l2a',
    max_cloud_cover: max_cloud_cover ?? 30,
    max_scenes: max_scenes ? Math.min(Math.max(parseInt(max_scenes) || 20, 1), 50) : 20,
    bands: bands || ['B04', 'B03', 'B02'],
    target_crs: target_crs || 'EPSG:4326',
    target_resolution: target_resolution || 10.0,
    max_temporal_gap_days: max_temporal_gap_days || 30,
    min_coverage_pct: min_coverage_pct || 50.0,
  };

  const result = await callPythonService(
    'POST', '/analysis/preprocess', pythonBody, 'preprocess',
  );

  if (!result.ok) {
    res.status(result.status || 502).json({
      error: result.error, code: result.code, requestId: result.requestId,
    });
    return;
  }

  // ── Map snake_case to camelCase ──────────────────────────────
  const data = result.data;
  res.json({
    requestId: result.requestId,
    status: data?.status,
    aoiBbox: data?.aoi_bbox,
    targetCrs: data?.target_crs,
    targetResolution: data?.target_resolution,
    scenesTotal: data?.scenes_total,
    scenesSuitable: data?.scenes_suitable,
    scenesUnsuitable: data?.scenes_unsuitable,
    scenes: (data?.scenes || []).map((s: any) => ({
      itemId: s.item_id,
      collection: s.collection,
      acquisitionDate: s.acquisition_date,
      cloudCover: s.cloud_cover,
      crs: s.crs,
      resolutionMeters: s.resolution_meters,
      bbox: s.bbox,
      spatialCoveragePct: s.spatial_coverage_pct,
      bandsProcessed: s.bands_processed,
      nodataCount: s.nodata_count,
      totalPixels: s.total_pixels,
      preprocessingSteps: s.preprocessing_steps,
      warnings: s.warnings,
      suitable: s.suitable,
      rejectionReasons: s.rejection_reasons,
    })),
    comparability: data?.comparability,
    temporalWindow: data?.temporal_window,
    warnings: data?.warnings,
    latencyMs: result.upstreamLatencyMs,
  });
});

// ── GET /api/analysis/indices ──────────────────────────────────────

/**
 * List all available spectral indices and supported sensors.
 */
router.get('/indices', async (_req: Request, res: Response) => {
  const result = await callPythonService('GET', '/analysis/indices', undefined, 'indices');
  if (!result.ok) {
    res.status(result.status || 502).json({ error: result.error, code: result.code, requestId: result.requestId });
    return;
  }
  res.json({
    requestId: result.requestId,
    status: 'ok',
    indices: result.data?.indices || [],
    supportedSensors: result.data?.supported_sensors || [],
  });
});

// ── POST /api/analysis/index ───────────────────────────────────────

/**
 * Validate and prepare a spectral index computation.
 *
 * Request body:
 *   index_name: "NDVI" | "NDWI" | "NDBI" | "NBR" | "NDSI"
 *   sensor:     "sentinel-2-l2a" | "landsat-c2-l2"
 */
router.post('/index', optionalAuth, async (req: AuthRequest, res: Response) => {
  const { index_name, sensor } = req.body;

  if (!index_name || typeof index_name !== 'string') {
    res.status(400).json({ error: 'index_name is required', code: 'MISSING_INDEX' });
    return;
  }
  if (!sensor || typeof sensor !== 'string') {
    res.status(400).json({ error: 'sensor is required', code: 'MISSING_SENSOR' });
    return;
  }

  const result = await callPythonService('POST', '/analysis/index', { index_name, sensor }, 'index');
  if (!result.ok) {
    res.status(result.status || 502).json({ error: result.error, code: result.code, requestId: result.requestId });
    return;
  }
  const data = result.data;
  res.json({
    requestId: result.requestId,
    status: data?.status || 'ok',
    indexName: data?.index_name,
    formula: data?.formula,
    description: data?.description,
    sensor: data?.sensor,
    bandsUsed: data?.bands_used,
    supportedSensors: data?.supported_sensors,
    validation: data?.validation,
    message: data?.message,
  });
});

// ── GET /api/analysis/health ───────────────────────────────────────

/**
 * Health check — combines Node + Python service status.
 */
router.get('/health', async (_req: Request, res: Response) => {
  const { checkPythonServiceHealth } = await import('../services/python-client');
  const pythonHealthy = await checkPythonServiceHealth();

  res.json({
    node: 'ok',
    python: pythonHealthy ? 'ok' : 'unavailable',
    pythonUrl: process.env.PYTHON_SERVICE_URL || 'http://localhost:8000',
  });
});

export default router;
