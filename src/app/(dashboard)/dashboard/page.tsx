import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/getUser';
import { getDashboardData } from '@/actions/dashboard';
import { StatsGrid } from '@/components/dashboard/StatsGrid';
import { OverdueTable } from '@/components/dashboard/OverdueTable';
import { WorkloadChart } from '@/components/dashboard/WorkloadChart';
import { DeadlineCalendar } from '@/components/dashboard/DeadlineCalendar';

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const result = await getDashboardData();
  if (result.error !== null) redirect('/login');

  const { stats, overdue, workload, deadlines } = result.data;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Live overview of your firm's work status.
        </p>
      </div>

      {/* Stats */}
      <StatsGrid stats={stats} />

      {/* Overdue + Workload side by side on large screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-sm font-semibold mb-3">
            Overdue Tasks
            {overdue.length > 0 && (
              <span className="ml-2 text-xs font-normal text-red-600">
                {overdue.length} task{overdue.length !== 1 ? 's' : ''} need attention
              </span>
            )}
          </h2>
          <OverdueTable tasks={overdue} />
        </div>

        <div>
          <h2 className="text-sm font-semibold mb-3">Team Workload</h2>
          <WorkloadChart data={workload} />
        </div>
      </div>

      {/* Deadline calendar — full width */}
      <div>
        <h2 className="text-sm font-semibold mb-3">Upcoming Deadlines</h2>
        <DeadlineCalendar deadlines={deadlines} />
      </div>
    </div>
  );
}
