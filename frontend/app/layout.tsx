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
          href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css"
        />
      </head>
      <body className="antialiased">
        <MockInitializer />
        <div className="starfield" />
        <div className="relative z-10">
          {children}
        </div>
      </body>
    </html>
  );
}
