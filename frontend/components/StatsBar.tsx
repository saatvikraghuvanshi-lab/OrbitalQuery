'use client';

interface StatsBarProps {
  total: number;
  latencyMs: number;
  query: string;
}

export default function StatsBar({ total, latencyMs, query }: StatsBarProps) {
  return (
    <div className="max-w-[1600px] mx-auto mb-4">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-4">
          {query && (
            <span className="text-xs text-slate-500">
              Results for <span className="text-blue-400 font-medium">&ldquo;{query}&rdquo;</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-[11px] text-slate-600 font-mono">
          <span>{total} result{total !== 1 ? 's' : ''}</span>
          <span>•</span>
          <span>{latencyMs}ms</span>
        </div>
      </div>
    </div>
  );
}
