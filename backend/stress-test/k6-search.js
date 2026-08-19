/**
 * OrbitalQuery — k6 Stress Test
 *
 * Tests the /api/search endpoint with 1000+ concurrent queries.
 *
 * Usage:
 *   k6 run stress-test/k6-search.js
 *
 * Install k6: https://k6.io/docs/get-started/installation/
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ─── Custom Metrics ───────────────────────────────────────────────────
const searchSuccessRate = new Rate('search_success_rate');
const searchLatency = new Trend('search_latency', true);
const totalResults = new Counter('total_results_found');

// ─── Configuration ────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

const SEARCH_QUERIES = [
  'deforestation near Assam 2015–2020',
  'urban expansion in Jaipur',
  'glacier retreat in Himalayas',
  'ocean temperature Indian Ocean',
  'forest fire detection Western Ghats',
  'coral reef health monitoring',
  'flood monitoring river basin',
  'nighttime city lights India',
  'agricultural crop monitoring',
  'land use land cover change',
  'soil moisture desert',
  'urban heat island effect',
  'mangrove forest health',
  'snow cover mountain range',
  'wetland ecosystem monitoring',
  'drought assessment semi-arid',
  'coastal erosion satellite',
  'mining impact detection',
  'river water quality',
  'air pollution haze detection',
];

const PROVIDERS = ['', 'Copernicus/ESA', 'USGS/NASA', 'NASA'];
const COLLECTIONS = ['', 'sentinel-2-l2a', 'landsat-c2-l2', 'modis-terra-lst'];

// Random bounding boxes around interesting regions
const BBOXES = [
  null,
  [91.0, 26.0, 92.5, 27.5],   // Assam
  [75.5, 26.7, 76.2, 27.1],   // Jaipur
  [84.0, 27.5, 86.0, 29.5],   // Himalayas
  [78.0, 25.0, 82.0, 28.0],   // Gangetic Plain
  [-60.0, -5.0, -55.0, 0.0],  // Amazon
  [73.0, 9.0, 76.0, 15.0],    // Western Ghats
  [88.0, 21.0, 90.0, 23.0],   // Sundarbans
];

// ─── Test Scenarios ───────────────────────────────────────────────────
export const options = {
  scenarios: {
    // Scenario 1: Steady search load (1000 queries over 5 minutes)
    steady_search: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 200,
      stages: [
        { duration: '30s', target: 20 },   // Ramp up to 20 req/s
        { duration: '1m', target: 50 },     // Ramp to 50 req/s
        { duration: '2m', target: 50 },     // Sustain 50 req/s
        { duration: '30s', target: 20 },    // Ramp down
        { duration: '30s', target: 0 },     // Cool down
      ],
    },

    // Scenario 2: Burst load (rapid concurrent requests)
    burst_load: {
      executor: 'per-vu-iterations',
      vus: 100,
      iterations: 10,
      startTime: '30s', // Start 30s into the test
    },

    // Scenario 3: Auth stress test
    auth_stress: {
      executor: 'constant-arrival-rate',
      rate: 5,
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 10,
      maxVUs: 50,
      startTime: '1m',
      exec: 'testAuth',
    },
  },

  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<5000'], // 95% under 2s, 99% under 5s
    http_req_failed: ['rate<0.1'],                    // Less than 10% failures
    search_success_rate: ['rate>0.9'],                // 90% successful searches
    search_latency: ['p(95)<2000'],
  },
};

// ─── Helper Functions ─────────────────────────────────────────────────
function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildSearchBody() {
  return JSON.stringify({
    query: randomItem(SEARCH_QUERIES),
    bbox: randomItem(BBOXES),
    provider: randomItem(PROVIDERS),
    collection: randomItem(COLLECTIONS),
    startDate: Math.random() > 0.5 ? '2023-01-01' : undefined,
    endDate: Math.random() > 0.5 ? '2024-12-31' : undefined,
    limit: Math.floor(Math.random() * 20) + 5,
  });
}

function buildAuthBody() {
  const email = `testuser${Math.floor(Math.random() * 10000)}@orbitalquery.test`;
  const password = `TestPass${Math.floor(Math.random() * 100000)}!`;
  return JSON.stringify({ email, password, name: 'Stress Test User' });
}

// ─── Main Search Test ─────────────────────────────────────────────────
export default function () {
  const headers = {
    'Content-Type': 'application/json',
  };

  const body = buildSearchBody();

  const res = http.post(`${BASE_URL}/api/search`, body, {
    headers,
    timeout: '10s',
    tags: { name: 'search' },
  });

  // Record metrics
  searchLatency.add(res.timings.duration);
  searchSuccessRate.add(res.status === 200);

  // Validate response
  check(res, {
    'search status is 200': (r) => r.status === 200,
    'search has results array': (r) => {
      try {
        const data = JSON.parse(r.body);
        return Array.isArray(data.results);
      } catch {
        return false;
      }
    },
    'search has latency field': (r) => {
      try {
        const data = JSON.parse(r.body);
        return typeof data.latencyMs === 'number';
      } catch {
        return false;
      }
    },
    'search response time < 2s': (r) => r.timings.duration < 2000,
  });

  if (res.status === 200) {
    try {
      const data = JSON.parse(res.body);
      totalResults.add(data.total || 0);
    } catch {}
  }

  sleep(Math.random() * 0.5 + 0.1); // 100-600ms think time
}

// ─── Auth Test ────────────────────────────────────────────────────────
export function testAuth() {
  const headers = {
    'Content-Type': 'application/json',
  };

  // Test register
  const registerBody = buildAuthBody();
  const registerRes = http.post(`${BASE_URL}/api/auth/register`, registerBody, {
    headers,
    timeout: '5s',
    tags: { name: 'auth_register' },
  });

  check(registerRes, {
    'register status is 201 or 409': (r) => r.status === 201 || r.status === 409,
    'register response time < 1s': (r) => r.timings.duration < 1000,
  });

  // Test login with the registered user
  if (registerRes.status === 201) {
    const loginBody = JSON.stringify({
      email: JSON.parse(registerBody).email,
      password: JSON.parse(registerBody).password,
    });

    const loginRes = http.post(`${BASE_URL}/api/auth/login`, loginBody, {
      headers,
      timeout: '5s',
      tags: { name: 'auth_login' },
    });

    check(loginRes, {
      'login status is 200': (r) => r.status === 200,
      'login returns token': (r) => {
        try {
          const data = JSON.parse(r.body);
          return typeof data.token === 'string';
        } catch {
          return false;
        }
      },
    });

    // Test /me with token
    if (loginRes.status === 200) {
      const token = JSON.parse(loginRes.body).token;
      const meRes = http.get(`${BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: '5s',
        tags: { name: 'auth_me' },
      });

      check(meRes, {
        'me status is 200': (r) => r.status === 200,
        'me returns user': (r) => {
          try {
            const data = JSON.parse(r.body);
            return !!data.user;
          } catch {
            return false;
          }
        },
      });
    }
  }

  sleep(0.2);
}

// ─── Summary Report ───────────────────────────────────────────────────
export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    totalRequests: data.metrics.http_reqs?.values?.count || 0,
    avgLatency: data.metrics.http_req_duration?.values?.avg?.toFixed(2) + 'ms',
    p95Latency: data.metrics.http_req_duration?.values?.['p(95)']?.toFixed(2) + 'ms',
    p99Latency: data.metrics.http_req_duration?.values?.['p(99)']?.toFixed(2) + 'ms',
    errorRate: ((data.metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2) + '%',
    searchSuccessRate: ((data.metrics.search_success_rate?.values?.rate || 0) * 100).toFixed(2) + '%',
  };

  console.log('\n📊 OrbitalQuery Stress Test Results:');
  console.log('━'.repeat(50));
  console.log(JSON.stringify(summary, null, 2));
  console.log('━'.repeat(50));

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'stress-test-results.json': JSON.stringify(summary, null, 2),
  };
}
