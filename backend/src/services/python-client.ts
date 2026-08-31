/**
 * Python EO Analysis Service client.
 *
 * Forwards requests from the Node gateway to the Python FastAPI service.
 * Handles timeouts, structured errors, request correlation, and logging.
 * Never exposes Python internals to the frontend.
 */

import fetch from 'node-fetch';
import { randomUUID } from 'crypto';

// ── Configuration ───────────────────────────────────────────────────

const PYTHON_SERVICE_URL =
  process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';

const PYTHON_SERVICE_TIMEOUT_MS = parseInt(
  process.env.PYTHON_SERVICE_TIMEOUT_MS || '180000', // 3 minutes — allows Python cold-start on free tier
  10,
);

const MAX_RETRIES = 3; // Retry up to 3 times on 503 (Render cold-start)
const RETRY_DELAY_MS = 5000; // Initial delay — doubles on each retry

// ── Types ───────────────────────────────────────────────────────────

export interface PythonServiceResponse<T = any> {
  ok: boolean;
  requestId: string;
  status?: number;
  data?: T;
  error?: string;
  code?: string;
  upstreamLatencyMs: number;
}

// ── Client ──────────────────────────────────────────────────────────

/**
 * Forward a request to the Python analysis service.
 *
 * @param method  HTTP method
 * @param path    Path on the Python service (e.g. '/stac/search')
 * @param body    Request body (will be JSON-serialised)
 * @param caller  Human-readable label for logging (e.g. 'search-scenes')
 */
export async function callPythonService<T = any>(
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, any>,
  caller: string = 'unknown',
  timeoutMs?: number,
): Promise<PythonServiceResponse<T>> {
  const requestId = randomUUID();
  const url = `${PYTHON_SERVICE_URL}${path}`;
  const start = Date.now();
  const effectiveTimeout = timeoutMs || PYTHON_SERVICE_TIMEOUT_MS;

  console.log(
    `[python-client] → ${method} ${path} | requestId=${requestId} caller=${caller}`,
  );

  try {
    let response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(effectiveTimeout),
    });

    // Retry on 503 (Render cold-start) with exponential backoff
    let retries = 0;
    while (response.status === 503 && retries < MAX_RETRIES) {
      const delay = RETRY_DELAY_MS * Math.pow(2, retries);
      console.log(`[python-client] ← 503, retrying in ${delay}ms (attempt ${retries + 1}/${MAX_RETRIES}) | requestId=${requestId}`);
      await new Promise(r => setTimeout(r, delay));
      retries++;
      response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': requestId,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(effectiveTimeout),
      });
    }

    const upstreamLatencyMs = Date.now() - start;
    const text = await response.text();

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      // Non-JSON response from Python service (e.g. 503 HTML from Render)
      console.error(
        `[python-client] ← ${response.status} (non-JSON) | requestId=${requestId} latency=${upstreamLatencyMs}ms`,
      );
      return {
        ok: false,
        requestId,
        status: response.status,
        error: response.status === 503 ? 'Analysis service is starting up (cold start). Please try again in 30 seconds.' : 'Python service returned invalid response',
        code: 'UPSTREAM_INVALID_RESPONSE',
        upstreamLatencyMs,
      };
    }

    if (!response.ok) {
      // Log but do NOT leak Python tracebacks to frontend
      console.error(
        `[python-client] ← ${response.status} | requestId=${requestId} latency=${upstreamLatencyMs}ms error=${data?.detail || 'unknown'}`,
      );
      return {
        ok: false,
        requestId,
        status: response.status,
        error: sanitizeUpstreamError(data),
        code: mapStatusCode(response.status),
        upstreamLatencyMs,
      };
    }

    console.log(
      `[python-client] ← ${response.status} OK | requestId=${requestId} latency=${upstreamLatencyMs}ms`,
    );

    return {
      ok: true,
      requestId,
      status: response.status,
      data: data as T,
      upstreamLatencyMs,
    };
  } catch (err: any) {
    const upstreamLatencyMs = Date.now() - start;

    // Timeout
    if (err.name === 'TimeoutError' || err.code === 'ABORT_ERR') {
      console.error(
        `[python-client] ← TIMEOUT after ${effectiveTimeout}ms | requestId=${requestId}`,
      );
      return {
        ok: false,
        requestId,
        error: 'Python analysis service timed out',
        code: 'UPSTREAM_TIMEOUT',
        upstreamLatencyMs,
      };
    }

    // Connection refused / network error
    console.error(
      `[python-client] ← NETWORK ERROR: ${err.message} | requestId=${requestId}`,
    );
    return {
      ok: false,
      requestId,
      error: 'Analysis service is currently unavailable. It may be starting up from sleep — please try again in 30 seconds.',
      code: 'UPSTREAM_UNAVAILABLE',
      upstreamLatencyMs,
    };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Strip Python internals from error messages before sending to frontend.
 * Never send tracebacks, file paths, or dependency names.
 */
function sanitizeUpstreamError(data: any): string {
  const detail = data?.detail;
  if (typeof detail === 'string') {
    // Remove file paths, stack traces, internal details
    return detail
      .replace(/File ".*?"/g, '')
      .replace(/line \d+/g, '')
      .replace(/\.py:\d+/g, '')
      .substring(0, 200);
  }
  if (typeof detail === 'object') {
    return JSON.stringify(detail).substring(0, 200);
  }
  return 'Analysis service error';
}

/**
 * Map HTTP status codes to stable error codes for the frontend.
 */
function mapStatusCode(status: number): string {
  if (status === 400) return 'UPSTREAM_BAD_REQUEST';
  if (status === 404) return 'UPSTREAM_NOT_FOUND';
  if (status >= 500) return 'UPSTREAM_ERROR';
  return 'UPSTREAM_ERROR';
}

/**
 * Check if the Python service is reachable (fast, 5s timeout).
 */
export async function checkPythonServiceHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${PYTHON_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Quick check with even shorter timeout (3s) — used to decide fallback paths.
 */
let _pythonStatusCache: { ok: boolean; at: number } = { ok: false, at: 0 };
export async function isPythonServiceUp(): Promise<boolean> {
  // Cache result for 30 seconds to avoid hammering
  if (Date.now() - _pythonStatusCache.at < 30_000) return _pythonStatusCache.ok;
  try {
    const res = await fetch(`${PYTHON_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    _pythonStatusCache = { ok: res.ok, at: Date.now() };
    return res.ok;
  } catch {
    _pythonStatusCache = { ok: false, at: Date.now() };
    return false;
  }
}
