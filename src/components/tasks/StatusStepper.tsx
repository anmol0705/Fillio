'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { updateTaskStatus } from '@/actions/tasks';
import type { TaskStatus, AccessLevel } from '@/types';

const NEXT_STATUSES: Partial<Record<TaskStatus, TaskStatus[]>> = {
  not_started:       ['in_progress'],
  in_progress:       ['under_review'],
  under_review:      ['changes_requested', 'approved'],
  changes_requested: ['in_progress'],
  approved:          ['filed'],
  filed:             ['completed'],
};

function buttonLabel(target: TaskStatus): string {
  if (target === 'in_progress')       return 'Mark In Progress';
  if (target === 'under_review')      return 'Submit for Review';
  if (target === 'changes_requested') return 'Request Changes';
  if (target === 'approved')          return 'Approve';
  if (target === 'filed')             return 'Mark Filed';
  if (target === 'completed')         return 'Mark Completed';
  return target;
}

interface Props {
  taskId:         string;
  status:         TaskStatus;
  myAccess:       AccessLevel | null;
  onStatusChange: (newStatus: TaskStatus) => void;
}

export function StatusStepper({ taskId, status, myAccess, onStatusChange }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  const canEdit = myAccess === 'owner' || myAccess === 'editor';
  const nexts   = NEXT_STATUSES[status] ?? [];

  if (!canEdit || nexts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {status === 'completed' ? 'Task is completed — no further changes.' : 'No transitions available.'}
      </p>
    );
  }

  function move(next: TaskStatus) {
    setError('');
    // Update parent immediately so StatusBadge reflects the change at once
    onStatusChange(next);

    startTransition(async () => {
      const res = await updateTaskStatus(taskId, next);
      if ('error' in res) {
        // Revert if server rejected the transition
        onStatusChange(status);
        setError(res.error);
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {nexts.map((next) => (
          <Button
            key={next}
            size="sm"
            variant={next === 'changes_requested' ? 'outline' : 'default'}
            disabled={isPending}
            onClick={() => move(next)}
          >
            {buttonLabel(next)}
          </Button>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
