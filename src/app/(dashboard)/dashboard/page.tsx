import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/getUser';
import { getDashboardData } from '@/actions/dashboard';
import { StatsGrid, MemberStatsGrid } from '@/components/dashboard/StatsGrid';
import { OverdueTable } from '@/components/dashboard/OverdueTable';
import { WorkloadChart } from '@/components/dashboard/WorkloadChart';
import { DeadlineList } from '@/components/dashboard/DeadlineList';

function greet() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const result = await getDashboardData();
  if (result.error !== null) redirect('/login');

  const { isAdmin, stats, memberStats, overdue, myOverdue, workload, deadlines, myDeadlines } = result.data;

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  // ─── Admin (firm-wide) view ──────────────────────────────────────────────
  if (isAdmin) {
    return (
      <div className="space-y-8">
        <div>
          <p className="text-xs text-muted-foreground">{today}</p>
          <h1 className="text-2xl font-semibold mt-0.5">Firm Dashboard</h1>
          {stats.overdueTasks > 0 && (
            <p className="text-sm text-red-600 mt-1 font-medium">
              {stats.overdueTasks} task{stats.overdueTasks !== 1 ? 's' : ''} overdue — needs attention
            </p>
          )}
          {stats.overdueTasks === 0 && (
            <p className="text-sm text-muted-foreground mt-1">All tasks on track.</p>
          )}
        </div>

        <StatsGrid stats={stats} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section>
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              Overdue Tasks
              {overdue.length > 0 && (
                <span className="rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 text-xs font-semibold">
                  {overdue.length}
                </span>
              )}
            </h2>
            <OverdueTable tasks={overdue} />
          </section>

          <section>
            <h2 className="text-sm font-semibold mb-3">Team Workload</h2>
            <WorkloadChart data={workload} />
          </section>
        </div>

        <section>
          <h2 className="text-sm font-semibold mb-3">
            Upcoming Deadlines
            <span className="ml-2 font-normal text-muted-foreground">(next 60 days)</span>
          </h2>
          <DeadlineList deadlines={deadlines} showAssignee />
        </section>
      </div>
    );
  }

  // ─── Member (personal) view ──────────────────────────────────────────────
  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs text-muted-foreground">{today}</p>
        <h1 className="text-2xl font-semibold mt-0.5">{greet()}</h1>
        {memberStats.myOverdue > 0 && (
          <p className="text-sm text-red-600 mt-1 font-medium">
            You have {memberStats.myOverdue} overdue task{memberStats.myOverdue !== 1 ? 's' : ''}
          </p>
        )}
        {memberStats.myOverdue === 0 && memberStats.myTotal > 0 && (
          <p className="text-sm text-muted-foreground mt-1">
            {memberStats.myTotal} active task{memberStats.myTotal !== 1 ? 's' : ''} — nothing overdue.
          </p>
        )}
        {memberStats.myTotal === 0 && (
          <p className="text-sm text-muted-foreground mt-1">No tasks assigned to you yet.</p>
        )}
      </div>

      <MemberStatsGrid stats={memberStats} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            My Overdue Tasks
            {myOverdue.length > 0 && (
              <span className="rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 text-xs font-semibold">
                {myOverdue.length}
              </span>
            )}
          </h2>
          <OverdueTable tasks={myOverdue} />
        </section>

        <section>
          <h2 className="text-sm font-semibold mb-3">My Upcoming Deadlines</h2>
          <DeadlineList deadlines={myDeadlines} />
        </section>
      </div>
    </div>
  );
}
