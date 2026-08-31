import type { Metadata } from 'next';
import './globals.css';
import MockInitializer from '@/components/MockInitializer';

export const metadata: Metadata = {
  title: 'OrbitalQuery — Semantic EO Dataset Explorer',
  description: 'Query Earth Observation datasets with natural language, geospatial filters, and time ranges using semantic AI search.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body className="antialiased oq-bg text-[var(--color-text-primary)]">
        <MockInitializer />
        <div className="relative z-10 min-h-screen flex flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
