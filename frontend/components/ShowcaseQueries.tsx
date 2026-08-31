'use client';

import {
  Building2, CloudRain, TreePine, Scissors, Waves, Mountain, Droplets, Flame, Snowflake, Sprout, MapPin, Globe,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface ShowcaseQuery { query: string; phenomenon: string; }
interface Category { title: string; subtitle: string; icon: LucideIcon; queries: ShowcaseQuery[]; color: string; }

const PHENOMENON_ICONS: Record<string, LucideIcon> = {
  urban_expansion: Building2, flood_impact: CloudRain, vegetation_change: TreePine,
  deforestation: Scissors, coastal_erosion: Waves, glacier_retreat: Mountain,
  water_change: Droplets, burn_severity: Flame, snow_cover: Snowflake, soil_moisture: Sprout,
};

const PHENOMENON_COLORS: Record<string, string> = {
  urban_expansion: '#8B6CF6', flood_impact: '#60A5FA', vegetation_change: '#22C55E',
  deforestation: '#EF4444', coastal_erosion: '#0EA5E9', glacier_retreat: '#67E8F9',
  water_change: '#06B6D4', burn_severity: '#F97316', snow_cover: '#CBD5E1', soil_moisture: '#D97706',
};

const SHOWCASE_CATEGORIES: Category[] = [
  {
    title: 'India', subtitle: 'Real-world EO analysis queries for Indian locations',
    icon: MapPin, color: '#A3F63F',
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
    title: 'International', subtitle: 'Global Earth observation analysis queries',
    icon: Globe, color: '#8B6CF6',
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

export default function ShowcaseQueries({ onSelect }: { onSelect: (query: string) => void }) {
  return (
    <div className="w-full max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Globe className="w-5 h-5 text-purple" strokeWidth={1.75} />
          <h2 className="text-headline text-oq-50">Explore Earth&apos;s Change</h2>
        </div>
        <p className="text-body text-oq-200 max-w-xl">
          Click any query to run a real temporal comparison analysis. OrbitalQuery discovers satellite imagery, computes spectral indices, and generates change metrics.
        </p>
      </div>

      {/* Categories */}
      {SHOWCASE_CATEGORIES.map((category) => {
        const CatIcon = category.icon;
        return (
          <div key={category.title} className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <CatIcon className="w-4 h-4" style={{ color: category.color }} strokeWidth={1.75} />
              <h3 className="text-sm font-semibold text-oq-50">{category.title}</h3>
              <span className="text-[10px] text-oq-300">·</span>
              <span className="text-[11px] text-oq-300">{category.subtitle}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {category.queries.map((q) => {
                const Icon = PHENOMENON_ICONS[q.phenomenon] || MapPin;
                const color = PHENOMENON_COLORS[q.phenomenon] || '#94A3B8';
                return (
                  <button
                    key={q.query}
                    onClick={() => onSelect(q.query)}
                    className="group text-left p-3 rounded-lg border border-oq-600/30 bg-oq-800/20 hover:bg-oq-700/40 hover:border-oq-600/50 transition-all oq-card"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: `${color}12` }}>
                        <Icon className="w-4 h-4" style={{ color }} strokeWidth={1.75} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-oq-100 group-hover:text-oq-50 transition-colors leading-tight">
                          {q.query}
                        </div>
                        <div className="text-[10px] text-oq-300 mt-0.5 capitalize">
                          {q.phenomenon.replace(/_/g, ' ')}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
