'use client';

import { useEffect, useRef } from 'react';

export default function TerminalLog({ steps, currentDetail }: {
  steps: Array<{ step: string; detail: string }>;
  currentDetail?: string | null;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [steps, currentDetail]);

  return (
    <div className="flex flex-col rounded-lg border border-oq-700/30 bg-[#0A0F0D] overflow-hidden flex-1 min-h-0">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-oq-700/30 flex-shrink-0">
        <span className="w-2 h-2 rounded-full bg-oq-400/50" />
        <span className="w-2 h-2 rounded-full bg-oq-400/30" />
        <span className="w-2 h-2 rounded-full bg-lime/40" />
        <span className="ml-1.5 text-[9px] uppercase tracking-widest text-oq-300 font-medium font-mono">Processing Log</span>
      </div>

      {/* Log entries */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2.5 text-[11px] font-mono space-y-1">
        {steps.length === 0 && (
          <div className="text-oq-300">$ awaiting pipeline output…</div>
        )}

        {steps.map((s, i) => {
          const isAnalysisOp = /search|rank|detect|process|report/i.test(s.step);
          return (
            <div key={i} className="flex items-start gap-1.5 leading-relaxed">
              <span className="text-lime select-none mt-px opacity-60">✓</span>
              <span className={`whitespace-pre-wrap break-words ${isAnalysisOp ? 'text-purple' : 'text-oq-200'}`}>
                {s.step.replace(/_/g, ' ')}
              </span>
              {s.detail && (
                <span className="text-oq-300 whitespace-pre-wrap break-words">
                  — {s.detail.length > 100 ? s.detail.slice(0, 100) + '…' : s.detail}
                </span>
              )}
            </div>
          );
        })}

        {currentDetail && (
          <div className="flex items-start gap-1.5 text-lime">
            <span className="animate-pulse select-none mt-px opacity-60">▸</span>
            <span className="whitespace-pre-wrap break-words">
              {currentDetail}
              <span className="animate-pulse">▍</span>
            </span>
          </div>
        )}

        <div ref={endRef} />
      </div>
    </div>
  );
}
