'use client';

interface StatsBarProps {
  total: number;
  latencyMs: number;
  query: string;
}

export default function StatsBar({ total, latencyMs, query }: StatsBarProps) {
  return (
    <div className="flex items-center gap-2">
      {query && (
        <span className="text-xs text-slate-500">
          <span className="text-blue-400 font-medium">&ldquo;{query}&rdquo;</span>
        </span>
      )}
      <div className="flex items-center gap-2 text-[11px] text-slate-600 font-mono">
        <span>{total} result{total !== 1 ? 's' : ''}</span>
        <span>•</span>
        <span>{latencyMs}ms</span>
      </div>
    </div>
  );
}
