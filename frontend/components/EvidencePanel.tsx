'use client';

import { SceneInfo } from '@/hooks/useAnalysis';

interface EvidencePanelProps {
  scenes: SceneInfo[];
}

export default function EvidencePanel({ scenes }: EvidencePanelProps) {
  if (scenes.length === 0) {
    return (
      <div className="glass rounded-2xl border border-blue-500/20 p-5">
        <h3 className="text-sm font-bold text-slate-200 mb-3">Evidence</h3>
        <p className="text-xs text-slate-500">No scenes discovered yet</p>
      </div>
    );
  }

  const avgScore = Math.round(94 - scenes.reduce((sum, s) => sum + (s.cloud_cover || 0), 0) / scenes.length);

  return (
    <div className="glass rounded-2xl border border-blue-500/20 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-200">Evidence</h3>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-[10px] text-green-400 font-medium">Score: {avgScore}%</span>
        </div>
      </div>

      <div className="space-y-2">
        {scenes.map((scene, i) => {
          const score = Math.max(60, 100 - (scene.cloud_cover || 0) * 2);
          const roleLabel = i === 0 ? 'Period 1 (Before)' : 'Period 2 (After)';

          return (
            <div key={scene.item_id || i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/30 border border-slate-700/20">
              <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium text-slate-300 truncate">
                  {scene.platform} — {scene.datetime ? new Date(scene.datetime).toLocaleDateString() : '—'}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[9px] text-slate-600">
                    ☁ {scene.cloud_cover ?? '—'}%
                  </span>
                  <span className="text-[9px] text-slate-600">•</span>
                  <span className="text-[9px] text-blue-400">{roleLabel}</span>
                </div>
              </div>
              <div className="text-[10px] font-mono text-green-400 shrink-0">
                {score}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
