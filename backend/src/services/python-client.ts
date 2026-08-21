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
  process.env.PYTHON_SERVICE_TIMEOUT_MS || '30000',
  10,
);

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
): Promise<PythonServiceResponse<T>> {
  const requestId = randomUUID();
  const url = `${PYTHON_SERVICE_URL}${path}`;
  const start = Date.now();

  console.log(
    `[python-client] → ${method} ${path} | requestId=${requestId} caller=${caller}`,
  );

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(PYTHON_SERVICE_TIMEOUT_MS),
    });

    const upstreamLatencyMs = Date.now() - start;
    const text = await response.text();

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      // Non-JSON response from Python service
      console.error(
        `[python-client] ← ${response.status} (non-JSON) | requestId=${requestId} latency=${upstreamLatencyMs}ms`,
      );
      return {
        ok: false,
        requestId,
        status: response.status,
        error: 'Python service returned invalid response',
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
        `[python-client] ← TIMEOUT after ${PYTHON_SERVICE_TIMEOUT_MS}ms | requestId=${requestId}`,
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
      error: 'Python analysis service is unavailable',
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
 * Check if the Python service is reachable.
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
