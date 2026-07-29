import { format } from 'date-fns';
import type { TaskAuditLog, Profile } from '@/types';

type AuditEntry = TaskAuditLog & { actor: Profile };

const ACTION_LABELS: Record<string, string> = {
  created: 'created this task',
  status_changed: 'changed status',
  reassigned: 'reassigned the task',
  comment_added: 'added a comment',
  file_uploaded: 'uploaded a file',
  access_granted: 'granted access',
};

interface Props {
  entries: AuditEntry[];
}

export function AuditLog({ entries }: Props) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <div key={entry.id} className="flex gap-3 text-sm">
          <div className="flex flex-col items-center">
            <div className="w-2 h-2 rounded-full bg-border mt-1.5 flex-shrink-0" />
            <div className="w-px flex-1 bg-border mt-1" />
          </div>
          <div className="pb-3 min-w-0">
            <p className="text-foreground">
              <span className="font-medium">{entry.actor.full_name}</span>{' '}
              {ACTION_LABELS[entry.action] ?? entry.action}
              {entry.new_value && entry.action === 'status_changed' && (
                <span className="text-muted-foreground">
                  {' '}&rarr;{' '}
                  <span className="font-medium">{entry.new_value.replace(/_/g, ' ')}</span>
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {format(new Date(entry.created_at), 'dd MMM yyyy, h:mm a')}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
