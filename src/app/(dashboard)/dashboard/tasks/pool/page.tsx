import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/getUser';
import { getPoolTasks } from '@/actions/tasks';
import { PoolClient } from '@/components/tasks/PoolClient';

export default async function PoolPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const result = await getPoolTasks();
  if (result.error !== null) redirect('/dashboard');

  return <PoolClient tasks={result.data} />;
}
