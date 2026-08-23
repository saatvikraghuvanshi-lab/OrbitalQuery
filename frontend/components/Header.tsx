'use client';

export default function Header() {
  return (
    <header className="border-b border-slate-800/50 glass sticky top-0 z-50">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-white">
                OrbitalQuery
              </h1>
              <p className="text-[10px] text-slate-500 -mt-0.5 tracking-wider uppercase">
                EO Dataset Explorer
              </p>
            </div>
          </div>

          {/* Right side — minimal */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-600 font-mono hidden sm:block">
              Powered by ISRO • Copernicus • Sentinel
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
