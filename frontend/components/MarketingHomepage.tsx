'use client';

import { useCallback, useState } from 'react';

interface MarketingHomepageProps {
  onLaunchAsk: () => void;
  onNavigate: (tab: 'ask' | 'showcase' | 'discover') => void;
}

// ── Example queries ──────────────────────────────────────────
const EXAMPLE_QUERIES = [
  { category: 'Agriculture', query: 'Find crop stress in Maharashtra during the last growing season.' },
  { category: 'Forest', query: 'Show forest cover change in the Western Ghats since 2019.' },
  { category: 'Water', query: 'Show changes in water bodies around Bengaluru over five years.' },
  { category: 'Urban', query: 'Compare urban expansion around Delhi since 2018.' },
  { category: 'Disaster', query: 'Find satellite imagery of flood-affected areas in Assam.' },
  { category: 'Climate', query: 'Compare land-surface temperature around major Indian cities.' },
];

// ── Data sources ─────────────────────────────────────────────
const DATA_SOURCES = [
  { name: 'Sentinel-2', status: 'active' as const },
  { name: 'Landsat', status: 'active' as const },
  { name: 'Sentinel-1', status: 'active' as const },
  { name: 'MODIS', status: 'roadmap' as const },
  { name: 'Copernicus', status: 'active' as const },
  { name: 'NASA', status: 'active' as const },
  { name: 'ISRO', status: 'active' as const },
];

// ── Capabilities ─────────────────────────────────────────────
const CAPABILITIES = [
  'Semantic Search', 'STAC Data', 'Geospatial Filtering',
  'Temporal Search', 'Interactive Map', 'Multi-Source EO',
];

export default function MarketingHomepage({ onLaunchAsk, onNavigate }: MarketingHomepageProps) {
  const [demoQuery] = useState('Show me vegetation changes in Punjab between 2020 and 2025.');

  const handleLaunch = useCallback(() => onLaunchAsk(), [onLaunchAsk]);
  const handleExplore = useCallback(() => onNavigate('showcase'), [onNavigate]);

  return (
    <div className="min-h-screen" style={{ background: '#050907' }}>

      {/* ════════════════════════════════════════════════════════ */}
      {/* 1. HERO                                                 */}
      {/* ════════════════════════════════════════════════════════ */}
      <section className="relative min-h-[85vh] flex items-center justify-center overflow-hidden">
        {/* Subtle satellite background */}
        <div className="absolute inset-0" style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?q=80&w=2400&auto=format&fit=crop')`,
          backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.08, filter: 'saturate(0.4)',
        }} />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#050907]" />
        {/* Subtle grid */}
        <div className="absolute inset-0 opacity-[0.02]" style={{
          backgroundImage: 'linear-gradient(rgba(163,230,53,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(163,230,53,0.5) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
        }} />

        <div className="relative z-10 text-center px-6 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-oq-700/40 bg-oq-900/40 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-lime animate-pulse" />
            <span className="text-[9px] text-oq-200 uppercase tracking-[0.15em] font-medium">Earth Observation Intelligence Platform</span>
          </div>

          <h1 className="text-[42px] md:text-[52px] leading-[1.1] font-bold tracking-tight mb-5">
            <span className="text-oq-50">Ask the Earth.</span><br />
            <span className="text-lime">Find the Data.</span>
          </h1>
          <p className="text-[15px] text-oq-200 mb-8 max-w-xl mx-auto leading-relaxed">
            Query Earth observation archives using natural language, location and time — without manually browsing satellite catalogs.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button onClick={handleLaunch} className="bg-lime text-oq-950 text-[11px] font-semibold uppercase tracking-wider px-6 py-2.5 rounded hover:bg-lime-hover transition-colors flex items-center gap-2">
              Launch Console
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
            </button>
            <button onClick={handleExplore} className="bg-oq-900/60 border border-oq-700/40 text-oq-100 text-[11px] font-medium px-6 py-2.5 rounded hover:bg-oq-800 transition-colors">
              Explore Analyses
            </button>
          </div>
        </div>
      </section>

      {/* ── Data source strip ─────────────────────────────────── */}
      <div className="border-t border-b border-oq-700/20 bg-oq-950">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <span className="text-[9px] text-oq-300 uppercase tracking-wider font-medium">Data Sources</span>
          <div className="flex items-center gap-4">
            {['Copernicus', 'NASA', 'ISRO', 'AWS'].map(s => (
              <span key={s} className="text-[10px] text-oq-200 font-mono">{s}</span>
            ))}
            <span className="text-oq-600">·</span>
            <span className="text-[10px] text-oq-300">Sentinel-2 · Landsat · MODIS</span>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════ */}
      {/* 2. PRODUCT DEMONSTRATION                                */}
      {/* ════════════════════════════════════════════════════════ */}
      <section className="py-20 px-6">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-[28px] md:text-[36px] font-bold text-oq-50 tracking-tight mb-3">Ask a question. Get the right data.</h2>
            <p className="text-[14px] text-oq-200">Search Earth observation data using natural language, location and time.</p>
          </div>

          {/* Product console */}
          <div className="rounded-lg border border-oq-700/30 bg-oq-950 overflow-hidden">
            {/* Console header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-oq-700/20">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-oq-200 font-semibold uppercase tracking-wider">OrbitalQuery</span>
                <span className="text-oq-600">/</span>
                <span className="text-[10px] text-oq-300">Search</span>
              </div>
              <button onClick={() => onNavigate('discover')} className="text-[9px] text-oq-300 hover:text-lime transition-colors uppercase tracking-wider font-medium">Datasets</button>
            </div>

            {/* Search input */}
            <div className="px-5 py-4 border-b border-oq-700/20">
              <div className="text-[9px] text-oq-300 uppercase tracking-wider mb-2 font-medium">Ask OrbitalQuery</div>
              <div className="flex items-center gap-3 bg-oq-900/50 border border-oq-700/20 rounded px-4 py-3">
                <svg className="w-4 h-4 text-oq-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <span className="text-[13px] text-oq-100 flex-1">{demoQuery}</span>
                <button onClick={handleLaunch} className="text-[10px] text-lime font-semibold uppercase tracking-wider hover:text-lime-hover transition-colors">Run Query</button>
              </div>
            </div>

            {/* Interpretation */}
            <div className="px-5 py-4 border-b border-oq-700/20">
              <div className="text-[9px] text-oq-300 uppercase tracking-wider mb-3 font-medium">Interpreted Query</div>
              <div className="grid grid-cols-3 gap-4">
                <div><div className="text-[8px] text-oq-300 uppercase tracking-wider mb-0.5">Location</div><div className="text-[12px] text-oq-100 font-medium">Punjab</div></div>
                <div><div className="text-[8px] text-oq-300 uppercase tracking-wider mb-0.5">Time</div><div className="text-[12px] text-oq-100 font-medium">2020 — 2025</div></div>
                <div><div className="text-[8px] text-oq-300 uppercase tracking-wider mb-0.5">Topic</div><div className="text-[12px] text-oq-100 font-medium">Vegetation change</div></div>
              </div>
              <div className="mt-3">
                <div className="text-[8px] text-oq-300 uppercase tracking-wider mb-1.5">Relevant Sources</div>
                <div className="flex gap-2">
                  {['Sentinel-2', 'Landsat', 'MODIS'].map(s => (
                    <span key={s} className="px-2 py-0.5 rounded text-[9px] text-oq-200 bg-oq-800/40 border border-oq-700/15 font-mono">{s}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Result */}
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[9px] text-oq-300 uppercase tracking-wider font-medium">Results</div>
                <div className="text-[10px] text-oq-300 font-mono">24 datasets</div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Result card */}
                <div className="p-4 rounded border border-oq-700/20 bg-oq-900/30">
                  <div className="text-[9px] text-cat-vegetation font-semibold uppercase tracking-wider mb-1">Vegetation Change</div>
                  <div className="text-[13px] text-oq-50 font-medium mb-1">Punjab · 2020–2025</div>
                  <div className="text-[11px] text-oq-200 mb-2">Sentinel-2 · Multispectral · 10m</div>
                  <button onClick={handleLaunch} className="text-[10px] text-lime font-semibold uppercase tracking-wider hover:text-lime-hover transition-colors">View Result</button>
                </div>
                {/* Map placeholder */}
                <div className="rounded border border-oq-700/20 bg-oq-900/20 flex items-center justify-center overflow-hidden" style={{ height: '140px' }}>
                  <div className="text-[10px] text-oq-400 flex flex-col items-center gap-1">
                    <svg className="w-5 h-5 text-oq-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 6.978l4.276-4.277a1.125 1.125 0 011.591 0L21 12.5V18a1.125 1.125 0 01-1.125 1.125H4.5A1.125 1.125 0 013.375 18V12.5L5.152 7.223a1.125 1.125 0 011.591 0L9 9.75" /></svg>
                    <span>Punjab region — satellite view</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════ */}
      {/* 3. EXAMPLE QUERIES                                      */}
      {/* ════════════════════════════════════════════════════════ */}
      <section className="py-16 px-6 border-t border-oq-700/15">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-[24px] md:text-[28px] font-bold text-oq-50 tracking-tight mb-2">What can you ask the Earth?</h2>
            <p className="text-[13px] text-oq-200">Search by phenomenon, location, time or intent.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {EXAMPLE_QUERIES.map((q) => (
              <button key={q.query} onClick={handleLaunch}
                className="text-left p-4 rounded border border-oq-700/15 bg-oq-900/20 hover:bg-oq-800/40 hover:border-oq-600/25 transition-all group">
                <div className="text-[9px] text-oq-300 uppercase tracking-wider font-semibold mb-2">{q.category}</div>
                <div className="text-[12px] text-oq-100 group-hover:text-oq-50 transition-colors leading-relaxed">{q.query}</div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════ */}
      {/* 4. WORKFLOW                                             */}
      {/* ════════════════════════════════════════════════════════ */}
      <section className="py-16 px-6 border-t border-oq-700/15">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-[24px] md:text-[28px] font-bold text-oq-50 tracking-tight text-center mb-12">From question to insight</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 relative">
            {/* Connecting line */}
            <div className="hidden md:block absolute top-5 left-[12.5%] right-[12.5%] h-px bg-oq-700/30" />
            {[
              { num: '01', title: 'Ask', desc: 'Describe what you need in natural language.' },
              { num: '02', title: 'Understand', desc: 'Extract location, time, topic and intent.' },
              { num: '03', title: 'Search', desc: 'Find relevant Earth Observation datasets.' },
              { num: '04', title: 'Discover', desc: 'Explore imagery, results and analysis.' },
            ].map((step) => (
              <div key={step.num} className="text-center relative">
                <div className="w-10 h-10 rounded-full border border-oq-700/30 bg-oq-900 flex items-center justify-center mx-auto mb-3 relative z-10">
                  <span className="text-[10px] font-mono font-bold text-oq-200">{step.num}</span>
                </div>
                <div className="text-[13px] font-semibold text-oq-50 mb-1">{step.title}</div>
                <div className="text-[11px] text-oq-300 leading-relaxed">{step.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════ */}
      {/* 5. ANALYSIS PREVIEW                                     */}
      {/* ════════════════════════════════════════════════════════ */}
      <section className="py-16 px-6 border-t border-oq-700/15">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <h2 className="text-[24px] md:text-[28px] font-bold text-oq-50 tracking-tight mb-2">Go beyond the dataset</h2>
            <p className="text-[13px] text-oq-200">Find the data. Then understand what changed.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { title: 'Flood / Water Change', location: 'Assam', time: 'Before → After', metric: 'New water detected', value: '12.4 km²', source: 'Sentinel-2 · NDWI', color: '#22D3EE' },
              { title: 'Vegetation Change', location: 'Western Ghats', time: '2019–2025', metric: 'Forest loss', value: '3,200 ha', source: 'Sentinel-2 · NDVI', color: '#4ADE80' },
              { title: 'Urban Expansion', location: 'Jaipur', time: '2018–2025', metric: 'Built-up increase', value: '+18.7%', source: 'Sentinel-2 · NDBI', color: '#A78BFA' },
            ].map((card) => (
              <div key={card.title} className="rounded border border-oq-700/20 bg-oq-900/20 overflow-hidden group hover:border-oq-600/30 transition-all">
                {/* Map placeholder */}
                <div className="h-32 bg-oq-900/30 border-b border-oq-700/15 flex items-center justify-center">
                  <div className="text-[10px] text-oq-400 flex flex-col items-center gap-1">
                    <svg className="w-5 h-5 text-oq-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 6.978l4.276-4.277a1.125 1.125 0 011.591 0L21 12.5V18a1.125 1.125 0 01-1.125 1.125H4.5A1.125 1.125 0 013.375 18V12.5L5.152 7.223a1.125 1.125 0 011.591 0L9 9.75" /></svg>
                    <span>{card.location} satellite view</span>
                  </div>
                </div>
                <div className="p-4">
                  <div className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: card.color }}>{card.title}</div>
                  <div className="text-[12px] text-oq-100 font-medium">{card.location} · {card.time}</div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-[20px] font-bold text-oq-50">{card.value}</span>
                    <span className="text-[10px] text-oq-300">{card.metric}</span>
                  </div>
                  <div className="text-[9px] text-oq-300 mt-1 font-mono">{card.source}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════ */}
      {/* 6. DATA SOURCES                                         */}
      {/* ════════════════════════════════════════════════════════ */}
      <section className="py-16 px-6 border-t border-oq-700/15">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-[24px] md:text-[28px] font-bold text-oq-50 tracking-tight text-center mb-10">One interface. Multiple Earth observation sources.</h2>
          <div className="flex flex-wrap justify-center gap-3">
            {DATA_SOURCES.map(s => (
              <div key={s.name} className="flex items-center gap-2 px-3 py-1.5 rounded border border-oq-700/20 bg-oq-900/20">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.status === 'active' ? '#4ADE80' : '#68756E' }} />
                <span className="text-[11px] text-oq-100 font-medium">{s.name}</span>
                {s.status === 'roadmap' && <span className="text-[8px] text-oq-300 uppercase tracking-wider">Roadmap</span>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════ */}
      {/* 7. RESEARCH + OPEN SOURCE                               */}
      {/* ════════════════════════════════════════════════════════ */}
      <section className="py-16 px-6 border-t border-oq-700/15">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-[24px] md:text-[28px] font-bold text-oq-50 tracking-tight text-center mb-2">Research & Open Source</h2>
          <p className="text-[13px] text-oq-200 text-center mb-10">Explore the research behind OrbitalQuery and the code powering the platform.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Research */}
            <div className="p-5 rounded border border-oq-700/20 bg-oq-900/20">
              <div className="text-[9px] text-oq-300 uppercase tracking-wider font-semibold mb-2">Research Report</div>
              <h3 className="text-[15px] font-semibold text-oq-50 mb-2">OrbitalQuery Research Report</h3>
              <p className="text-[11px] text-oq-200 leading-relaxed mb-4">Technical research covering EO data sources, API feasibility, analysis methods, change detection, system architecture and limitations.</p>
              <a href="/docs/research" className="text-[10px] text-lime font-semibold uppercase tracking-wider hover:text-lime-hover transition-colors">Read Research Report</a>
            </div>
            {/* GitHub */}
            <div className="p-5 rounded border border-oq-700/20 bg-oq-900/20">
              <div className="text-[9px] text-oq-300 uppercase tracking-wider font-semibold mb-2">Open Source</div>
              <h3 className="text-[15px] font-semibold text-oq-50 mb-2">OrbitalQuery on GitHub</h3>
              <p className="text-[11px] text-oq-200 leading-relaxed mb-4">Explore the implementation, semantic search, data ingestion, APIs, frontend, backend, and analysis roadmap.</p>
              <a href="https://github.com/saatvikraghuvanshi-lab/OrbitalQuery" target="_blank" rel="noopener noreferrer" className="text-[10px] text-lime font-semibold uppercase tracking-wider hover:text-lime-hover transition-colors">View on GitHub</a>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════ */}
      {/* 8. TECHNICAL CREDIBILITY + ARCHITECTURE                 */}
      {/* ════════════════════════════════════════════════════════ */}
      <section className="py-16 px-6 border-t border-oq-700/15">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-[22px] font-bold text-oq-50 tracking-tight mb-3">A working system, not just a concept.</h2>
          <p className="text-[13px] text-oq-300 mb-8">Core capabilities powering OrbitalQuery's Earth observation analysis.</p>

          {/* Feature tags row */}
          <div className="flex flex-wrap justify-center gap-2.5 mb-10">
            {CAPABILITIES.map(c => (
              <span key={c} className="px-4 py-1.5 rounded-md text-[11px] font-medium text-[#E5E7EB] border border-[#2A3A2F] bg-[#0F1A13]">
                {c}
              </span>
            ))}
          </div>

          {/* System pipeline row */}
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {[
              { num: '01', label: 'User Query' },
              { num: '02', label: 'Semantic Search' },
              { num: '03', label: 'EO Data Sources' },
              { num: '04', label: 'Analysis' },
              { num: '05', label: 'Map + Insight' },
            ].map((step, i) => (
              <div key={step.label} className="flex items-center gap-2">
                <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg border border-[#2A3A2F] bg-[#0D1711]">
                  <span className="text-[9px] font-mono font-bold" style={{ color: '#A3E635' }}>{step.num}</span>
                  <span className="text-[11px] font-medium text-[#E5E7EB]">{step.label}</span>
                </div>
                {i < 4 && (
                  <svg className="w-5 h-5 flex-shrink-0" style={{ color: '#A3E635' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════ */}
      {/* 10. FINAL CTA                                           */}
      {/* ════════════════════════════════════════════════════════ */}
      <section className="py-20 px-6 border-t border-oq-700/15">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-[28px] md:text-[36px] font-bold text-oq-50 tracking-tight mb-2">The Earth is already speaking.</h2>
          <p className="text-[14px] text-oq-200 mb-8">Ask the right question.</p>
          <div className="flex items-center justify-center gap-4">
            <button onClick={handleLaunch} className="bg-lime text-oq-950 text-[11px] font-semibold uppercase tracking-wider px-6 py-2.5 rounded hover:bg-lime-hover transition-colors flex items-center gap-2">
              Launch Console
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
            </button>
            <button onClick={() => onNavigate('showcase')} className="text-[11px] text-oq-300 hover:text-oq-100 transition-colors uppercase tracking-wider font-medium">Explore Research</button>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════ */}
      {/* 11. FOOTER                                              */}
      {/* ════════════════════════════════════════════════════════ */}
      <footer className="border-t border-oq-700/20 py-8 px-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <div className="text-[13px] font-semibold text-oq-100 mb-0.5">OrbitalQuery</div>
            <div className="text-[10px] text-oq-300">Semantic Earth Observation Dataset Explorer</div>
          </div>
          <div className="flex items-center gap-5">
            {[
              { label: 'Console', action: handleLaunch },
              { label: 'Analyses', action: handleExplore },
              { label: 'GitHub', action: () => window.open('https://github.com/saatvikraghuvanshi-lab/OrbitalQuery', '_blank') },
            ].map(link => (
              <button key={link.label} onClick={link.action} className="text-[10px] text-oq-300 hover:text-oq-100 transition-colors uppercase tracking-wider font-medium">{link.label}</button>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
