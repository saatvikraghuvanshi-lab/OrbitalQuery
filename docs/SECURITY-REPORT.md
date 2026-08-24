# OrbitalQuery Security Report — Stage 20

## Executive Summary

Comprehensive security audit and hardening of the OrbitalQuery EO analysis architecture.
All 14 attack vectors tested and mitigated. 90 security tests passing.

**Overall Status: SECURED** ✅

---

## Security Controls Implemented

### 1. SSRF Protection ✅

| Check | Status | Details |
|-------|--------|---------|
| Private IP blocking | ✅ | RFC1918 (10.x, 172.16.x, 192.168.x), link-local, IPv6 ULA |
| Internal host blocking | ✅ | localhost, 127.0.0.1, 0.0.0.0, metadata endpoints |
| Cloud metadata blocking | ✅ | 169.254.169.254 (AWS/GCP), metadata.google.internal |
| URL scheme validation | ✅ | Only http/https/s3/gs allowed; blocks ftp, file, etc. |
| Applied to | | STAC asset hrefs, n8n webhook URLs |

### 2. AOI / Geometry Validation ✅

| Check | Status | Details |
|-------|--------|---------|
| Max bbox area | ✅ | 100 deg² (~1100km × 1100km) |
| Max single span | ✅ | 60° per dimension |
| Coordinate bounds | ✅ | west/east [-180,180], south/north [-90,90] |
| Ordering enforcement | ✅ | west < east, south < north |
| GeoJSON type whitelist | ✅ | Polygon, MultiPolygon, Point, LineString only |
| GeoJSON coordinate count | ✅ | Max 100K coordinate values |

### 3. Date Range Limits ✅

| Check | Status | Details |
|-------|--------|---------|
| Max span | ✅ | 5 years (1825 days) |
| Year bounds | ✅ | 2015–2027 |
| Start < end | ✅ | Enforced |
| Format validation | ✅ | ISO 8601 required |

### 4. Scene Count / Band Caps ✅

| Check | Status | Details |
|-------|--------|---------|
| Max scenes | ✅ | 100 per search (Node also caps at 50) |
| Max bands | ✅ | 20 per request |
| Band name sanitization | ✅ | Alphanumeric + dash + underscore only |

### 5. Payload Size Limits ✅

| Check | Status | Details |
|-------|--------|---------|
| Array elements | ✅ | Max 10M elements (100K × 100 bands) |
| Raster dimensions | ✅ | Max 10,000 × 10,000 pixels |
| Node JSON body | ✅ | 5MB limit (`express.json({ limit: '5mb' })`) |

### 6. Prompt Injection Prevention ✅

| Pattern | Blocked |
|---------|---------|
| "Ignore previous instructions" | ✅ |
| "System: You are now..." | ✅ |
| "Assistant: ..." | ✅ |
| "ACT AS / PRETEND YOU" | ✅ |
| "JAILBREAK / DAN MODE" | ✅ |
| "Ignore rules" | ✅ |
| `<|system|>` / `<|user|>` tokens | ✅ |
| Query length (max 2000 chars) | ✅ |
| Query minimum (3 chars) | ✅ |

### 7. Credential Leakage Prevention ✅

| Check | Status | Details |
|-------|--------|---------|
| Log sanitization | ✅ | BHOONIDHI_PASS, COPERNICUS_TOKEN, passwords stripped |
| Error message sanitization | ✅ | File paths removed, tokens masked |
| Response data sanitization | ✅ | signed_href, tokens, passwords stripped |
| URL token stripping | ✅ | Query params with token/sig/signature removed |
| Applied to | | All error responses, log output, STAC hrefs |

### 8. Rate Limiting ✅

| Check | Status | Details |
|-------|--------|---------|
| Sliding window | ✅ | 60 requests per minute per IP |
| Health endpoints exempt | ✅ | /health and / not rate-limited |
| Response headers | ✅ | X-RateLimit-Limit, X-RateLimit-Remaining |
| Retry-After on 429 | ✅ | 60 seconds |

### 9. CORS Hardening ✅

| Check | Status | Details |
|-------|--------|---------|
| No wildcard in production | ✅ | Only explicit origins allowed |
| Allowed origins | ✅ | localhost:3000, localhost:3001 |
| Methods restricted | ✅ | GET, POST only |
| Headers restricted | ✅ | Content-Type, Authorization only |

### 10. Security Headers ✅

| Header | Value |
|--------|-------|
| X-Content-Type-Options | nosniff |
| X-Frame-Options | DENY |
| X-XSS-Protection | 1; mode=block |
| Referrer-Policy | strict-origin-when-cross-origin |
| X-Powered-By | Removed |

### 11. Audit Logging ✅

| Check | Status | Details |
|-------|--------|---------|
| All API requests logged | ✅ | Method, path, status, latency, client IP |
| Secrets stripped from logs | ✅ | Regex-based sanitization |
| Error level routing | ✅ | 5xx→ERROR, 4xx→WARN, 2xx→INFO |

### 12. Analysis Parameter Validation ✅

| Check | Status | Details |
|-------|--------|---------|
| Index names | ✅ | Whitelist: NDVI, NDWI, NDBI, NBR, NDSI |
| Thresholds | ✅ | Range [0, 10] |
| Min region size | ✅ | Range [1, 10000] |
| Direction | ✅ | Whitelist: absolute, increase, decrease |
| Analysis type | ✅ | Whitelist: 5 supported types |

---

## Test Results

```
Security tests:          90/90 passed ✅
Full Python suite:      503/504 passed (1 pre-existing network test)
TypeScript compile:       clean ✅
```

### Test Classes

| Class | Tests | Coverage |
|-------|-------|----------|
| TestSSRFProtection | 12 | Private IPs, metadata, schemes |
| TestAOIValidation | 12 | Bounds, ordering, area, span |
| TestGeoJSONValidation | 4 | Types, coordinates, missing fields |
| TestDateRangeValidation | 7 | Ordering, span, year bounds, format |
| TestSceneCountValidation | 5 | Valid, cap, default, zero, negative |
| TestBandValidation | 6 | Valid, cap, injection, special chars |
| TestArrayPayloadValidation | 4 | Valid, huge, null, custom limit |
| TestRasterDimensions | 2 | Valid, too large |
| TestPromptInjection | 12 | 7 injection patterns + normal queries |
| TestAnalysisParameterValidation | 10 | Index, threshold, direction, type |
| TestRateLimiting | 3 | Allow, reset, remaining count |
| TestCredentialLeakage | 8 | Passwords, tokens, paths, responses |
| TestURLSanitization | 4 | Token params, clean URLs, empty |
| TestCombinedValidation | 2 | Valid inputs + malicious inputs |

---

## What's NOT Covered (Known Limitations)

| Item | Status | Notes |
|------|--------|-------|
| Authentication | ⚠️ | Optional auth exists via `optionalAuth` middleware; not mandatory for analysis routes |
| API keys | ⚠️ | No API key system; relies on network-level access control |
| DDoS mitigation | ⚠️ | Rate limiting is per-process; multi-instance needs external rate limiter |
| SQL injection | ✅ | SQLite via Prisma ORM (parameterized queries) |
| XSS | ✅ | React escapes output; security headers set |
| CSRF | ⚠️ | Same-origin policy + CORS; no CSRF tokens |
| Supply chain | ⚠️ | No dependency audit; consider `npm audit` + `pip-audit` |
| TLS/HTTPS | ⚠️ | Development uses HTTP; production should use HTTPS proxy |

---

## Files Modified

| File | Change |
|------|--------|
| `analysis-service/app/security.py` | **NEW** — 500+ line security module |
| `analysis-service/app/main.py` | Added security middleware (rate limit, headers, audit) |
| `analysis-service/app/routes/stac.py` | Added bbox/date/scene validation |
| `analysis-service/app/routes/query.py` | Added prompt injection prevention |
| `analysis-service/app/routes/flood.py` | Added query validation + array size limits |
| `analysis-service/app/routes/timeseries.py` | Added bbox/date/band validation |
| `analysis-service/app/routes/explain.py` | Added query validation + SSRF for n8n URL |
| `analysis-service/app/routes/analysis.py` | Added bbox/date/band validation + URL sanitization |
| `analysis-service/tests/test_security.py` | **NEW** — 90 security tests |

---

## Recommendations for Production

1. **HTTPS**: Deploy behind a reverse proxy (nginx/Caddy) with TLS termination
2. **Authentication**: Enable `requiredAuth` on analysis routes for non-public deployments
3. **API keys**: Implement API key system for external consumers
4. **External rate limiter**: Use Redis-backed rate limiting for multi-instance deployments
5. **Dependency audit**: Run `npm audit` + `pip-audit` regularly
6. **WAF**: Consider Cloudflare/AWS WAF for additional DDoS and injection protection
7. **Secrets rotation**: Rotate Bhoonidhi/Copernicus credentials periodically
8. **Audit log retention**: Configure log rotation and retention policies
