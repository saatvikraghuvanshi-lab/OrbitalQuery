'use client';

interface OrbitalLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
}

export default function OrbitalLogo({ size = 'md', showText = true, className = '' }: OrbitalLogoProps) {
  const sizes = {
    sm: { icon: 32, text: 'text-lg', sub: 'text-[8px]' },
    md: { icon: 48, text: 'text-2xl', sub: 'text-[10px]' },
    lg: { icon: 80, text: 'text-4xl', sub: 'text-xs' },
    xl: { icon: 120, text: 'text-5xl', sub: 'text-sm' },
  };
  const s = sizes[size];

  const isHorizontal = className.includes('flex-row');

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      {/* Logo Icon — red satellite with orbital ring */}
      <svg
        width={s.icon}
        height={s.icon}
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Orbital ring — tilted ellipse */}
        <ellipse
          cx="100"
          cy="100"
          rx="85"
          ry="45"
          transform="rotate(-35 100 100)"
          stroke="#dc2626"
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
        />

        {/* Satellite body — stylized Q shape */}
        <g transform="translate(55, 45)">
          {/* Main satellite body */}
          <rect x="15" y="0" width="60" height="55" rx="8" fill="#dc2626" />

          {/* Solar panels — left */}
          <rect x="0" y="10" width="18" height="35" rx="3" fill="#dc2626" />
          <line x1="9" y1="15" x2="9" y2="40" stroke="#0a0e1a" strokeWidth="2" />

          {/* Solar panels — right */}
          <rect x="72" y="10" width="18" height="35" rx="3" fill="#dc2626" />
          <line x1="81" y1="15" x2="81" y2="40" stroke="#0a0e1a" strokeWidth="2" />

          {/* Center dish/antenna */}
          <rect x="30" y="12" width="30" height="30" rx="4" fill="#0a0e1a" />
          <rect x="35" y="17" width="20" height="20" rx="2" fill="#dc2626" opacity="0.6" />

          {/* Q tail — the distinctive斜 line */}
          <line x1="55" y1="55" x2="80" y2="90" stroke="#dc2626" strokeWidth="10" strokeLinecap="round" />
        </g>
      </svg>

      {/* Text */}
      {showText && (
        <div className={isHorizontal ? 'text-left' : 'text-center'}>
          <h1
            className={`font-black tracking-tight text-white ${s.text}`}
            style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}
          >
            <span className="text-[#dc2626]">Ø</span>rbital<span className="text-[#dc2626]">Q</span>uery
          </h1>
          {size !== 'sm' && (
            <p className={`${s.sub} text-slate-500 tracking-[0.2em] uppercase mt-1`}>
              EO Dataset Explorer
            </p>
          )}
        </div>
      )}
    </div>
  );
}
