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
  change_visualizations: { change_mask_png: string; difference_png: string; bbox: number[] } | null;
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
  detail: string | null;
  processingSteps: Array<{ step: string; detail: string }>;
}

// ── Constants ───────────────────────────────────────────────────

/** 90s timeout — Python service cold starts on Render free tier */
const FETCH_TIMEOUT_MS = 90_000;

// ── Helper: single fetch attempt ────────────────────────────────

async function fetchAnalysis(query: string): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

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
      throw new AnalysisError(
        'TIMEOUT',
        'TIMEOUT',
      );
    }
    // "Failed to fetch" can mean CORS, network, or the backend is unreachable
    throw new AnalysisError('NETWORK', 'NETWORK');
  }
  clearTimeout(timeout);

  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new AnalysisError('Invalid server response.', 'PARSE');
  }

  if (!res.ok) {
    const errMsg = data?.detail || data?.message || data?.error || `Server error (${res.status})`;
    if (
      errMsg.includes('starting up') ||
      errMsg.includes('unavailable') ||
      errMsg.includes('PYTHON_UNAVAILABLE') ||
      res.status === 502 ||
      res.status === 503
    ) {
      throw new AnalysisError('PYTHON_UNAVAILABLE', 'HTTP_503');
    }
    throw new AnalysisError(errMsg, `HTTP_${res.status}`);
  }

  if (data.status === 'error' && !data.plan) {
    throw new AnalysisError(data.message || 'Query could not be processed.', 'ANALYSIS');
  }

  return data;
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
      await new Promise(r => setTimeout(r, 50));

      setState(prev => ({ ...prev, step: 'searching', detail: 'Querying satellite archives...' }));

      // ── Single fetch attempt ───────────────────────────────
      let data: any = null;
      try {
        data = await fetchAnalysis(query);
      } catch (err: any) {
        throw err instanceof AnalysisError ? err : new AnalysisError(err.message, 'UNKNOWN');
      }

      if (!data) {
        throw new AnalysisError('No response from analysis engine.', 'UNKNOWN');
      }

      // ── Process successful response ───────────────────────
      const plan = data.plan;
      if (!plan) {
        throw new AnalysisError('No analysis plan generated. Please provide a location and phenomenon.', 'ANALYSIS');
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

      await new Promise(r => setTimeout(r, 100));

      const changedPct = result?.metrics?.changed_pct;
      setState(prev => ({
        ...prev,
        step: 'deciding',
        detail: changedPct > 0
          ? `Change detected: ${typeof changedPct === 'number' ? changedPct.toFixed(1) : changedPct}% of area`
          : 'Running change detection...',
      }));

      await new Promise(r => setTimeout(r, 80));

      const findingCount = result?.explanation?.key_findings?.length || 0;
      setState(prev => ({
        ...prev,
        step: 'explaining',
        detail: findingCount > 0
          ? `Generated ${findingCount} key finding${findingCount > 1 ? 's' : ''}`
          : 'Generating analysis summary...',
      }));

      await new Promise(r => setTimeout(r, 80));

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
        console.warn('[OrbitalQuery] Running in degraded mode — Python analysis engine unavailable.');
      }

    } catch (err: any) {
      // Map error codes to user-friendly messages
      let errorMessage = err.message || 'Analysis failed';
      const code = err.code ?? null;

      if (code === 'TIMEOUT') {
        errorMessage =
          'Request timed out after 90 seconds. The analysis engine may be experiencing high load or a cold start. Please try again.';
      } else if (code === 'NETWORK') {
        errorMessage =
          'Could not reach the analysis server. The server may be starting up. Please try again in 15 seconds.';
      } else if (code === 'PYTHON_UNAVAILABLE' || code === 'HTTP_503') {
        errorMessage =
          'The analysis engine is waking up from sleep (30-60s on first use). Please try again in 30 seconds.';
      }

      setState(prev => ({
        ...prev,
        step: 'error',
        error: errorMessage,
        errorCode: code,
        detail: null,
      }));
    }
  }, []);

  return { state, analyze, reset };
}
