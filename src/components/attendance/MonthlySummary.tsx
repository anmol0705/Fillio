'use client';

interface SummaryRow {
  profile: {
    id: string;
    full_name: string;
    role: { name: string; color: string } | null;
  };
  present: number;
  absent: number;
  half_day: number;
  leave: number;
  total_days: number;
}

interface Props {
  data: SummaryRow[];
  month: number;
  year: number;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function MonthlySummary({ data, month, year }: Props) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
        <p className="text-sm font-medium text-muted-foreground">
          No attendance data for this month
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {MONTH_NAMES[month - 1]} {year} — start marking daily attendance to see the summary here.
        </p>
      </div>
    );
  }

  // Compute column totals
  const totals = data.reduce(
    (acc, row) => ({
      present: acc.present + row.present,
      absent: acc.absent + row.absent,
      half_day: acc.half_day + row.half_day,
      leave: acc.leave + row.leave,
      total_days: acc.total_days + row.total_days,
    }),
    { present: 0, absent: 0, half_day: 0, leave: 0, total_days: 0 },
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {MONTH_NAMES[month - 1]} {year} — {data.length} staff member{data.length !== 1 ? 's' : ''}
      </p>

      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                Staff
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide hidden sm:table-cell">
                Role
              </th>
              <th className="text-center px-3 py-3 font-medium text-green-700 text-xs uppercase tracking-wide">
                Present
              </th>
              <th className="text-center px-3 py-3 font-medium text-red-700 text-xs uppercase tracking-wide">
                Absent
              </th>
              <th className="text-center px-3 py-3 font-medium text-amber-700 text-xs uppercase tracking-wide">
                Half Day
              </th>
              <th className="text-center px-3 py-3 font-medium text-blue-700 text-xs uppercase tracking-wide">
                Leave
              </th>
              <th className="text-center px-3 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                Days Recorded
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border">
            {data.map((row) => (
              <tr key={row.profile.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {row.profile.role ? (
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: row.profile.role.color }}
                        aria-hidden="true"
                      />
                    ) : (
                      <span className="w-2 h-2 rounded-full shrink-0 bg-gray-300" aria-hidden="true" />
                    )}
                    <span className="font-medium text-foreground truncate max-w-[140px]">
                      {row.profile.full_name}
                    </span>
                  </div>
                </td>

                <td className="px-4 py-3 hidden sm:table-cell">
                  <span className="text-xs text-muted-foreground">
                    {row.profile.role?.name ?? '—'}
                  </span>
                </td>

                <td className="px-3 py-3 text-center">
                  <span className="inline-flex items-center justify-center w-9 h-7 rounded bg-green-100 text-green-700 text-xs font-semibold">
                    {row.present}
                  </span>
                </td>

                <td className="px-3 py-3 text-center">
                  <span className="inline-flex items-center justify-center w-9 h-7 rounded bg-red-100 text-red-700 text-xs font-semibold">
                    {row.absent}
                  </span>
                </td>

                <td className="px-3 py-3 text-center">
                  <span className="inline-flex items-center justify-center w-9 h-7 rounded bg-amber-100 text-amber-700 text-xs font-semibold">
                    {row.half_day}
                  </span>
                </td>

                <td className="px-3 py-3 text-center">
                  <span className="inline-flex items-center justify-center w-9 h-7 rounded bg-blue-100 text-blue-700 text-xs font-semibold">
                    {row.leave}
                  </span>
                </td>

                <td className="px-3 py-3 text-center">
                  <span className="text-sm text-muted-foreground font-medium">
                    {row.total_days}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>

          {/* Totals row */}
          <tfoot>
            <tr className="bg-muted/40 border-t-2 border-border">
              <td className="px-4 py-3 font-semibold text-foreground text-sm" colSpan={2}>
                Total
              </td>

              <td className="px-3 py-3 text-center">
                <span className="inline-flex items-center justify-center w-9 h-7 rounded bg-green-200 text-green-800 text-xs font-bold">
                  {totals.present}
                </span>
              </td>

              <td className="px-3 py-3 text-center">
                <span className="inline-flex items-center justify-center w-9 h-7 rounded bg-red-200 text-red-800 text-xs font-bold">
                  {totals.absent}
                </span>
              </td>

              <td className="px-3 py-3 text-center">
                <span className="inline-flex items-center justify-center w-9 h-7 rounded bg-amber-200 text-amber-800 text-xs font-bold">
                  {totals.half_day}
                </span>
              </td>

              <td className="px-3 py-3 text-center">
                <span className="inline-flex items-center justify-center w-9 h-7 rounded bg-blue-200 text-blue-800 text-xs font-bold">
                  {totals.leave}
                </span>
              </td>

              <td className="px-3 py-3 text-center">
                <span className="text-sm text-foreground font-semibold">
                  {totals.total_days}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
