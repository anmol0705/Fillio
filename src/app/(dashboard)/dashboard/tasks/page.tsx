import { getMyTasks } from '@/actions/tasks';
import { getClients } from '@/actions/clients';
import { getOrgUsers } from '@/actions/users';
import { TasksClient } from '@/components/tasks/TasksClient';
import { isPast } from 'date-fns';

export default async function TasksPage() {
  const [tasksResult, clientsResult, usersResult] = await Promise.all([
    getMyTasks(),
    getClients(),
    getOrgUsers(),
  ]);

  const tasks = 'data' in tasksResult ? tasksResult.data : [];
  const clients = 'data' in clientsResult ? clientsResult.data : [];
  const users = 'data' in usersResult ? usersResult.data : [];

  const overdue = tasks.filter(
    (t) => t.due_at && isPast(new Date(t.due_at)) && t.status !== 'completed',
  ).length;

  const dueToday = tasks.filter((t) => {
    if (!t.due_at) return false;
    const d = new Date(t.due_at);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  }).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold">My Tasks</h1>
      </div>

      {/* Stats row — 1 col on mobile, 3 cols on sm+ */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-2xl font-bold">{tasks.length}</p>
          <p className="text-sm text-muted-foreground">Total tasks</p>
        </div>
        <div className="rounded-lg border bg-card p-4 border-red-200">
          <p className="text-2xl font-bold text-red-600">{overdue}</p>
          <p className="text-sm text-muted-foreground">Overdue</p>
        </div>
        <div className="rounded-lg border bg-card p-4 border-amber-200">
          <p className="text-2xl font-bold text-amber-600">{dueToday}</p>
          <p className="text-sm text-muted-foreground">Due today</p>
        </div>
      </div>

      <TasksClient tasks={tasks} clients={clients} users={users} />
    </div>
  );
}
