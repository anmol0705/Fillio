import { redirect, notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/getUser';
import { getTaskDetail, getTaskMessages } from '@/actions/tasks';
import { getOrgUsers } from '@/actions/users';
import { getTaskFiles } from '@/actions/files';
import { TaskDetail } from '@/components/tasks/TaskDetail';
import { TaskChat } from '@/components/tasks/TaskChat';
import { FileAttachments } from '@/components/tasks/FileAttachments';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TaskDetailPage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [taskRes, messagesRes, usersRes, filesRes] = await Promise.all([
    getTaskDetail(id),
    getTaskMessages(id),
    getOrgUsers(),
    getTaskFiles(id),
  ]);

  if (taskRes.error !== null) notFound();

  const members = usersRes.error === null
    ? usersRes.data.map((u) => ({ id: u.id, full_name: u.full_name }))
    : [];

  const messages      = messagesRes.error === null ? messagesRes.data : [];
  const files         = filesRes.error === null ? filesRes.data : [];
  const currentMember = members.find((m) => m.id === user.id);

  return (
    <div className="max-w-5xl mx-auto py-2 space-y-8">
      <TaskDetail task={taskRes.data} members={members} />

      <FileAttachments
        taskId={id}
        myAccess={taskRes.data.my_access}
        initial={files}
      />

      <div>
        <h2 className="text-sm font-semibold mb-4">Chat</h2>
        <TaskChat
          taskId={id}
          currentUserId={user.id}
          currentUserName={currentMember?.full_name ?? 'You'}
          initialMessages={messages}
          members={members}
        />
      </div>
    </div>
  );
}
