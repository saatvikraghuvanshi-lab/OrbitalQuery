'use client';

import { useEffect, useRef } from 'react';

const MONO = "'JetBrains Mono','Fira Code',ui-monospace,SFMono-Regular,Menlo,monospace";

export default function TerminalLog({
  steps,
  currentDetail,
}: {
  steps: Array<{ step: string; detail: string }>;
  currentDetail?: string | null;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps, currentDetail]);

  return (
    <div
      className="flex flex-col rounded-xl border border-oq-700/50 bg-oq-800 overflow-hidden flex-1 min-h-0 terminal-panel"
      style={{ fontFamily: MONO }}
    >
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-oq-700/50 flex-shrink-0">
        <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-lime/70" />
        <span className="ml-2 text-[10px] uppercase tracking-widest text-oq-300">Processing Log</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 text-xs space-y-1.5">
        {steps.length === 0 && (
          <div className="text-oq-300">$ awaiting pipeline output…</div>
        )}

        {steps.map((s, i) => {
          const isAnalysisOp = /search|rank|detect|process|report/i.test(s.step);
          return (
            <div key={i} className="flex items-start gap-2 leading-relaxed">
              <span className="text-lime select-none mt-px">✓</span>
              <span className={`whitespace-pre-wrap break-words ${isAnalysisOp ? 'text-purple' : 'text-lime/90'}`}>
                {s.step.replace(/_/g, ' ')}
              </span>
              {s.detail && (
                <span className="text-oq-200 whitespace-pre-wrap break-words">
                  — {s.detail.length > 120 ? s.detail.slice(0, 120) + '…' : s.detail}
                </span>
              )}
            </div>
          );
        })}

        {currentDetail && (
          <div className="flex items-start gap-2 text-lime">
            <span className="animate-pulse select-none mt-px">▸</span>
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
