'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { updateTaskStatus } from '@/actions/tasks';
import { STATUS_TRANSITIONS } from '@/lib/validations/task';
import { StatusBadge } from './StatusBadge';
import type { Task } from '@/types';
import { useRouter } from 'next/navigation';

const STATUS_LABELS: Record<string, string> = {
  in_progress: 'Start Working',
  under_review: 'Submit for Review',
  changes_requested: 'Request Changes',
  approved: 'Approve',
  filed: 'Mark Filed',
  completed: 'Complete',
};

interface Props {
  task: Pick<Task, 'id' | 'status'>;
}

export function StatusStepper({ task }: Props) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const nextStatuses = STATUS_TRANSITIONS[task.status] ?? [];

  if (task.status === 'completed') {
    return (
      <div className="flex items-center gap-2">
        <StatusBadge status={task.status} />
        <span className="text-xs text-muted-foreground">Task is complete</span>
      </div>
    );
  }

  async function handleTransition(next: string) {
    setLoading(true);
    try {
      const result = await updateTaskStatus({
        task_id: task.id,
        new_status: next as Task['status'],
      });
      if ('error' in result) {
        toast.error(result.error);
      } else {
        toast.success('Status updated');
        router.refresh();
      }
    } catch {
      toast.error('Failed to update status');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <StatusBadge status={task.status} />
      {nextStatuses.map((next) => (
        <Button
          key={next}
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => handleTransition(next)}
          className="min-h-[44px]"
        >
          {loading ? 'Updating…' : (STATUS_LABELS[next] ?? next)}
        </Button>
      ))}
    </div>
  );
}
