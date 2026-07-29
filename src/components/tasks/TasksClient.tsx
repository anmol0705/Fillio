'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { TaskTable } from './TaskTable';
import { TaskForm } from './TaskForm';
import type { TaskWithRelations, Client, Profile } from '@/types';

interface Props {
  tasks: TaskWithRelations[];
  clients: Client[];
  users: Profile[];
}

export function TasksClient({ tasks, clients, users }: Props) {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreateOpen(true)} className="min-h-[44px]">
          <Plus className="w-4 h-4 mr-1.5" />
          New Task
        </Button>
      </div>
      <TaskTable data={tasks} />
      <TaskForm
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        clients={clients}
        users={users}
      />
    </div>
  );
}
