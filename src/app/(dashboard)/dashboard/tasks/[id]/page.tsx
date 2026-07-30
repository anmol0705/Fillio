import { redirect, notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/getUser';
import { getTaskDetail } from '@/actions/tasks';
import { getOrgUsers } from '@/actions/users';
import { TaskDetail } from '@/components/tasks/TaskDetail';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TaskDetailPage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [taskRes, usersRes] = await Promise.all([
    getTaskDetail(id),
    getOrgUsers(),
  ]);

  if (taskRes.error !== null) notFound();

  const members = usersRes.error === null
    ? usersRes.data.map((u) => ({ id: u.id, full_name: u.full_name }))
    : [];

  return (
    <div className="max-w-5xl mx-auto py-2">
      <TaskDetail task={taskRes.data} members={members} />
    </div>
  );
}
