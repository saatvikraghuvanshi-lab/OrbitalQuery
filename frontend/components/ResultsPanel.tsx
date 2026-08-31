'use client';

interface ResultsPanelProps {
  result: any;
}

const SEVERITY_COLORS: Record<string, string> = {
  LOW: 'bg-lime/15 text-lime border-lime/30',
  MEDIUM: 'bg-semantic-warning/15 text-semantic-warning border-semantic-warning/30',
  HIGH: 'bg-semantic-after/15 text-semantic-after border-semantic-after/30',
  CRITICAL: 'bg-semantic-error/15 text-semantic-error border-semantic-error/30',
};

const STAT_LABELS: Record<string, string> = {
  total_flood_area_km2: 'Flooded Area',
  flood_pct: 'AOI Coverage',
  builtup_affected_km2: 'Built-up Affected',
  cluster_count: 'Impact Zones',
  urban_expansion_area_km2: 'Expansion Area',
  expansion_pct: 'Growth %',
  ndbi_change_magnitude: 'NDBI Change',
  degradation_area_km2: 'Degradation Area',
  ndvi_change_magnitude: 'NDVI Change',
  burned_area_km2: 'Burned Area',
  burn_pct: 'Burn Coverage',
};

export default function ResultsPanel({ result }: ResultsPanelProps) {
  const severity = result.decision?.overall_severity || 'LOW';
  const severityColor = SEVERITY_COLORS[severity] || SEVERITY_COLORS.LOW;

  return (
    <div className="space-y-4">
      {/* Severity Banner */}
      <div className="oq-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-oq-50">Result</h3>
          <span className={`text-[10px] px-3 py-1 rounded-full border font-bold ${severityColor}`}>
            {severity}
          </span>
        </div>

        {/* Key Statistics */}
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(result.statistics).slice(0, 6).map(([key, value]) => (
            <div key={key} className="bg-oq-800/50 rounded-xl p-3 border border-oq-700/30">
              <div className="text-[10px] text-oq-300 mb-1">
                {STAT_LABELS[key] || key.replace(/_/g, ' ')}
              </div>
              <div className="text-lg font-bold text-oq-50">
                {typeof value === 'number' ? (
                  value < 1 && value > 0 ? value.toFixed(4) : Number(value).toFixed(1)
                ) : String(value)}
                <span className="text-[10px] text-oq-400 font-normal ml-1">
                  {key.includes('km2') ? 'km²' : key.includes('pct') || key.includes('%') ? '%' : ''}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Confidence */}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[10px] text-oq-300">Confidence:</span>
          <span className="text-[10px] text-lime font-medium">
            {result.decision?.confidence || 'medium'}
          </span>
        </div>
      </div>
    </div>
  );
}
