'use client';

import { useEffect, useState } from 'react';

/**
 * ShaderGradient background — loaded client-side only via dynamic import.
 * Falls back to a static CSS gradient if WebGL is unavailable.
 */
export default function ShaderBackground() {
  const [ready, setReady] = useState(false);
  const [SGComponents, setSGComponents] = useState<any>(null);

  useEffect(() => {
    import('@shadergradient/react').then((mod) => {
      setSGComponents({ Canvas: mod.ShaderGradientCanvas, Gradient: mod.ShaderGradient });
      setReady(true);
    }).catch(() => {
      // ShaderGradient failed to load — static fallback
    });
  }, []);

  if (!ready || !SGComponents) {
    return (
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 80%, rgba(163,246,63,0.04) 0%, transparent 55%), radial-gradient(ellipse at 80% 20%, rgba(139,108,246,0.03) 0%, transparent 50%), var(--color-bg-deep)',
          opacity: 0.4,
        }}
      />
    );
  }

  const { Canvas, Gradient } = SGComponents;

  return (
    <div
      className="fixed inset-0 z-0 pointer-events-none"
      style={{ opacity: 0.35 }}
    >
      <Canvas
        style={{ width: '100%', height: '100%' }}
        pixelDensity={1}
        fov={45}
        pointerEvents="none"
      >
        <Gradient
          animate="on"
          cAzimuthAngle={180}
          cDistance={2.8}
          cPolarAngle={80}
          cameraZoom={9.1}
          color1="#08120B"
          color2="#A3F63F"
          color3="#8B6CF6"
          positionX={0}
          positionY={0}
          positionZ={0}
          range="disabled"
          rangeEnd={40}
          rangeStart={0}
          reflection={0.4}
          rotationX={50}
          rotationY={0}
          rotationZ={-60}
          shader="defaults"
          type="waterPlane"
          uAmplitude={0}
          uDensity={1.5}
          uFrequency={0}
          uSpeed={0.4}
          uStrength={1.5}
          uTime={8}
          wireframe={false}
        />
      </Canvas>
    </div>
  );
}
