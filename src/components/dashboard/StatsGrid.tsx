import type { DashboardStats } from '@/actions/dashboard';

interface Props {
  stats: DashboardStats;
}

export function StatsGrid({ stats }: Props) {
  const items = [
    {
      label: 'Total Tasks',
      value: stats.totalTasks,
      color: 'text-foreground',
      border: 'border-border',
    },
    {
      label: 'Overdue',
      value: stats.overdueTasks,
      color: 'text-red-600',
      border: 'border-red-200',
    },
    {
      label: 'Due This Week',
      value: stats.dueSoonTasks,
      color: 'text-amber-600',
      border: 'border-amber-200',
    },
    {
      label: 'Completed (Month)',
      value: stats.completedThisMonth,
      color: 'text-emerald-600',
      border: 'border-emerald-200',
    },
    {
      label: 'Under Review',
      value: stats.underReview,
      color: 'text-blue-600',
      border: 'border-blue-200',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className={`rounded-lg border ${item.border} bg-card p-4`}
        >
          <p className={`text-2xl font-bold tabular-nums ${item.color}`}>
            {item.value}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{item.label}</p>
        </div>
      ))}
    </div>
  );
}
