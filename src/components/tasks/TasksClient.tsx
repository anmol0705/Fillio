'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { TaskForm } from './TaskForm';
import { TasksTable } from './TasksTable';
import type { TaskListItem, Client, Profile } from '@/types';

interface Props {
  initialTasks: TaskListItem[];
  clients:      Client[];
  members:      Pick<Profile, 'id' | 'full_name'>[];
}

export function TasksClient({ initialTasks, clients, members }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">My Tasks</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Tasks you created or have access to.</p>
        </div>
        <Button onClick={() => setOpen(true)}>New Task</Button>
      </div>

      <TasksTable tasks={initialTasks} />

      <TaskForm
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) router.refresh();
        }}
        clients={clients}
        members={members}
      />
    </div>
  );
}
