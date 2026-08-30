'use client';

import { useState, useCallback } from 'react';

export interface YearlyDataPoint {
  year: number;
  date: string;
  scene_id: string;
  cloud_cover: number;
  index_mean: number;
  index_std: number;
  index_min: number;
  index_max: number;
  thumbnail: string;
  tilejson: string;
}

export interface YearlyTrend {
  direction: string;
  slope_per_year: number;
  r_squared: number;
  start_value: number;
  end_value: number;
  total_change: number;
  total_change_pct: number;
  year_over_year: Array<{
    from_year: number;
    to_year: number;
    change: number;
    pct_change: number;
  }>;
  mean: number;
  std: number;
}

export interface YearlyComparisonResult {
  status: string;
  aoi_name: string;
  aoi_bbox: number[];
  index_name: string;
  collection: string;
  years: YearlyDataPoint[];
  trend: YearlyTrend;
  processing_steps: Array<{ step: string; detail: string }>;
}

interface UseYearlyComparisonOptions {
  bbox: number[];
  startYear: number;
  endYear: number;
  collection?: string;
  index?: string;
  maxCloudCover?: number;
  aoiName?: string;
}

export function useYearlyComparison() {
  const [result, setResult] = useState<YearlyComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchYearlyData = useCallback(async (options: UseYearlyComparisonOptions) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/analysis/yearly-comparison', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bbox: options.bbox,
          start_year: options.startYear,
          end_year: options.endYear,
          collection: options.collection || 'sentinel-2-l2a',
          index: options.index || 'NDVI',
          max_cloud_cover: options.maxCloudCover ?? 20,
          aoi_name: options.aoiName || 'Study Area',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || data.detail || 'Yearly comparison failed');
      }

      const data = await res.json();
      setResult(data);
      return data;
    } catch (err: any) {
      const msg = err.message || 'Failed to fetch yearly data';
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setLoading(false);
  }, []);

  return { result, loading, error, fetchYearlyData, reset };
}
