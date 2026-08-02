import Link from 'next/link';
import type { UpcomingDeadline } from '@/actions/dashboard';

interface Props {
  deadlines: UpcomingDeadline[];
  showAssignee?: boolean;
}

const TYPE_LABEL: Record<string, string> = {
  gst: 'GST', tds: 'TDS', income_tax: 'IT', audit: 'Audit',
  roc_mca: 'ROC', accounting: 'Acctg', payroll: 'Payroll',
  notice: 'Notice', advisory: 'Advisory', other: 'Other',
};

function urgencyClass(daysUntil: number) {
  if (daysUntil <= 3)  return 'text-red-600 font-semibold';
  if (daysUntil <= 7)  return 'text-amber-600 font-medium';
  return 'text-muted-foreground';
}

function daysLabel(daysUntil: number) {
  if (daysUntil === 0) return 'Today';
  if (daysUntil === 1) return 'Tomorrow';
  return `${daysUntil}d`;
}

function groupByWeek(deadlines: UpcomingDeadline[], now: Date) {
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const groups: { label: string; items: (UpcomingDeadline & { daysUntil: number })[] }[] = [
    { label: 'This week',  items: [] },
    { label: 'Next week',  items: [] },
    { label: 'Later',      items: [] },
  ];

  for (const d of deadlines) {
    const due  = new Date(d.due_at);
    const diff = Math.floor((due.getTime() - now.getTime()) / 86400000);
    const item = { ...d, daysUntil: Math.max(0, diff) };
    if (diff <= 7)       groups[0].items.push(item);
    else if (diff <= 14) groups[1].items.push(item);
    else                 groups[2].items.push(item);
  }

  return groups.filter(g => g.items.length > 0);
}

export function DeadlineList({ deadlines, showAssignee = false }: Props) {
  if (deadlines.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground rounded-lg border border-dashed">
        No upcoming deadlines in the next 60 days
      </div>
    );
  }

  const now    = new Date();
  const groups = groupByWeek(deadlines, now);

  return (
    <div className="space-y-5">
      {groups.map(group => (
        <div key={group.label}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {group.label}
          </p>
          <div className="divide-y rounded-lg border overflow-hidden">
            {group.items.map(task => (
              <Link
                key={task.id}
                href={`/dashboard/tasks/${task.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors"
              >
                {/* Type chip */}
                <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-muted text-muted-foreground tabular-nums">
                  {TYPE_LABEL[task.type] ?? task.type}
                </span>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{task.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {task.client?.name ?? '—'}
                    {showAssignee && task.assignee ? ` · ${task.assignee.full_name}` : ''}
                  </p>
                </div>

                <span className={`text-xs shrink-0 tabular-nums ${urgencyClass(task.daysUntil)}`}>
                  {daysLabel(task.daysUntil)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
