'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addReporting, removeReporting } from '@/actions/hierarchy';
import type { ReportingStructure } from '@/actions/hierarchy';

interface Props {
  data: ReportingStructure;
}

export function ReportingManager({ data }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const { profiles, roles, relationships } = data;

  // Quick lookups
  const roleMap = new Map(roles.map((r) => [r.id, r]));

  // For each person, who are their current managers?
  const managersOf = new Map<string, string[]>();
  for (const rel of relationships) {
    const existing = managersOf.get(rel.report_id) ?? [];
    managersOf.set(rel.report_id, [...existing, rel.manager_id]);
  }

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function handleAdd(reportId: string, managerId: string) {
    setError(null);
    const result = await addReporting({ reportId, managerId });
    if ('error' in result) setError(result.error);
    else refresh();
  }

  async function handleRemove(reportId: string, managerId: string) {
    setError(null);
    const result = await removeReporting({ reportId, managerId });
    if ('error' in result) setError(result.error);
    else refresh();
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
        {profiles.map((person) => {
          const currentManagerIds = managersOf.get(person.id) ?? [];
          const currentManagers = currentManagerIds
            .map((id) => profiles.find((p) => p.id === id))
            .filter(Boolean) as typeof profiles;

          // Dropdown options: everyone except self and already-assigned managers
          const available = profiles.filter(
            (p) => p.id !== person.id && !currentManagerIds.includes(p.id),
          );

          const role = person.role_id ? roleMap.get(person.role_id) : null;

          return (
            <div key={person.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              {/* Person info */}
              <div className="w-48 shrink-0">
                <div className="flex items-center gap-1.5">
                  {role && (
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: role.colour }}
                    />
                  )}
                  <p className="text-sm font-medium text-foreground truncate">
                    {person.full_name}
                  </p>
                </div>
                {role && (
                  <p className="text-xs text-muted-foreground mt-0.5 pl-3.5">{role.name}</p>
                )}
              </div>

              {/* Reports to */}
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <span className="text-xs text-muted-foreground shrink-0">Reports to:</span>

                {currentManagers.length === 0 && (
                  <span className="text-xs text-muted-foreground italic">nobody (top level)</span>
                )}

                {currentManagers.map((mgr) => (
                  <span
                    key={mgr.id}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground"
                  >
                    {mgr.full_name}
                    <button
                      onClick={() => handleRemove(person.id, mgr.id)}
                      disabled={isPending}
                      className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50 ml-0.5 leading-none"
                      title={`Remove ${mgr.full_name} as manager`}
                    >
                      ×
                    </button>
                  </span>
                ))}

                {/* Add manager dropdown */}
                {available.length > 0 && (
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAdd(person.id, e.target.value);
                        e.target.value = '';
                      }
                    }}
                    disabled={isPending}
                    className="rounded border border-dashed border-border bg-transparent px-2 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 cursor-pointer"
                  >
                    <option value="" disabled>+ Add manager</option>
                    {available.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
