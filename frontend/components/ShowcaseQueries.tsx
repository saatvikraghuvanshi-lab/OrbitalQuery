'use client';

import { useState } from 'react';
import {
  Building2, CloudRain, TreePine, Scissors, Waves, Mountain,
  Droplets, Flame, Snowflake, Sprout, ArrowRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────

interface ShowcaseQuery {
  query: string;
  phenomenon: string;
}

interface Category {
  title: string;
  icon: LucideIcon;
  color: string;
  group: 'land' | 'water' | 'cryosphere' | 'urban';
  queries: ShowcaseQuery[];
}

interface FeaturedAnalysis {
  location: string;
  phenomenon: string;
  timeRange: string;
  query: string;
  category: string;
  color: string;
  description: string;
}

// ── Data ───────────────────────────────────────────────────────

const FEATURED: FeaturedAnalysis[] = [
  {
    location: 'Hyderabad',
    phenomenon: 'Urban Expansion',
    timeRange: '2021 → 2025',
    query: 'Hyderabad urban expansion 2021 vs 2025',
    category: 'Urban',
    color: '#A78BFA',
    description: 'Built-up area growth across the metropolitan region.',
  },
  {
    location: 'Kerala',
    phenomenon: 'Flood Impact',
    timeRange: 'August 2024',
    query: 'Kerala flood impact August 2024',
    category: 'Flood',
    color: '#60A5FA',
    description: 'Before and after flood extent in the affected region.',
  },
  {
    location: 'Sundarbans',
    phenomenon: 'Deforestation',
    timeRange: '2019 → 2024',
    query: 'Sundarbans deforestation 2019 vs 2024',
    category: 'Forest',
    color: '#4ADE80',
    description: 'Mangrove canopy loss over the five-year period.',
  },
];

const ALL_CATEGORIES: Category[] = [
  {
    title: 'Vegetation Change', icon: TreePine, color: '#4ADE80', group: 'land',
    queries: [
      { query: 'Jaipur vegetation loss 2020 vs 2025', phenomenon: 'vegetation_change' },
      { query: 'Nairobi vegetation change 2020 vs 2025', phenomenon: 'vegetation_change' },
    ],
  },
  {
    title: 'Deforestation', icon: Scissors, color: '#EF4444', group: 'land',
    queries: [
      { query: 'Sundarbans deforestation 2019 vs 2024', phenomenon: 'deforestation' },
      { query: 'Amazon deforestation 2018 vs 2025', phenomenon: 'deforestation' },
    ],
  },
  {
    title: 'Soil Moisture', icon: Sprout, color: '#FBBF24', group: 'land',
    queries: [
      { query: 'Thar Desert soil moisture decline 2020 vs 2025', phenomenon: 'soil_moisture' },
    ],
  },
  {
    title: 'Burn Severity', icon: Flame, color: '#FB923C', group: 'land',
    queries: [
      { query: 'Chennai burn severity analysis 2023 vs 2025', phenomenon: 'burn_severity' },
      { query: 'California wildfire burn severity 2023 vs 2025', phenomenon: 'burn_severity' },
    ],
  },
  {
    title: 'Flood Impact', icon: CloudRain, color: '#60A5FA', group: 'water',
    queries: [
      { query: 'Kerala flood impact August 2024', phenomenon: 'flood_impact' },
      { query: 'Assam flood extent July 2024', phenomenon: 'flood_impact' },
    ],
  },
  {
    title: 'Water Change', icon: Droplets, color: '#22D3EE', group: 'water',
    queries: [
      { query: 'Rajasthan water body shrinkage 2020 vs 2025', phenomenon: 'water_change' },
      { query: 'Lake Chad shrinkage 2015 vs 2025', phenomenon: 'water_change' },
    ],
  },
  {
    title: 'Coastal Erosion', icon: Waves, color: '#2DD4BF', group: 'water',
    queries: [
      { query: 'Mumbai coastal erosion 2020 vs 2025', phenomenon: 'coastal_erosion' },
      { query: 'Great Barrier Reef coastal change 2019 vs 2024', phenomenon: 'coastal_erosion' },
    ],
  },
  {
    title: 'Glacier Retreat', icon: Mountain, color: '#BAE6FD', group: 'cryosphere',
    queries: [
      { query: 'Uttarakhand glacier retreat 2018 vs 2025', phenomenon: 'glacier_retreat' },
      { query: 'Greenland ice sheet retreat 2018 vs 2025', phenomenon: 'glacier_retreat' },
    ],
  },
  {
    title: 'Snow Cover', icon: Snowflake, color: '#BAE6FD', group: 'cryosphere',
    queries: [
      { query: 'Himalayan snow cover change 2019 vs 2025', phenomenon: 'snow_cover' },
    ],
  },
  {
    title: 'Urban Expansion', icon: Building2, color: '#A78BFA', group: 'urban',
    queries: [
      { query: 'Hyderabad urban expansion 2021 vs 2025', phenomenon: 'urban_expansion' },
      { query: 'Delhi urban sprawl 2019 vs 2025', phenomenon: 'urban_expansion' },
      { query: 'Jakarta urban expansion 2019 vs 2025', phenomenon: 'urban_expansion' },
      { query: 'Dhaka urban sprawl 2020 vs 2025', phenomenon: 'urban_expansion' },
    ],
  },
];

// ── Group definitions ──────────────────────────────────────────

const GROUPS = [
  { key: 'land' as const, label: 'Land & Vegetation' },
  { key: 'water' as const, label: 'Water & Coast' },
  { key: 'cryosphere' as const, label: 'Cryosphere' },
  { key: 'urban' as const, label: 'Urban' },
];

const GROUP_DIVIDER_COLORS: Record<string, string> = {
  land: '#4ADE80',
  water: '#22D3EE',
  cryosphere: '#BAE6FD',
  urban: '#A78BFA',
};

// ── Component ──────────────────────────────────────────────────

export default function ShowcaseQueries({ onSelect }: { onSelect: (query: string) => void }) {
  const [regionFilter, setRegionFilter] = useState<'all' | 'india' | 'global'>('all');

  const filteredFeatured = FEATURED.filter(f => {
    if (regionFilter === 'india') {
      return ['Hyderabad', 'Kerala', 'Sundarbans', 'Delhi', 'Jaipur', 'Mumbai',
        'Uttarakhand', 'Rajasthan', 'Assam', 'Chennai', 'Himalayan', 'Thar',
        'Great Barrier Reef', 'Amazon', 'Lake Chad', 'Nairobi', 'California',
        'Jakarta', 'Dhaka', 'Greenland'].some(loc =>
        f.location.toLowerCase().includes(loc.toLowerCase()) ||
        f.query.toLowerCase().includes(loc.toLowerCase())
      ) && !['Lake Chad', 'Nairobi', 'California', 'Amazon', 'Jakarta', 'Dhaka', 'Greenland', 'Great Barrier Reef'].some(loc =>
        f.location.toLowerCase().includes(loc.toLowerCase())
      );
    }
    return true;
  });

  return (
    <div className="w-full min-h-full" style={{ background: '#050907' }}>
      <div className="max-w-[1360px] mx-auto px-10 py-10">

        {/* ── Page Header ──────────────────────────────────── */}
        <div className="mb-8">
          <h1 className="text-[32px] md:text-[36px] font-bold text-oq-50 tracking-tight leading-tight mb-2">
            Explore Earth&apos;s Change
          </h1>
          <p className="text-[14px] text-oq-300 max-w-lg leading-relaxed">
            Investigate environmental change through satellite imagery, location and time.
          </p>
        </div>

        {/* ── Filter Bar ───────────────────────────────────── */}
        <div className="flex items-center gap-4 mb-10">
          <span className="text-[9px] uppercase tracking-[0.15em] text-oq-400 font-medium">
            Explore by phenomenon
          </span>
          <div className="flex-1 h-px bg-oq-700/20" />
          <div className="flex items-center gap-1">
            {(['all', 'india', 'global'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setRegionFilter(f)}
                className={`px-3 py-1 rounded text-[10px] font-medium uppercase tracking-wider transition-all border ${
                  regionFilter === f
                    ? 'bg-oq-700/30 border-oq-600/40 text-oq-50'
                    : 'border-transparent text-oq-400 hover:text-oq-200'
                }`}
              >
                {f === 'all' ? 'All' : f === 'india' ? 'India' : 'Global'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Featured Analyses ────────────────────────────── */}
        <div className="mb-12">
          <div className="mb-5">
            <h2 className="text-[18px] font-semibold text-oq-50 mb-1">Featured analyses</h2>
            <p className="text-[12px] text-oq-400">
              See how Earth observation data reveals change over time.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {FEATURED.map((item) => (
              <button
                key={item.query}
                onClick={() => onSelect(item.query)}
                className="group text-left rounded-lg border border-oq-700/20 bg-oq-800/20 hover:bg-oq-800/40 hover:border-oq-700/40 transition-all overflow-hidden"
              >
                {/* Visual area */}
                <div
                  className="h-44 relative overflow-hidden"
                  style={{
                    background: `linear-gradient(135deg, ${item.color}08 0%, ${item.color}04 50%, #09110D 100%)`,
                  }}
                >
                  {/* Abstract satellite visual */}
                  <div className="absolute inset-0" style={{
                    backgroundImage: `
                      radial-gradient(ellipse at 30% 40%, ${item.color}10 0%, transparent 60%),
                      radial-gradient(ellipse at 70% 60%, ${item.color}08 0%, transparent 50%)
                    `,
                  }} />
                  <div className="absolute inset-0 opacity-[0.04]" style={{
                    backgroundImage: `linear-gradient(${item.color}40 1px, transparent 1px), linear-gradient(90deg, ${item.color}40 1px, transparent 1px)`,
                    backgroundSize: '40px 40px',
                  }} />
                  {/* Location label */}
                  <div className="absolute top-3 left-3">
                    <span
                      className="text-[9px] uppercase tracking-wider font-medium px-2 py-0.5 rounded"
                      style={{ color: item.color, background: `${item.color}12` }}
                    >
                      {item.category}
                    </span>
                  </div>
                </div>

                {/* Text area */}
                <div className="px-4 py-3.5">
                  <div className="text-[16px] font-semibold text-oq-50 mb-0.5 leading-tight">
                    {item.location}
                  </div>
                  <div className="text-[12px] text-oq-300 mb-1.5">
                    {item.phenomenon} · {item.timeRange}
                  </div>
                  <div className="text-[11px] text-oq-400 leading-relaxed mb-3">
                    {item.description}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] font-medium text-lime group-hover:gap-2 transition-all">
                    View Analysis <ArrowRight className="w-3 h-3" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Category Browser ─────────────────────────────── */}
        <div>
          <div className="mb-6">
            <h2 className="text-[18px] font-semibold text-oq-50 mb-1">Explore by phenomenon</h2>
            <p className="text-[12px] text-oq-400">
              Browse analyses organized by environmental phenomenon.
            </p>
          </div>

          <div className="space-y-8">
            {GROUPS.map((group) => {
              const cats = ALL_CATEGORIES.filter(c => c.group === group.key);
              if (cats.length === 0) return null;

              return (
                <div key={group.key}>
                  {/* Group header */}
                  <div className="flex items-center gap-3 mb-5">
                    <div
                      className="w-[3px] h-[14px] rounded-full"
                      style={{ background: GROUP_DIVIDER_COLORS[group.key] || '#68756E' }}
                    />
                    <h3 className="text-[11px] uppercase tracking-[0.12em] font-semibold text-oq-200 leading-none">
                      {group.label}
                    </h3>
                    <div className="flex-1 h-px bg-oq-700/20" />
                  </div>

                  {/* Categories in group */}
                  <div className="grid grid-cols-3 gap-x-10 gap-y-6">
                    {cats.map((cat) => {
                      const Icon = cat.icon;
                      return (
                        <div key={cat.title}>
                          {/* Category title */}
                          <div className="flex items-center gap-2 mb-2.5">
                            <Icon className="w-3 h-3" style={{ color: cat.color }} strokeWidth={2} />
                            <span
                              className="text-[10px] font-semibold uppercase tracking-wider"
                              style={{ color: cat.color }}
                            >
                              {cat.title}
                            </span>
                          </div>

                          {/* Query list */}
                          <div className="space-y-0.5">
                            {cat.queries.map((q) => (
                              <button
                                key={q.query}
                                onClick={() => onSelect(q.query)}
                                className="group w-full text-left px-2.5 py-2 rounded text-[12px] text-oq-200 hover:text-oq-50 hover:bg-oq-700/20 transition-all flex items-center gap-2"
                              >
                                <span className="flex-1 leading-snug">{q.query}</span>
                                <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-oq-400 flex-shrink-0" />
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
