'use client';

import { useState, useCallback } from 'react';

// ── Types ───────────────────────────────────────────────────────

export interface AnalysisPlan {
  plan_id: string;
  phenomenon: string;
  phenomenon_description: string;
  analysis_type: string;
  sensor: string;
  bands: string[];
  aoi: string;
  bbox: number[];
  start_date: string;
  end_date: string;
  cloud_threshold: number;
  comparison_strategy: string;
  min_scenes: number;
  max_scenes: number;
  output_requirements: string[];
  required_indices: string[];
  validation: {
    status: string;
    phenomenon: string;
    analysis_type: string;
    sensor: string;
    bands: string[];
    dates_provided: boolean;
    bbox_provided: boolean;
  };
}

export interface SceneInfo {
  item_id: string;
  collection: string;
  datetime: string;
  cloud_cover: number | null;
  bbox: number[];
  provider: string;
  platform: string;
}

export interface IndexInfo {
  index_name: string;
  stats: Record<string, number>;
  scene_id: string;
  date: string;
  resolution_m: number;
  valid_pixels: number;
  total_pixels: number;
}

export interface TemporalComparisonResult {
  plan_id: string;
  phenomenon: string;
  analysis_type: string;
  aoi_name: string;
  aoi_bbox: number[];
  period1: { start: string; end: string };
  period2: { start: string; end: string };
  scene_t1: SceneInfo | null;
  scene_t2: SceneInfo | null;
  index_t1: IndexInfo | null;
  index_t2: IndexInfo | null;
  change_detection: Record<string, any> | null;
  metrics: Record<string, any>;
  imagery: {
    period1: Record<string, string>;
    period2: Record<string, string>;
  };
  processing_steps: Array<{ step: string; detail: string }>;
  sensor_info: Record<string, any>;
  explanation: {
    title: string;
    summary: string;
    methodology: string;
    key_findings: string[];
    key_indices: string[];
    sensors_used: string[];
    confidence: string;
    limitations: string[];
  };
}

export type AnalysisStep =
  | 'idle'
  | 'planning'
  | 'searching'
  | 'ranking'
  | 'processing'
  | 'deciding'
  | 'explaining'
  | 'complete'
  | 'error';

export interface AnalysisState {
  step: AnalysisStep;
  query: string;
  plan: AnalysisPlan | null;
  scenes: SceneInfo[];
  result: TemporalComparisonResult | null;
  error: string | null;
}

// ── Hook ────────────────────────────────────────────────────────

export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>({
    step: 'idle',
    query: '',
    plan: null,
    scenes: [],
    result: null,
    error: null,
  });

  const reset = useCallback(() => {
    setState({
      step: 'idle',
      query: '',
      plan: null,
      scenes: [],
      result: null,
      error: null,
    });
  }, []);

  const analyze = useCallback(async (query: string) => {
    setState(prev => ({ ...prev, step: 'planning', query, error: null }));

    try {
      // Call the real temporal-compare pipeline
      setState(prev => ({ ...prev, step: 'searching' }));

      const res = await fetch('/api/analysis/temporal-compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      let data: any;
      try {
        data = await res.json();
      } catch {
        throw new Error('Backend is unreachable. Please ensure the analysis service is running.');
      }

      if (!res.ok) {
        const errMsg = data?.detail || data?.message || data?.error || `Analysis failed (${res.status})`;
        // Make cold-start errors user-friendly
        if (errMsg.includes('starting up') || errMsg.includes('unavailable') || errMsg.includes('invalid response')) {
          throw new Error('🛰️ The analysis engine is waking up from sleep (Render free tier). Please try again in 30-60 seconds.');
        }
        throw new Error(errMsg);
      }

      if (data.status === 'error') {
        throw new Error(data.message || (data.errors?.[0]) || 'Query could not be processed. Please describe what you want to analyze.');
      }

      const plan = data.plan;
      if (!plan) {
        throw new Error('No analysis plan was generated. Please provide a location and phenomenon (e.g. "Flood impact in Jaipur from July to September 2024").');
      }

      setState(prev => ({ ...prev, step: 'ranking', plan }));

      // Simulate processing steps with progress updates
      setState(prev => ({ ...prev, step: 'processing' }));
      await new Promise(r => setTimeout(r, 500));

      setState(prev => ({ ...prev, step: 'deciding' }));
      await new Promise(r => setTimeout(r, 300));

      setState(prev => ({ ...prev, step: 'explaining' }));
      await new Promise(r => setTimeout(r, 300));

      // Build the result from the pipeline response
      const result: TemporalComparisonResult = data.result;

      // Extract scenes for the evidence panel
      const scenes: SceneInfo[] = [];
      if (result.scene_t1) scenes.push(result.scene_t1);
      if (result.scene_t2) scenes.push(result.scene_t2);

      setState(prev => ({
        ...prev,
        step: 'complete',
        scenes,
        result,
      }));

    } catch (err: any) {
      setState(prev => ({
        ...prev,
        step: 'error',
        error: err.message || 'Analysis failed',
      }));
    }
  }, []);

  return { state, analyze, reset };
}
