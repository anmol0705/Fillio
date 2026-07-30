'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { StatusBadge } from './StatusBadge';
import { PriorityBadge } from './PriorityBadge';
import { TaskTypeChip } from './TaskTypeChip';
import { StatusStepper } from './StatusStepper';
import { AuditLog } from './AuditLog';
import { grantAccess } from '@/actions/tasks';
import type { TaskDetail as TaskDetailType, TaskStatus, Profile } from '@/types';

interface Props {
  task:    TaskDetailType;
  members: Pick<Profile, 'id' | 'full_name'>[];
}

export function TaskDetail({ task: initialTask, members }: Props) {
  const [isPending, startTransition] = useTransition();
  const [grantUserId, setGrantUserId] = useState('');
  const [grantLevel,  setGrantLevel]  = useState<'editor' | 'viewer'>('viewer');
  const [grantError,  setGrantError]  = useState('');

  // Hold the full task in local state so status changes are instant
  const [task, setTask] = useState<TaskDetailType>(initialTask);

  function handleStatusChange(newStatus: TaskStatus) {
    setTask((prev) => ({ ...prev, status: newStatus }));
  }

  function submitGrant(e: React.FormEvent) {
    e.preventDefault();
    if (!grantUserId) return;
    setGrantError('');

    startTransition(async () => {
      const res = await grantAccess(task.id, grantUserId, grantLevel);
      if ('error' in res) { setGrantError(res.error); return; }

      // Append the new access row optimistically
      const member = members.find((m) => m.id === grantUserId);
      setTask((prev) => ({
        ...prev,
        access: [
          ...prev.access.filter((a) => a.user_id !== grantUserId),
          {
            id:         crypto.randomUUID(),
            task_id:    task.id,
            user_id:    grantUserId,
            level:      grantLevel,
            granted_by: null,
            created_at: new Date(),
            profile:    { full_name: member?.full_name ?? 'Unknown' },
          } as TaskDetailType['access'][number],
        ],
      }));
      setGrantUserId('');
    });
  }

  const isOwner = task.my_access === 'owner';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left — main detail */}
      <div className="lg:col-span-2 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">{task.title}</h1>
          <div className="flex flex-wrap gap-2 mt-2">
            <TaskTypeChip type={task.type} />
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
          </div>
        </div>

        {task.description && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{task.description}</p>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Assignee</span>
            <p className="font-medium">{task.assignee?.full_name ?? '—'}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Client</span>
            <p className="font-medium">{task.client?.name ?? '—'}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Due Date</span>
            <p className="font-medium">
              {task.due_at
                ? new Date(task.due_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                : '—'}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Financial Year</span>
            <p className="font-medium">{task.financial_year ?? '—'}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Created by</span>
            <p className="font-medium">{task.creator.full_name}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Open Pool</span>
            <p className="font-medium">{task.is_open_pool ? 'Yes' : 'No'}</p>
          </div>
        </div>

        <Separator />

        <div>
          <h2 className="text-sm font-medium mb-3">Move Status</h2>
          <StatusStepper
            taskId={task.id}
            status={task.status}
            myAccess={task.my_access}
            onStatusChange={handleStatusChange}
          />
        </div>

        <Separator />

        <div>
          <h2 className="text-sm font-medium mb-3">Activity Log</h2>
          <AuditLog entries={task.audit_log} />
        </div>
      </div>

      {/* Right — access panel */}
      <div className="space-y-5">
        <div>
          <h2 className="text-sm font-semibold mb-3">Access</h2>
          <ul className="space-y-2">
            {task.access.map((row) => (
              <li key={row.id} className="flex items-center justify-between text-sm">
                <span>{row.profile.full_name}</span>
                <span className="text-xs text-muted-foreground capitalize">{row.level}</span>
              </li>
            ))}
          </ul>
        </div>

        {isOwner && (
          <>
            <Separator />
            <form onSubmit={submitGrant} className="space-y-3">
              <h2 className="text-sm font-semibold">Grant Access</h2>
              {grantError && <p className="text-xs text-red-600">{grantError}</p>}
              <div className="space-y-1">
                <Label className="text-xs">Member</Label>
                <Select value={grantUserId} onValueChange={(v) => setGrantUserId(v ?? '')}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select member" />
                  </SelectTrigger>
                  <SelectContent>
                    {members
                      .filter((m) => !task.access.find((a) => a.user_id === m.id))
                      .map((m) => (
                        <SelectItem key={m.id} value={m.id} className="text-xs">{m.full_name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Level</Label>
                <Select value={grantLevel} onValueChange={(v) => setGrantLevel(v as 'editor' | 'viewer')}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="editor" className="text-xs">Editor</SelectItem>
                    <SelectItem value="viewer" className="text-xs">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" size="sm" className="w-full" disabled={isPending || !grantUserId}>
                {isPending ? 'Granting…' : 'Grant Access'}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
