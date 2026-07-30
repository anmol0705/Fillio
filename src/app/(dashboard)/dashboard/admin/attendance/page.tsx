import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/auth/getUser';
import { db } from '@/db';
import {
  getAttendanceForDate,
  getMonthlyAttendanceSummary,
} from '@/actions/attendance';
import { AttendanceSheet } from '@/components/attendance/AttendanceSheet';
import { MonthlySummary } from '@/components/attendance/MonthlySummary';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateInput(date: string): string {
  // Takes 'YYYY-MM-DD', returns same — just validates format
  const match = /^\d{4}-\d{2}-\d{2}$/.exec(date);
  return match ? date : new Date().toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    view?: string;
    month?: string;
    year?: string;
  }>;
}) {
  // Auth check
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const profile = await db.query.profiles.findFirst({
    where: (p, { eq }) => eq(p.id, user.id),
    columns: { is_org_admin: true, can_mark_attendance: true },
  });

  if (!profile?.is_org_admin && !profile?.can_mark_attendance) redirect('/dashboard');

  // Parse search params
  const params = await searchParams;
  const today = new Date().toISOString().split('T')[0];
  const view = params.view === 'monthly' ? 'monthly' : 'daily';
  const date = params.date ? formatDateInput(params.date) : today;

  const now = new Date();
  const month = params.month
    ? Math.min(12, Math.max(1, parseInt(params.month, 10)))
    : now.getMonth() + 1;
  const year = params.year
    ? Math.max(2020, Math.min(2100, parseInt(params.year, 10)))
    : now.getFullYear();

  // Fetch data
  const [dailyResult, monthlyResult] = await Promise.all([
    view === 'daily' ? getAttendanceForDate(date) : Promise.resolve(null),
    view === 'monthly'
      ? getMonthlyAttendanceSummary(year, month)
      : Promise.resolve(null),
  ]);

  // Build base URLs for tab switching and controls
  const dailyTabHref = `/dashboard/admin/attendance?view=daily&date=${date}`;
  const monthlyTabHref = `/dashboard/admin/attendance?view=monthly&month=${month}&year=${year}`;

  // ---------------------------------------------------------------------------
  // Render daily view
  // ---------------------------------------------------------------------------

  function renderDailyView() {
    if (!dailyResult) return null;

    if ('error' in dailyResult) {
      return (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <p className="text-sm text-destructive font-medium">Failed to load attendance</p>
          <p className="text-xs text-muted-foreground mt-0.5">{dailyResult.error}</p>
        </div>
      );
    }

    // Transform AttendanceForDateRow[] → StaffRow[] for AttendanceSheet
    const staffRows = dailyResult.data.map((row) => ({
      profile: {
        id: row.profile.id,
        full_name: row.profile.full_name,
        role: null,
      },
      record: row.record
        ? {
            status: row.record.status as
              | 'present'
              | 'absent'
              | 'half_day'
              | 'leave',
            note: row.record.note,
          }
        : null,
    }));

    return (
      <div className="space-y-4">
        {/* Date picker */}
        <form method="GET" action="/dashboard/admin/attendance" className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="view" value="daily" />
          <label htmlFor="date-picker" className="text-sm font-medium text-foreground shrink-0">
            Date
          </label>
          <input
            id="date-picker"
            type="date"
            name="date"
            defaultValue={date}
            max={today}
            className="rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
          />
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px]"
          >
            Go
          </button>
        </form>

        <AttendanceSheet date={date} staffRows={staffRows} />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render monthly view
  // ---------------------------------------------------------------------------

  function renderMonthlyView() {
    if (!monthlyResult) return null;

    if ('error' in monthlyResult) {
      return (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <p className="text-sm text-destructive font-medium">Failed to load summary</p>
          <p className="text-xs text-muted-foreground mt-0.5">{monthlyResult.error}</p>
        </div>
      );
    }

    // Transform MonthlySummaryRow[] for MonthlySummary component
    const summaryData = monthlyResult.data.map((row) => ({
      profile: {
        id: row.profile.id,
        full_name: row.profile.full_name,
        role: null,
      },
      present: row.present,
      absent: row.absent,
      half_day: row.half_day,
      leave: row.leave,
      total_days: row.total_days,
    }));

    const MONTHS = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];

    return (
      <div className="space-y-4">
        {/* Month/year selectors */}
        <form
          method="GET"
          action="/dashboard/admin/attendance"
          className="flex flex-wrap items-center gap-3"
        >
          <input type="hidden" name="view" value="monthly" />
          <div className="flex items-center gap-2">
            <label htmlFor="month-picker" className="text-sm font-medium text-foreground shrink-0">
              Month
            </label>
            <select
              id="month-picker"
              name="month"
              defaultValue={month}
              className="rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="year-picker" className="text-sm font-medium text-foreground shrink-0">
              Year
            </label>
            <select
              id="year-picker"
              name="year"
              defaultValue={year}
              className="rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
            >
              {[2024, 2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px]"
          >
            View
          </button>
        </form>

        <MonthlySummary data={summaryData} month={month} year={year} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">Attendance</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Mark daily attendance for your team
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit">
        <a
          href={dailyTabHref}
          className={`px-4 py-2.5 rounded-md text-sm font-medium transition-colors flex items-center min-h-[44px] ${
            view === 'daily'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Daily
        </a>
        <a
          href={monthlyTabHref}
          className={`px-4 py-2.5 rounded-md text-sm font-medium transition-colors flex items-center min-h-[44px] ${
            view === 'monthly'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Monthly Summary
        </a>
      </div>

      {/* Content */}
      <Suspense
        fallback={
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 border-t-foreground animate-spin" />
            Loading...
          </div>
        }
      >
        {view === 'daily' ? renderDailyView() : renderMonthlyView()}
      </Suspense>
    </div>
  );
}
