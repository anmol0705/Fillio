'use client';

import { useState, useTransition } from 'react';
import { cn } from '@/lib/utils';
import { markAttendance, bulkMarkAttendance } from '@/actions/attendance';
import { toast } from 'sonner';
import { Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AttendanceStatus = 'present' | 'absent' | 'half_day' | 'leave';

interface StaffRow {
  profile: {
    id: string;
    full_name: string;
    role: { name: string; color: string } | null;
  };
  record: {
    status: AttendanceStatus;
    note: string | null;
  } | null;
}

interface Props {
  date: string;
  staffRows: StaffRow[];
}

// ---------------------------------------------------------------------------
// Status button config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: {
  value: AttendanceStatus;
  label: string;
  inactive: string;
  active: string;
}[] = [
  {
    value: 'present',
    label: 'P',
    inactive: 'bg-green-100 text-green-700 border border-green-200 hover:bg-green-200',
    active: 'bg-green-600 text-white border border-green-600',
  },
  {
    value: 'absent',
    label: 'A',
    inactive: 'bg-red-100 text-red-700 border border-red-200 hover:bg-red-200',
    active: 'bg-red-600 text-white border border-red-600',
  },
  {
    value: 'half_day',
    label: 'H',
    inactive: 'bg-amber-100 text-amber-700 border border-amber-200 hover:bg-amber-200',
    active: 'bg-amber-600 text-white border border-amber-600',
  },
  {
    value: 'leave',
    label: 'L',
    inactive: 'bg-blue-100 text-blue-700 border border-blue-200 hover:bg-blue-200',
    active: 'bg-blue-600 text-white border border-blue-600',
  },
];

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  half_day: 'Half Day',
  leave: 'Leave',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AttendanceSheet({ date, staffRows }: Props) {
  const [isPending, startTransition] = useTransition();

  // Local status state — keyed by profile id
  const [statusMap, setStatusMap] = useState<Map<string, AttendanceStatus>>(
    () =>
      new Map(
        staffRows
          .filter((r) => r.record !== null)
          .map((r) => [r.profile.id, r.record!.status]),
      ),
  );

  // Per-row saving indicator
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  if (staffRows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
        <p className="text-sm font-medium text-muted-foreground">No active staff found</p>
        <p className="text-xs text-muted-foreground mt-1">
          Add staff members in the Users section to track attendance.
        </p>
      </div>
    );
  }

  function markSaving(id: string) {
    setSavingIds((prev) => new Set(prev).add(id));
    setSavedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function markSaved(id: string) {
    setSavingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setSavedIds((prev) => new Set(prev).add(id));
    // Remove saved indicator after 2s
    setTimeout(() => {
      setSavedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 2000);
  }

  function handleStatusClick(profileId: string, status: AttendanceStatus) {
    // Optimistic update
    setStatusMap((prev) => new Map(prev).set(profileId, status));
    markSaving(profileId);

    startTransition(async () => {
      const result = await markAttendance({ user_id: profileId, date, status });
      if ('error' in result) {
        // Revert optimistic update on error
        setStatusMap((prev) => {
          const next = new Map(prev);
          next.delete(profileId);
          return next;
        });
        setSavingIds((prev) => {
          const next = new Set(prev);
          next.delete(profileId);
          return next;
        });
        toast.error('Failed to save attendance', {
          description: result.error,
        });
      } else {
        markSaved(profileId);
      }
    });
  }

  function handleMarkAllPresent() {
    // Optimistic: set all to present
    const allPresent = new Map<string, AttendanceStatus>(
      staffRows.map((r) => [r.profile.id, 'present']),
    );
    setStatusMap(allPresent);

    const records = staffRows.map((r) => ({
      user_id: r.profile.id,
      status: 'present' as const,
    }));

    startTransition(async () => {
      const result = await bulkMarkAttendance({ date, records });
      if ('error' in result) {
        // Revert to original
        setStatusMap(
          new Map(
            staffRows
              .filter((r) => r.record !== null)
              .map((r) => [r.profile.id, r.record!.status]),
          ),
        );
        toast.error('Failed to mark all present', {
          description: result.error,
        });
      } else {
        toast.success('All staff marked present', {
          description: `${result.data} records updated for ${date}`,
        });
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Mark All Present */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {staffRows.length} staff member{staffRows.length !== 1 ? 's' : ''}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={handleMarkAllPresent}
          disabled={isPending}
          className="gap-2 min-h-[44px]"
        >
          {isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Check className="w-3.5 h-3.5 text-green-600" />
          )}
          Mark All Present
        </Button>
      </div>

      {/* Table — horizontally scrollable on mobile */}
      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                Staff Member
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide hidden sm:table-cell">
                Role
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                Status
              </th>
              <th className="w-8 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {staffRows.map((row) => {
              const currentStatus = statusMap.get(row.profile.id);
              const isSaving = savingIds.has(row.profile.id);
              const isSaved = savedIds.has(row.profile.id);

              return (
                <tr key={row.profile.id} className="hover:bg-muted/20 transition-colors">
                  {/* Staff name + role color dot */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {row.profile.role ? (
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: row.profile.role.color }}
                          aria-hidden="true"
                        />
                      ) : (
                        <span className="w-2 h-2 rounded-full shrink-0 bg-gray-300" aria-hidden="true" />
                      )}
                      <span className="font-medium text-foreground truncate max-w-[160px]">
                        {row.profile.full_name}
                      </span>
                    </div>
                  </td>

                  {/* Role name */}
                  <td className="px-4 py-3 hidden sm:table-cell">
                    {row.profile.role ? (
                      <span className="text-xs text-muted-foreground">
                        {row.profile.role.name}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">—</span>
                    )}
                  </td>

                  {/* Status toggle buttons */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1" role="group" aria-label="Attendance status">
                      {STATUS_CONFIG.map((cfg) => (
                        <button
                          key={cfg.value}
                          type="button"
                          title={STATUS_LABELS[cfg.value]}
                          aria-pressed={currentStatus === cfg.value}
                          disabled={isSaving}
                          onClick={() => handleStatusClick(row.profile.id, cfg.value)}
                          className={cn(
                            'w-8 h-8 rounded text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            currentStatus === cfg.value ? cfg.active : cfg.inactive,
                            isSaving && 'opacity-60 cursor-not-allowed',
                          )}
                        >
                          {cfg.label}
                        </button>
                      ))}
                    </div>
                  </td>

                  {/* Save indicator */}
                  <td className="px-4 py-3 w-8 text-center">
                    {isSaving && (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mx-auto" />
                    )}
                    {isSaved && (
                      <Check className="w-4 h-4 text-green-600 mx-auto" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
