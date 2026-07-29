import { notFound } from 'next/navigation';
import { getTaskDetail, getTaskMessages } from '@/actions/tasks';
import { getCurrentUser } from '@/lib/auth/getUser';
import { StatusStepper } from '@/components/tasks/StatusStepper';
import { AuditLog } from '@/components/tasks/AuditLog';
import { TaskTypeChip } from '@/components/tasks/TaskTypeChip';
import { PriorityBadge } from '@/components/tasks/PriorityBadge';
import { TaskChat } from '@/components/tasks/TaskChat';
import { format } from 'date-fns';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TaskDetailPage({ params }: Props) {
  const { id } = await params;

  // Run task detail fetch and message hydration in parallel
  const [result, user, messagesResult] = await Promise.all([
    getTaskDetail(id),
    getCurrentUser(),
    getTaskMessages(id),
  ]);

  if ('error' in result || !result.data) {
    notFound();
  }

  if (!user) {
    notFound();
  }

  const task = result.data;
  // Provide initialMessages from server so the chat panel is populated on first render
  // without a client-side fetch — Realtime subscription then keeps it live.
  const initialMessages = 'data' in messagesResult ? (messagesResult.data ?? []) : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Task detail */}
      <div className="lg:col-span-2 space-y-6 min-w-0">
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <TaskTypeChip type={task.task_type} />
            <PriorityBadge priority={task.priority} />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold break-words">{task.title}</h1>
          {task.description && (
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed break-words">
              {task.description}
            </p>
          )}
        </div>

        <StatusStepper task={task} />

        {/* Meta grid — 1 col on mobile, 2 on sm+ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Client</p>
            <p className="font-medium">{task.client?.name ?? '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Assignee</p>
            <p className="font-medium">{task.assignee?.full_name ?? 'Unassigned'}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Creator</p>
            <p className="font-medium">{task.creator.full_name}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Due Date</p>
            <p className="font-medium">
              {task.due_at ? format(new Date(task.due_at), 'dd MMM yyyy') : '—'}
            </p>
          </div>
          {task.financial_year && (
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">
                Financial Year
              </p>
              <p className="font-medium">{task.financial_year}</p>
            </div>
          )}
        </div>

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Activity
          </h2>
          <AuditLog entries={task.auditLog} />
        </div>
      </div>

      {/* Right: Realtime chat — full width on mobile, sidebar on lg+ */}
      <div className="rounded-lg border bg-card p-4 flex flex-col min-h-[400px] lg:min-h-0">
        <TaskChat
          taskId={task.id}
          currentUserId={user.id}
          initialMessages={initialMessages}
        />
      </div>
    </div>
  );
}
