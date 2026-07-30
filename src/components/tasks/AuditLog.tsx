import type { TaskDetail } from '@/types';

type Entry = TaskDetail['audit_log'][number];

const ACTION_LABELS: Record<Entry['action'], string> = {
  created:        'Task created',
  status_changed: 'Status updated',
  reassigned:     'Reassigned',
  access_granted: 'Access granted',
  edited:         'Task edited',
  comment_added:  'Comment added',
};

function formatPayload(entry: Entry): string {
  if (!entry.payload) return '';
  const p = entry.payload as Record<string, unknown>;

  if (entry.action === 'status_changed') {
    return `${String(p.from ?? '').replace(/_/g, ' ')} → ${String(p.to ?? '').replace(/_/g, ' ')}`;
  }
  if (entry.action === 'access_granted') {
    return `${String(p.to ?? '')} — ${String(p.level ?? '')}`;
  }
  if (entry.action === 'reassigned') {
    if (p.via === 'pool_claim') return 'Claimed from pool';
    return `Assignee changed`;
  }
  return '';
}

export function AuditLog({ entries }: { entries: TaskDetail['audit_log'] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }

  return (
    <ol className="relative border-l border-border pl-4 space-y-4">
      {entries.map((entry) => {
        const detail = formatPayload(entry);
        return (
          <li key={entry.id} className="relative">
            <span className="absolute -left-[1.375rem] top-1 h-3 w-3 rounded-full bg-primary/20 border-2 border-primary" />
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{ACTION_LABELS[entry.action]}</p>
                {detail && <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>}
                <p className="text-xs text-muted-foreground mt-0.5">by {entry.actor.full_name}</p>
              </div>
              <time className="text-xs text-muted-foreground whitespace-nowrap">
                {new Date(entry.created_at).toLocaleDateString('en-IN', {
                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
