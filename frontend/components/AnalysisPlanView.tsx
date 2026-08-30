'use client';

import { AnalysisPlan } from '@/hooks/useAnalysis';

interface AnalysisPlanViewProps {
  plan: AnalysisPlan;
}

const PHENOMENON_LABELS: Record<string, string> = {
  flood_impact: 'Flood Impact',
  urban_expansion: 'Urban Expansion',
  vegetation_change: 'Vegetation Change',
  deforestation: 'Deforestation',
  burn_severity: 'Burn Severity',
  snow_cover: 'Snow Cover',
  glacier_retreat: 'Glacier Retreat',
  water_change: 'Water Body Change',
  coastal_erosion: 'Coastal Erosion',
  soil_moisture: 'Soil Moisture',
  land_cover_change: 'Land Cover Change',
};

export default function AnalysisPlanView({ plan }: AnalysisPlanViewProps) {
  const label = PHENOMENON_LABELS[plan.phenomenon] || plan.phenomenon;

  return (
    <div className="glass rounded-2xl border border-blue-500/20 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
          <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-200">Analysis Plan</h3>
          <p className="text-[10px] text-slate-600">System interpretation of your query</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-800/30 rounded-xl p-3">
          <div className="text-[10px] text-slate-600 mb-1">Problem</div>
          <div className="text-xs font-medium text-slate-300">{label}</div>
        </div>

        <div className="bg-slate-800/30 rounded-xl p-3">
          <div className="text-[10px] text-slate-600 mb-1">Location</div>
          <div className="text-xs font-medium text-slate-300">{plan.aoi || '—'}</div>
          {plan.bbox && (
            <div className="text-[9px] text-slate-500 mt-0.5 font-mono">
              [{plan.bbox.map((b: number) => b.toFixed(1)).join(', ')}]
            </div>
          )}
        </div>

        <div className="bg-slate-800/30 rounded-xl p-3">
          <div className="text-[10px] text-slate-600 mb-1">Period</div>
          <div className="text-xs font-medium text-slate-300">
            {plan.start_date} → {plan.end_date}
          </div>
        </div>

        <div className="bg-slate-800/30 rounded-xl p-3">
          <div className="text-[10px] text-slate-600 mb-1">Evidence</div>
          <div className="text-xs font-medium text-slate-300">
            {plan.sensor || 'sentinel-2-l2a'} ({(plan.bands || []).slice(0, 3).join(', ')})
          </div>
        </div>

        <div className="bg-slate-800/30 rounded-xl p-3">
          <div className="text-[10px] text-slate-600 mb-1">Method</div>
          <div className="text-xs font-medium text-slate-300">{plan.analysis_type || '—'}</div>
        </div>
      </div>
    </div>
  );
}
