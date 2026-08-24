'use client';

import {
  Earth,
  Building2,
  CloudRain,
  TreePine,
  Scissors,
  Waves,
  Mountain,
  Droplets,
  Flame,
  Snowflake,
  Sprout,
  MapPin,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface ShowcaseQuery {
  query: string;
  phenomenon: string;
}

interface Category {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  queries: ShowcaseQuery[];
}

// Phenomenon → Lucide icon mapping
const PHENOMENON_ICONS: Record<string, LucideIcon> = {
  urban_expansion: Building2,
  flood_impact: CloudRain,
  vegetation_change: TreePine,
  deforestation: Scissors,
  coastal_erosion: Waves,
  glacier_retreat: Mountain,
  water_change: Droplets,
  burn_severity: Flame,
  snow_cover: Snowflake,
  soil_moisture: Sprout,
};

// Phenomenon → subtle tint color (used for icon background)
const PHENOMENON_COLORS: Record<string, string> = {
  urban_expansion: '#a855f7',
  flood_impact: '#3b82f6',
  vegetation_change: '#22c55e',
  deforestation: '#ef4444',
  coastal_erosion: '#0ea5e9',
  glacier_retreat: '#67e8f9',
  water_change: '#06b6d4',
  burn_severity: '#f97316',
  snow_cover: '#e2e8f0',
  soil_moisture: '#d97706',
};

function PhenomenonIcon({ phenomenon }: { phenomenon: string }) {
  const Icon = PHENOMENON_ICONS[phenomenon] || Earth;
  const color = PHENOMENON_COLORS[phenomenon] || '#94a3b8';

  return (
    <div
      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
      style={{ background: `${color}12` }}
    >
      <Icon className="w-[18px] h-[18px]" style={{ color }} strokeWidth={1.75} />
    </div>
  );
}

const SHOWCASE_CATEGORIES: Category[] = [
  {
    title: 'India',
    subtitle: 'Real-world EO analysis queries for Indian locations',
    icon: MapPin,
    queries: [
      { query: 'Hyderabad urban expansion 2021 vs 2025', phenomenon: 'urban_expansion' },
      { query: 'Kerala flood impact August 2024', phenomenon: 'flood_impact' },
      { query: 'Jaipur vegetation loss 2020 vs 2025', phenomenon: 'vegetation_change' },
      { query: 'Sundarbans deforestation 2019 vs 2024', phenomenon: 'deforestation' },
      { query: 'Mumbai coastal erosion 2020 vs 2025', phenomenon: 'coastal_erosion' },
      { query: 'Uttarakhand glacier retreat 2018 vs 2025', phenomenon: 'glacier_retreat' },
      { query: 'Rajasthan water body shrinkage 2020 vs 2025', phenomenon: 'water_change' },
      { query: 'Delhi urban sprawl 2019 vs 2025', phenomenon: 'urban_expansion' },
      { query: 'Assam flood extent July 2024', phenomenon: 'flood_impact' },
      { query: 'Chennai burn severity analysis 2023 vs 2025', phenomenon: 'burn_severity' },
      { query: 'Himalayan snow cover change 2019 vs 2025', phenomenon: 'snow_cover' },
      { query: 'Thar Desert soil moisture decline 2020 vs 2025', phenomenon: 'soil_moisture' },
    ],
  },
  {
    title: 'International',
    subtitle: 'Global Earth observation analysis queries',
    icon: Earth,
    queries: [
      { query: 'Amazon deforestation 2018 vs 2025', phenomenon: 'deforestation' },
      { query: 'Jakarta urban expansion 2019 vs 2025', phenomenon: 'urban_expansion' },
      { query: 'California wildfire burn severity 2023 vs 2025', phenomenon: 'burn_severity' },
      { query: 'Greenland ice sheet retreat 2018 vs 2025', phenomenon: 'glacier_retreat' },
      { query: 'Lake Chad shrinkage 2015 vs 2025', phenomenon: 'water_change' },
      { query: 'Dhaka urban sprawl 2020 vs 2025', phenomenon: 'urban_expansion' },
      { query: 'Great Barrier Reef coastal change 2019 vs 2024', phenomenon: 'coastal_erosion' },
      { query: 'Nairobi vegetation change 2020 vs 2025', phenomenon: 'vegetation_change' },
    ],
  },
];

interface ShowcaseQueriesProps {
  onSelect: (query: string) => void;
}

export default function ShowcaseQueries({ onSelect }: ShowcaseQueriesProps) {
  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-8">
      {/* Hero */}
      <div className="text-center mb-10">
        <div className="flex items-center justify-center gap-3 mb-3">
          <Earth className="w-8 h-8 text-blue-400/70" strokeWidth={1.5} />
          <h2 className="text-3xl font-bold text-white">Explore Earth</h2>
        </div>
        <p className="text-sm text-slate-400 max-w-xl mx-auto">
          Click any query below to run a real temporal comparison analysis.
          OrbitalQuery will discover satellite imagery, compute spectral indices,
          and generate change metrics automatically.
        </p>
      </div>

      {/* Categories */}
      {SHOWCASE_CATEGORIES.map((category) => {
        const CatIcon = category.icon;
        return (
          <div key={category.title} className="mb-10">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <CatIcon className="w-5 h-5 text-slate-400" strokeWidth={1.75} />
                {category.title}
              </h3>
              <p className="text-xs text-slate-500">{category.subtitle}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {category.queries.map((q) => (
                <button
                  key={q.query}
                  onClick={() => onSelect(q.query)}
                  className="group text-left p-4 rounded-xl border border-slate-700/30 bg-slate-800/30
                    hover:bg-slate-800/60 hover:border-slate-600/50 transition-all duration-200"
                >
                  <div className="flex items-start gap-3">
                    <PhenomenonIcon phenomenon={q.phenomenon} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors leading-tight">
                        {q.query}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1 capitalize">
                        {q.phenomenon.replace(/_/g, ' ')}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
