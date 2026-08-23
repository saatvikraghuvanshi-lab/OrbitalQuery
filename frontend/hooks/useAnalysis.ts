'use client';

import { useState, useCallback } from 'react';

// ── Types ───────────────────────────────────────────────────────

export interface AnalysisPlan {
  phenomenon: string;
  aoi: string;
  bbox: number[];
  time_range: { start: string; end: string };
  preferred_sensors: string[];
  analysis_type: string;
  collection: string;
}

export interface Scene {
  scene_id: string;
  satellite: string;
  acquisition_date: string;
  cloud_cover_pct: number;
  provider: string;
  resolution_m: number;
  bbox: number[];
  role?: string; // 'pre_event' | 'post_event' | 'supporting'
}

export interface AnalysisResult {
  analysis_id: string;
  statistics: Record<string, any>;
  decision: {
    overall_severity: string;
    confidence: string;
    metrics: any[];
    recommendations: string[];
  };
  explanation: {
    summary: string;
    key_findings: string[];
    confidence_statement: string;
    limitations: string[];
  };
  scenes: Scene[];
  provenance?: any;
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
  scenes: Scene[];
  result: AnalysisResult | null;
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
      // Step 1: Parse query into analysis plan
      const planRes = await fetch('/api/analysis/query/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      if (!planRes.ok) {
        const planErr = await planRes.json();
        throw new Error(planErr.message || planErr.error || 'Failed to parse query');
      }

      const planData = await planRes.json();
      const plan = planData.plan || planData;
      setState(prev => ({ ...prev, step: 'searching', plan }));

      // Step 2: Search for scenes
      const searchBody: any = {
        bbox: plan.bbox || [68.0, 6.0, 97.5, 37.5],
        collection: plan.collection || 'sentinel-2-l2a',
        start_date: plan.time_range?.start || '2024-01-01',
        end_date: plan.time_range?.end || '2024-12-31',
        limit: 10,
      };

      const searchRes = await fetch('/api/analysis/search-scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchBody),
      });

      let scenes: Scene[] = [];
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        scenes = (searchData.items || []).map((item: any) => ({
          scene_id: item.id,
          satellite: item.properties?.platform || 'Unknown',
          acquisition_date: item.properties?.datetime?.split('T')[0] || '',
          cloud_cover_pct: item.properties?.['eo:cloud_cover'] ?? 0,
          provider: 'STAC',
          resolution_m: item.properties?.['eo:gsd'] || 10,
          bbox: item.bbox || [],
        }));
      }

      setState(prev => ({ ...prev, step: 'ranking', scenes }));

      // Step 3: For demo, create a simulated analysis result
      // In production, this would call the full flood/urban/vegetation pipeline
      setState(prev => ({ ...prev, step: 'processing' }));

      // Wait briefly to simulate processing
      await new Promise(r => setTimeout(r, 1500));

      // Step 4: Generate decision intelligence
      setState(prev => ({ ...prev, step: 'deciding' }));

      const result: AnalysisResult = {
        analysis_id: `analysis-${Date.now()}`,
        statistics: generateDemoStatistics(plan.phenomenon),
        decision: generateDemoDecision(plan.phenomenon),
        explanation: generateDemoExplanation(plan.phenomenon, plan.aoi),
        scenes: scenes.slice(0, 5),
      };

      setState(prev => ({ ...prev, step: 'complete', result }));
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

// ── Demo Data Generators ────────────────────────────────────────

function generateDemoStatistics(phenomenon: string): Record<string, any> {
  switch (phenomenon) {
    case 'flood_impact':
      return {
        total_flood_area_km2: 23.7,
        aoi_area_km2: 200.0,
        flood_pct: 11.85,
        cluster_count: 5,
        builtup_affected_km2: 4.2,
      };
    case 'urban_expansion':
      return {
        ndbi_change_mean: 0.18,
        urban_expansion_area_km2: 12.4,
        expansion_pct: 6.2,
      };
    case 'vegetation_change':
      return {
        ndvi_change_mean: -0.28,
        degradation_area_km2: 18.5,
      };
    case 'burn_severity':
      return {
        burned_area_km2: 8.3,
        burn_pct: 4.15,
        severity_high_km2: 2.1,
      };
    default:
      return { area_km2: 10.0, confidence: 'medium' };
  }
}

function generateDemoDecision(phenomenon: string) {
  const decisions: Record<string, any> = {
    flood_impact: {
      overall_severity: 'HIGH',
      confidence: 'high',
      metrics: [
        { name: 'total_flood_area', value: 23.7, unit: 'km²', severity: 'HIGH' },
        { name: 'aoi_coverage_pct', value: 11.85, unit: '%', severity: 'HIGH' },
        { name: 'builtup_affected', value: 4.2, unit: 'km²', severity: 'HIGH' },
        { name: 'high_impact_clusters', value: 5, unit: 'zones', severity: 'HIGH' },
      ],
      recommendations: [
        'Significant flooding detected. Activate flood response protocols.',
        'Multiple high-impact zones identified — prioritize resource allocation.',
        'Deploy SAR-based continuous monitoring for flood extent evolution.',
      ],
    },
    urban_expansion: {
      overall_severity: 'MEDIUM',
      confidence: 'medium',
      metrics: [
        { name: 'ndbi_change_magnitude', value: 0.18, unit: 'NDBI units', severity: 'MEDIUM' },
        { name: 'urban_expansion_area', value: 12.4, unit: 'km²', severity: 'HIGH' },
      ],
      recommendations: [
        'Notable urban expansion detected. Monitor for continued growth.',
        'Assess impact on agricultural land and green spaces.',
      ],
    },
    vegetation_change: {
      overall_severity: 'HIGH',
      confidence: 'medium',
      metrics: [
        { name: 'ndvi_change_magnitude', value: -0.28, unit: 'NDVI units', severity: 'HIGH' },
        { name: 'degradation_area', value: 18.5, unit: 'km²', severity: 'HIGH' },
      ],
      recommendations: [
        'Significant vegetation loss detected. Investigate causes.',
        'Cross-reference with forest cover databases.',
      ],
    },
  };
  return decisions[phenomenon] || decisions.flood_impact;
}

function generateDemoExplanation(phenomenon: string, aoi: string) {
  const explanations: Record<string, any> = {
    flood_impact: {
      summary: `Satellite analysis reveals significant flooding in the ${aoi || 'target'} region. A total of 23.7 km² of land is inundated, affecting approximately 4.2 km² of built-up areas across 5 distinct high-impact zones.`,
      key_findings: [
        'Sentinel-1 SAR imagery confirms widespread inundation across the study area',
        'Built-up areas near river channels are most severely affected',
        'Five distinct flood clusters identified through connected component analysis',
        'Flood extent spans approximately 11.85% of the total analysis area',
      ],
      confidence_statement: 'High confidence based on SAR backscatter analysis with VV+VH consensus. Cloud-independent detection ensures reliable results.',
      limitations: [
        'Results based on single-date SAR analysis — temporal evolution not captured',
        'Built-up area classification uses proxy data, not ground truth',
        'Small water bodies may be indistinguishable from flood extent',
      ],
    },
    urban_expansion: {
      summary: `Analysis of multi-temporal Sentinel-2 imagery shows urban expansion of approximately 12.4 km² in the ${aoi || 'target'} region over the study period.`,
      key_findings: [
        'NDBI (Normalized Difference Built-up Index) shows positive change of 0.18',
        'Expansion concentrated along major transportation corridors',
        'Agricultural land converted to built-up area',
      ],
      confidence_statement: 'Medium confidence. NDBI change detection is reliable but may misclassify bare soil as built-up.',
      limitations: [
        'Seasonal vegetation variations may affect NDBI accuracy',
        'Cloud-free imagery availability limits temporal resolution',
      ],
    },
    vegetation_change: {
      summary: `Vegetation analysis reveals significant degradation of approximately 18.5 km² in the ${aoi || 'target'} region.`,
      key_findings: [
        'NDVI shows mean decline of 0.28 units',
        'Degradation concentrated in [specific area]',
      ],
      confidence_statement: 'Medium confidence. NDVI change is robust but seasonality must be considered.',
      limitations: [
        'Cloud cover may affect some pixel values',
        'Seasonal variation not fully accounted for',
      ],
    },
  };
  return explanations[phenomenon] || explanations.flood_impact;
}
