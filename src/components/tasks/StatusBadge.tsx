import { Badge } from '@/components/ui/badge';
import type { Task } from '@/types';

const STATUS_CONFIG: Record<Task['status'], { label: string; className: string }> = {
  not_started: { label: 'Not Started', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  in_progress: { label: 'In Progress', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  under_review: { label: 'Under Review', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  changes_requested: {
    label: 'Changes Requested',
    className: 'bg-orange-100 text-orange-700 border-orange-200',
  },
  approved: { label: 'Approved', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  filed: { label: 'Filed', className: 'bg-violet-100 text-violet-700 border-violet-200' },
  completed: { label: 'Completed', className: 'bg-green-100 text-green-700 border-green-200' },
};

export function StatusBadge({ status }: { status: Task['status'] }) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}
