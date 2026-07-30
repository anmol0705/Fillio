'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { createTask } from '@/actions/tasks';
import type { Client, Profile } from '@/types';

interface Props {
  open:       boolean;
  onOpenChange: (v: boolean) => void;
  clients:    Client[];
  members:    Pick<Profile, 'id' | 'full_name'>[];
}

const TASK_TYPES = [
  { value: 'gst',        label: 'GST' },
  { value: 'tds',        label: 'TDS' },
  { value: 'income_tax', label: 'Income Tax' },
  { value: 'audit',      label: 'Audit' },
  { value: 'roc_mca',    label: 'ROC / MCA' },
  { value: 'accounting', label: 'Accounting' },
  { value: 'payroll',    label: 'Payroll' },
  { value: 'notice',     label: 'Notice' },
  { value: 'advisory',   label: 'Advisory' },
  { value: 'other',      label: 'Other' },
] as const;

const PRIORITIES = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high',   label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low',    label: 'Low' },
] as const;

export function TaskForm({ open, onOpenChange, clients, members }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  const [title,    setTitle]    = useState('');
  const [desc,     setDesc]     = useState('');
  const [type,     setType]     = useState('');
  const [priority, setPriority] = useState('medium');
  const [dueAt,    setDueAt]    = useState('');
  const [clientId, setClientId] = useState('');
  const [fyear,    setFyear]    = useState('');
  const [assignee, setAssignee] = useState('');
  const [isPool,   setIsPool]   = useState(false);

  function reset() {
    setTitle(''); setDesc(''); setType(''); setPriority('medium');
    setDueAt(''); setClientId(''); setFyear(''); setAssignee('');
    setIsPool(false); setError('');
  }

  function handleClose(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!type) { setError('Task type is required'); return; }
    setError('');

    startTransition(async () => {
      const res = await createTask({
        title:          title.trim(),
        description:    desc.trim() || undefined,
        type,
        priority,
        due_at:         dueAt ? new Date(dueAt).toISOString() : null,
        client_id:      clientId || null,
        financial_year: fyear.trim() || null,
        assignee_id:    assignee || null,
        is_open_pool:   isPool,
      });

      if ('error' in res) {
        setError(res.error);
        return;
      }
      reset();
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4 mt-2">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}

          <div className="space-y-1">
            <Label htmlFor="tf-title">Title *</Label>
            <Input
              id="tf-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. File GST Return for FY 2024-25"
              required
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="tf-desc">Description</Label>
            <Textarea
              id="tf-desc"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Optional notes..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Task Type *</Label>
              <Select value={type} onValueChange={(v) => setType(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v ?? 'medium')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="tf-due">Due Date</Label>
              <Input
                id="tf-due"
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tf-fy">Financial Year</Label>
              <Input
                id="tf-fy"
                value={fyear}
                onChange={(e) => setFyear(e.target.value)}
                placeholder="e.g. 2024-25"
                maxLength={10}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Client</Label>
            <Select value={clientId} onValueChange={(v) => setClientId(v ?? '')}>
              <SelectTrigger><SelectValue placeholder="Select client (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">— None —</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Assignee</Label>
            <Select value={assignee} onValueChange={(v) => setAssignee(v ?? '')}>
              <SelectTrigger><SelectValue placeholder="Assign to (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">— Unassigned —</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3">
            <Switch id="tf-pool" checked={isPool} onCheckedChange={setIsPool} />
            <Label htmlFor="tf-pool" className="cursor-pointer">
              Open Pool — visible to all org members
            </Label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Creating…' : 'Create Task'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
