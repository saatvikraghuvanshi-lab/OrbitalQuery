'use client';

function codeLabel(code: string | null): string {
  if (!code) return 'Analysis Error';
  if (code === 'HTTP 503' || code === 'HTTP 504') return 'API Timeout / Service Unavailable';
  if (code === 'HTTP 000') return 'Connection Error';
  if (code === 'ANALYSIS') return 'Analysis Error';
  const m = code.match(/^HTTP (\d+)/);
  if (m) {
    const s = m[1];
    if (s.startsWith('4')) return 'Bad Request';
    if (s.startsWith('5')) return 'Server Error';
  }
  return 'Error';
}

export default function AnalysisErrorScreen({
  error,
  code,
  query,
  onRetry,
  onModify,
}: {
  error: string;
  code: string | null;
  query: string;
  onRetry: () => void;
  onModify: () => void;
}) {
  const statusLabel = codeLabel(code);
  const diagnostic = [
    `OrbitalQuery Analysis Pipeline`,
    `────────────────────────────`,
    `Status    : ${code || 'ERROR'} / ${statusLabel}`,
    `Query     : ${query || '(none)'}`,
    ``,
    error,
    ``,
    `Trace:`,
    `  Failed to fetch satellite imagery from provider endpoint.`,
    `  Bounding box coordinates returned 0 matching granules.`,
  ].join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(diagnostic);
    } catch {
      // silently ignore copy failure
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#050A07' }}>
      <div className="max-w-xl mx-auto w-full p-8 oq-card border-lime/20">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-lime/10 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-5 h-5 text-lime"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-lime">Analysis Execution Failed</h2>
            <div className="text-xs text-oq-300 mt-0.5">
              {code} <span className="text-oq-400 mx-1">/</span> {statusLabel}
            </div>
          </div>
        </div>

        <p className="text-sm text-oq-200 mb-4 leading-relaxed">{error}</p>

        <details className="mb-6 group">
          <summary className="cursor-pointer text-[11px] uppercase tracking-wider text-oq-300 hover:text-oq-100 select-none list-none">
            Diagnostic Log
          </summary>
          <pre
            className="mt-2 p-3 rounded-lg bg-oq-900 border border-oq-700/50 text-[11px] text-oq-200 overflow-x-auto whitespace-pre-wrap leading-relaxed terminal-panel"
            style={{ fontFamily: "'JetBrains Mono','Fira Code',ui-monospace,monospace" }}
          >
            {diagnostic}
          </pre>
        </details>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={onRetry}
            className="px-4 py-2 rounded-full bg-lime hover:bg-lime-hover text-oq-950 text-sm font-medium transition-colors shadow-sm shadow-lime/20"
          >
            Retry Analysis
          </button>
          <button
            onClick={onModify}
            className="px-4 py-2 rounded-full border border-oq-700/50 hover:border-oq-600 text-oq-200 text-sm font-medium transition-colors"
          >
            Modify Parameters / Query
          </button>
          <button
            onClick={copy}
            className="px-4 py-2 rounded-full text-oq-300 hover:text-oq-100 text-sm font-medium transition-colors"
          >
            Copy Diagnostic Log
          </button>
        </div>
      </div>
    </div>
  );
}
