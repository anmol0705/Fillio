'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import { createTemplate, deleteTemplate } from '@/actions/recurring';
import { Plus, Trash2, RefreshCw } from 'lucide-react';
import type { RecurringTemplate } from '@/types';

// ---------------------------------------------------------------------------
// Display maps
// ---------------------------------------------------------------------------

const CADENCE_LABELS: Record<string, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  half_yearly: 'Half-Yearly',
  annually: 'Annually',
};

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

const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

// ---------------------------------------------------------------------------
// Form schema (client-side, mirrors server schema)
// z.coerce.number() in Zod v4 infers output as `unknown` — FormData is typed
// explicitly below and the resolver is cast to avoid the inference gap.
// ---------------------------------------------------------------------------

const formSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500),
  task_type: z.enum([
    'gst',
    'tds',
    'income_tax',
    'audit',
    'roc_mca',
    'accounting',
    'payroll',
    'notice',
    'advisory',
    'other',
  ]),
  cadence: z.enum(['monthly', 'quarterly', 'half_yearly', 'annually']),
  default_priority: z.enum(['urgent', 'high', 'medium', 'low']),
  // z.coerce handles HTML input strings; FormData declares the output as number
  days_before_due: z.coerce.number().int().min(1).max(365),
});

// Explicit type — z.infer<typeof formSchema> would yield `unknown` for
// days_before_due due to a Zod v4 coerce inference limitation.
type FormData = {
  title: string;
  task_type:
    | 'gst'
    | 'tds'
    | 'income_tax'
    | 'audit'
    | 'roc_mca'
    | 'accounting'
    | 'payroll'
    | 'notice'
    | 'advisory'
    | 'other';
  cadence: 'monthly' | 'quarterly' | 'half_yearly' | 'annually';
  default_priority: 'urgent' | 'high' | 'medium' | 'low';
  days_before_due: number;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  initialTemplates: RecurringTemplate[];
}

export function RecurringClient({ initialTemplates }: Props) {
  const [templates, setTemplates] = useState<RecurringTemplate[]>(initialTemplates);
  const [open, setOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting },
    // Cast required: zodResolver returns Resolver typed with the schema's
    // inferred output (days_before_due: unknown due to Zod v4 coerce), but
    // FormData declares it as number. Runtime behavior is correct.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = useForm<FormData>({ resolver: zodResolver(formSchema) as Resolver<FormData, any>, defaultValues: { default_priority: 'medium', days_before_due: 7 } });

  function handleClose() {
    reset();
    setOpen(false);
  }

  async function onSubmit(data: FormData) {
    const result = await createTemplate(data);

    if ('error' in result) {
      toast.error(result.error);
      return;
    }

    setTemplates((prev) => [...prev, result.data]);
    toast.success('Template created');
    handleClose();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this template? No future tasks will be generated from it.')) {
      return;
    }

    setDeletingId(id);
    const result = await deleteTemplate(id);
    setDeletingId(null);

    if ('error' in result) {
      toast.error(result.error);
      return;
    }

    setTemplates((prev) => prev.filter((t) => t.id !== id));
    toast.success('Template deleted');
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)} className="min-h-[44px]">
          <Plus className="w-4 h-4 mr-1.5" />
          New Template
        </Button>
      </div>

      {/* Template list */}
      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border rounded-lg">
          <RefreshCw className="w-8 h-8 mb-2 opacity-30" />
          <p className="text-sm">No recurring templates yet</p>
          <p className="text-xs mt-1">
            Create one to auto-generate tasks on a schedule.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div
              key={t.id}
              className="rounded-lg border bg-card px-4 py-3 space-y-2"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{t.title}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-muted-foreground">
                      {TYPE_LABELS[t.task_type] ?? t.task_type}
                    </span>
                    <span className="text-xs text-muted-foreground">&middot;</span>
                    <span className="text-xs text-muted-foreground">
                      {PRIORITY_LABELS[t.default_priority] ?? t.default_priority}
                    </span>
                    <span className="text-xs text-muted-foreground">&middot;</span>
                    <span className="text-xs text-muted-foreground">
                      {t.days_before_due}d before due
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="secondary">
                    {CADENCE_LABELS[t.cadence] ?? t.cadence}
                  </Badge>
                  <button
                    type="button"
                    aria-label="Delete template"
                    disabled={deletingId === t.id}
                    onClick={() => handleDelete(t.id)}
                    className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Recurring Template</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1">
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="rt-title">Template Title *</Label>
              <Input
                id="rt-title"
                {...register('title')}
                placeholder="e.g. GSTR-1 Monthly Filing"
              />
              {errors.title && (
                <p className="text-xs text-destructive">{errors.title.message}</p>
              )}
            </div>

            {/* Task type + Cadence — stack on mobile */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Task Type *</Label>
                <Select
                  onValueChange={(v) =>
                    setValue('task_type', v as FormData['task_type'], {
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.task_type && (
                  <p className="text-xs text-destructive">
                    {errors.task_type.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Cadence *</Label>
                <Select
                  onValueChange={(v) =>
                    setValue('cadence', v as FormData['cadence'], {
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CADENCE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.cadence && (
                  <p className="text-xs text-destructive">
                    {errors.cadence.message}
                  </p>
                )}
              </div>
            </div>

            {/* Priority + Days before due — stack on mobile */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select
                  defaultValue="medium"
                  onValueChange={(v) =>
                    setValue('default_priority', v as FormData['default_priority'], {
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger className="w-full">
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
                <Label htmlFor="rt-days">Days Before Due</Label>
                <Input
                  id="rt-days"
                  type="number"
                  min={1}
                  max={365}
                  {...register('days_before_due')}
                />
                {errors.days_before_due && (
                  <p className="text-xs text-destructive">
                    {errors.days_before_due.message}
                  </p>
                )}
              </div>
            </div>

            <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                className="min-h-[44px] w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="min-h-[44px] w-full sm:w-auto">
                {isSubmitting ? 'Saving...' : 'Create Template'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
