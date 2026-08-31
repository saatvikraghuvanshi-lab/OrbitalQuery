'use client';

interface IntelligencePanelProps {
  result: any;
  onViewEvidence?: () => void;
}

export default function IntelligencePanel({ result, onViewEvidence }: IntelligencePanelProps) {
  const decision = result.decision;
  const explanation = result.explanation;

  return (
    <div className="space-y-4">
      {/* Explanation */}
      <div className="oq-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-purple/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h3 className="text-sm font-bold text-oq-50">Intelligence</h3>
        </div>

        {explanation?.summary && (
          <p className="text-xs text-oq-200 leading-relaxed mb-4">
            {explanation.summary}
          </p>
        )}

        {/* Key Findings */}
        {explanation?.key_findings && explanation.key_findings.length > 0 && (
          <div className="mb-4">
            <div className="text-[10px] text-oq-300 mb-2">Key Findings</div>
            <div className="space-y-1.5">
              {explanation.key_findings.map((finding: string, i: number) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-lime mt-1.5 shrink-0" />
                  <span className="text-[11px] text-oq-200">{finding}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Confidence Statement */}
        {explanation?.confidence_statement && (
          <div className="bg-oq-800/50 rounded-xl p-3 mb-4 border border-oq-700/30">
            <div className="text-[10px] text-oq-300 mb-1">Confidence</div>
            <p className="text-[11px] text-oq-200">{explanation.confidence_statement}</p>
          </div>
        )}

        {/* Limitations */}
        {explanation?.limitations && explanation.limitations.length > 0 && (
          <div className="mb-4">
            <div className="text-[10px] text-oq-300 mb-2">Limitations</div>
            <div className="space-y-1">
              {explanation.limitations.map((lim: string, i: number) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-semantic-warning text-[10px] mt-0.5">⚠</span>
                  <span className="text-[10px] text-oq-300">{lim}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Recommendations */}
      {decision?.recommendations && decision.recommendations.length > 0 && (
        <div className="oq-card p-5">
          <h3 className="text-sm font-bold text-oq-50 mb-3">Recommendations</h3>
          <div className="space-y-2">
            {decision.recommendations.map((rec: string, i: number) => (
              <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-oq-800/30 border border-oq-700/20">
                <div className="w-5 h-5 rounded-full bg-purple/10 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[10px] text-purple font-bold">{i + 1}</span>
                </div>
                <span className="text-[11px] text-oq-200">{rec}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Evidence Link */}
      {onViewEvidence && (
        <button
          onClick={onViewEvidence}
          className="w-full py-3 rounded-xl border border-oq-700/30 text-xs text-oq-300 hover:text-oq-100 hover:border-oq-600/50 transition-colors"
        >
          📋 View Full Evidence Chain
        </button>
      )}

      {/* Disclaimer */}
      <div className="text-center py-2">
        <p className="text-[9px] text-oq-400">
          ⚠ This is a research tool, not for operational disaster response. Always verify through official sources.
        </p>
      </div>
    </div>
  );
}
