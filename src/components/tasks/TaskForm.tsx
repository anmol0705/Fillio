'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createTask } from '@/actions/tasks';
import { taskTypeValues, taskPriorityValues } from '@/lib/validations/task';
import { useRouter } from 'next/navigation';
import type { Client, Profile } from '@/types';

const TYPE_LABELS: Record<string, string> = {
  gst: 'GST',
  tds: 'TDS',
  income_tax: 'Income Tax',
  audit: 'Audit',
  roc_mca: 'ROC/MCA',
  accounting: 'Accounting',
  payroll: 'Payroll',
  notice: 'Notice',
  advisory: 'Advisory',
  other: 'Other',
};

const formSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500),
  description: z.string().max(5000).optional(),
  task_type: z.enum(taskTypeValues, { error: 'Task type is required' }),
  priority: z.enum(taskPriorityValues),
  client_id: z.string().optional(),
  assignee_id: z.string().optional(),
  financial_year: z.string().max(10).optional(),
  due_at: z.string().optional(),
  is_open_pool: z.boolean(),
});

type FormData = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onClose: () => void;
  clients: Client[];
  users: Profile[];
}

export function TaskForm({ open, onClose, clients, users }: Props) {
  const router = useRouter();
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { priority: 'medium' as const, is_open_pool: false },
  });

  async function onSubmit(data: FormData) {
    setServerError('');
    try {
      const result = await createTask({
        ...data,
        client_id: data.client_id || null,
        assignee_id: data.assignee_id || null,
        due_at: data.due_at ? new Date(data.due_at).toISOString() : null,
      });

      if ('error' in result) {
        setServerError(result.error);
        return;
      }

      toast.success('Task created');
      reset();
      onClose();
      router.push(`/dashboard/tasks/${result.data.id}`);
      router.refresh();
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Failed to create task');
    }
  }

  function handleClose() {
    reset();
    setServerError('');
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-full max-w-lg mx-4 sm:mx-auto max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1">
          {serverError && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
              {serverError}
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              {...register('title')}
              placeholder="e.g. GSTR-1 filing for March 2025"
              className="min-h-[44px]"
            />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>

          {/* Type + Priority — stack on mobile, side-by-side on sm+ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type *</Label>
              <Select
                onValueChange={(v) =>
                  setValue('task_type', v as FormData['task_type'], { shouldValidate: true })
                }
              >
                <SelectTrigger className="w-full min-h-[44px]">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {taskTypeValues.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.task_type && (
                <p className="text-xs text-destructive">{errors.task_type.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select
                defaultValue="medium"
                onValueChange={(v) =>
                  setValue('priority', v as FormData['priority'], { shouldValidate: true })
                }
              >
                <SelectTrigger className="w-full min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Client + Assignee — stack on mobile */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Client</Label>
              <Select onValueChange={(v) => setValue('client_id', (v as string) ?? '')}>
                <SelectTrigger className="w-full min-h-[44px]">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Assignee</Label>
              <Select onValueChange={(v) => setValue('assignee_id', (v as string) ?? '')}>
                <SelectTrigger className="w-full min-h-[44px]">
                  <SelectValue placeholder="Assign to…" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Financial Year + Due Date — stack on mobile */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="financial_year">Financial Year</Label>
              <Input
                id="financial_year"
                {...register('financial_year')}
                placeholder="2024-25"
                className="min-h-[44px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="due_at">Due Date</Label>
              <Input id="due_at" type="date" {...register('due_at')} className="min-h-[44px]" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              {...register('description')}
              placeholder="Optional notes…"
              rows={3}
            />
          </div>

          <div className="flex items-center gap-3 py-1">
            <input
              type="checkbox"
              id="open_pool"
              {...register('is_open_pool')}
              className="rounded border w-5 h-5 shrink-0"
            />
            <Label htmlFor="open_pool" className="font-normal cursor-pointer leading-snug">
              Add to open pool (anyone can claim this task)
            </Label>
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button type="button" variant="outline" onClick={handleClose} className="min-h-[44px] w-full sm:w-auto">
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="min-h-[44px] w-full sm:w-auto">
              {isSubmitting ? 'Creating…' : 'Create Task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
