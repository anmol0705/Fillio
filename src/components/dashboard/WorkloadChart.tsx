'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import type { WorkloadEntry } from '@/actions/dashboard';

interface Props { data: WorkloadEntry[] }

export function WorkloadChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground rounded-lg border border-dashed">
        No active tasks assigned
      </div>
    );
  }

  const chartData = data.map(d => ({
    name:            d.userName.split(' ')[0],
    'Not Started':   d.notStarted,
    'In Progress':   d.inProgress,
    'Under Review':  d.underReview,
    total:           d.notStarted + d.inProgress + d.underReview,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" stroke="currentColor" opacity={0.3} />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{
            borderRadius: 8,
            border: '1px solid hsl(var(--border))',
            background: 'hsl(var(--card))',
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Not Started" stackId="a" fill="#94a3b8" radius={[0, 0, 0, 0]} />
        <Bar dataKey="In Progress" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
        <Bar dataKey="Under Review" stackId="a" fill="#f59e0b" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
