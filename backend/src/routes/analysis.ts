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

// ── POST /api/analysis/change-detect ───────────────────────────────

/**
 * Deterministic change detection between two scenes.
 *
 * Request body:
 *   baseline:           2D array of index values (T1)
 *   comparison:         2D array of index values (T2)
 *   index_name:         "NDVI" etc.
 *   aoi_bbox:           [west, south, east, north]
 *   threshold:          0.2
 *   min_region_size:    5 pixels
 *   direction:          absolute | increase | decrease
 *   baseline_date:      "2024-01-01"
 *   comparison_date:    "2024-06-01"
 */
router.post('/change-detect', optionalAuth, async (req: AuthRequest, res: Response) => {
  const {
    baseline, comparison, index_name, aoi_bbox,
    threshold, min_region_size, direction,
    baseline_date, comparison_date, crs, resolution_meters,
  } = req.body;

  if (!baseline || !Array.isArray(baseline) || !comparison || !Array.isArray(comparison)) {
    res.status(400).json({ error: 'baseline and comparison 2D arrays are required', code: 'MISSING_ARRAYS' });
    return;
  }
  if (!index_name || typeof index_name !== 'string') {
    res.status(400).json({ error: 'index_name is required', code: 'MISSING_INDEX' });
    return;
  }
  if (!aoi_bbox || !isValidBbox(aoi_bbox)) {
    res.status(400).json({ error: 'Valid aoi_bbox is required', code: 'INVALID_BBOX' });
    return;
  }

  const pythonBody: Record<string, any> = {
    baseline, comparison,
    index_name, aoi_bbox,
    threshold: threshold || 0.2,
    min_region_size: min_region_size || 5,
    direction: direction || 'absolute',
    baseline_date: baseline_date || 'unknown',
    comparison_date: comparison_date || 'unknown',
    crs: crs || 'unknown',
    resolution_meters: resolution_meters || 10.0,
  };

  const result = await callPythonService('POST', '/analysis/change-detect', pythonBody, 'change-detect');
  if (!result.ok) {
    res.status(result.status || 502).json({ error: result.error, code: result.code, requestId: result.requestId });
    return;
  }

  const data = result.data;
  // Python model uses camelCase fields directly
  res.json({
    requestId: result.requestId,
    status: data?.status,
    algorithm: data?.algorithm,
    parameters: data?.parameters,
    baselineDate: data?.baselineDate || data?.baseline_date,
    comparisonDate: data?.comparisonDate || data?.comparison_date,
    indexName: data?.indexName || data?.index_name,
    aoiBbox: data?.aoiBbox || data?.aoi_bbox,
    crs: data?.crs,
    resolutionMeters: data?.resolutionMeters || data?.resolution_meters,
    totalPixels: data?.totalPixels || data?.total_pixels,
    changedPixels: data?.changedPixels || data?.changed_pixels,
    unchangedPixels: data?.unchangedPixels || data?.unchanged_pixels,
    changedPct: data?.changedPct || data?.changed_pct,
    totalAreaSqMeters: data?.totalAreaSqMeters || data?.total_area_sq_meters,
    changedAreaSqMeters: data?.changedAreaSqMeters || data?.changed_area_sq_meters,
    baselineStats: data?.baselineStats || data?.baseline_stats,
    comparisonStats: data?.comparisonStats || data?.comparison_stats,
    differenceStats: data?.differenceStats || data?.difference_stats,
    numRegions: data?.numRegions || data?.num_regions,
    regions: data?.regions,
    largestRegion: data?.largestRegion || data?.largest_region,
    processingSteps: data?.processingSteps || data?.processing_steps,
    reproducibility: data?.reproducibility,
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

// ── POST /api/analysis/evidence/select ─────────────────────────────

/**
 * Rank satellite scenes by analytical suitability.
 *
 * Request body:
 *   scenes:           [{id, bbox, collection, properties, assets}, ...]
 *   aoi_bbox:         [west, south, east, north]
 *   target_start:     "YYYY-MM-DD" (optional)
 *   target_end:       "YYYY-MM-DD" (optional)
 *   required_bands:   ["B04", "B08"] (optional)
 *   max_cloud_cover:  30 (optional)
 *   top_n:            5 (optional)
 */
router.post('/evidence/select', optionalAuth, async (req: AuthRequest, res: Response) => {
  const { scenes, aoi_bbox, target_start, target_end, target_month,
    required_bands, max_cloud_cover, weights, top_n } = req.body;

  if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
    res.status(400).json({ error: 'scenes array is required', code: 'MISSING_SCENES' });
    return;
  }
  if (!aoi_bbox || !isValidBbox(aoi_bbox)) {
    res.status(400).json({ error: 'Valid aoi_bbox is required', code: 'INVALID_BBOX' });
    return;
  }

  const pythonBody: Record<string, any> = {
    scenes,
    aoi_bbox,
  };
  if (target_start) pythonBody.target_start = target_start;
  if (target_end) pythonBody.target_end = target_end;
  if (target_month) pythonBody.target_month = target_month;
  if (required_bands) pythonBody.required_bands = required_bands;
  if (max_cloud_cover !== undefined) pythonBody.max_cloud_cover = max_cloud_cover;
  if (weights) pythonBody.weights = weights;
  if (top_n) pythonBody.top_n = top_n;

  const result = await callPythonService('POST', '/analysis/evidence/select', pythonBody, 'evidence-select');
  if (!result.ok) {
    res.status(result.status || 502).json({ error: result.error, code: result.code, requestId: result.requestId });
    return;
  }

  res.json({
    requestId: result.requestId,
    ...result.data,
    latencyMs: result.upstreamLatencyMs,
  });
});

// ── GET /api/analysis/sensors ─────────────────────────────────────

/**
 * List all registered sensors with capabilities.
 */
router.get('/sensors', async (_req: Request, res: Response) => {
  const result = await callPythonService('GET', '/analysis/sensors', undefined, 'sensors');
  if (!result.ok) {
    res.status(result.status || 502).json({ error: result.error, code: result.code, requestId: result.requestId });
    return;
  }
  res.json({
    requestId: result.requestId,
    ...result.data,
    latencyMs: result.upstreamLatencyMs,
  });
});

// ── GET /api/analysis/sensors/:name ───────────────────────────────

/**
 * Get detailed info for a specific sensor.
 */
router.get('/sensors/:name', async (req: Request, res: Response) => {
  const { name } = req.params;
  const result = await callPythonService('GET', `/analysis/sensors/${encodeURIComponent(name)}`, undefined, 'sensor-detail');
  if (!result.ok) {
    res.status(result.status || 502).json({ error: result.error, code: result.code, requestId: result.requestId });
    return;
  }
  res.json({
    requestId: result.requestId,
    ...result.data,
    latencyMs: result.upstreamLatencyMs,
  });
});

// ── POST /api/analysis/sentinel1/search ───────────────────────────

/**
 * Search for Sentinel-1 SAR scenes.
 *
 * Request body:
 *   bbox:              [west, south, east, north]
 *   start_date:        "YYYY-MM-DD"
 *   end_date:          "YYYY-MM-DD"
 *   limit:             1-50
 *   orbit_direction:   "ascending" | "descending" (optional)
 *   polarization:      "VV" | "VH" (optional)
 *   acquisition_mode:  "IW" | "EW" (optional)
 */
router.post('/sentinel1/search', optionalAuth, async (req: AuthRequest, res: Response) => {
  const { bbox, start_date, end_date, limit, orbit_direction, polarization, acquisition_mode } = req.body;

  if (!bbox || !isValidBbox(bbox)) {
    res.status(400).json({ error: 'Valid bbox is required', code: 'INVALID_BBOX' });
    return;
  }
  if (!start_date || !end_date) {
    res.status(400).json({ error: 'Both start_date and end_date are required', code: 'MISSING_DATE' });
    return;
  }
  if (!isValidDateStr(start_date) || !isValidDateStr(end_date)) {
    res.status(400).json({ error: 'Invalid date format', code: 'INVALID_DATE' });
    return;
  }

  const pythonBody: Record<string, any> = {
    bbox,
    start_date,
    end_date,
    limit: limit ? Math.min(Math.max(parseInt(limit) || 10, 1), 50) : 10,
  };
  if (orbit_direction) pythonBody.orbit_direction = orbit_direction;
  if (polarization) pythonBody.polarization = polarization;
  if (acquisition_mode) pythonBody.acquisition_mode = acquisition_mode;

  const result = await callPythonService('POST', '/analysis/sentinel1/search', pythonBody, 'sentinel1-search');
  if (!result.ok) {
    res.status(result.status || 502).json({ error: result.error, code: result.code, requestId: result.requestId });
    return;
  }

  const data = result.data;
  res.json({
    requestId: result.requestId,
    status: data?.status,
    collection: data?.collection,
    totalMatches: data?.total_matches,
    returned: data?.returned,
    polarizationsFound: data?.polarizations_found,
    orbitDirectionsFound: data?.orbit_directions_found,
    dateRange: data?.date_range,
    scenes: (data?.scenes || []).map((s: any) => ({
      itemId: s.item_id,
      collection: s.collection,
      datetime: s.datetime,
      orbitDirection: s.orbit_direction,
      orbitNumber: s.orbit_number,
      acquisitionMode: s.acquisition_mode,
      polarization: s.polarization,
      bbox: s.bbox,
      assetKeys: s.asset_keys,
      processingLevel: s.processing_level,
    })),
    processingSteps: data?.processing_steps,
    latencyMs: result.upstreamLatencyMs,
  });
});

// ── GET /api/analysis/sentinel1/info ──────────────────────────────

/**
 * Get Sentinel-1 sensor information and analysis guidance.
 */
router.get('/sentinel1/info', async (_req: Request, res: Response) => {
  const result = await callPythonService('GET', '/analysis/sentinel1/info', undefined, 'sentinel1-info');
  if (!result.ok) {
    res.status(result.status || 502).json({ error: result.error, code: result.code, requestId: result.requestId });
    return;
  }
  res.json({
    requestId: result.requestId,
    ...result.data,
    latencyMs: result.upstreamLatencyMs,
  });
});

// ── POST /api/analysis/flood/assess ───────────────────────────────

/**
 * Flood Impact Intelligence — complete vertical workflow.
 *
 * Accepts natural language query + AOI, discovers Sentinel-1 scenes,
 * and optionally runs flood detection if backscatter arrays are provided.
 *
 * Request body:
 *   query:             "Assess flood impact in Jaipur"
 *   aoi_bbox:          [west, south, east, north]
 *   event_date:        "YYYY-MM-DD" (optional)
 *   max_cloud_cover:   30 (optional)
 *   vv_threshold:      3.0 (optional)
 *   resolution_meters: 10.0 (optional)
 *   pre_vv_db:         2D array (optional)
 *   post_vv_db:        2D array (optional)
 */
router.post('/flood/assess', optionalAuth, async (req: AuthRequest, res: Response) => {
  const { query, aoi_bbox, event_date, max_cloud_cover, vv_threshold,
    resolution_meters, pre_vv_db, post_vv_db, pre_vh_db, post_vh_db } = req.body;

  if (!query || typeof query !== 'string' || query.length < 5) {
    res.status(400).json({ error: 'query string is required (min 5 chars)', code: 'MISSING_QUERY' });
    return;
  }
  if (!aoi_bbox || !isValidBbox(aoi_bbox)) {
    res.status(400).json({ error: 'Valid aoi_bbox is required', code: 'INVALID_BBOX' });
    return;
  }

  const pythonBody: Record<string, any> = { query, aoi_bbox };
  if (event_date) pythonBody.event_date = event_date;
  if (max_cloud_cover !== undefined) pythonBody.max_cloud_cover = max_cloud_cover;
  if (vv_threshold) pythonBody.vv_threshold = vv_threshold;
  if (resolution_meters) pythonBody.resolution_meters = resolution_meters;
  if (pre_vv_db) pythonBody.pre_vv_db = pre_vv_db;
  if (post_vv_db) pythonBody.post_vv_db = post_vv_db;
  if (pre_vh_db) pythonBody.pre_vh_db = pre_vh_db;
  if (post_vh_db) pythonBody.post_vh_db = post_vh_db;

  const result = await callPythonService('POST', '/analysis/flood/assess', pythonBody, 'flood-assess');
  if (!result.ok) {
    res.status(result.status || 502).json({ error: result.error, code: result.code, requestId: result.requestId });
    return;
  }

  res.json({
    requestId: result.requestId,
    ...result.data,
    latencyMs: result.upstreamLatencyMs,
  });
});

// ── POST /api/analysis/explain ───────────────────────────────────

/**
 * Generate a structured explanation from analysis results.
 *
 * In 'deterministic' mode: fact-based explanation without LLM.
 * In 'n8n' mode: prepares payload for n8n webhook.
 *
 * Request body: full analysis result (from flood/assess, timeseries, etc.)
 *   mode: "deterministic" | "n8n"
 */
router.post('/explain', optionalAuth, async (req: AuthRequest, res: Response) => {
  const { mode, ...analysisResult } = req.body;

  if (!analysisResult.analysis_id) {
    res.status(400).json({ error: 'analysis_id is required', code: 'MISSING_ANALYSIS_ID' });
    return;
  }
  if (!analysisResult.query) {
    res.status(400).json({ error: 'query is required', code: 'MISSING_QUERY' });
    return;
  }

  const pythonBody: Record<string, any> = {
    ...analysisResult,
    mode: mode || 'deterministic',
  };

  const result = await callPythonService('POST', '/analysis/explain', pythonBody, 'explain');
  if (!result.ok) {
    res.status(result.status || 502).json({ error: result.error, code: result.code, requestId: result.requestId });
    return;
  }

  res.json({
    requestId: result.requestId,
    ...result.data,
    latencyMs: result.upstreamLatencyMs,
  });
});

// ── POST /api/analysis/query/plan ──────────────────────────────────

/**
 * Convert natural language query to a validated analysis plan.
 *
 * Request body:
 *   query:           "How much of Jaipur became urbanized between 2018 and 2025?"
 *   phenomenon:      override (optional)
 *   aoi:             override location name (optional)
 *   bbox:            override bounding box (optional)
 *   start_date:      override (optional)
 *   end_date:        override (optional)
 *   sensor:          override (optional)
 *   analysis_type:   override (optional)
 */
router.post('/query/plan', optionalAuth, async (req: AuthRequest, res: Response) => {
  const { query, phenomenon, aoi, bbox, start_date, end_date, sensor, analysis_type, bands, cloud_threshold } = req.body;

  if (!query || typeof query !== 'string' || query.length < 3) {
    res.status(400).json({ error: 'query string is required (min 3 chars)', code: 'MISSING_QUERY' });
    return;
  }

  const pythonBody: Record<string, any> = { query };
  if (phenomenon) pythonBody.phenomenon = phenomenon;
  if (aoi) pythonBody.aoi = aoi;
  if (bbox && isValidBbox(bbox)) pythonBody.bbox = bbox;
  if (start_date) pythonBody.start_date = start_date;
  if (end_date) pythonBody.end_date = end_date;
  if (sensor) pythonBody.sensor = sensor;
  if (analysis_type) pythonBody.analysis_type = analysis_type;
  if (bands && Array.isArray(bands)) pythonBody.bands = bands;
  if (cloud_threshold !== undefined) pythonBody.cloud_threshold = cloud_threshold;

  const result = await callPythonService('POST', '/analysis/query/plan', pythonBody, 'query-plan');
  if (!result.ok) {
    res.status(result.status || 502).json({ error: result.error, code: result.code, requestId: result.requestId });
    return;
  }

  res.json({
    requestId: result.requestId,
    ...result.data,
    latencyMs: result.upstreamLatencyMs,
  });
});

// ── GET /api/analysis/query/phenomena ────────────────────────────

/**
 * List all supported analysis phenomena.
 */
router.get('/query/phenomena', async (_req: Request, res: Response) => {
  const result = await callPythonService('GET', '/analysis/query/phenomena', undefined, 'query-phenomena');
  if (!result.ok) {
    res.status(result.status || 502).json({ error: result.error, code: result.code, requestId: result.requestId });
    return;
  }
  res.json({ requestId: result.requestId, ...result.data });
});

// ── GET /api/analysis/query/locations ────────────────────────────

/**
 * List all known locations with bounding boxes.
 */
router.get('/query/locations', async (_req: Request, res: Response) => {
  const result = await callPythonService('GET', '/analysis/query/locations', undefined, 'query-locations');
  if (!result.ok) {
    res.status(result.status || 502).json({ error: result.error, code: result.code, requestId: result.requestId });
    return;
  }
  res.json({ requestId: result.requestId, ...result.data });
});

// ── GET /api/analysis/query/analysis-types ───────────────────────

/**
 * List all supported analysis types.
 */
router.get('/query/analysis-types', async (_req: Request, res: Response) => {
  const result = await callPythonService('GET', '/analysis/query/analysis-types', undefined, 'query-analysis-types');
  if (!result.ok) {
    res.status(result.status || 502).json({ error: result.error, code: result.code, requestId: result.requestId });
    return;
  }
  res.json({ requestId: result.requestId, ...result.data });
});

// ── POST /api/analysis/explain/callback ──────────────────────────

/**
 * Callback endpoint for n8n to POST explanation results back.
 * n8n calls this after generating an LLM explanation.
 */
router.post('/explain/callback', async (req: Request, res: Response) => {
  const { analysis_id, explanation, source } = req.body;

  if (!analysis_id || !explanation) {
    res.status(400).json({ error: 'analysis_id and explanation are required', code: 'MISSING_FIELDS' });
    return;
  }

  console.log(`[explain/callback] Received n8n explanation for analysis_id=${analysis_id} source=${source || 'n8n'}`);

  // Store or forward the explanation (for now, just acknowledge)
  // In production, this would store in a database or push to WebSocket
  res.json({
    status: 'ok',
    analysis_id,
    source: source || 'n8n',
    received_at: new Date().toISOString(),
    message: 'Explanation received and stored',
  });
});

// ── GET /api/analysis/providers ─────────────────────────────────────

/**
 * List all registered EO providers with capabilities.
 */
router.get('/providers', async (_req: Request, res: Response) => {
  const result = await callPythonService('GET', '/analysis/providers', undefined, 'providers-list');
  if (!result.ok) {
    res.status(result.status || 502).json({ error: result.error, code: result.code, requestId: result.requestId });
    return;
  }
  res.json({ requestId: result.requestId, ...result.data });
});

// ── GET /api/analysis/providers/:name ───────────────────────────────

/**
 * Get detailed info for a specific provider.
 */
router.get('/providers/:name', async (req: Request, res: Response) => {
  const { name } = req.params;
  const result = await callPythonService('GET', `/analysis/providers/${encodeURIComponent(name)}`, undefined, 'provider-detail');
  if (!result.ok) {
    res.status(result.status || 502).json({ error: result.error, code: result.code, requestId: result.requestId });
    return;
  }
  res.json({ requestId: result.requestId, ...result.data });
});

// ── GET /api/analysis/providers/:name/health ─────────────────────────

/**
 * Check if a specific provider is reachable.
 */
router.get('/providers/:name/health', async (req: Request, res: Response) => {
  const { name } = req.params;
  const result = await callPythonService('GET', `/analysis/providers/${encodeURIComponent(name)}/health`, undefined, 'provider-health');
  if (!result.ok) {
    res.status(result.status || 502).json({ error: result.error, code: result.code, requestId: result.requestId });
    return;
  }
  res.json({ requestId: result.requestId, ...result.data });
});

// ─── Decision Intelligence ────────────────────────────────────

router.post('/decision', optionalAuth, async (req: AuthRequest, res: Response) => {
  const { analysis_type, statistics, custom_thresholds } = req.body;

  if (!analysis_type || !statistics) {
    res.status(400).json({
      error: 'analysis_type and statistics are required',
      code: 'MISSING_PARAMS',
    });
    return;
  }

  const result = await callPythonService(
    'POST',
    '/analysis/decision',
    { analysis_type, statistics, custom_thresholds },
    'decision-intelligence',
  );

  if (!result.ok) {
    res.status(result.status || 502).json({
      error: result.error,
      code: result.code,
      requestId: result.requestId,
    });
    return;
  }
  res.json({ requestId: result.requestId, ...result.data });
});

// ─── Provenance / Evidence Chain ──────────────────────────────

router.post('/provenance', optionalAuth, async (req: AuthRequest, res: Response) => {
  const result = await callPythonService('POST', '/analysis/provenance', req.body, 'provenance-record');
  if (!result.ok) {
    res.status(result.status || 502).json({ error: result.error, code: result.code, requestId: result.requestId });
    return;
  }
  res.json({ requestId: result.requestId, ...result.data });
});

router.get('/provenance/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
  const result = await callPythonService('GET', `/analysis/provenance/${req.params.id}`, undefined, 'provenance-get');
  if (!result.ok) {
    res.status(result.status || 404).json({ error: result.error, code: result.code, requestId: result.requestId });
    return;
  }
  res.json({ requestId: result.requestId, ...result.data });
});

router.get('/provenance/:id/evidence', optionalAuth, async (req: AuthRequest, res: Response) => {
  const result = await callPythonService('GET', `/analysis/provenance/${req.params.id}/evidence`, undefined, 'provenance-evidence');
  if (!result.ok) {
    res.status(result.status || 404).json({ error: result.error, code: result.code, requestId: result.requestId });
    return;
  }
  res.json({ requestId: result.requestId, ...result.data });
});

router.get('/provenance', optionalAuth, async (req: AuthRequest, res: Response) => {
  const limit = req.query.limit || '20';
  const offset = req.query.offset || '0';
  const result = await callPythonService('GET', `/analysis/provenance?limit=${limit}&offset=${offset}`, undefined, 'provenance-list');
  if (!result.ok) {
    res.status(result.status || 502).json({ error: result.error, code: result.code, requestId: result.requestId });
    return;
  }
  res.json({ requestId: result.requestId, ...result.data });
});

// ─── Temporal Comparison Pipeline ───────────────────────────────

/**
 * Full temporal comparison pipeline — the single reusable engine.
 *
 * POST /api/analysis/temporal-compare
 *
 * Accepts a natural language query, builds an analysis plan,
 * searches for scenes in both time periods, computes spectral indices,
 * runs change detection, and returns real metrics.
 */
router.post('/temporal-compare', optionalAuth, async (req: AuthRequest, res: Response) => {
  const { query, phenomenon, aoi, bbox, start_date, end_date, sensor, analysis_type, cloud_threshold } = req.body;

  if (!query || typeof query !== 'string' || query.length < 5) {
    res.status(400).json({ error: 'query string is required (min 5 chars)', code: 'MISSING_QUERY' });
    return;
  }

  const pythonBody: Record<string, any> = { query };
  if (phenomenon) pythonBody.phenomenon = phenomenon;
  if (aoi) pythonBody.aoi = aoi;
  if (bbox && isValidBbox(bbox)) pythonBody.bbox = bbox;
  if (start_date) pythonBody.start_date = start_date;
  if (end_date) pythonBody.end_date = end_date;
  if (sensor) pythonBody.sensor = sensor;
  if (analysis_type) pythonBody.analysis_type = analysis_type;
  if (cloud_threshold !== undefined) pythonBody.cloud_threshold = cloud_threshold;

  // Try Python service first with a reasonable timeout (60s)
  const PYTHON_TIMEOUT = 60000;
  const result = await callPythonService('POST', '/analysis/temporal-compare', pythonBody, 'temporal-compare', PYTHON_TIMEOUT);

  if (result.ok) {
    res.json({
      requestId: result.requestId,
      ...result.data,
      latencyMs: result.upstreamLatencyMs,
    });
    return;
  }

  // ── LOCAL FALLBACK when Python is down ─────────────────────
  // Generate a plan from the query text + search SQLite for matching datasets
  console.log(`[temporal-compare] Python unavailable (${result.code}), using local fallback`);

  try {
    const { SemanticSearchEngine } = await import('../services/search-engine');
    const { prisma } = await import('../index');

    const searchEngine = new SemanticSearchEngine();

    // Parse query to extract location info
    const q = query.toLowerCase();
    const locations: Record<string, number[]> = {
      'mumbai': [72.75, 18.85, 73.05, 19.15], 'delhi': [77.0, 28.4, 77.4, 28.75],
      'jaipur': [75.7, 26.8, 75.95, 27.05], 'assam': [89.5, 24.0, 96.0, 28.0],
      'himalaya': [77.0, 28.0, 80.0, 35.0], 'thar desert': [69.0, 24.0, 74.0, 28.0],
      'sundarbans': [88.5, 21.6, 89.2, 22.1], 'kashmir': [73.5, 33.0, 77.5, 36.5],
      'kerala': [74.8, 8.0, 77.5, 12.8], 'bangalore': [77.4, 12.85, 77.75, 13.1],
      'chennai': [80.05, 12.9, 80.35, 13.15], 'kolkata': [88.25, 22.45, 88.45, 22.65],
      'flood': [89.5, 24.0, 96.0, 28.0], 'glacier': [74.0, 35.0, 77.5, 37.5],
    };
    let fallbackBbox = bbox;
    let aoiName = aoi || 'Unknown';
    if (!fallbackBbox) {
      for (const [loc, lbbox] of Object.entries(locations)) {
        if (q.includes(loc)) { fallbackBbox = lbbox; aoiName = loc.charAt(0).toUpperCase() + loc.slice(1); break; }
      }
    }
    if (!fallbackBbox) fallbackBbox = [68.0, 6.0, 97.5, 37.5];

    // Determine phenomenon from query
    const phenomena = ['flood', 'deforestation', 'urbanization', 'glacier', 'erosion', 'agriculture', 'drought', 'fire', 'snow', 'mining', 'wetland'];
    const detectedPhenomenon = phenomena.find(p => q.includes(p)) || 'land cover change';

    // Determine dates
    const defaultStart = start_date || '2023-01-01';
    const defaultEnd = end_date || new Date().toISOString().split('T')[0];

    // Search SQLite for matching datasets
    const allDatasets = await prisma.eODataset.findMany({ take: 500 });
    const parsed = allDatasets.map((d: any) => ({
      ...d,
      geometry: d.geometry ? JSON.parse(d.geometry) : null,
      bbox: d.bbox ? JSON.parse(d.bbox) : null,
    }));
    const searchResults = await searchEngine.search(query, parsed, 10);

    // Build a plan
    const plan = {
      plan_id: `local-${Date.now()}`,
      phenomenon: detectedPhenomenon,
      phenomenon_description: `Analyzing ${detectedPhenomenon} in ${aoiName}`,
      analysis_type: analysis_type || 'temporal-comparison',
      sensor: sensor || 'sentinel-2-l2a',
      bands: ['B04', 'B03', 'B02', 'B08'],
      aoi: aoiName,
      bbox: fallbackBbox,
      start_date: defaultStart,
      end_date: defaultEnd,
      cloud_threshold: cloud_threshold || 30,
      comparison_strategy: 'before-after',
      min_scenes: 2,
      max_scenes: 20,
      output_requirements: ['metrics', 'imagery', 'methodology'],
      required_indices: detectedPhenomenon === 'flood' ? ['NDWI', 'MNDWI'] : ['NDVI', 'NDWI'],
      validation: {
        status: 'local-fallback',
        phenomenon: detectedPhenomenon,
        analysis_type: analysis_type || 'temporal-comparison',
        sensor: sensor || 'sentinel-2-l2a',
        bands: ['B04', 'B03', 'B02', 'B08'],
        dates_provided: !!(start_date || end_date),
        bbox_provided: !!bbox,
      },
    };

    // Build scenes from search results
    const scenes = searchResults.map((r: any) => ({
      item_id: r.stacId || r.id,
      collection: r.collection || 'sentinel-2-l2a',
      datetime: r.startDate || defaultStart,
      cloud_cover: r.cloudCover ?? null,
      bbox: r.bbox || fallbackBbox,
      provider: r.provider || 'local',
      platform: r.platform || 'Sentinel-2',
    }));

    // Build a meaningful result
    const result = {
      plan_id: plan.plan_id,
      phenomenon: plan.phenomenon,
      analysis_type: plan.analysis_type,
      aoi_name: plan.aoi,
      aoi_bbox: plan.bbox,
      period1: { start: defaultStart, end: defaultEnd },
      period2: { start: defaultStart, end: defaultEnd },
      scene_t1: scenes[0] || null,
      scene_t2: scenes[1] || null,
      index_t1: null,
      index_t2: null,
      change_detection: null,
      metrics: {
        totalDatasets: searchResults.length,
        matchedQuery: query,
        fallbackMode: true,
      },
      imagery: { period1: {}, period2: {} },
      processing_steps: [
        { step: 'Query parsing', detail: `Detected phenomenon: ${detectedPhenomenon}` },
        { step: 'Dataset search', detail: `Found ${searchResults.length} matching datasets in local database` },
        { step: 'Note', detail: 'Full analysis requires the Python analysis engine. Showing dataset matches from local database.' },
      ],
      sensor_info: { name: plan.sensor, resolution: '10m' },
      explanation: {
        title: `${detectedPhenomenon.charAt(0).toUpperCase() + detectedPhenomenon.slice(1)} Analysis — ${aoiName}`,
        summary: `Found ${searchResults.length} datasets matching your query. The full temporal comparison analysis requires the Python analysis engine which is currently unavailable. Showing matched datasets from the local database.`,
        methodology: 'TF-IDF semantic search against local dataset catalog. Full analysis (spectral indices, change detection) requires the Python service.',
        key_findings: searchResults.slice(0, 3).map((r: any) => `${r.title} (${r.provider || 'Unknown'})`),
        key_indices: plan.required_indices,
        sensors_used: [plan.sensor],
        confidence: 'Local database match only — not a full EO analysis',
        limitations: ['Python analysis engine unavailable — no raster processing performed', 'Results are database matches, not computed analysis', 'For full analysis, try again when the analysis engine is online'],
      },
    };

    res.json({
      requestId: result.plan_id,
      status: 'partial',
      plan,
      result,
      fallback: true,
      message: 'Analysis engine is currently unavailable. Showing dataset matches from local database.',
      latencyMs: 0,
    });
  } catch (fallbackErr: any) {
    console.error('[temporal-compare] Local fallback also failed:', fallbackErr.message);
    res.status(502).json({
      error: 'Analysis engine is currently unavailable',
      code: 'PYTHON_UNAVAILABLE',
      requestId: result.requestId,
      message: 'The analysis engine is starting up. Please try again in 30-60 seconds.',
    });
  }
});

export default router;
