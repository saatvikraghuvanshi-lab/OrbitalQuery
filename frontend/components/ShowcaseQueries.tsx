'use client';

import {
  Building2, CloudRain, TreePine, Scissors, Waves, Mountain, Droplets, Flame, Snowflake, Sprout, Globe,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface ShowcaseQuery { query: string; phenomenon: string; }
interface Category { title: string; icon: LucideIcon; color: string; queries: ShowcaseQuery[]; }

const PHENOMENON_ICONS: Record<string, LucideIcon> = {
  urban_expansion: Building2, flood_impact: CloudRain, vegetation_change: TreePine,
  deforestation: Scissors, coastal_erosion: Waves, glacier_retreat: Mountain,
  water_change: Droplets, burn_severity: Flame, snow_cover: Snowflake, soil_moisture: Sprout,
};

const PHENOMENON_COLORS: Record<string, string> = {
  urban_expansion: '#A78BFA', flood_impact: '#60A5FA', vegetation_change: '#4ADE80',
  deforestation: '#EF4444', coastal_erosion: '#2DD4BF', glacier_retreat: '#BAE6FD',
  water_change: '#22D3EE', burn_severity: '#FB923C', snow_cover: '#BAE6FD', soil_moisture: '#FBBF24',
};

const ALL_CATEGORIES: Category[] = [
  {
    title: 'Urban Expansion', icon: Building2, color: '#A78BFA',
    queries: [
      { query: 'Hyderabad urban expansion 2021 vs 2025', phenomenon: 'urban_expansion' },
      { query: 'Delhi urban sprawl 2019 vs 2025', phenomenon: 'urban_expansion' },
      { query: 'Jakarta urban expansion 2019 vs 2025', phenomenon: 'urban_expansion' },
      { query: 'Dhaka urban sprawl 2020 vs 2025', phenomenon: 'urban_expansion' },
    ],
  },
  {
    title: 'Flood Impact', icon: CloudRain, color: '#60A5FA',
    queries: [
      { query: 'Kerala flood impact August 2024', phenomenon: 'flood_impact' },
      { query: 'Assam flood extent July 2024', phenomenon: 'flood_impact' },
    ],
  },
  {
    title: 'Deforestation', icon: Scissors, color: '#EF4444',
    queries: [
      { query: 'Sundarbans deforestation 2019 vs 2024', phenomenon: 'deforestation' },
      { query: 'Amazon deforestation 2018 vs 2025', phenomenon: 'deforestation' },
    ],
  },
  {
    title: 'Coastal Erosion', icon: Waves, color: '#2DD4BF',
    queries: [
      { query: 'Mumbai coastal erosion 2020 vs 2025', phenomenon: 'coastal_erosion' },
      { query: 'Great Barrier Reef coastal change 2019 vs 2024', phenomenon: 'coastal_erosion' },
    ],
  },
  {
    title: 'Glacier Retreat', icon: Mountain, color: '#BAE6FD',
    queries: [
      { query: 'Uttarakhand glacier retreat 2018 vs 2025', phenomenon: 'glacier_retreat' },
      { query: 'Greenland ice sheet retreat 2018 vs 2025', phenomenon: 'glacier_retreat' },
    ],
  },
  {
    title: 'Water Change', icon: Droplets, color: '#22D3EE',
    queries: [
      { query: 'Rajasthan water body shrinkage 2020 vs 2025', phenomenon: 'water_change' },
      { query: 'Lake Chad shrinkage 2015 vs 2025', phenomenon: 'water_change' },
    ],
  },
  {
    title: 'Vegetation Change', icon: TreePine, color: '#4ADE80',
    queries: [
      { query: 'Jaipur vegetation loss 2020 vs 2025', phenomenon: 'vegetation_change' },
      { query: 'Nairobi vegetation change 2020 vs 2025', phenomenon: 'vegetation_change' },
    ],
  },
  {
    title: 'Burn Severity', icon: Flame, color: '#FB923C',
    queries: [
      { query: 'Chennai burn severity analysis 2023 vs 2025', phenomenon: 'burn_severity' },
      { query: 'California wildfire burn severity 2023 vs 2025', phenomenon: 'burn_severity' },
    ],
  },
  {
    title: 'Snow Cover', icon: Snowflake, color: '#BAE6FD',
    queries: [
      { query: 'Himalayan snow cover change 2019 vs 2025', phenomenon: 'snow_cover' },
    ],
  },
  {
    title: 'Soil Moisture', icon: Sprout, color: '#FBBF24',
    queries: [
      { query: 'Thar Desert soil moisture decline 2020 vs 2025', phenomenon: 'soil_moisture' },
    ],
  },
];

function CategorySection({ category, onSelect }: { category: Category; onSelect: (q: string) => void }) {
  const Icon = category.icon;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 px-1 mb-1">
        <Icon className="w-3 h-3" style={{ color: category.color }} strokeWidth={2} />
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: category.color }}>
          {category.title}
        </span>
      </div>
      {category.queries.map((q) => (
        <button
          key={q.query}
          onClick={() => onSelect(q.query)}
          className="w-full text-left px-3 py-1.5 rounded text-[11px] text-oq-100 hover:text-oq-50 hover:bg-oq-800/50 transition-colors"
        >
          {q.query}
        </button>
      ))}
    </div>
  );
}

export default function ShowcaseQueries({ onSelect }: { onSelect: (query: string) => void }) {
  return (
    <div className="w-full max-w-6xl mx-auto px-6 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Globe className="w-4 h-4 text-oq-200" strokeWidth={2} />
          <h1 className="text-[22px] font-bold text-oq-50 tracking-tight">Explore Earth&apos;s Change</h1>
        </div>
        <p className="text-[13px] text-oq-200 leading-relaxed max-w-2xl">
          Investigate real-world environmental change using multi-temporal satellite imagery and spectral analysis.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-6">
        {ALL_CATEGORIES.map((cat) => (
          <CategorySection key={cat.title} category={cat} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}
