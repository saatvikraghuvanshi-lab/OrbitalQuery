'use client';

import OrbitalLogo from './OrbitalLogo';

interface HeaderProps {
  onCoordinateSearch?: (coord: string) => void;
  onAnalyze?: () => void;
}

export default function Header({ onCoordinateSearch, onAnalyze }: HeaderProps) {
  return (
    <header className="border-b border-white/5 bg-[#0c0e12] sticky top-0 z-50">
      <div className="max-w-[1800px] mx-auto px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center space-x-2 cursor-pointer">
            <OrbitalLogo size="sm" showText={true} className="flex-row gap-2" />
          </div>

          {/* Right side: Coordinate search + Analyze + Sign In */}
          <div className="flex items-center space-x-5">
            {/* Coordinate search */}
            <div className="relative flex items-center">
              <div className="absolute left-3 text-gray-500">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Coordinate or ID..."
                className="pl-9 pr-4 py-2 rounded-md bg-white text-gray-900 placeholder-gray-500 text-sm
                  focus:outline-none focus:ring-2 focus:ring-[#f03b43] w-64 border-none shadow-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && onCoordinateSearch) {
                    onCoordinateSearch((e.target as HTMLInputElement).value);
                  }
                }}
              />
            </div>

            {/* Analyze button */}
            <button
              onClick={onAnalyze}
              className="bg-[#f03b43] hover:bg-[#d9343c] text-white px-6 py-2 rounded font-bold text-sm
                transition-colors shadow-sm tracking-wide"
            >
              ANALYZE
            </button>

            {/* Sign In */}
            <a
              href="/auth"
              className="text-white hover:text-gray-300 text-sm font-medium transition-colors"
            >
              Sign In
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
