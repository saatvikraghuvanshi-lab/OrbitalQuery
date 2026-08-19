'use client';

import { useEffect } from 'react';
import { installMockHandlers } from '@/lib/mock-api';

/**
 * Initializes mock API handlers when the backend is unreachable.
 * This component runs client-side only and is invisible to the user.
 * When NEXT_PUBLIC_USE_MOCKS=true, mocks are always active.
 * Otherwise, mocks only activate if the backend is down.
 */
export default function MockInitializer() {
  useEffect(() => {
    const useMocks = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';

    if (useMocks) {
      console.info('🎭 OrbitalQuery: Mock API handlers enabled (NEXT_PUBLIC_USE_MOCKS=true)');
      installMockHandlers();
    } else {
      // Try backend health check, install mocks if it fails
      fetch('/api/health', { method: 'GET' })
        .then(res => {
          if (!res.ok) throw new Error('Backend unhealthy');
          console.info('🛰️ OrbitalQuery: Backend connected');
        })
        .catch(() => {
          console.warn('🎭 OrbitalQuery: Backend unreachable — activating mock API handlers');
          installMockHandlers();
        });
    }
  }, []);

  return null; // No UI
}
