'use client';

import Image from 'next/image';

interface OrbitalLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
}

export default function OrbitalLogo({ size = 'md', showText = true, className = '' }: OrbitalLogoProps) {
  const isHorizontal = className.includes('flex-row');

  // For lg/xl, show the full logo image (icon + text baked in)
  if (size === 'lg' || size === 'xl') {
    const dims = size === 'lg' ? { w: 200, h: 120 } : { w: 300, h: 180 };
    return (
      <div className={`flex flex-col items-center ${className}`}>
        <Image
          src="/orbitalquery-logo.png"
          alt="ØrbitalQuery"
          width={dims.w}
          height={dims.h}
          className="object-contain"
          priority
        />
      </div>
    );
  }

  // For sm/md, show the image inline with optional text
  const iconDims = size === 'sm' ? { w: 36, h: 36 } : { w: 48, h: 48 };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Image
        src="/orbitalquery-logo.png"
        alt="ØrbitalQuery"
        width={iconDims.w}
        height={iconDims.h}
        className="object-contain rounded"
        priority
      />
      {showText && (
        <div className={isHorizontal ? 'text-left' : 'text-center'}>
          <h1 className="text-sm font-bold tracking-tight text-white">
            <span className="text-[#dc2626]">Ø</span>rbital<span className="text-[#dc2626]">Q</span>uery
          </h1>
        </div>
      )}
    </div>
  );
}
