'use client';

import { useState } from 'react';
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
  const [open,  setOpen]  = useState(false);
  const [tasks, setTasks] = useState<TaskListItem[]>(initialTasks);

  function addTask(task: TaskListItem) {
    setTasks((prev) => [task, ...prev]);
  }

  function removeTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">My Tasks</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Tasks you created or have access to.</p>
        </div>
        <Button onClick={() => setOpen(true)}>New Task</Button>
      </div>

      <TasksTable tasks={tasks} onRemove={removeTask} />

      <TaskForm
        open={open}
        onOpenChange={setOpen}
        clients={clients}
        members={members}
        onCreated={addTask}
      />
    </div>
  );
}
