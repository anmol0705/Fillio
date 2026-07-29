'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { claimPoolTask } from '@/actions/tasks';
import { TaskTypeChip } from './TaskTypeChip';
import { PriorityBadge } from './PriorityBadge';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import type { TaskWithRelations } from '@/types';

interface Props {
  initialTasks: TaskWithRelations[];
}

export function PoolClient({ initialTasks }: Props) {
  const [tasks, setTasks] = useState(initialTasks);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function handleClaim(id: string) {
    setClaiming(id);
    try {
      const result = await claimPoolTask(id);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      setTasks((prev) => prev.filter((t) => t.id !== id));
      toast.success('Task claimed — it is now yours');
      startTransition(() => router.push(`/dashboard/tasks/${id}`));
    } catch {
      toast.error('Failed to claim task');
    } finally {
      setClaiming(null);
    }
  }

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="text-base font-medium">No tasks in the pool</p>
        <p className="text-sm text-muted-foreground mt-1">
          All tasks have been claimed or assigned. Check back later.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tasks.map((task) => (
        <div key={task.id} className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium leading-snug">{task.title}</p>
            <PriorityBadge priority={task.priority} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <TaskTypeChip type={task.task_type} />
            {task.client && (
              <span className="text-xs text-muted-foreground">{task.client.name}</span>
            )}
          </div>
          {task.due_at && (
            <p className="text-xs text-muted-foreground">
              Due {format(new Date(task.due_at), 'dd MMM yyyy')}
            </p>
          )}
          <Button
            size="sm"
            className="w-full min-h-[44px]"
            disabled={claiming === task.id}
            onClick={() => handleClaim(task.id)}
          >
            {claiming === task.id ? 'Claiming…' : 'Claim Task'}
          </Button>
        </div>
      ))}
    </div>
  );
}
