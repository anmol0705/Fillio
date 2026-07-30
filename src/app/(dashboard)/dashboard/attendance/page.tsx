import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/getUser';
import { getMyAttendance } from '@/actions/attendance';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const STATUS_STYLES = {
  present:  { label: 'Present',  cls: 'bg-emerald-100 text-emerald-700' },
  absent:   { label: 'Absent',   cls: 'bg-red-100 text-red-700' },
  half_day: { label: 'Half day', cls: 'bg-yellow-100 text-yellow-700' },
  leave:    { label: 'Leave',    cls: 'bg-blue-100 text-blue-700' },
};

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default async function MyAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const params = await searchParams;
  const now    = new Date();
  const month  = params.month
    ? Math.min(12, Math.max(1, parseInt(params.month, 10)))
    : now.getMonth() + 1;
  const year   = params.year
    ? Math.max(2020, Math.min(2100, parseInt(params.year, 10)))
    : now.getFullYear();

  const result = await getMyAttendance(year, month);

  // Previous / next month links
  const prevMonth  = month === 1  ? 12 : month - 1;
  const prevYear   = month === 1  ? year - 1 : year;
  const nextMonth  = month === 12 ? 1  : month + 1;
  const nextYear   = month === 12 ? year + 1 : year;
  const isThisMonth = month === now.getMonth() + 1 && year === now.getFullYear();

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">My Attendance</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Your attendance records marked by the manager.
        </p>
      </div>

      {/* Month navigation */}
      <div className="flex items-center gap-3">
        <a
          href={`/dashboard/attendance?month=${prevMonth}&year=${prevYear}`}
          className="rounded-md border px-3 py-2 text-sm hover:bg-accent transition-colors"
        >
          ‹
        </a>
        <span className="text-sm font-semibold min-w-[140px] text-center">
          {MONTHS[month - 1]} {year}
        </span>
        {!isThisMonth && (
          <a
            href={`/dashboard/attendance?month=${nextMonth}&year=${nextYear}`}
            className="rounded-md border px-3 py-2 text-sm hover:bg-accent transition-colors"
          >
            ›
          </a>
        )}
        {isThisMonth && <div className="w-[42px]" />}
      </div>

      {/* Error state */}
      {'error' in result && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <p className="text-sm text-destructive">{result.error}</p>
        </div>
      )}

      {'data' in result && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(
              [
                { key: 'present',  label: 'Present',  colour: 'text-emerald-600' },
                { key: 'absent',   label: 'Absent',   colour: 'text-red-600' },
                { key: 'half_day', label: 'Half day', colour: 'text-yellow-600' },
                { key: 'leave',    label: 'Leave',    colour: 'text-blue-600' },
              ] as const
            ).map(({ key, label, colour }) => (
              <div key={key} className="rounded-lg border bg-card px-4 py-3 text-center">
                <p className={`text-2xl font-bold tabular-nums ${colour}`}>
                  {result.data[key]}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Records list */}
          {result.data.records.length === 0 ? (
            <div className="rounded-lg border border-dashed px-6 py-12 text-center">
              <p className="text-sm font-medium">No records for {MONTHS[month - 1]} {year}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Your manager hasn't marked attendance for this month yet.
              </p>
            </div>
          ) : (
            <div className="divide-y rounded-lg border overflow-hidden">
              {result.data.records.map((r) => {
                const s = STATUS_STYLES[r.status];
                return (
                  <div key={r.date} className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm">{formatDate(r.date)}</span>
                    <div className="flex items-center gap-3">
                      {r.note && (
                        <span className="text-xs text-muted-foreground truncate max-w-[160px]">
                          {r.note}
                        </span>
                      )}
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${s.cls}`}>
                        {s.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {result.data.total_days} day{result.data.total_days !== 1 ? 's' : ''} recorded this month.
          </p>
        </>
      )}
    </div>
  );
}
