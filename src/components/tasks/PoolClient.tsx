'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from './StatusBadge';
import { PriorityBadge } from './PriorityBadge';
import { TaskTypeChip } from './TaskTypeChip';
import { claimPoolTask } from '@/actions/tasks';
import type { TaskListItem } from '@/types';

interface Props {
  tasks: TaskListItem[];
}

export function PoolClient({ tasks }: Props) {
  const router = useRouter();
  const [filter, setFilter]           = useState('');
  const [isPending, startTransition]  = useTransition();

  const filtered = tasks.filter((t) =>
    t.title.toLowerCase().includes(filter.toLowerCase()) ||
    (t.client?.name ?? '').toLowerCase().includes(filter.toLowerCase())
  );

  function claim(taskId: string) {
    startTransition(async () => {
      const res = await claimPoolTask(taskId);
      if ('error' in res) { alert(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Open Task Pool</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tasks available for any team member to claim.
        </p>
      </div>

      <Input
        placeholder="Filter by title or client…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="max-w-xs"
      />

      {filtered.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-muted-foreground">
          No open tasks available.
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((task) => {
            const alreadyClaimed = task.my_access !== null;
            const isPast = task.due_at && new Date(task.due_at) < new Date();

            return (
              <li
                key={task.id}
                className="rounded-md border p-4 flex items-start justify-between gap-4"
              >
                <div className="space-y-1 min-w-0">
                  <Link
                    href={`/dashboard/tasks/${task.id}`}
                    className="font-medium text-primary hover:underline line-clamp-1"
                  >
                    {task.title}
                  </Link>
                  <div className="flex flex-wrap gap-1.5">
                    <TaskTypeChip type={task.type} />
                    <StatusBadge status={task.status} />
                    <PriorityBadge priority={task.priority} />
                  </div>
                  <div className="text-xs text-muted-foreground flex gap-3 mt-1">
                    {task.client && <span>Client: {task.client.name}</span>}
                    {task.due_at && (
                      <span className={isPast ? 'text-red-600 font-medium' : ''}>
                        Due:{' '}
                        {new Date(task.due_at).toLocaleDateString('en-IN', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })}
                      </span>
                    )}
                    {task.assignee && <span>Assignee: {task.assignee.full_name}</span>}
                  </div>
                </div>

                <Button
                  size="sm"
                  variant={alreadyClaimed ? 'outline' : 'default'}
                  disabled={isPending || alreadyClaimed}
                  onClick={() => claim(task.id)}
                >
                  {alreadyClaimed ? 'Claimed' : 'Claim'}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
