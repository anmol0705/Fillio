import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/getUser';
import { getMyTasks } from '@/actions/tasks';
import { getClients } from '@/actions/clients';
import { getOrgUsers } from '@/actions/users';
import { TasksClient } from '@/components/tasks/TasksClient';

export default async function TasksPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [tasksRes, clientsRes, usersRes] = await Promise.all([
    getMyTasks(),
    getClients(),
    getOrgUsers(),
  ]);

  const tasks   = tasksRes.error   === null ? tasksRes.data   : [];
  const clients = clientsRes.error === null ? clientsRes.data : [];
  const members = usersRes.error   === null
    ? usersRes.data.map((u) => ({ id: u.id, full_name: u.full_name }))
    : [];

  return <TasksClient initialTasks={tasks} clients={clients} members={members} />;
}
