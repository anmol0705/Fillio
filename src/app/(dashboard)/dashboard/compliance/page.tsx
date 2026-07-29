import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/getUser';
import {
  getDeadlinesForMonth,
  getUpcomingDeadlines,
} from '@/lib/compliance/deadlines';
import { ComplianceCalendar } from '@/components/compliance/ComplianceCalendar';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDaysRemaining(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
}

function formatDueDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function CompliancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  // Auth — all authenticated users can access compliance calendar
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // Parse search params
  const params = await searchParams;
  const now = new Date();
  const month = params.month
    ? Math.min(12, Math.max(1, parseInt(params.month, 10)))
    : now.getMonth() + 1;
  const year = params.year
    ? Math.max(2020, Math.min(2100, parseInt(params.year, 10)))
    : now.getFullYear();

  // Fetch deadlines: current month + next month for context
  const currentMonthDeadlines = getDeadlinesForMonth(year, month);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonthDeadlines = getDeadlinesForMonth(nextMonthYear, nextMonth);

  // Combine for the calendar (it filters internally by viewed month)
  const allDeadlines = [...currentMonthDeadlines, ...nextMonthDeadlines];

  // Nearest upcoming deadline for the alert (within 30 days)
  const upcomingDeadlines = getUpcomingDeadlines(30);
  const nextDeadline = upcomingDeadlines[0] ?? null;

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Compliance Calendar</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            FY 2026-27 statutory deadlines for Indian CA firms
          </p>
        </div>

        {/* Deadlines this month count */}
        <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5">
          <span className="text-sm font-semibold text-primary">
            {currentMonthDeadlines.length}
          </span>
          <span className="text-xs text-muted-foreground">
            deadline{currentMonthDeadlines.length !== 1 ? 's' : ''} in{' '}
            {MONTH_NAMES[month - 1]}
          </span>
        </div>
      </div>

      {/* Next deadline alert */}
      {nextDeadline && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4 text-amber-600 shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            />
          </svg>
          <div>
            <p className="text-sm font-medium text-amber-900">
              Next:{' '}
              <span className="font-semibold">{nextDeadline.title}</span>{' '}
              due in{' '}
              <span className="font-semibold">
                {getDaysRemaining(nextDeadline.due_date)} day
                {getDaysRemaining(nextDeadline.due_date) !== 1 ? 's' : ''}
              </span>
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              {formatDueDateShort(nextDeadline.due_date)} — {nextDeadline.applicable_to}
            </p>
          </div>
        </div>
      )}

      {/* Calendar */}
      <Suspense
        fallback={
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 border-t-foreground animate-spin" />
            Loading deadlines...
          </div>
        }
      >
        <ComplianceCalendar
          deadlines={allDeadlines}
          currentMonth={month}
          currentYear={year}
        />
      </Suspense>
    </div>
  );
}
