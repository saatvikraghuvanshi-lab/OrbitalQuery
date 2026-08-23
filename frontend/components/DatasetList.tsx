'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface Dataset {
  id: string;
  title: string;
  provider: string;
  collection: string;
  date: string | null;
  bbox: number[] | null;
  cloudCover?: number | null;
  previewUrl?: string | null;
  score?: number;
}

interface DatasetListProps {
  datasets: Dataset[];
  selectedId: string | null;
  onSelect: (dataset: Dataset) => void;
  loading?: boolean;
}

const PROVIDER_COLORS: Record<string, string> = {
  'ISRO': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'Bhoonidhi': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'Copernicus': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'ESA': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'NASA': 'bg-green-500/20 text-green-400 border-green-500/30',
  'AWS': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  'Planetary Computer': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'Microsoft': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'Sentinel': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  'Landsat': 'bg-teal-500/20 text-teal-400 border-teal-500/30',
};

const PROVIDER_ICONS: Record<string, string> = {
  'ISRO': '🇮🇳',
  'Bhoonidhi': '🇮🇳',
  'Copernicus': '🇪🇺',
  'ESA': '🇪🇺',
  'NASA': '🇺🇸',
  'AWS': '☁️',
  'Planetary Computer': '🌐',
  'Microsoft': '🌐',
  'Sentinel': '🛰️',
  'Landsat': '🛰️',
};

function getProviderBadge(provider: string) {
  const key = Object.keys(PROVIDER_COLORS).find(k =>
    provider?.toLowerCase().includes(k.toLowerCase())
  ) || provider;
  const colorClass = PROVIDER_COLORS[key] || 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  const icon = PROVIDER_ICONS[key] || '📡';
  return { colorClass, icon, label: key };
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

export default function DatasetList({ datasets, selectedId, onSelect, loading }: DatasetListProps) {
  if (loading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-slate-800/30 animate-pulse" />
        ))}
      </div>
    );
  }

  if (datasets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <div className="text-3xl mb-3">📦</div>
        <h3 className="text-sm font-semibold text-slate-400 mb-1">No Datasets</h3>
        <p className="text-xs text-slate-600">
          Run a search in Ask OrbitalQuery to discover datasets, or adjust your filters.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-2 p-3">
        {datasets.map((ds) => {
          const { colorClass, icon, label } = getProviderBadge(ds.provider);
          const isSelected = ds.id === selectedId;

          return (
            <Card
              key={ds.id}
              onClick={() => onSelect(ds)}
              className={`cursor-pointer transition-all duration-200 border ${
                isSelected
                  ? 'border-blue-500/50 bg-blue-500/10 shadow-lg shadow-blue-500/10'
                  : 'border-slate-700/30 bg-slate-800/20 hover:bg-slate-800/40 hover:border-slate-600/50'
              }`}
            >
              <CardContent className="p-3">
                {/* Provider badge */}
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="outline" className={`text-[10px] px-2 py-0 ${colorClass}`}>
                    {icon} {label}
                  </Badge>
                  {ds.cloudCover != null && (
                    <span className="text-[10px] text-slate-500">
                      ☁️ {ds.cloudCover.toFixed(0)}%
                    </span>
                  )}
                </div>

                {/* Title */}
                <h4 className="text-xs font-medium text-slate-200 leading-tight mb-1.5 line-clamp-2">
                  {ds.title}
                </h4>

                {/* Meta */}
                <div className="flex items-center gap-3 text-[10px] text-slate-500">
                  <span>📅 {formatDate(ds.date)}</span>
                  {ds.bbox && (
                    <span className="font-mono">
                      📍 [{ds.bbox[0]?.toFixed(1)}, {ds.bbox[1]?.toFixed(1)}]
                    </span>
                  )}
                </div>

                {/* Score bar */}
                {ds.score != null && (
                  <div className="mt-2">
                    <div className="h-1 bg-slate-700/50 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full transition-all"
                        style={{ width: `${Math.min(ds.score, 100)}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-slate-600 mt-0.5 block">
                      Relevance: {ds.score.toFixed(0)}%
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </ScrollArea>
  );
}
