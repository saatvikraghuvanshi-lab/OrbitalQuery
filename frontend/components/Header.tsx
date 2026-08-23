'use client';

import OrbitalLogo from './OrbitalLogo';

export default function Header() {
  return (
    <header className="border-b border-slate-800/50 glass sticky top-0 z-50">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <OrbitalLogo size="sm" showText={true} className="flex-row gap-2" />

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
