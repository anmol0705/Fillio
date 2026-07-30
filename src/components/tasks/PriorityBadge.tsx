import type { TaskPriority } from '@/types';

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  urgent: 'bg-red-100 text-red-700',
  high:   'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low:    'bg-slate-100 text-slate-600',
};

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${PRIORITY_STYLES[priority]}`}>
      {priority}
    </span>
  );
}
