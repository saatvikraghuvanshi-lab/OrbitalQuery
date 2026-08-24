'use client';

interface OrbitalLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
}

function LogoMark({ size }: { size: number }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Satellite body */}
      <rect x="12" y="10" width="8" height="12" rx="2" fill="#FF4D4D" />
      {/* Solar panel left */}
      <rect x="4" y="12" width="7" height="8" rx="1.5" stroke="#FF4D4D" strokeWidth="2" fill="none" />
      {/* Solar panel right */}
      <rect x="21" y="12" width="7" height="8" rx="1.5" stroke="#FF4D4D" strokeWidth="2" fill="none" />
      {/* Antenna */}
      <path d="M16 10 L16 6" stroke="#FF4D4D" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="5" r="1.2" fill="#FF4D4D" />
      {/* Orbital ring */}
      <ellipse cx="16" cy="16" rx="14.5" ry="5" stroke="rgba(255,77,77,0.35)" strokeWidth="1.2" fill="none" strokeDasharray="3 2" />
    </svg>
  );
}

export default function OrbitalLogo({ size = 'md', showText = true, className = '' }: OrbitalLogoProps) {
  const iconSizes: Record<string, number> = { sm: 36, md: 47, lg: 73, xl: 94 };
  const textSizes: Record<string, string> = { sm: 'text-base', md: 'text-lg', lg: 'text-3xl', xl: 'text-4xl' };
  const isHorizontal = className.includes('flex-row') || className.includes('flex-col');

  return (
    <div className={`flex flex-col items-center gap-1.5 ${className}`}>
      <LogoMark size={iconSizes[size] || 36} />
      {showText && (
        <div className={className.includes('flex-row') ? 'text-left' : 'text-center'}>
          <h1 className={`${textSizes[size] || 'text-base'} font-bold text-white tracking-[0.02em]`} style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
            Orbital<span className="text-[#FF4D4D]">Query</span>
          </h1>
        </div>
      )}
    </div>
  );
}
