import { Suspense } from 'react';
import Link from 'next/link';
import {
  getDashboardStats,
  getOverdueTasks,
  getWorkload,
  getUpcomingDeadlines,
  type UpcomingDeadline,
  type OverdueTask,
  type WorkloadEntry,
  type DashboardStats,
} from '@/actions/dashboard';
import { StatsGrid } from '@/components/dashboard/StatsGrid';
import { OverdueTable } from '@/components/dashboard/OverdueTable';
import { WorkloadChart } from '@/components/dashboard/WorkloadChart';
import { DeadlineCalendar } from '@/components/dashboard/DeadlineCalendar';

// Fallback stats used when the action returns an error
const EMPTY_STATS: DashboardStats = {
  totalTasks: 0,
  overdueTasks: 0,
  dueSoonTasks: 0,
  completedThisMonth: 0,
  underReview: 0,
};

async function DashboardContent() {
  const [statsResult, overdueResult, workloadResult, upcomingResult] =
    await Promise.all([
      getDashboardStats(),
      getOverdueTasks(),
      getWorkload(),
      getUpcomingDeadlines(14),
    ]);

  const stats: DashboardStats =
    'data' in statsResult ? statsResult.data : EMPTY_STATS;
  const overdue: OverdueTask[] =
    'data' in overdueResult ? overdueResult.data : [];
  const workload: WorkloadEntry[] =
    'data' in workloadResult ? workloadResult.data : [];
  const upcoming: UpcomingDeadline[] =
    'data' in upcomingResult ? upcomingResult.data : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Overview of your firm&apos;s work status
        </p>
      </div>

      <StatsGrid stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Overdue tasks — this view closes the sale */}
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-red-600">
            Overdue Tasks{overdue.length > 0 ? ` (${overdue.length})` : ''}
          </h2>
          <OverdueTable tasks={overdue} />
        </div>

        {/* Upcoming deadlines */}
        <div className="space-y-3">
          <h2 className="text-base font-semibold">Upcoming — Next 14 Days</h2>
          {upcoming.length === 0 ? (
            <div className="rounded-lg border border-border bg-card px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                No deadlines in the next 14 days.
              </p>
              <Link
                href="/dashboard/tasks"
                className="mt-2 inline-block text-xs text-blue-600 hover:underline"
              >
                View all tasks
              </Link>
            </div>
          ) : (
            <div className="divide-y rounded-lg border overflow-hidden">
              {upcoming.map((t) => (
                <Link
                  key={t.id}
                  href={`/dashboard/tasks/${t.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors min-h-[52px]"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {t.client?.name ?? 'No client'}
                      {t.assignee ? ` · ${t.assignee.full_name}` : ''}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-semibold shrink-0 tabular-nums ${
                      t.daysLeft === 0
                        ? 'text-red-600'
                        : t.daysLeft <= 3
                          ? 'text-red-500'
                          : t.daysLeft <= 7
                            ? 'text-amber-600'
                            : 'text-muted-foreground'
                    }`}
                  >
                    {t.daysLeft === 0 ? 'Today' : `${t.daysLeft}d`}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Workload chart */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold">Team Workload</h2>
        <div className="rounded-lg border bg-card p-4">
          <WorkloadChart data={workload} />
        </div>
      </div>

      {/* Deadline calendar — hidden on mobile as it requires too much width */}
      <div className="space-y-3 hidden sm:block">
        <h2 className="text-base font-semibold">Deadline Calendar</h2>
        <div className="rounded-lg border bg-card p-4">
          <DeadlineCalendar deadlines={upcoming} />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="h-8 w-48 bg-muted rounded animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-64 bg-muted rounded-lg animate-pulse" />
            <div className="h-64 bg-muted rounded-lg animate-pulse" />
          </div>
          <div className="h-64 bg-muted rounded-lg animate-pulse" />
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
