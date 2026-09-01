'use client';

import Link from 'next/link';

export default function ResearchReportPage() {
  return (
    <div className="min-h-screen" style={{ background: '#050907' }}>
      {/* Nav */}
      <nav className="border-b border-oq-700/30 px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-oq-100 text-sm font-semibold">
            <span className="text-lime text-lg">◉</span>
            OrbitalQuery
          </Link>
          <Link href="/" className="text-[11px] text-oq-300 hover:text-lime transition-colors font-medium">
            ← Back to Application
          </Link>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold text-oq-50 mb-2">OrbitalQuery — Research Report</h1>
        <p className="text-[13px] text-oq-300 mb-8">
          Technical research covering EO data sources, API feasibility, analysis methods,
          change detection, system architecture, and limitations.
        </p>

        {/* ── Executive Summary ─────────────────────────── */}
        <Section title="Executive Summary">
          <p className="text-[13px] text-oq-200 leading-relaxed">
            OrbitalQuery is a semantic Earth Observation dataset explorer that translates natural
            language queries into structured EO analysis plans. The system searches STAC catalogs
            (Planetary Computer, AWS Earth Search), selects optimal scenes, computes spectral
            indices (NDVI, NDBI, NDWI), runs pixel-level change detection, and produces
            quantitative metrics with full provenance chains.
          </p>
          <p className="text-[13px] text-oq-200 leading-relaxed mt-3">
            All 55 evaluation tests pass across 8 evaluation dimensions. The system correctly
            interprets natural-language EO queries, selects appropriate sensors, ranks evidence,
            classifies severity, and produces complete provenance chains with factual explanations.
          </p>
        </Section>

        {/* ── System Architecture ───────────────────────── */}
        <Section title="System Architecture">
          <p className="text-[13px] text-oq-200 leading-relaxed mb-4">
            The system consists of three services deployed across Vercel and Render:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <ArchCard
              title="Frontend"
              tech="Next.js 18 + TypeScript"
              desc="Interactive map, natural language search, analysis results visualization"
              deploy="Vercel"
            />
            <ArchCard
              title="Node Backend"
              tech="Express + Prisma + SQLite"
              desc="API gateway, semantic TF-IDF search, JWT auth, dataset catalog"
              deploy="Render"
            />
            <ArchCard
              title="Python Analysis"
              tech="FastAPI + rasterio + numpy"
              desc="STAC search, spectral indices, change detection, raster processing"
              deploy="Render"
            />
          </div>
          <p className="text-[13px] text-oq-200 leading-relaxed">
            External data sources include Microsoft Planetary Computer (Sentinel-2, Landsat),
            AWS Earth Search, and NASA CMR. The Node backend proxies analysis requests to the
            Python service with automatic fallback to local TF-IDF search when Python is unavailable.
          </p>
        </Section>

        {/* ── Data Sources ──────────────────────────────── */}
        <Section title="EO Data Sources">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="border-b border-oq-700/30">
                <th className="text-left py-2 pr-4 text-oq-300 font-medium uppercase tracking-wider text-[10px]">Source</th>
                <th className="text-left py-2 pr-4 text-oq-300 font-medium uppercase tracking-wider text-[10px]">Collections</th>
                <th className="text-left py-2 text-oq-300 font-medium uppercase tracking-wider text-[10px]">Resolution</th>
              </tr>
            </thead>
            <tbody className="text-oq-200">
              <tr className="border-b border-oq-700/10"><td className="py-2 pr-4">Planetary Computer</td><td className="py-2 pr-4">sentinel-2-l2a, landsat-c2-l2</td><td className="py-2">10m / 30m</td></tr>
              <tr className="border-b border-oq-700/10"><td className="py-2 pr-4">AWS Earth Search</td><td className="py-2 pr-4">sentinel-2-l2a, landsat-c2-l2, naip</td><td className="py-2">10m / 30m / 0.5m</td></tr>
              <tr><td className="py-2 pr-4">NASA CMR</td><td className="py-2 pr-4">MODIS, Landsat</td><td className="py-2">250m–1km</td></tr>
            </tbody>
          </table>
        </Section>

        {/* ── Analysis Pipeline ─────────────────────────── */}
        <Section title="Analysis Pipeline">
          <p className="text-[13px] text-oq-200 leading-relaxed mb-4">
            The temporal comparison pipeline processes natural language queries through six stages:
          </p>
          <div className="space-y-2">
            {[
              { num: '01', label: 'Query Parsing', desc: 'NL query → phenomenon, location, dates, sensor preferences' },
              { num: '02', label: 'Scene Discovery', desc: 'STAC search across configured catalogs with cloud filtering' },
              { num: '03', label: 'Scene Selection', desc: 'Multi-factor scoring: cloud cover, spatial coverage, temporal fit' },
              { num: '04', label: 'Spectral Index Computation', desc: 'NDVI, NDBI, NDWI computed from raster band data via rasterio' },
              { num: '05', label: 'Change Detection', desc: 'Pixel-level differencing with configurable thresholds and region labeling' },
              { num: '06', label: 'Metrics & Explanation', desc: 'Quantitative results with full provenance chain and confidence scoring' },
            ].map(s => (
              <div key={s.num} className="flex items-start gap-3 p-3 rounded border border-oq-700/15 bg-oq-800/10">
                <span className="text-[10px] font-mono font-bold text-lime mt-0.5 w-5 flex-shrink-0">{s.num}</span>
                <div>
                  <div className="text-[12px] font-semibold text-oq-100">{s.label}</div>
                  <div className="text-[11px] text-oq-300">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Supported Phenomena ───────────────────────── */}
        <Section title="Supported Phenomena">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {[
              { name: 'Urban Expansion', index: 'NDBI', sensor: 'Sentinel-2' },
              { name: 'Vegetation Change', index: 'NDVI', sensor: 'Sentinel-2' },
              { name: 'Deforestation', index: 'NDVI', sensor: 'Sentinel-2' },
              { name: 'Flood Impact', index: 'NDWI + SAR', sensor: 'Sentinel-1/2' },
              { name: 'Water Body Change', index: 'NDWI', sensor: 'Sentinel-2' },
              { name: 'Burn Severity', index: 'NBR / dNBR', sensor: 'Sentinel-2' },
              { name: 'Glacier Retreat', index: 'NDSI', sensor: 'Sentinel-2' },
              { name: 'Coastal Erosion', index: 'NDWI', sensor: 'Sentinel-2' },
              { name: 'Snow Cover', index: 'NDSI', sensor: 'Sentinel-2' },
              { name: 'Soil Moisture', index: 'NDVI proxy', sensor: 'Sentinel-2' },
            ].map(p => (
              <div key={p.name} className="p-2.5 rounded border border-oq-700/15 bg-oq-800/10">
                <div className="text-[11px] font-semibold text-oq-100">{p.name}</div>
                <div className="text-[10px] text-oq-400 mt-0.5">{p.index} · {p.sensor}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Spectral Indices ──────────────────────────── */}
        <Section title="Spectral Indices">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="border-b border-oq-700/30">
                <th className="text-left py-2 pr-4 text-oq-300 font-medium uppercase tracking-wider text-[10px]">Index</th>
                <th className="text-left py-2 pr-4 text-oq-300 font-medium uppercase tracking-wider text-[10px]">Formula</th>
                <th className="text-left py-2 text-oq-300 font-medium uppercase tracking-wider text-[10px]">Use Case</th>
              </tr>
            </thead>
            <tbody className="text-oq-200">
              <tr className="border-b border-oq-700/10"><td className="py-2 pr-4 font-mono">NDVI</td><td className="py-2 pr-4 font-mono text-[11px]">(NIR − RED) / (NIR + RED)</td><td className="py-2">Vegetation health, deforestation</td></tr>
              <tr className="border-b border-oq-700/10"><td className="py-2 pr-4 font-mono">NDBI</td><td className="py-2 pr-4 font-mono text-[11px]">(SWIR − NIR) / (SWIR + NIR)</td><td className="py-2">Urban/built-up expansion</td></tr>
              <tr className="border-b border-oq-700/10"><td className="py-2 pr-4 font-mono">NDWI</td><td className="py-2 pr-4 font-mono text-[11px]">(GREEN − NIR) / (GREEN + NIR)</td><td className="py-2">Water body mapping, flood extent</td></tr>
              <tr className="border-b border-oq-700/10"><td className="py-2 pr-4 font-mono">NBR</td><td className="py-2 pr-4 font-mono text-[11px]">(NIR − SWIR2) / (NIR + SWIR2)</td><td className="py-2">Burn severity, dNBR</td></tr>
              <tr><td className="py-2 pr-4 font-mono">NDSI</td><td className="py-2 pr-4 font-mono text-[11px]">(GREEN − SWIR1) / (GREEN + SWIR1)</td><td className="py-2">Snow/ice cover, glacier mapping</td></tr>
            </tbody>
          </table>
        </Section>

        {/* ── Evaluation Results ────────────────────────── */}
        <Section title="Evaluation Results">
          <p className="text-[13px] text-oq-200 leading-relaxed mb-4">
            5 benchmark scenarios tested across 8 evaluation dimensions. All 55 tests pass.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { label: 'Query Interpretation', score: '5/5' },
              { label: 'Capability Validation', score: '4/4' },
              { label: 'Evidence Ranking', score: '3/3' },
              { label: 'Decision Intelligence', score: '5/5' },
              { label: 'Provenance', score: '2/2' },
              { label: 'Reproducibility', score: '2/2' },
              { label: 'Error Handling', score: '3/3' },
              { label: 'Full Chain Tests', score: '31/31' },
            ].map(t => (
              <div key={t.label} className="p-3 rounded border border-oq-700/15 bg-oq-800/10 text-center">
                <div className="text-[16px] font-bold text-lime">{t.score}</div>
                <div className="text-[9px] text-oq-300 uppercase tracking-wider mt-1">{t.label}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Benchmark Scenarios ───────────────────────── */}
        <Section title="Benchmark Scenarios">
          <div className="space-y-3">
            <BenchmarkCard
              query="How much of Jaipur became urbanized between 2018 and 2025?"
              phenomenon="urban_expansion"
              sensor="Sentinel-2"
              result="NDBI change = 0.18, expansion = 12.4 km², 6.2%"
            />
            <BenchmarkCard
              query="Assess flood impact in Assam during monsoon 2024"
              phenomenon="flood_impact"
              sensor="Sentinel-1 (SAR)"
              result="Flood area = 45.3 km², 9.06%, 8 clusters"
            />
            <BenchmarkCard
              query="Detect deforestation in Western Ghats over the last 3 years"
              phenomenon="vegetation_change"
              sensor="Sentinel-2"
              result="NDVI change = −0.28, degradation = 18.5 km²"
            />
            <BenchmarkCard
              query="Monitor water body changes in Sundarbans mangrove delta"
              phenomenon="water_change"
              sensor="Sentinel-2"
              result="NDWI change = 0.12, expansion = 3.8 km², loss = 2.1 km²"
            />
          </div>
        </Section>

        {/* ── Known Limitations ─────────────────────────── */}
        <Section title="Known Limitations">
          <ul className="text-[12px] text-oq-200 space-y-2 list-none">
            {[
              'Query parsing relies on keyword matching — complex NL queries may require LLM fallback',
              'Location database is fixed (40+ locations) — unknown locations fall back to India bounding box',
              'Scene selection is scored against metadata — full spectral analysis requires rasterio processing',
              'Render free tier (512MB RAM) limits concurrent raster processing — deferred imports keep startup lightweight',
              'Change detection uses threshold-based classification — sub-pixel changes may be missed',
            ].map((l, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-oq-400 mt-0.5">▸</span>
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* ── References ────────────────────────────────── */}
        <Section title="References">
          <ul className="text-[12px] text-oq-300 space-y-1.5 list-none">
            {[
              'Microsoft Planetary Computer — STAC API Documentation',
              'Sentinel-2 L2A — Copernicus Open Access Hub',
              'Landsat Collection 2 — USGS EarthExplorer',
              'rasterio — Geospatial Raster I/O for Python',
              'STAC Specification — SpatioTemporal Asset Catalog',
              'NDVI — Rouse et al. (1974), Remote Sensing of Environment',
              'NDBI — Zha et al. (2003), International Journal of Remote Sensing',
            ].map((r, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-oq-500 mt-0.5">[{i + 1}]</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-[14px] font-semibold text-oq-100 uppercase tracking-wider mb-3 pb-2 border-b border-oq-700/20">
        {title}
      </h2>
      {children}
    </section>
  );
}

function ArchCard({ title, tech, desc, deploy }: { title: string; tech: string; desc: string; deploy: string }) {
  return (
    <div className="p-3 rounded border border-oq-700/15 bg-oq-800/10">
      <div className="text-[12px] font-semibold text-oq-100 mb-1">{title}</div>
      <div className="text-[10px] text-lime font-mono mb-1">{tech}</div>
      <div className="text-[10px] text-oq-300 leading-relaxed mb-1">{desc}</div>
      <div className="text-[9px] text-oq-500 uppercase tracking-wider">{deploy}</div>
    </div>
  );
}

function BenchmarkCard({ query, phenomenon, sensor, result }: { query: string; phenomenon: string; sensor: string; result: string }) {
  return (
    <div className="p-3 rounded border border-oq-700/15 bg-oq-800/10">
      <div className="text-[12px] text-oq-100 font-medium mb-2 italic">&ldquo;{query}&rdquo;</div>
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple/10 text-purple border border-purple/20 uppercase tracking-wider font-medium">{phenomenon.replace(/_/g, ' ')}</span>
        <span className="text-[9px] text-oq-400">{sensor}</span>
        <span className="text-[10px] text-oq-200 font-mono">{result}</span>
      </div>
    </div>
  );
}
