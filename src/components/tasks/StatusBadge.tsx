import type { TaskStatus } from '@/types';

const STATUS_STYLES: Record<TaskStatus, string> = {
  not_started:       'bg-slate-100 text-slate-600',
  in_progress:       'bg-blue-100 text-blue-700',
  under_review:      'bg-amber-100 text-amber-700',
  changes_requested: 'bg-orange-100 text-orange-700',
  approved:          'bg-emerald-100 text-emerald-700',
  filed:             'bg-indigo-100 text-indigo-700',
  completed:         'bg-green-100 text-green-700',
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started:       'Not Started',
  in_progress:       'In Progress',
  under_review:      'Under Review',
  changes_requested: 'Changes Requested',
  approved:          'Approved',
  filed:             'Filed',
  completed:         'Completed',
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
