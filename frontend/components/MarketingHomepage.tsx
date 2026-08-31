'use client';

import { useCallback } from 'react';

interface MarketingHomepageProps {
  onLaunchAsk: () => void;
  onNavigate: (tab: 'ask' | 'showcase' | 'discover') => void;
}

export default function MarketingHomepage({ onLaunchAsk, onNavigate }: MarketingHomepageProps) {
  const handleLaunch = useCallback(() => onNavigate('ask'), [onNavigate]);

  return (
    <div className="oq-bg h-screen flex flex-col overflow-hidden">
      {/* Hero */}
      <section className="relative flex-1 flex items-center justify-center overflow-hidden">
        {/* Background satellite imagery */}
        <div className="absolute inset-0">
          <div className="absolute inset-0" style={{
            backgroundImage: `url('https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?q=80&w=2400&auto=format&fit=crop')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.15,
            filter: 'saturate(0.5)',
          }} />
          <div className="absolute inset-0 bg-gradient-to-b from-oq-950/40 via-oq-950/70 to-oq-950" />
        </div>

        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'linear-gradient(rgba(163,246,63,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(163,246,63,0.5) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }} />

        <div className="relative z-10 text-center px-6 max-w-3xl mx-auto">
          {/* Status badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-oq-700/50 bg-oq-900/60 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-lime animate-pulse" />
            <span className="text-[10px] text-oq-200 uppercase tracking-widest font-medium">Earth Observation Intelligence Platform</span>
          </div>

          <h1 className="text-headline-xl text-oq-50 mb-4 tracking-tight">
            Ask the Earth.<br />
            <span className="text-lime">Find the Data.</span>
          </h1>
          <p className="text-body text-oq-200 mb-8 max-w-xl mx-auto leading-relaxed">
            Query Earth observation archives using natural language, location and time — without manually browsing satellite catalogs.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={handleLaunch}
              className="bg-lime text-oq-950 font-medium text-sm uppercase tracking-wider px-6 py-2.5 rounded-md hover:bg-lime-hover transition-colors flex items-center gap-2"
            >
              Launch Console
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </button>
            <button
              onClick={() => onNavigate('showcase')}
              className="bg-oq-800/50 border border-oq-700/50 text-oq-100 text-sm px-6 py-2.5 rounded-md hover:bg-oq-700/50 hover:border-oq-600 transition-colors flex items-center gap-2"
            >
              Explore Analyses
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </div>
        </div>
      </section>

      {/* Bottom status bar */}
      <footer className="relative z-10 border-t border-oq-700/30 bg-oq-950/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-[10px] text-oq-300 uppercase tracking-wider font-medium">Data Sources</span>
            <div className="flex items-center gap-3">
              {['Copernicus', 'NASA', 'ISRO', 'AWS'].map((src) => (
                <span key={src} className="text-[10px] text-oq-200 font-mono">{src}</span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-lime/60" />
            <span className="text-[10px] text-oq-300">Sentinel-2 · Landsat · MODIS</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
