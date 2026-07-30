'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
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

const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started:       'Not Started',
  in_progress:       'In Progress',
  under_review:      'Under Review',
  changes_requested: 'Changes Requested',
  approved:          'Approved',
  filed:             'Filed',
  completed:         'Completed',
};

function buttonLabel(target: TaskStatus): string {
  if (target === 'in_progress') return 'Mark In Progress';
  if (target === 'under_review') return 'Submit for Review';
  if (target === 'changes_requested') return 'Request Changes';
  if (target === 'approved') return 'Approve';
  if (target === 'filed') return 'Mark Filed';
  if (target === 'completed') return 'Mark Completed';
  return STATUS_LABELS[target];
}

interface Props {
  taskId:   string;
  status:   TaskStatus;
  myAccess: AccessLevel | null;
}

export function StatusStepper({ taskId, status, myAccess }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const canEdit  = myAccess === 'owner' || myAccess === 'editor';
  const nexts    = NEXT_STATUSES[status] ?? [];

  if (!canEdit || nexts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {status === 'completed' ? 'Task is completed — no further changes.' : 'No transitions available.'}
      </p>
    );
  }

  function move(next: TaskStatus) {
    startTransition(async () => {
      const res = await updateTaskStatus(taskId, next);
      if ('error' in res) {
        alert(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
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
  );
}
