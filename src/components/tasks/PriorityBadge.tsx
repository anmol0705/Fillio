import { Badge } from '@/components/ui/badge';
import type { Task } from '@/types';

const PRIORITY_CONFIG: Record<Task['priority'], { label: string; className: string }> = {
  urgent: { label: 'Urgent', className: 'bg-red-100 text-red-700 border-red-200' },
  high: { label: 'High', className: 'bg-orange-100 text-orange-700 border-orange-200' },
  medium: { label: 'Medium', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  low: { label: 'Low', className: 'bg-gray-100 text-gray-600 border-gray-200' },
};

export function PriorityBadge({ priority }: { priority: Task['priority'] }) {
  const config = PRIORITY_CONFIG[priority];
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}
