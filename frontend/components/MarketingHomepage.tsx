'use client';

import { useCallback } from 'react';

interface MarketingHomepageProps {
  onLaunchAsk: () => void;
  onNavigate: (tab: 'ask' | 'showcase' | 'discover') => void;
}

export default function MarketingHomepage({ onLaunchAsk, onNavigate }: MarketingHomepageProps) {
  const handleLaunch = useCallback(() => {
    onNavigate('ask');
  }, [onNavigate]);

  return (
    <div className="oq-bg min-h-screen flex flex-col">
      {/* Top Navigation */}
      <nav className="w-full sticky top-0 z-50 border-b border-[var(--color-accent-border)]" style={{ background: 'rgba(8,18,11,0.85)', backdropFilter: 'blur(12px)' }}>
        <div className="max-w-7xl mx-auto px-gutter-md h-control-bar-height flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="12" y="10" width="8" height="12" rx="2" fill="#ef4444" />
              <rect x="4" y="12" width="7" height="8" rx="1.5" stroke="#ef4444" strokeWidth="1.5" fill="none" />
              <rect x="21" y="12" width="7" height="8" rx="1.5" stroke="#ef4444" strokeWidth="1.5" fill="none" />
              <path d="M16 10 L16 6" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="16" cy="5" r="1.2" fill="#ef4444" />
              <ellipse cx="16" cy="16" rx="14.5" ry="5" stroke="rgba(239,68,68,0.35)" strokeWidth="1.2" fill="none" strokeDasharray="3 2" />
            </svg>
            <span className="text-[18px] font-semibold text-[var(--color-text-primary)] tracking-tight">
              OrbitalQuery
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleLaunch}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Ask
            </button>
            <button
              onClick={() => onNavigate('showcase')}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Showcase
            </button>
            <button
              onClick={() => onNavigate('discover')}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
              Discover
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-grow">
        {/* Hero Section */}
        <section className="relative w-full min-h-[80vh] flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 w-full h-full" style={{
            backgroundImage: `url('https://lh3.googleusercontent.com/aida-public/AB6AXuBS8U667WQz7pFS52T9uevSEbcLv-w1lz82XhrhWU4POlIPRx0eWoi-MalJcatG-fqfT2W7Z2PXyW1CBnLA3uEyGGoDzN-LM8tJ3WH4WAyuI2LWVcw47Uy_fNQtXhdh7aBf8RTt-dVBkm5aiuTVErocV95UFjBPmMVqqdO0YuFsLOJWF2RmNqJM6D1vuvf8KGDyWnn1hlhhqeoPP4F0pcFUl72OkerHUti_29qugb2kz4LL6q88_jQNew')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center center',
          }} />
          <div className="absolute inset-0 bg-[var(--color-bg-deep)]/60 backdrop-blur-[2px]" />

          <div className="relative z-10 text-center px-gutter-md max-w-4xl mx-auto mt-20">
            <h1 className="font-headline-xl text-headline-xl text-[var(--color-accent)] mb-6">
              Ask the Earth. Find the Data.
            </h1>
            <p className="font-body-md text-body-md text-[var(--color-text-secondary)] mb-10 max-w-2xl mx-auto">
              Query Earth observation archives using natural language, location and time — without manually browsing satellite catalogs.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={handleLaunch}
                className="bg-[var(--color-accent)] text-[var(--color-bg-deep)] font-label-mono text-label-mono uppercase px-6 py-3 rounded-full w-full sm:w-auto hover:bg-[var(--color-accent-hover)] transition-colors shadow-[0_0_15px_rgba(163,246,63,0.3)] flex items-center justify-center"
              >
                Launch Console
                <svg className="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </button>
              <button
                onClick={() => onNavigate('showcase')}
                className="bg-oq-700/40 border border-[var(--color-accent-border)] text-[var(--color-accent)] font-label-mono text-label-mono uppercase px-6 py-3 rounded-full w-full sm:w-auto hover:border-[var(--color-accent)] transition-colors flex items-center justify-center"
              >
                View Documentation
                <svg className="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A9 9 0 006 18c1.052 0 2.062-.18 3-.512m0-13.042A8.967 8.967 0 0118 3.75c1.052 0 2.062.18 3 .512v14.25A9 9 0 0118 18c-1.052 0-2.062-.18-3-.512" />
                </svg>
              </button>
            </div>
          </div>
        </section>

        {/* Search Section */}
        <section className="py-24 px-gutter-md bg-[var(--color-bg-base)] border-t border-[var(--color-accent-border)] relative overflow-hidden">
          <div className="absolute inset-0 topo-bg opacity-30" />
          <div className="max-w-3xl mx-auto relative z-10">
            <div className="oq-card p-8">
              <h2 className="font-headline-lg text-headline-lg text-[var(--color-text-primary)] mb-2">
                Ask a question about Earth observation data
              </h2>
              <p className="font-body-md text-body-md text-[var(--color-text-secondary)] mb-8">
                Describe what you&apos;re looking for in natural language.
              </p>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </span>
                <input
                  type="text"
                  placeholder="e.g. Compare urban expansion in Hyderabad from 2021–2025..."
                  className="w-full bg-[var(--color-bg-elevated)] border border-[var(--color-accent-border)] text-[var(--color-text-primary)] font-data-display text-data-display py-4 pl-12 pr-4 focus:outline-none focus:border-[var(--color-accent)] transition-colors rounded-xl placeholder:text-[var(--color-text-muted)]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                      onLaunchAsk();
                    }
                  }}
                />
              </div>
              <div className="mt-6 flex flex-wrap gap-2 items-center">
                <span className="font-label-mono text-label-mono text-[var(--color-text-muted)] uppercase mr-2 mt-1">Examples:</span>
                {[
                  'Urban expansion in Hyderabad, 2021–2025',
                  'Vegetation change in the Amazon, 2020–2025',
                  'Snow cover in the Himalayas this year',
                  'Coastal change near Mumbai, 2019–2025',
                ].map((example) => (
                  <button
                    key={example}
                    onClick={handleLaunch}
                    className="bg-oq-700/40 text-[var(--color-text-secondary)] font-body-sm text-body-sm px-3 py-1 rounded-full border border-[var(--color-accent-border)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Capabilities Grid */}
        <section className="py-24 px-gutter-md bg-[var(--color-bg-deep)] relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[var(--color-accent)]/5 rounded-full blur-[120px] pointer-events-none" />
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16 relative z-10">
              <span className="font-label-mono text-label-mono text-[var(--color-accent)] uppercase tracking-widest mb-4 block">
                Core Capabilities
              </span>
              <h2 className="font-headline-xl text-headline-xl text-[var(--color-text-primary)] font-bold">
                Search. Discover. Explore.
              </h2>
            </div>
            <div className="flex flex-col gap-4 max-w-4xl mx-auto relative z-10">
              {[
                { num: '01', title: 'Semantic Search', desc: 'Ask questions about Earth observation data in natural language.', action: handleLaunch },
                { num: '02', title: 'Earth Observation Data', desc: 'Discover relevant observations across available datasets.', action: () => onNavigate('discover') },
                { num: '03', title: 'Spatial & Temporal Analysis', desc: 'Explore observations on a map and compare them across time.', action: () => onNavigate('showcase') },
              ].map((item) => (
                <button
                  key={item.num}
                  onClick={item.action}
                  className="group flex items-center justify-between p-8 bg-[var(--color-bg-card)] border border-[var(--color-accent-border)] hover:border-[var(--color-accent)] transition-all duration-300 cursor-pointer text-left"
                >
                  <div className="flex items-center gap-8">
                    <span className="font-data-display text-2xl text-[var(--color-text-muted)] group-hover:text-[var(--color-accent)] transition-colors">
                      {item.num}
                    </span>
                    <div>
                      <h3 className="font-data-display text-data-display text-[var(--color-text-primary)] uppercase mb-1">
                        {item.title}
                      </h3>
                      <p className="font-body-md text-body-md text-[var(--color-text-secondary)]">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                  <span className="text-[var(--color-text-muted)] group-hover:text-[var(--color-accent)] transition-opacity opacity-0 group-hover:opacity-100">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-32 px-gutter-md relative overflow-hidden bg-[var(--color-bg-base)] border-t border-[var(--color-accent-border)]">
          <div className="absolute inset-0 topo-bg opacity-20" />
          <div className="relative z-10 text-center max-w-2xl mx-auto">
            <h2 className="font-headline-lg text-headline-lg text-[var(--color-text-primary)] mb-6">
              Ready to Explore Earth Observation Data?
            </h2>
            <p className="font-body-md text-body-md text-[var(--color-text-secondary)] mb-8">
              Start with a natural-language question and explore the datasets behind the answer.
            </p>
            <button
              onClick={handleLaunch}
              className="bg-[var(--color-accent)] text-[var(--color-bg-deep)] font-label-mono text-data-display uppercase px-6 py-3 rounded-full hover:bg-[var(--color-accent-hover)] transition-colors shadow-[0_0_20px_rgba(163,246,63,0.4)] flex items-center justify-center mx-auto"
            >
              Launch Console
              <svg className="w-5 h-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full py-margin-safe bg-[var(--color-bg-deep)] text-[var(--color-text-muted)] font-body-sm text-body-sm border-t border-[var(--color-accent-border)] transition-opacity duration-300 flex flex-col md:flex-row justify-between items-center px-gutter-md max-w-7xl mx-auto">
        <div className="text-[var(--color-accent)] font-headline-lg text-headline-lg mb-4 md:mb-0 tracking-tighter font-bold">
          OrbitalQuery
        </div>
        <div className="flex flex-wrap justify-center gap-6 mb-4 md:mb-0">
          <button onClick={() => onNavigate('showcase')} className="hover:text-[var(--color-accent)] transition-colors">Documentation</button>
          <button onClick={() => onNavigate('discover')} className="hover:text-[var(--color-accent)] transition-colors">Datasets</button>
          <button onClick={handleLaunch} className="hover:text-[var(--color-accent)] transition-colors">Launch Console</button>
        </div>
        <div>© 2026 OrbitalQuery.</div>
      </footer>
    </div>
  );
}
