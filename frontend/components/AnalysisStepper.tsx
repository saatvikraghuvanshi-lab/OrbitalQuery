'use client';

const STEPS = [
  { key: 'planning', label: 'Query', num: '01' },
  { key: 'searching', label: 'Discover', num: '02' },
  { key: 'ranking', label: 'Rank', num: '03' },
  { key: 'processing', label: 'Process', num: '04' },
  { key: 'deciding', label: 'Detect', num: '05' },
  { key: 'explaining', label: 'Report', num: '06' },
] as const;

export default function AnalysisStepper({ current }: { current: string }) {
  const order = STEPS.map(s => s.key);
  const currentIdx = order.indexOf(current as any);

  return (
    <div className="w-full">
      <div className="flex items-start">
        {STEPS.map((s, i) => {
          const isDone = currentIdx > i;
          const isActive = currentIdx === i;
          const isAnalysis = s.key === 'deciding' || s.key === 'processing';

          return (
            <div key={s.key} className="flex-1 flex flex-col items-center relative">
              {/* Connector line */}
              {i < STEPS.length - 1 && (
                <div className="absolute top-4 left-1/2 w-full h-px bg-oq-700/40">
                  <div className={`h-full bg-lime transition-all duration-500 ${isDone ? 'w-full' : 'w-0'}`} />
                </div>
              )}
              {/* Node */}
              <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300 ${
                isActive
                  ? 'bg-lime text-oq-950 shadow-[0_0_12px_rgba(163,246,63,0.3)]'
                  : isDone
                  ? 'bg-lime/80 text-oq-950'
                  : isAnalysis
                  ? 'bg-purple/10 text-purple border border-purple/20'
                  : 'bg-oq-800 text-oq-300 border border-oq-700/30'
              }`}>
                {isDone ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span>{s.num}</span>
                )}
              </div>
              {/* Label */}
              <span className={`text-[9px] mt-1.5 font-medium text-center leading-tight ${
                isActive ? 'text-lime' : isDone ? 'text-lime/70' : isAnalysis ? 'text-purple/70' : 'text-oq-300'
              }`}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
