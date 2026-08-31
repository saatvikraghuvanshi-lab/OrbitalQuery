'use client';

import { useMemo } from 'react';
import type { YearlyComparisonResult } from '@/hooks/useYearlyComparison';

interface Props {
  result: YearlyComparisonResult;
}

// Index color config
const INDEX_COLORS: Record<string, { color: string; label: string; description: string }> = {
  NDVI: { color: '#22c55e', label: 'Vegetation Index', description: 'Measures vegetation health and density' },
  NDWI: { color: '#3b82f6', label: 'Water Index', description: 'Detects surface water bodies' },
  NDBI: { color: '#a855f7', label: 'Built-up Index', description: 'Identifies urban/built-up areas' },
  NBR: { color: '#f97316', label: 'Burn Ratio', description: 'Assesses wildfire burn severity' },
  NDSI: { color: '#06b6d4', label: 'Snow Index', description: 'Maps snow and ice cover' },
};

export default function YearlyComparisonView({ result }: Props) {
  const config = INDEX_COLORS[result.index_name] || INDEX_COLORS.NDVI;
  const { years, trend } = result;

  // Compute chart dimensions
  const chartData = useMemo(() => {
    if (!years.length) return null;

    const values = years.map(y => y.index_mean);
    const minVal = Math.min(...values) - 0.1;
    const maxVal = Math.max(...values) + 0.1;
    const range = maxVal - minVal || 1;

    return { values, minVal, maxVal, range };
  }, [years]);

  if (!years.length) {
    return (
      <div className="oq-card p-8 text-center border-oq-700/30">
        <div className="text-oq-200 text-sm">No data available for the selected year range</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-medium mb-3"
          style={{ background: `${config.color}20`, color: config.color, border: `1px solid ${config.color}30` }}>
          {result.index_name} — {config.label}
        </div>
        <h2 className="text-xl font-bold text-oq-50 mb-1">
          {result.aoi_name} — Yearly {result.index_name} Trend
        </h2>
        <p className="text-xs text-oq-300">
          {years[0].year} → {years[years.length - 1].year} · {years.length} years · {result.collection}
        </p>
      </div>

      {/* Trend Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="oq-card p-4">
          <div className="text-[10px] text-oq-300 uppercase tracking-wider font-medium mb-1">Trend</div>
          <div className="text-lg font-bold" style={{ color: trend.direction === 'increasing' ? '#22c55e' : trend.direction === 'decreasing' ? '#ef4444' : '#94a3b8' }}>
            {trend.direction === 'increasing' ? '↗ Increasing' : trend.direction === 'decreasing' ? '↘ Decreasing' : '→ Stable'}
          </div>
          <div className="text-[10px] text-oq-300 mt-1">R² = {trend.r_squared.toFixed(2)}</div>
        </div>
        <div className="oq-card p-4">
          <div className="text-[10px] text-oq-300 uppercase tracking-wider font-medium mb-1">Start ({years[0].year})</div>
          <div className="text-2xl font-bold text-oq-50">{trend.start_value.toFixed(4)}</div>
          <div className="text-[10px] text-oq-300 mt-1">{result.index_name} mean</div>
        </div>
        <div className="oq-card p-4">
          <div className="text-[10px] text-oq-300 uppercase tracking-wider font-medium mb-1">End ({years[years.length - 1].year})</div>
          <div className="text-2xl font-bold" style={{ color: config.color }}>{trend.end_value.toFixed(4)}</div>
          <div className="text-[10px] text-oq-300 mt-1">{result.index_name} mean</div>
        </div>
        <div className="oq-card p-4">
          <div className="text-[10px] text-oq-300 uppercase tracking-wider font-medium mb-1">Total Change</div>
          <div className="text-2xl font-bold" style={{ color: trend.total_change > 0 ? '#22c55e' : trend.total_change < 0 ? '#ef4444' : '#94a3b8' }}>
            {trend.total_change > 0 ? '+' : ''}{(trend.total_change * 100).toFixed(2)}%
          </div>
          <div className="text-[10px] text-oq-300 mt-1">{trend.slope_per_year > 0 ? '+' : ''}{(trend.slope_per_year * 100).toFixed(3)}% per year</div>
        </div>
      </div>

      {/* Timeline Chart */}
      <div className="oq-card p-5">
        <h3 className="text-xs font-semibold text-oq-100 uppercase tracking-wider mb-4">
          {result.index_name} Time Series
        </h3>
        <div className="relative" style={{ height: '280px' }}>
          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 bottom-8 w-12 flex flex-col justify-between text-[10px] text-oq-400 text-right pr-2">
            <span>{chartData?.maxVal.toFixed(2)}</span>
            <span>{((chartData?.maxVal || 0) + (chartData?.minVal || 0)) / 2}</span>
            <span>{chartData?.minVal.toFixed(2)}</span>
          </div>
          
          {/* Chart area */}
          <div className="absolute left-14 right-4 top-0 bottom-8 border-l border-b border-oq-700/50">
            {/* Grid lines */}
            <div className="absolute inset-0">
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i} className="absolute w-full border-t border-oq-700/20" style={{ top: `${i * 25}%` }} />
              ))}
            </div>

            {/* Trend line */}
            {chartData && trend.slope_per_year !== 0 && (
              <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                <line
                  x1="0"
                  y1={`${((chartData.maxVal - trend.start_value) / chartData.range) * 100}%`}
                  x2="100%"
                  y2={`${((chartData.maxVal - trend.end_value) / chartData.range) * 100}%`}
                  stroke={config.color}
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  opacity="0.4"
                />
              </svg>
            )}

            {/* Data points and line */}
            <svg className="absolute inset-0 w-full h-full">
              {/* Line */}
              <polyline
                fill="none"
                stroke={config.color}
                strokeWidth="2"
                points={chartData ? years.map((y, i) => {
                  const x = (i / Math.max(years.length - 1, 1)) * 100;
                  const yPos = ((chartData.maxVal - y.index_mean) / chartData.range) * 100;
                  return `${x}%,${yPos}%`;
                }).join(' ') : ''}
              />
              {/* Points */}
              {chartData && years.map((y, i) => {
                const x = (i / Math.max(years.length - 1, 1)) * 100;
                const yPos = ((chartData.maxVal - y.index_mean) / chartData.range) * 100;
                return (
                  <g key={y.year}>
                    <circle
                      cx={`${x}%`}
                      cy={`${yPos}%`}
                      r="5"
                      fill={config.color}
                      stroke="#0f172a"
                      strokeWidth="2"
                    />
                    {/* Value label */}
                    <text
                      x={`${x}%`}
                      y={`${yPos - 8}%`}
                      textAnchor="middle"
                      className="fill-oq-200"
                      fontSize="10"
                      fontWeight="600"
                    >
                      {y.index_mean.toFixed(3)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* X-axis labels */}
          <div className="absolute left-14 right-4 bottom-0 flex justify-between text-[10px] text-oq-300">
            {years.map(y => (
              <span key={y.year}>{y.year}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Year-by-Year Table */}
      <div className="oq-card overflow-hidden">
        <div className="px-5 py-3 border-b border-oq-700/30">
          <h3 className="text-xs font-semibold text-oq-100 uppercase tracking-wider">
            Year-by-Year Data
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] text-oq-300 uppercase tracking-wider border-b border-oq-700/30">
                <th className="px-4 py-2 text-left">Year</th>
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-right">{result.index_name} Mean</th>
                <th className="px-4 py-2 text-right">Std Dev</th>
                <th className="px-4 py-2 text-right">Cloud</th>
                <th className="px-4 py-2 text-right">YoY Change</th>
              </tr>
            </thead>
            <tbody>
              {years.map((y, i) => {
                const yoy = trend.year_over_year?.find(t => t.to_year === y.year);
                return (
                  <tr key={y.year} className="border-b border-oq-700/20 hover:bg-oq-800/30">
                    <td className="px-4 py-2.5 font-medium text-oq-50">{y.year}</td>
                    <td className="px-4 py-2.5 text-oq-300 font-mono text-xs">
                      {y.date ? new Date(y.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono" style={{ color: config.color }}>
                      {y.index_mean.toFixed(4)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-oq-300 font-mono text-xs">
                      ±{y.index_std.toFixed(4)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        y.cloud_cover < 10 ? 'bg-semantic-success/20 text-semantic-success' :
                        y.cloud_cover < 25 ? 'bg-semantic-warning/20 text-semantic-warning' :
                        'bg-semantic-error/20 text-semantic-error'
                      }`}>
                        {y.cloud_cover.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {yoy ? (
                        <span className={`text-xs font-medium ${yoy.change > 0 ? 'text-semantic-success' : yoy.change < 0 ? 'text-semantic-error' : 'text-oq-300'}`}>
                          {yoy.change > 0 ? '+' : ''}{(yoy.change * 100).toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-oq-400 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Methodology */}
      <div className="oq-card p-5">
        <h3 className="text-xs font-semibold text-oq-100 uppercase tracking-wider mb-3">
          Methodology
        </h3>
        <div className="text-xs text-oq-200 space-y-2">
          <p>
            <span className="text-oq-300">Index:</span>{' '}
            <span className="font-mono text-oq-50">{result.index_name}</span>
            {' — '}
            <span className="text-oq-300">Mean value computed from best low-cloud scene per year (growing season: Apr-Sep)</span>
          </p>
          <p>
            <span className="text-oq-300">Trend:</span>{' '}
            <span className="text-oq-50">Linear regression with R² = {trend.r_squared.toFixed(3)}</span>
            {' · '}
            <span className="text-oq-300">Slope: {trend.slope_per_year > 0 ? '+' : ''}{(trend.slope_per_year * 100).toFixed(4)}% per year</span>
          </p>
          <p>
            <span className="text-oq-300">Sensor:</span>{' '}
            <span className="text-oq-50">{result.collection}</span>
            {' · '}
            <span className="text-oq-300">Cloud threshold: &lt;20%</span>
          </p>
        </div>
      </div>
    </div>
  );
}
