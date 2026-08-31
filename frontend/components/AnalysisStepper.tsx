'use client';

const STEPS = [
  { key: 'planning', label: 'Plan' },
  { key: 'searching', label: 'Search' },
  { key: 'ranking', label: 'Rank' },
  { key: 'processing', label: 'Process' },
  { key: 'deciding', label: 'Detect' },
  { key: 'explaining', label: 'Report' },
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
              {i < STEPS.length - 1 && (
                <div className="absolute top-5 left-1/2 w-full h-1 rounded-full bg-oq-700/50 overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-lime transition-all duration-500 ease-out ${isDone ? 'w-full' : 'w-0'}`}
                  />
                </div>
              )}

              <div
                className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                  isActive
                    ? 'bg-lime text-oq-950 ring-4 ring-lime/30 animate-pulse shadow-lg shadow-lime/30'
                    : isDone
                    ? 'bg-lime text-oq-950'
                    : isAnalysis
                    ? 'bg-purple/10 text-purple border border-purple/30'
                    : 'bg-oq-800 text-oq-300 border border-oq-700/40'
                }`}
              >
                {isDone ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className="text-sm font-bold">{i + 1}</span>
                )}
              </div>

              <span
                className={`text-[10px] mt-2 font-medium text-center leading-tight ${
                  isActive ? 'text-lime' : isDone ? 'text-lime/80' : isAnalysis ? 'text-purple' : 'text-oq-300'
                }`}
              >
                {i + 1}. {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
