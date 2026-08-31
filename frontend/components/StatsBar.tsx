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
        <span className="text-xs text-oq-300">
          <span className="text-lime font-medium">&ldquo;{query}&rdquo;</span>
        </span>
      )}
      <div className="flex items-center gap-2 text-[11px] text-oq-300 font-mono">
        <span>{total} result{total !== 1 ? 's' : ''}</span>
        <span className="text-oq-600">•</span>
        <span>{latencyMs}ms</span>
      </div>
    </div>
  );
}
