import { getPoolTasks } from '@/actions/tasks';
import { PoolClient } from '@/components/tasks/PoolClient';

export default async function PoolPage() {
  const result = await getPoolTasks();
  const tasks = 'data' in result ? result.data : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Open Pool</h1>
        <p className="text-sm text-muted-foreground">
          Unclaimed tasks — claim one to take ownership.
        </p>
      </div>
      <PoolClient initialTasks={tasks} />
    </div>
  );
}
