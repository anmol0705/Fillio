import Link from 'next/link';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { OverdueTask } from '@/actions/dashboard';

interface Props {
  tasks: OverdueTask[];
}

export function OverdueTable({ tasks }: Props) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-8 text-center">
        <p className="text-sm font-medium text-emerald-700">No overdue tasks — great work!</p>
      </div>
    );
  }

  return (
    <div className="divide-y rounded-lg border overflow-hidden">
      {tasks.map((task) => {
        const initials = task.assignee
          ? task.assignee.full_name
              .split(' ')
              .map((n: string) => n[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()
          : '?';

        return (
          <Link
            key={task.id}
            href={`/dashboard/tasks/${task.id}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors"
          >
            <Avatar className="w-7 h-7 shrink-0">
              <AvatarFallback className="text-xs bg-red-100 text-red-700">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{task.title}</p>
              <p className="text-xs text-muted-foreground">
                {task.assignee?.full_name ?? 'Unassigned'}
                {task.client ? ` · ${task.client.name}` : ''}
              </p>
            </div>
            <span className="text-xs font-semibold text-red-600 shrink-0 tabular-nums">
              {task.daysOverdue}d overdue
            </span>
          </Link>
        );
      })}
    </div>
  );
}
