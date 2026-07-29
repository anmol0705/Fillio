'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ComplianceDeadline {
  id: string;
  title: string;
  description: string;
  category: 'gst' | 'tds' | 'income_tax' | 'roc' | 'advance_tax' | 'payroll' | 'other';
  due_date: string;
  applicable_to: string;
  period: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
}

interface Props {
  deadlines: ComplianceDeadline[];
  currentMonth: number;
  currentYear: number;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

type Category = ComplianceDeadline['category'] | 'all';

const CATEGORY_FILTERS: { value: Category; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'gst', label: 'GST' },
  { value: 'tds', label: 'TDS' },
  { value: 'income_tax', label: 'Income Tax' },
  { value: 'roc', label: 'ROC' },
  { value: 'advance_tax', label: 'Advance Tax' },
  { value: 'payroll', label: 'Payroll' },
];

const CATEGORY_STYLES: Record<
  ComplianceDeadline['category'],
  { border: string; bg: string; badge: string }
> = {
  gst: {
    border: 'border-l-blue-500',
    bg: 'bg-blue-50',
    badge: 'bg-blue-100 text-blue-700',
  },
  tds: {
    border: 'border-l-green-500',
    bg: 'bg-green-50',
    badge: 'bg-green-100 text-green-700',
  },
  income_tax: {
    border: 'border-l-purple-500',
    bg: 'bg-purple-50',
    badge: 'bg-purple-100 text-purple-700',
  },
  roc: {
    border: 'border-l-orange-500',
    bg: 'bg-orange-50',
    badge: 'bg-orange-100 text-orange-700',
  },
  advance_tax: {
    border: 'border-l-red-500',
    bg: 'bg-red-50',
    badge: 'bg-red-100 text-red-700',
  },
  payroll: {
    border: 'border-l-gray-400',
    bg: 'bg-gray-50',
    badge: 'bg-gray-100 text-gray-700',
  },
  other: {
    border: 'border-l-slate-400',
    bg: 'bg-slate-50',
    badge: 'bg-slate-100 text-slate-700',
  },
};

const CATEGORY_LABELS: Record<ComplianceDeadline['category'], string> = {
  gst: 'GST',
  tds: 'TDS',
  income_tax: 'Income Tax',
  roc: 'ROC',
  advance_tax: 'Advance Tax',
  payroll: 'Payroll',
  other: 'Other',
};

const PRIORITY_STYLES: Record<
  ComplianceDeadline['priority'],
  string
> = {
  urgent: 'bg-red-100 text-red-700 border border-red-200',
  high: 'bg-orange-100 text-orange-700 border border-orange-200',
  medium: 'bg-amber-100 text-amber-700 border border-amber-200',
  low: 'bg-gray-100 text-gray-600 border border-gray-200',
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDueDate(dateStr: string): string {
  const [year, monthStr, dayStr] = dateStr.split('-');
  if (!year || !monthStr || !dayStr) return dateStr;
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  const monthName = MONTH_NAMES[month - 1] ?? '';
  const shortMonth = monthName.slice(0, 3);
  return `${shortMonth} ${day}, ${year}`;
}

function getDaysRemaining(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
}

function getDaysRemainingChip(daysLeft: number): { label: string; className: string } {
  if (daysLeft < 0) {
    return {
      label: `${Math.abs(daysLeft)}d overdue`,
      className: 'bg-red-100 text-red-700 border border-red-200',
    };
  }
  if (daysLeft === 0) {
    return {
      label: 'Due today',
      className: 'bg-red-100 text-red-700 border border-red-200',
    };
  }
  if (daysLeft <= 7) {
    return {
      label: `${daysLeft}d left`,
      className: 'bg-red-100 text-red-700 border border-red-200',
    };
  }
  if (daysLeft <= 30) {
    return {
      label: `${daysLeft}d left`,
      className: 'bg-amber-100 text-amber-700 border border-amber-200',
    };
  }
  return {
    label: `${daysLeft}d left`,
    className: 'bg-green-100 text-green-700 border border-green-200',
  };
}

function navigateMonth(
  year: number,
  month: number,
  direction: -1 | 1,
): { year: number; month: number } {
  const total = month - 1 + direction;
  const newYear = year + Math.floor(total / 12);
  const newMonth = ((total % 12) + 12) % 12 + 1;
  return { year: newYear, month: newMonth };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ComplianceCalendar({
  deadlines,
  currentMonth,
  currentYear,
}: Props) {
  const [activeFilter, setActiveFilter] = useState<Category>('all');
  const [viewMonth, setViewMonth] = useState(currentMonth);
  const [viewYear, setViewYear] = useState(currentYear);

  // Filter deadlines for the viewed month
  const monthStr = `${viewYear}-${String(viewMonth).padStart(2, '0')}`;
  const monthDeadlines = deadlines.filter((d) => d.due_date.startsWith(monthStr));

  // Apply category filter
  const filtered =
    activeFilter === 'all'
      ? monthDeadlines
      : monthDeadlines.filter((d) => d.category === activeFilter);

  // Sort by due_date ascending
  const sorted = [...filtered].sort((a, b) => a.due_date.localeCompare(b.due_date));

  function handlePrev() {
    const { year, month } = navigateMonth(viewYear, viewMonth, -1);
    setViewYear(year);
    setViewMonth(month);
  }

  function handleNext() {
    const { year, month } = navigateMonth(viewYear, viewMonth, 1);
    setViewYear(year);
    setViewMonth(month);
  }

  return (
    <div className="space-y-5">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handlePrev}
          className="flex items-center justify-center w-11 h-11 rounded-md border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          aria-label="Previous month"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <h2 className="text-base font-semibold text-foreground">
          {MONTH_NAMES[viewMonth - 1]} {viewYear}
        </h2>

        <button
          type="button"
          onClick={handleNext}
          className="flex items-center justify-center w-11 h-11 rounded-md border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          aria-label="Next month"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
        {CATEGORY_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setActiveFilter(filter.value)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium transition-colors border',
              activeFilter === filter.value
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground',
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Deadline count for filtered view */}
      {sorted.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {sorted.length} deadline{sorted.length !== 1 ? 's' : ''}
          {activeFilter !== 'all' ? ` in ${CATEGORY_LABELS[activeFilter as ComplianceDeadline['category']]}` : ''}
        </p>
      )}

      {/* Deadline cards */}
      {sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            No compliance deadlines for this period
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {activeFilter !== 'all'
              ? `No ${CATEGORY_LABELS[activeFilter as ComplianceDeadline['category']]} deadlines in ${MONTH_NAMES[viewMonth - 1]} ${viewYear}.`
              : `No statutory deadlines fall in ${MONTH_NAMES[viewMonth - 1]} ${viewYear}.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((deadline) => {
            const styles = CATEGORY_STYLES[deadline.category];
            const daysLeft = getDaysRemaining(deadline.due_date);
            const chip = getDaysRemainingChip(daysLeft);

            return (
              <div
                key={deadline.id}
                className={cn(
                  'rounded-lg border border-border border-l-4 p-4',
                  styles.bg,
                  styles.border,
                )}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Category badge */}
                  <span
                    className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium shrink-0',
                      styles.badge,
                    )}
                  >
                    {CATEGORY_LABELS[deadline.category]}
                  </span>

                  {/* Priority badge */}
                  <span
                    className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize shrink-0',
                      PRIORITY_STYLES[deadline.priority],
                    )}
                  >
                    {deadline.priority}
                  </span>

                  {/* Days remaining chip — pushed right on larger screens */}
                  <span
                    className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium shrink-0 sm:ml-auto',
                      chip.className,
                    )}
                  >
                    {chip.label}
                  </span>
                </div>

                <div className="mt-2.5">
                  <h3 className="text-sm font-semibold text-foreground leading-snug">
                    {deadline.title}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                    {deadline.description}
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    <span className="font-medium text-foreground">Due:</span>{' '}
                    {formatDueDate(deadline.due_date)}
                  </span>
                  <span>
                    <span className="font-medium text-foreground">Period:</span>{' '}
                    {deadline.period}
                  </span>
                  <span>
                    <span className="font-medium text-foreground">Applies to:</span>{' '}
                    {deadline.applicable_to}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
