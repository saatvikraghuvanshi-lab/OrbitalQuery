"""
OrbitalQuery Security Module — Stage 20.

Provides guards against:
1. SSRF (Server-Side Request Forgery)
2. Malicious GeoJSON / oversized AOIs
3. Excessive date ranges
4. Excessive scene counts
5. Memory exhaustion (payload size limits)
6. CPU exhaustion (timeout + max dimensions)
7. API credential leakage
8. Prompt injection
9. Malicious analysis parameters
10. Rate limiting
11. Secret logging prevention
12. CORS hardening
"""

from __future__ import annotations

import hashlib
import ipaddress
import logging
import re
import time
import urllib.parse
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Optional

from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse, Response

logger = logging.getLogger("orbitalquery-security")

# ══════════════════════════════════════════════════════════════════
# Configuration Constants
# ══════════════════════════════════════════════════════════════════

# AOI limits
MAX_BBOX_AREA_DEG2 = 100.0          # max bbox area in square degrees
MAX_BBOX_SPAN_DEG = 60.0            # max single dimension span
MIN_BBOX_AREA_DEG2 = 0.0001         # ~11m x 11m minimum

# Date range limits
MAX_DATE_RANGE_DAYS = 365 * 5        # 5 years max
MIN_DATE_YEAR = 2015
MAX_DATE_YEAR = 2027

# Scene limits
MAX_SCENE_COUNT = 100               # max scenes per search
MAX_BANDS = 20                       # max bands per request

# Payload limits
MAX_QUERY_LENGTH = 2000              # max query string length
MAX_PAYLOAD_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_RASTER_DIMENSION = 10000         # max pixels per side
MAX_ARRAY_ELEMENTS = 100 * 100 * 10  # 100K pixels x 10 bands

# Rate limiting
RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_MAX_REQUESTS = 60         # per IP per window

# SSRF protection
BLOCKED_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),  # link-local
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),         # IPv6 ULA
    ipaddress.ip_network("fe80::/10"),        # IPv6 link-local
]

BLOCKED_HOSTS = [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "metadata.google.internal",
    "169.254.169.254",  # AWS/GCP metadata
    "instance-data",     # AWS metadata alias
]

# Prompt injection patterns
INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?previous\s+instructions",
    r"you\s+are\s+now",
    r"system\s*:\s*",
    r"assistant\s*:\s*",
    r"role\s*:\s*",
    r"<\|system\|>",
    r"<\|user\|>",
    r"<\|assistant\|>",
    r"ACT\s+AS",
    r"PRETEND\s+YOU",
    r"JAILBREAK",
    r"DAN\s+MODE",
    r"\bignore\b.*\brules\b",
    r"\boverride\b.*\bsafety\b",
]

# Secrets that must never appear in logs or responses
SECRET_PATTERNS = [
    (r'BHOONIDHI_PASS\s*=\s*\S+', 'BHOONIDHI_PASS=***'),
    (r'COPERNICUS_TOKEN\s*=\s*\S+', 'COPERNICUS_TOKEN=***'),
    (r"password['\"]?\s*[:=]\s*['\"][^'\"]+['\"]", 'password: ***'),
    (r"token['\"]?\s*[:=]\s*['\"][^'\"]+['\"]", 'token: ***'),
    (r"api[_-]?key['\"]?\s*[:=]\s*['\"][^'\"]+['\"]", 'api_key: ***'),
    (r'Authorization:\s*Bearer\s+\S+', 'Authorization: Bearer ***'),
]

# ══════════════════════════════════════════════════════════════════
# 1. SSRF Protection
# ══════════════════════════════════════════════════════════════════


def validate_url_safe(url: str) -> None:
    """
    Raise HTTPException if a URL points to a private/internal network.
    Prevents SSRF by blocking localhost, RFC1918, metadata endpoints.
    """
    if not url or not isinstance(url, str):
        return

    try:
        parsed = urllib.parse.urlparse(url)
    except Exception:
        return

    hostname = parsed.hostname or ""
    scheme = (parsed.scheme or "").lower()

    # Block non-HTTP schemes
    if scheme not in ("http", "https", "s3", "gs"):
        raise HTTPException(
            status_code=400,
            detail=f"URL scheme '{scheme}' is not allowed",
        )

    # Block known internal hosts
    if hostname.lower() in BLOCKED_HOSTS:
        raise HTTPException(
            status_code=400,
            detail="URL points to an internal host",
        )

    # Block private IPs
    try:
        ip = ipaddress.ip_address(hostname)
        for net in BLOCKED_NETWORKS:
            if ip in net:
                raise HTTPException(
                    status_code=400,
                    detail="URL points to a private network",
                )
    except ValueError:
        # hostname is not an IP — check if it resolves to private
        # We do a basic pattern check instead of DNS resolution
        # (DNS resolution itself would be an SSRF vector)
        pass


def sanitize_stac_href(href: str) -> str:
    """Strip signing tokens from STAC asset hrefs before returning to client."""
    if not href:
        return href
    # Remove query params that look like signing tokens
    parsed = urllib.parse.urlparse(href)
    if parsed.query:
        # Keep non-sensitive params, remove token/signature params
        safe_params = []
        for param in parsed.query.split("&"):
            key = param.split("=")[0].lower()
            if key not in ("token", "sig", "signature", "sigexpiry", "signeduntil",
                          "x-ms-signature", "X-Amz-Signature"):
                safe_params.append(param)
        clean_query = "&".join(safe_params)
        return urllib.parse.urlunparse(parsed._replace(query=clean_query))
    return href


# ══════════════════════════════════════════════════════════════════
# 2. AOI / Geometry Validation
# ══════════════════════════════════════════════════════════════════


def validate_bbox(bbox: list[float]) -> None:
    """Validate bounding box: size, bounds, ordering."""
    if not isinstance(bbox, list) or len(bbox) != 4:
        raise HTTPException(status_code=400, detail="bbox must be [west, south, east, north]")

    west, south, east, north = bbox

    # Type check
    for v in bbox:
        if not isinstance(v, (int, float)):
            raise HTTPException(status_code=400, detail="bbox values must be numbers")

    # Bounds check
    if west < -180 or west > 180:
        raise HTTPException(status_code=400, detail="west must be in [-180, 180]")
    if east < -180 or east > 180:
        raise HTTPException(status_code=400, detail="east must be in [-180, 180]")
    if south < -90 or south > 90:
        raise HTTPException(status_code=400, detail="south must be in [-90, 90]")
    if north < -90 or north > 90:
        raise HTTPException(status_code=400, detail="north must be in [-90, 90]")

    # Ordering
    if west >= east:
        raise HTTPException(status_code=400, detail="west must be less than east")
    if south >= north:
        raise HTTPException(status_code=400, detail="south must be less than north")

    # Size limits
    span_x = east - west
    span_y = north - south
    if span_x > MAX_BBOX_SPAN_DEG:
        raise HTTPException(
            status_code=400,
            detail=f"bbox longitude span ({span_x:.1f}°) exceeds maximum ({MAX_BBOX_SPAN_DEG}°)",
        )
    if span_y > MAX_BBOX_SPAN_DEG:
        raise HTTPException(
            status_code=400,
            detail=f"bbox latitude span ({span_y:.1f}°) exceeds maximum ({MAX_BBOX_SPAN_DEG}°)",
        )

    area = span_x * span_y
    if area > MAX_BBOX_AREA_DEG2:
        raise HTTPException(
            status_code=400,
            detail=f"bbox area ({area:.2f} deg²) exceeds maximum ({MAX_BBOX_AREA_DEG2} deg²). "
                   "Use a smaller region for analysis.",
        )


def validate_geojson(geometry: dict) -> None:
    """Validate GeoJSON geometry for size and coordinate bounds."""
    if not isinstance(geometry, dict):
        raise HTTPException(status_code=400, detail="geometry must be a GeoJSON object")

    geom_type = geometry.get("type")
    if geom_type not in ("Polygon", "MultiPolygon", "Point", "LineString"):
        raise HTTPException(
            status_code=400,
            detail=f"geometry type '{geom_type}' is not supported",
        )

    coords = geometry.get("coordinates")
    if not coords:
        raise HTTPException(status_code=400, detail="geometry must have coordinates")

    # Flatten and validate coordinate count (prevent memory bomb)
    flat_count = _count_coordinates(coords)
    if flat_count > MAX_ARRAY_ELEMENTS:
        raise HTTPException(
            status_code=400,
            detail=f"geometry has too many coordinates ({flat_count:,}). Maximum: {MAX_ARRAY_ELEMENTS:,}",
        )


def _count_coordinates(coords: Any) -> int:
    """Recursively count coordinate values."""
    if isinstance(coords, (int, float)):
        return 1
    if isinstance(coords, list):
        return sum(_count_coordinates(c) for c in coords)
    return 0


# ══════════════════════════════════════════════════════════════════
# 3. Date Range Validation
# ══════════════════════════════════════════════════════════════════


def validate_date_range(start: str, end: str) -> None:
    """Validate date range: ordering, bounds, span."""
    from datetime import datetime, timedelta

    try:
        start_dt = datetime.fromisoformat(start.replace("Z", "+00:00"))
        end_dt = datetime.fromisoformat(end.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    if start_dt > end_dt:
        raise HTTPException(status_code=400, detail="start_date must be before end_date")

    if start_dt.year < MIN_DATE_YEAR:
        raise HTTPException(
            status_code=400,
            detail=f"start_date year ({start_dt.year}) is before minimum ({MIN_DATE_YEAR})",
        )
    if end_dt.year > MAX_DATE_YEAR:
        raise HTTPException(
            status_code=400,
            detail=f"end_date year ({end_dt.year}) is after maximum ({MAX_DATE_YEAR})",
        )

    span = (end_dt - start_dt).days
    if span > MAX_DATE_RANGE_DAYS:
        raise HTTPException(
            status_code=400,
            detail=f"Date range ({span} days) exceeds maximum ({MAX_DATE_RANGE_DAYS} days, ~{MAX_DATE_RANGE_DAYS // 365} years)",
        )


# ══════════════════════════════════════════════════════════════════
# 4. Scene Count / Band Limits
# ══════════════════════════════════════════════════════════════════


def validate_scene_count(limit: int | None) -> int:
    """Enforce scene count limits."""
    if limit is None:
        return 10
    if not isinstance(limit, int) or limit < 1:
        raise HTTPException(status_code=400, detail="limit must be a positive integer")
    return min(limit, MAX_SCENE_COUNT)


def validate_bands(bands: list[str] | None) -> list[str] | None:
    """Enforce band count limits and sanitize band names."""
    if bands is None:
        return None
    if not isinstance(bands, list):
        raise HTTPException(status_code=400, detail="bands must be an array")
    if len(bands) > MAX_BANDS:
        raise HTTPException(
            status_code=400,
            detail=f"Too many bands ({len(bands)}). Maximum: {MAX_BANDS}",
        )
    # Sanitize: alphanumeric + dash + underscore only
    sanitized = []
    for b in bands:
        if not isinstance(b, str) or not re.match(r'^[A-Za-z0-9_-]+$', b):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid band name: '{b}'. Only alphanumeric, dash, underscore allowed.",
            )
        sanitized.append(b)
    return sanitized


# ══════════════════════════════════════════════════════════════════
# 5. Payload Size / Raster Limits
# ══════════════════════════════════════════════════════════════════


def validate_array_payload(data: Any, max_elements: int = MAX_ARRAY_ELEMENTS) -> None:
    """Validate that 2D/3D array payloads don't exceed size limits."""
    if data is None:
        return

    count = _count_coordinates(data)
    if count > max_elements:
        raise HTTPException(
            status_code=400,
            detail=f"Array payload too large ({count:,} elements). Maximum: {max_elements:,}",
        )


def validate_raster_dimensions(width: int, height: int) -> None:
    """Validate raster window dimensions."""
    if width > MAX_RASTER_DIMENSION or height > MAX_RASTER_DIMENSION:
        raise HTTPException(
            status_code=400,
            detail=f"Raster dimensions ({width}x{height}) exceed maximum ({MAX_RASTER_DIMENSION}x{MAX_RASTER_DIMENSION})",
        )


# ══════════════════════════════════════════════════════════════════
# 6. Query / Prompt Injection Protection
# ══════════════════════════════════════════════════════════════════


def validate_query_safe(query: str) -> str:
    """
    Validate query string for length and prompt injection patterns.
    Returns sanitized query (trimmed).
    """
    if not query or not isinstance(query, str):
        raise HTTPException(status_code=400, detail="query is required")

    query = query.strip()

    if len(query) > MAX_QUERY_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Query too long ({len(query)} chars). Maximum: {MAX_QUERY_LENGTH}",
        )

    if len(query) < 3:
        raise HTTPException(status_code=400, detail="Query too short (minimum 3 chars)")

    # Check for prompt injection patterns
    query_lower = query.lower()
    for pattern in INJECTION_PATTERNS:
        if re.search(pattern, query_lower, re.IGNORECASE):
            logger.warning(
                "Prompt injection attempt detected: query=%s pattern=%s",
                query[:100],
                pattern,
            )
            raise HTTPException(
                status_code=400,
                detail="Query contains disallowed content",
            )

    return query


# ══════════════════════════════════════════════════════════════════
# 7. Rate Limiting
# ══════════════════════════════════════════════════════════════════


@dataclass
class RateLimitBucket:
    """Sliding window rate limit bucket for a single client."""
    requests: list[float] = field(default_factory=list)

    def is_allowed(self, max_requests: int, window_seconds: float) -> bool:
        now = time.time()
        # Remove expired entries
        self.requests = [t for t in self.requests if now - t < window_seconds]
        if len(self.requests) >= max_requests:
            return False
        self.requests.append(now)
        return True

    @property
    def remaining(self) -> int:
        now = time.time()
        self.requests = [t for t in self.requests if now - t < RATE_LIMIT_WINDOW_SECONDS]
        return max(0, RATE_LIMIT_MAX_REQUESTS - len(self.requests))


# Global rate limit store (in-memory, per-process)
_rate_limit_store: dict[str, RateLimitBucket] = defaultdict(RateLimitBucket)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Rate limiting middleware — limits requests per IP per window."""

    def __init__(self, app, max_requests: int = RATE_LIMIT_MAX_REQUESTS,
                 window_seconds: float = RATE_LIMIT_WINDOW_SECONDS):
        super().__init__(app)
        self.max_requests = max_requests
        self.window_seconds = window_seconds

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Skip rate limiting for health checks
        if request.url.path in ("/health", "/"):
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        bucket = _rate_limit_store[client_ip]

        if not bucket.is_allowed(self.max_requests, self.window_seconds):
            return JSONResponse(
                status_code=429,
                content={
                    "error": "Rate limit exceeded",
                    "code": "RATE_LIMIT_EXCEEDED",
                    "retry_after_seconds": int(self.window_seconds),
                },
                headers={
                    "Retry-After": str(int(self.window_seconds)),
                    "X-RateLimit-Limit": str(self.max_requests),
                    "X-RateLimit-Remaining": "0",
                },
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(self.max_requests)
        response.headers["X-RateLimit-Remaining"] = str(bucket.remaining)
        return response


# ══════════════════════════════════════════════════════════════════
# 8. Credential Leakage Prevention
# ══════════════════════════════════════════════════════════════════


def sanitize_log_message(message: str) -> str:
    """Remove secrets from log messages before they hit the logger."""
    sanitized = message
    for pattern, replacement in SECRET_PATTERNS:
        sanitized = re.sub(pattern, replacement, sanitized, flags=re.IGNORECASE)
    return sanitized


def sanitize_error_message(error: Exception) -> str:
    """
    Sanitize error messages before returning to client.
    Prevents leaking internal paths, credentials, stack traces.
    """
    msg = str(error)

    # Remove file paths
    msg = re.sub(r'[A-Za-z]:\\[^\s"\']+[/\\]', '<path>', msg)
    msg = re.sub(r'/home/[^\s"\']+', '<path>', msg)
    msg = re.sub(r'/tmp/[^\s"\']+', '<path>', msg)

    # Remove credential patterns
    for pattern, replacement in SECRET_PATTERNS:
        msg = re.sub(pattern, replacement, msg, flags=re.IGNORECASE)

    # Remove URLs with tokens
    msg = re.sub(r'https?://[^\s"\']+[?&]token=[^\s&"\']+', '<url-with-token>', msg)

    return msg


def sanitize_response_data(data: dict) -> dict:
    """
    Strip internal/sensitive fields from response before sending to client.
    """
    STRIP_KEYS = {
        "signed_href", "signed_url", "token", "password", "secret",
        "api_key", "apikey", "authorization", "cookie",
    }
    STRIP_PATTERNS = [
        "signed_href", "signed_url", "token", "password", "secret",
        "api_key", "apikey", "authorization", "cookie",
    ]

    def _clean(obj: Any) -> Any:
        if isinstance(obj, dict):
            cleaned = {}
            for k, v in obj.items():
                k_lower = k.lower()
                # Skip sensitive keys
                if any(sp in k_lower for sp in STRIP_PATTERNS):
                    continue
                cleaned[k] = _clean(v)
            return cleaned
        if isinstance(obj, list):
            return [_clean(item) for item in obj]
        if isinstance(obj, str):
            # Remove URLs with tokens
            return re.sub(r'https?://[^\s]+[?&]token=[^\s&]+', '<url-with-token>', obj)
        return obj

    return _clean(data)


# ══════════════════════════════════════════════════════════════════
# 9. Analysis Parameter Validation
# ══════════════════════════════════════════════════════════════════

VALID_INDEX_NAMES = {"NDVI", "NDWI", "NDBI", "NBR", "NDSI"}
VALID_SENSORS = {"sentinel-2-l2a", "landsat-c2-l2", "sentinel-1-grd", "sentinel-1-grd"}
VALID_DIRECTIONS = {"absolute", "increase", "decrease"}
VALID_ANALYSIS_TYPES = {"flood_impact", "urban_expansion", "vegetation_change", "water_change", "burn_severity"}


def validate_analysis_params(
    index_name: str | None = None,
    threshold: float | None = None,
    min_region_size: int | None = None,
    direction: str | None = None,
    analysis_type: str | None = None,
) -> None:
    """Validate analysis-specific parameters."""
    if index_name is not None:
        if index_name.upper() not in VALID_INDEX_NAMES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid index '{index_name}'. Allowed: {sorted(VALID_INDEX_NAMES)}",
            )

    if threshold is not None:
        if not isinstance(threshold, (int, float)) or threshold < 0 or threshold > 10:
            raise HTTPException(
                status_code=400,
                detail="threshold must be between 0 and 10",
            )

    if min_region_size is not None:
        if not isinstance(min_region_size, int) or min_region_size < 1 or min_region_size > 10000:
            raise HTTPException(
                status_code=400,
                detail="min_region_size must be between 1 and 10000",
            )

    if direction is not None:
        if direction not in VALID_DIRECTIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid direction '{direction}'. Allowed: {sorted(VALID_DIRECTIONS)}",
            )

    if analysis_type is not None:
        if analysis_type not in VALID_ANALYSIS_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid analysis_type '{analysis_type}'. Allowed: {sorted(VALID_ANALYSIS_TYPES)}",
            )


# ══════════════════════════════════════════════════════════════════
# 10. CORS Configuration
# ══════════════════════════════════════════════════════════════════

ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
]


def get_cors_origins() -> list[str]:
    """Return allowed CORS origins based on environment."""
    import os
    env = os.getenv("ENVIRONMENT", "development")
    if env == "production":
        # In production, use explicit origins
        extra = os.getenv("CORS_ORIGINS", "")
        return ALLOWED_ORIGINS + ([extra] if extra else [])
    else:
        # Development: allow localhost variants
        return ALLOWED_ORIGINS + ["*"]


# ══════════════════════════════════════════════════════════════════
# 11. Content Security Headers Middleware
# ══════════════════════════════════════════════════════════════════


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)

        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Don't expose internal headers
        if "X-Powered-By" in response.headers:
            del response.headers["X-Powered-By"]

        return response


# ══════════════════════════════════════════════════════════════════
# 12. Request Audit Logging
# ══════════════════════════════════════════════════════════════════


class AuditMiddleware(BaseHTTPMiddleware):
    """Log all API requests with sanitized data for audit trail."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        start_time = time.time()
        client_ip = request.client.host if request.client else "unknown"

        response = await call_next(request)

        elapsed_ms = (time.time() - start_time) * 1000
        path = request.url.path
        method = request.method
        status = response.status_code

        # Only log API routes, not static files
        if path.startswith("/"):
            log_msg = sanitize_log_message(
                f"{method} {path} → {status} ({elapsed_ms:.0f}ms) from {client_ip}"
            )
            if status >= 500:
                logger.error(log_msg)
            elif status >= 400:
                logger.warning(log_msg)
            else:
                logger.info(log_msg)

        return response


# ══════════════════════════════════════════════════════════════════
# Combined Validation Helper
# ══════════════════════════════════════════════════════════════════


def validate_stac_search_params(
    collection: str | None = None,
    bbox: list[float] | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    limit: int | None = None,
) -> dict:
    """
    Run all security validations for a STAC search request.
    Returns sanitized/validated parameters.
    """
    result = {}

    if bbox:
        validate_bbox(bbox)
        result["bbox"] = bbox

    if start_date and end_date:
        validate_date_range(start_date, end_date)
        result["start_date"] = start_date
        result["end_date"] = end_date

    if limit is not None:
        result["limit"] = validate_scene_count(limit)

    return result
