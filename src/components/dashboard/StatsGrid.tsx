import type { DashboardStats, MemberStats } from '@/actions/dashboard';

// ─── Admin firm-wide stats ──────────────────────────────────────────────────

interface AdminProps { stats: DashboardStats }

export function StatsGrid({ stats }: AdminProps) {
  const items = [
    { label: 'Active Tasks',        value: stats.totalTasks,         color: 'text-foreground',    bg: 'bg-card',              border: 'border-border' },
    { label: 'Overdue',             value: stats.overdueTasks,       color: 'text-red-600',        bg: 'bg-red-50 dark:bg-red-950/20',    border: 'border-red-200 dark:border-red-900' },
    { label: 'Due This Week',       value: stats.dueSoonTasks,       color: 'text-amber-600',      bg: 'bg-amber-50 dark:bg-amber-950/20', border: 'border-amber-200 dark:border-amber-900' },
    { label: 'Completed (Month)',   value: stats.completedThisMonth, color: 'text-emerald-600',    bg: 'bg-emerald-50 dark:bg-emerald-950/20', border: 'border-emerald-200 dark:border-emerald-900' },
    { label: 'Under Review',        value: stats.underReview,        color: 'text-blue-600',       bg: 'bg-blue-50 dark:bg-blue-950/20',  border: 'border-blue-200 dark:border-blue-900' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {items.map(item => (
        <div key={item.label} className={`rounded-lg border ${item.border} ${item.bg} p-4`}>
          <p className={`text-2xl font-bold tabular-nums ${item.color}`}>{item.value}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Member personal stats ──────────────────────────────────────────────────

interface MemberProps { stats: MemberStats }

export function MemberStatsGrid({ stats }: MemberProps) {
  const items = [
    { label: 'My Tasks',        value: stats.myTotal,       color: 'text-foreground',  bg: 'bg-card',              border: 'border-border' },
    { label: 'Overdue',         value: stats.myOverdue,     color: 'text-red-600',     bg: 'bg-red-50 dark:bg-red-950/20',    border: 'border-red-200 dark:border-red-900' },
    { label: 'Due This Week',   value: stats.myDueSoon,     color: 'text-amber-600',   bg: 'bg-amber-50 dark:bg-amber-950/20', border: 'border-amber-200 dark:border-amber-900' },
    { label: 'In Progress',     value: stats.myInProgress,  color: 'text-blue-600',    bg: 'bg-blue-50 dark:bg-blue-950/20',  border: 'border-blue-200 dark:border-blue-900' },
    { label: 'Under Review',    value: stats.myUnderReview, color: 'text-violet-600',  bg: 'bg-violet-50 dark:bg-violet-950/20', border: 'border-violet-200 dark:border-violet-900' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {items.map(item => (
        <div key={item.label} className={`rounded-lg border ${item.border} ${item.bg} p-4`}>
          <p className={`text-2xl font-bold tabular-nums ${item.color}`}>{item.value}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{item.label}</p>
        </div>
      ))}
    </div>
  );
}
