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
  urban_expansion: '#8B6CF6', flood_impact: '#60A5FA', vegetation_change: '#22C55E',
  deforestation: '#EF4444', coastal_erosion: '#0EA5E9', glacier_retreat: '#67E8F9',
  water_change: '#06B6D4', burn_severity: '#F97316', snow_cover: '#CBD5E1', soil_moisture: '#D97706',
};

const PHENOMENON_LABELS: Record<string, string> = {
  urban_expansion: 'Urban Expansion', flood_impact: 'Flood Impact', vegetation_change: 'Vegetation Change',
  deforestation: 'Deforestation', coastal_erosion: 'Coastal Erosion', glacier_retreat: 'Glacier Retreat',
  water_change: 'Water Change', burn_severity: 'Burn Severity', snow_cover: 'Snow Cover', soil_moisture: 'Soil Moisture',
};

// ── India: organized by analytical category ──────────────────
const INDIA_CATEGORIES: Category[] = [
  {
    title: 'Urban Expansion', icon: Building2, color: '#8B6CF6',
    queries: [
      { query: 'Hyderabad urban expansion 2021 vs 2025', phenomenon: 'urban_expansion' },
      { query: 'Delhi urban sprawl 2019 vs 2025', phenomenon: 'urban_expansion' },
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
    ],
  },
  {
    title: 'Coastal Erosion', icon: Waves, color: '#0EA5E9',
    queries: [
      { query: 'Mumbai coastal erosion 2020 vs 2025', phenomenon: 'coastal_erosion' },
    ],
  },
  {
    title: 'Glacier Retreat', icon: Mountain, color: '#67E8F9',
    queries: [
      { query: 'Uttarakhand glacier retreat 2018 vs 2025', phenomenon: 'glacier_retreat' },
    ],
  },
  {
    title: 'Water Change', icon: Droplets, color: '#06B6D4',
    queries: [
      { query: 'Rajasthan water body shrinkage 2020 vs 2025', phenomenon: 'water_change' },
    ],
  },
  {
    title: 'Vegetation Change', icon: TreePine, color: '#22C55E',
    queries: [
      { query: 'Jaipur vegetation loss 2020 vs 2025', phenomenon: 'vegetation_change' },
    ],
  },
  {
    title: 'Burn Severity', icon: Flame, color: '#F97316',
    queries: [
      { query: 'Chennai burn severity analysis 2023 vs 2025', phenomenon: 'burn_severity' },
    ],
  },
  {
    title: 'Snow Cover', icon: Snowflake, color: '#CBD5E1',
    queries: [
      { query: 'Himalayan snow cover change 2019 vs 2025', phenomenon: 'snow_cover' },
    ],
  },
  {
    title: 'Soil Moisture', icon: Sprout, color: '#D97706',
    queries: [
      { query: 'Thar Desert soil moisture decline 2020 vs 2025', phenomenon: 'soil_moisture' },
    ],
  },
];

// ── International ────────────────────────────────────────────
const INTERNATIONAL_CATEGORIES: Category[] = [
  {
    title: 'Deforestation', icon: Scissors, color: '#EF4444',
    queries: [
      { query: 'Amazon deforestation 2018 vs 2025', phenomenon: 'deforestation' },
    ],
  },
  {
    title: 'Urban Expansion', icon: Building2, color: '#8B6CF6',
    queries: [
      { query: 'Jakarta urban expansion 2019 vs 2025', phenomenon: 'urban_expansion' },
      { query: 'Dhaka urban sprawl 2020 vs 2025', phenomenon: 'urban_expansion' },
    ],
  },
  {
    title: 'Burn Severity', icon: Flame, color: '#F97316',
    queries: [
      { query: 'California wildfire burn severity 2023 vs 2025', phenomenon: 'burn_severity' },
    ],
  },
  {
    title: 'Glacier Retreat', icon: Mountain, color: '#67E8F9',
    queries: [
      { query: 'Greenland ice sheet retreat 2018 vs 2025', phenomenon: 'glacier_retreat' },
    ],
  },
  {
    title: 'Water Change', icon: Droplets, color: '#06B6D4',
    queries: [
      { query: 'Lake Chad shrinkage 2015 vs 2025', phenomenon: 'water_change' },
    ],
  },
  {
    title: 'Coastal Erosion', icon: Waves, color: '#0EA5E9',
    queries: [
      { query: 'Great Barrier Reef coastal change 2019 vs 2024', phenomenon: 'coastal_erosion' },
    ],
  },
  {
    title: 'Vegetation Change', icon: TreePine, color: '#22C55E',
    queries: [
      { query: 'Nairobi vegetation change 2020 vs 2025', phenomenon: 'vegetation_change' },
    ],
  },
];

// ── Category section component ───────────────────────────────
function CategorySection({ category, onSelect }: { category: Category; onSelect: (q: string) => void }) {
  const Icon = category.icon;

  return (
    <div className="space-y-1.5">
      {/* Category header */}
      <div className="flex items-center gap-1.5 px-1">
        <Icon className="w-3 h-3" style={{ color: category.color }} strokeWidth={2} />
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: category.color }}>
          {category.title}
        </span>
      </div>
      {/* Query cards */}
      {category.queries.map((q) => (
        <button
          key={q.query}
          onClick={() => onSelect(q.query)}
          className="w-full text-left px-3 py-2 rounded border border-oq-700/15 bg-oq-800/10 hover:bg-oq-700/25 hover:border-oq-600/30 transition-all group"
        >
          <span className="text-[12px] text-oq-100 group-hover:text-oq-50 transition-colors leading-snug">
            {q.query}
          </span>
        </button>
      ))}
    </div>
  );
}

export default function ShowcaseQueries({ onSelect }: { onSelect: (query: string) => void }) {
  return (
    <div className="w-full max-w-6xl mx-auto px-6 py-8">

      {/* ── Hero ──────────────────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Globe className="w-4 h-4 text-lime" strokeWidth={2} />
          <h1 className="text-[22px] font-bold text-oq-50 tracking-tight">Explore Earth&apos;s Change</h1>
        </div>
        <p className="text-[13px] text-oq-200 leading-relaxed max-w-2xl">
          Investigate real-world environmental change using multi-temporal satellite imagery and spectral analysis.
        </p>
      </div>

      {/* ── India ─────────────────────────────────────────────── */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-1 h-4 rounded-full bg-lime" />
          <h2 className="text-[13px] font-bold text-oq-50 uppercase tracking-wider">India</h2>
          <span className="text-[10px] text-oq-300 ml-1">· {INDIA_CATEGORIES.reduce((n, c) => n + c.queries.length, 0)} analyses</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-5">
          {INDIA_CATEGORIES.map((cat) => (
            <CategorySection key={cat.title} category={cat} onSelect={onSelect} />
          ))}
        </div>
      </section>

      {/* ── International ─────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <span className="w-1 h-4 rounded-full bg-purple" />
          <h2 className="text-[13px] font-bold text-oq-50 uppercase tracking-wider">International</h2>
          <span className="text-[10px] text-oq-300 ml-1">· {INTERNATIONAL_CATEGORIES.reduce((n, c) => n + c.queries.length, 0)} analyses</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-5">
          {INTERNATIONAL_CATEGORIES.map((cat) => (
            <CategorySection key={cat.title} category={cat} onSelect={onSelect} />
          ))}
        </div>
      </section>
    </div>
  );
}
