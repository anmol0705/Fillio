'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createRecurringTemplate,
  updateRecurringTemplate,
  toggleTemplateActive,
  deleteRecurringTemplate,
} from '@/actions/recurring';
import type { RecurringTemplate, Role, Client } from '@/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  initialTemplates: RecurringTemplate[];
  roles:            Role[];
  clients:          Client[];
}

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

type FormValues = {
  title:                    string;
  task_type:                RecurringTemplate['task_type'];
  cadence:                  RecurringTemplate['cadence'];
  priority:                 RecurringTemplate['priority'];
  default_assignee_role_id: string;
  default_client_id:        string;
  due_in_days:              string;
};

const EMPTY_FORM: FormValues = {
  title:                    '',
  task_type:                'gst',
  cadence:                  'monthly',
  priority:                 'medium',
  default_assignee_role_id: '',
  default_client_id:        '',
  due_in_days:              '30',
};

// ---------------------------------------------------------------------------
// Display maps
// ---------------------------------------------------------------------------

const CADENCE_LABELS: Record<RecurringTemplate['cadence'], string> = {
  monthly:     'Monthly (1st of every month)',
  quarterly:   'Quarterly (Jan, Apr, Jul, Oct)',
  half_yearly: 'Half-yearly (Apr, Oct)',
  annually:    'Annually (1st April)',
};

const CADENCE_SHORT: Record<RecurringTemplate['cadence'], string> = {
  monthly:     'Monthly',
  quarterly:   'Quarterly',
  half_yearly: 'Half-yearly',
  annually:    'Annually',
};

const TYPE_LABELS: Record<RecurringTemplate['task_type'], string> = {
  gst:        'GST',
  tds:        'TDS',
  income_tax: 'Income Tax',
  audit:      'Audit',
  roc_mca:    'ROC / MCA',
  accounting: 'Accounting',
  payroll:    'Payroll',
  notice:     'Notice',
  advisory:   'Advisory',
  other:      'Other',
};

const PRIORITY_COLOURS: Record<RecurringTemplate['priority'], string> = {
  urgent: 'bg-red-100 text-red-700',
  high:   'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low:    'bg-slate-100 text-slate-600',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecurringClient({ initialTemplates, roles, clients }: Props) {
  const [templates, setTemplates]         = useState<RecurringTemplate[]>(initialTemplates);
  const [open, setOpen]                   = useState(false);
  const [editing, setEditing]             = useState<RecurringTemplate | null>(null);
  const [form, setForm]                   = useState<FormValues>(EMPTY_FORM);
  const [formError, setFormError]         = useState('');
  const [isPending, startTransition]      = useTransition();

  // ── helpers ──────────────────────────────────────────────────────────────

  function setField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setOpen(true);
  }

  function openEdit(t: RecurringTemplate) {
    setEditing(t);
    setForm({
      title:                    t.title,
      task_type:                t.task_type,
      cadence:                  t.cadence,
      priority:                 t.priority,
      default_assignee_role_id: t.default_assignee_role_id ?? '',
      default_client_id:        t.default_client_id ?? '',
      due_in_days:              String(t.due_in_days),
    });
    setFormError('');
    setOpen(true);
  }

  // ── submit ───────────────────────────────────────────────────────────────

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');

    const dueDays = parseInt(form.due_in_days, 10);
    if (isNaN(dueDays) || dueDays < 1 || dueDays > 365) {
      setFormError('Due in days must be between 1 and 365.');
      return;
    }
    if (!form.title.trim()) {
      setFormError('Title is required.');
      return;
    }

    const payload = {
      title:                    form.title.trim(),
      task_type:                form.task_type,
      cadence:                  form.cadence,
      priority:                 form.priority,
      default_assignee_role_id: form.default_assignee_role_id || null,
      default_client_id:        form.default_client_id || null,
      due_in_days:              dueDays,
    };

    startTransition(async () => {
      if (editing) {
        const res = await updateRecurringTemplate(editing.id, payload);
        if (res.error !== null) { setFormError(res.error); return; }
        setTemplates((prev) => prev.map((t) => t.id === editing.id ? res.data : t));
      } else {
        const res = await createRecurringTemplate(payload);
        if (res.error !== null) { setFormError(res.error); return; }
        setTemplates((prev) => [res.data, ...prev]);
      }
      setOpen(false);
    });
  }

  // ── toggle active ────────────────────────────────────────────────────────

  function handleToggle(t: RecurringTemplate) {
    const next = !t.is_active;
    setTemplates((prev) => prev.map((r) => r.id === t.id ? { ...r, is_active: next } : r));
    startTransition(async () => {
      const res = await toggleTemplateActive(t.id, next);
      if (res.error) {
        setTemplates((prev) => prev.map((r) => r.id === t.id ? { ...r, is_active: t.is_active } : r));
      }
    });
  }

  // ── delete ───────────────────────────────────────────────────────────────

  function handleDelete(t: RecurringTemplate) {
    if (!confirm(`Delete template "${t.title}"?\n\nNo future tasks will be created from it.`)) return;
    setTemplates((prev) => prev.filter((r) => r.id !== t.id));
    startTransition(async () => {
      const res = await deleteRecurringTemplate(t.id);
      if (res.error) {
        setTemplates((prev) => [t, ...prev]);
      }
    });
  }

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <>
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {templates.length} template{templates.length !== 1 ? 's' : ''}
        </p>
        <Button size="sm" onClick={openCreate}>
          + New template
        </Button>
      </div>

      {/* Empty state */}
      {templates.length === 0 ? (
        <div className="rounded-lg border border-dashed px-6 py-12 text-center">
          <p className="text-sm font-medium">No recurring templates yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create a template and tasks will be spawned automatically on schedule.
          </p>
        </div>
      ) : (
        <div className="divide-y rounded-lg border overflow-hidden">
          {templates.map((t) => {
            const roleName   = roles.find((r) => r.id === t.default_assignee_role_id)?.name;
            const clientName = clients.find((c) => c.id === t.default_client_id)?.name;

            return (
              <div key={t.id} className="flex items-center gap-4 px-4 py-3">
                <Switch
                  checked={t.is_active}
                  onCheckedChange={() => handleToggle(t)}
                  aria-label="Toggle active"
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-medium truncate ${!t.is_active ? 'opacity-50' : ''}`}>
                      {t.title}
                    </span>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {TYPE_LABELS[t.task_type]}
                    </Badge>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${PRIORITY_COLOURS[t.priority]}`}
                    >
                      {t.priority}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {CADENCE_SHORT[t.cadence]}
                    {' · '}due in {t.due_in_days}d
                    {roleName   ? ` · ${roleName}`   : ' · open pool'}
                    {clientName ? ` · ${clientName}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => openEdit(t)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => handleDelete(t)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Edit template' : 'New recurring template'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="rt-title">Title</Label>
              <Input
                id="rt-title"
                value={form.title}
                onChange={(e) => setField('title', e.target.value)}
                placeholder="e.g. Monthly GSTR-1 Filing"
                required
              />
            </div>

            {/* Task type + Cadence */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Task type</Label>
                <Select
                  value={form.task_type}
                  onValueChange={(v) => setField('task_type', v as RecurringTemplate['task_type'])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(TYPE_LABELS) as [RecurringTemplate['task_type'], string][]).map(
                      ([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Cadence</Label>
                <Select
                  value={form.cadence}
                  onValueChange={(v) => setField('cadence', v as RecurringTemplate['cadence'])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(CADENCE_LABELS) as [RecurringTemplate['cadence'], string][]).map(
                      ([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Priority + Due in days */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => setField('priority', v as RecurringTemplate['priority'])}
                >
                  <SelectTrigger>
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

              <div className="space-y-1.5">
                <Label htmlFor="rt-due">Due in days</Label>
                <Input
                  id="rt-due"
                  type="number"
                  min={1}
                  max={365}
                  value={form.due_in_days}
                  onChange={(e) => setField('due_in_days', e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Days from task creation date
                </p>
              </div>
            </div>

            {/* Default assignee role */}
            <div className="space-y-1.5">
              <Label>Default assignee role</Label>
              <Select
                value={form.default_assignee_role_id || '_none'}
                onValueChange={(v) => setField('default_assignee_role_id', v == null || v === '_none' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Open pool (no specific role)</SelectItem>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Cron picks the first active user with this role. If none, task is open pool.
              </p>
            </div>

            {/* Default client */}
            <div className="space-y-1.5">
              <Label>Default client</Label>
              <Select
                value={form.default_client_id || '_none'}
                onValueChange={(v) => setField('default_client_id', v == null || v === '_none' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">No specific client</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formError && (
              <p className="text-sm text-red-600">{formError}</p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving…' : editing ? 'Save changes' : 'Create template'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
