'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Props {
  data: Array<{ year: string; index: number; area: number }>;
  indexLabel: string;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#0D1711', border: '1px solid #2A3A2F', borderRadius: 8, padding: '8px 12px', fontSize: 11 }}>
      <div style={{ color: '#E5E7EB', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: {p.dataKey === 'index' ? p.value.toFixed(4) : `${p.value} km²`}
        </div>
      ))}
    </div>
  );
}

export default function RechartsTrendChart({ data, indexLabel }: Props) {
  return (
    <div style={{ width: '100%', height: 220 }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10B981" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
          <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={{ stroke: '#374151' }} tickLine={false} />
          <YAxis yAxisId="left" tick={{ fontSize: 9, fill: '#9CA3AF' }} axisLine={false} tickLine={false} label={{ value: indexLabel, angle: -90, position: 'insideLeft', style: { fontSize: 9, fill: '#9CA3AF' } }} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: '#9CA3AF' }} axisLine={false} tickLine={false} label={{ value: 'km²', angle: 90, position: 'insideRight', style: { fontSize: 9, fill: '#9CA3AF' } }} />
          <Tooltip content={<CustomTooltip />} />
          <Area yAxisId="left" type="monotone" dataKey="index" stroke="#10B981" strokeWidth={2} fill="url(#trendGradient)" name={indexLabel} dot={{ r: 3, fill: '#10B981', stroke: '#0D1711', strokeWidth: 2 }} activeDot={{ r: 5 }} />
          <Area yAxisId="right" type="monotone" dataKey="area" stroke="#FB923C" strokeWidth={1.5} fill="none" name="Area (km²)" strokeDasharray="4 2" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
