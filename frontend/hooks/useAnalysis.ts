'use client';

import { useState, useCallback } from 'react';

class AnalysisError extends Error {
  code: string | null;
  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = 'AnalysisError';
    this.code = code;
  }
}

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
  errorCode: string | null;
  /** Real detail string shown below the step label */
  detail: string | null;
  /** Real processing steps from the backend */
  processingSteps: Array<{ step: string; detail: string }>;
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
    errorCode: null,
    detail: null,
    processingSteps: [],
  });

  const reset = useCallback(() => {
    setState({
      step: 'idle',
      query: '',
      plan: null,
      scenes: [],
      result: null,
      error: null,
      errorCode: null,
      detail: null,
      processingSteps: [],
    });
  }, []);

  const analyze = useCallback(async (query: string) => {
    setState(prev => ({
      ...prev,
      step: 'planning',
      query,
      error: null,
      detail: 'Parsing your natural language query...',
      processingSteps: [],
    }));

    try {
      // Brief pause so user sees the planning step
      await new Promise(r => setTimeout(r, 200));

      setState(prev => ({ ...prev, step: 'searching', detail: 'Querying satellite archives...' }));

      // ── Backend call with 35s timeout ─────────────────────
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 35000);

      let res: Response;
      try {
        res = await fetch('/api/analysis/temporal-compare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
          signal: controller.signal,
        });
      } catch (fetchErr: any) {
        clearTimeout(timeout);
        if (fetchErr.name === 'AbortError') {
          throw new AnalysisError('Request timed out. The analysis engine may be starting up — try again in 30 seconds.', 'TIMEOUT');
        }
        throw new AnalysisError('Cannot reach the server. Check your connection and try again.', 'NETWORK');
      }
      clearTimeout(timeout);

      let data: any;
      try {
        data = await res.json();
      } catch {
        throw new AnalysisError('Invalid server response. The analysis engine may be starting up.', 'HTTP 000');
      }

      if (!res.ok) {
        const errMsg = data?.detail || data?.message || data?.error || `Analysis failed (${res.status})`;
        if (errMsg.includes('starting up') || errMsg.includes('unavailable') || errMsg.includes('PYTHON_UNAVAILABLE') || res.status === 502 || res.status === 503) {
          throw new AnalysisError('The analysis engine is waking up from sleep. Please try again in 30-60 seconds.', 'HTTP 503');
        }
        throw new AnalysisError(errMsg, `HTTP ${res.status}`);
      }

      if (data.status === 'error' && !data.plan) {
        throw new AnalysisError(data.message || 'Query could not be processed. Describe what you want to analyze.', 'ANALYSIS');
      }

      const plan = data.plan;
      if (!plan) {
        throw new AnalysisError('No analysis plan generated. Provide a location and phenomenon.', 'ANALYSIS');
      }

      const planDetail = [
        plan.phenomenon && `Phenomenon: ${plan.phenomenon.replace(/_/g, ' ')}`,
        plan.aoi && `Location: ${plan.aoi}`,
        plan.start_date && plan.end_date && `Period: ${plan.start_date} — ${plan.end_date}`,
      ].filter(Boolean).join(' · ');

      setState(prev => ({ ...prev, step: 'ranking', plan, detail: planDetail || 'Plan created' }));

      const result: TemporalComparisonResult = data.result;
      const backendSteps = result?.processing_steps || [];
      const sceneCount = [result?.scene_t1, result?.scene_t2].filter(Boolean).length;

      setState(prev => ({
        ...prev,
        step: 'processing',
        detail: sceneCount > 0
          ? `Selected ${sceneCount} observation${sceneCount > 1 ? 's' : ''} for analysis`
          : 'Processing observations...',
        processingSteps: backendSteps,
      }));

      // Brief pause to show processing
      await new Promise(r => setTimeout(r, 600));

      const changedPct = result?.metrics?.changed_pct;
      setState(prev => ({
        ...prev,
        step: 'deciding',
        detail: changedPct > 0
          ? `Change detected: ${typeof changedPct === 'number' ? changedPct.toFixed(1) : changedPct}% of area`
          : 'Running change detection...',
      }));

      await new Promise(r => setTimeout(r, 400));

      const findingCount = result?.explanation?.key_findings?.length || 0;
      setState(prev => ({
        ...prev,
        step: 'explaining',
        detail: findingCount > 0
          ? `Generated ${findingCount} key finding${findingCount > 1 ? 's' : ''}`
          : 'Generating analysis summary...',
      }));

      await new Promise(r => setTimeout(r, 400));

      // ── Phase 7: Complete ────────────────────────────────
      const scenes: SceneInfo[] = [];
      if (result.scene_t1) scenes.push(result.scene_t1);
      if (result.scene_t2) scenes.push(result.scene_t2);

      setState(prev => ({
        ...prev,
        step: 'complete',
        scenes,
        result,
        detail: null,
      }));

      if (data.fallback) {
        console.warn('[OrbitalQuery] Running in degraded mode — Python analysis engine unavailable. Showing local database matches.');
      }

    } catch (err: any) {
      setState(prev => ({
        ...prev,
        step: 'error',
        error: err.message || 'Analysis failed',
        errorCode: (err as any)?.code ?? null,
        detail: null,
      }));
    }
  }, []);

  return { state, analyze, reset };
}
