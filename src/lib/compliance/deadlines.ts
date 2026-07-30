import 'server-only';

import type { Task } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TaskType = Task['type'];

export type ComplianceDeadline = {
  id: string;
  title: string;
  description: string;
  category: 'gst' | 'tds' | 'income_tax' | 'roc' | 'advance_tax' | 'payroll' | 'other';
  due_date: string;          // 'YYYY-MM-DD'
  applicable_to: string;
  period: string;
  task_type: TaskType;
  priority: 'urgent' | 'high' | 'medium' | 'low';
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Zero-pad a number to 2 digits. */
function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Format a date tuple as 'YYYY-MM-DD'. */
function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Return the full month name (e.g. 'April 2026'). */
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function monthName(month: number, year: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/**
 * Add N months to a (year, month) pair and return the result.
 * E.g. addMonths(2026, 4, 1) → { year: 2026, month: 5 }
 */
function addMonths(year: number, month: number, n: number): { year: number; month: number } {
  const total = month - 1 + n;
  return {
    year: year + Math.floor(total / 12),
    month: (total % 12) + 1,
  };
}

// ---------------------------------------------------------------------------
// Indian Financial Year helpers
// ---------------------------------------------------------------------------

/** Returns the year in which the current Indian FY starts (April 1). */
function getIndianFYStartYear(date: Date): number {
  // Indian FY: April 1 to March 31
  // If current month is Jan/Feb/Mar, FY started previous year
  return date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
}

/** Returns an ordered array of { year, month } for the current Indian FY (Apr … Mar). */
function getCurrentFYMonths(): Array<{ year: number; month: number }> {
  const fyStart = getIndianFYStartYear(new Date());
  const months: Array<{ year: number; month: number }> = [];
  for (let m = 4; m <= 12; m++) months.push({ year: fyStart, month: m });
  for (let m = 1; m <= 3; m++) months.push({ year: fyStart + 1, month: m });
  return months;
}

// ---------------------------------------------------------------------------
// Current FY Deadline Generation (dynamic — recalculates each deploy/build)
// ---------------------------------------------------------------------------

const FY_MONTHS = getCurrentFYMonths();
/** Start year of the current Indian FY (e.g. 2026 for FY 2026-27). */
const fyStart = getIndianFYStartYear(new Date());

// ---- Build deadline array --------------------------------------------------

const deadlines: ComplianceDeadline[] = [];

// ---------------------------------------------------------------------------
// GST — Monthly GSTR-1 (11th of following month)
// ---------------------------------------------------------------------------
for (const { year, month } of FY_MONTHS) {
  const filing = addMonths(year, month, 1);
  deadlines.push({
    id: `gstr1-${monthName(month, year).toLowerCase().replace(' ', '-')}`,
    title: `GSTR-1 Filing — ${monthName(month, year)}`,
    description:
      `File GSTR-1 (outward supplies) for ${monthName(month, year)}. ` +
      'Report all B2B and B2C sales invoices for the month.',
    category: 'gst',
    due_date: ymd(filing.year, filing.month, 11),
    applicable_to: 'All GST registered businesses (monthly filers)',
    period: monthName(month, year),
    task_type: 'gst',
    priority: 'high',
  });
}

// ---------------------------------------------------------------------------
// GST — Monthly GSTR-3B (20th of following month)
// ---------------------------------------------------------------------------
for (const { year, month } of FY_MONTHS) {
  const filing = addMonths(year, month, 1);
  deadlines.push({
    id: `gstr3b-${monthName(month, year).toLowerCase().replace(' ', '-')}`,
    title: `GSTR-3B Filing — ${monthName(month, year)}`,
    description:
      `File GSTR-3B (summary return) and pay GST liability for ${monthName(month, year)}. ` +
      'Includes ITC reconciliation and net tax payment.',
    category: 'gst',
    due_date: ymd(filing.year, filing.month, 20),
    applicable_to: 'All GST registered businesses (monthly filers)',
    period: monthName(month, year),
    task_type: 'gst',
    priority: 'urgent',
  });
}

// ---------------------------------------------------------------------------
// GST — GSTR-2B Reconciliation (advisory, 14th of following month)
// ---------------------------------------------------------------------------
for (const { year, month } of FY_MONTHS) {
  const filing = addMonths(year, month, 1);
  deadlines.push({
    id: `gstr2b-recon-${monthName(month, year).toLowerCase().replace(' ', '-')}`,
    title: `GSTR-2B Reconciliation — ${monthName(month, year)}`,
    description:
      `Reconcile purchase register with GSTR-2B auto-drafted ITC statement for ${monthName(month, year)}. ` +
      'Advisory deadline — not a statutory filing. Ensures correct ITC claim in GSTR-3B.',
    category: 'gst',
    due_date: ymd(filing.year, filing.month, 14),
    applicable_to: 'All GST registered businesses claiming ITC',
    period: monthName(month, year),
    task_type: 'gst',
    priority: 'medium',
  });
}

// ---------------------------------------------------------------------------
// GST — GSTR-9 Annual Return (Sept 30 of the year after FY start)
// ---------------------------------------------------------------------------
deadlines.push({
  id: `gstr9-fy${fyStart}${(fyStart + 1).toString().slice(-2)}`,
  title: `GSTR-9 Annual Return — FY ${fyStart}-${(fyStart + 1).toString().slice(-2)}`,
  description:
    `File GSTR-9 annual return summarising all monthly/quarterly returns filed during FY ${fyStart}-${(fyStart + 1).toString().slice(-2)}. ` +
    'Reconcile with books of accounts.',
  category: 'gst',
  due_date: `${fyStart + 1}-09-30`,
  applicable_to: 'GST registered taxpayers with aggregate turnover above threshold',
  period: `FY ${fyStart}-${(fyStart + 1).toString().slice(-2)}`,
  task_type: 'gst',
  priority: 'high',
});

// ---------------------------------------------------------------------------
// TDS — Monthly deposit (7th of following month; March → April 30)
// ---------------------------------------------------------------------------
for (const { year, month } of FY_MONTHS) {
  const isMarch = month === 3; // last month of FY, special deposit deadline
  const filing = isMarch
    ? { year, month: 4, day: 30 }  // April 30 of year containing March
    : { ...addMonths(year, month, 1), day: 7 };

  deadlines.push({
    id: `tds-deposit-${monthName(month, year).toLowerCase().replace(' ', '-')}`,
    title: `TDS Deposit — ${monthName(month, year)}`,
    description:
      `Deposit TDS deducted during ${monthName(month, year)} with the government. ` +
      `Due by ${isMarch ? `30 April ${year}` : `7th of the following month`}. Applicable to non-government deductors.`,
    category: 'tds',
    due_date: ymd(filing.year, filing.month, filing.day),
    applicable_to: 'All TDS deductors (non-government)',
    period: monthName(month, year),
    task_type: 'tds',
    priority: 'urgent',
  });
}

// ---------------------------------------------------------------------------
// TDS — Quarterly returns
// ---------------------------------------------------------------------------
const fyTag = `fy${fyStart}${(fyStart + 1).toString().slice(-2)}`;
const fyLabel = `FY ${fyStart}-${(fyStart + 1).toString().slice(-2)}`;

const TDS_QUARTERLY_RETURNS: Array<{
  id: string;
  period: string;
  description: string;
  due_date: string;
}> = [
  {
    id: `tds-return-q1-${fyTag}`,
    period: `Q1 (April – June ${fyStart})`,
    description:
      `File TDS quarterly return (Form 24Q/26Q/27Q) for Q1 ${fyLabel} (April to June ${fyStart}). ` +
      'Includes all TDS deductions and challans for the quarter.',
    due_date: `${fyStart}-07-31`,
  },
  {
    id: `tds-return-q2-${fyTag}`,
    period: `Q2 (July – September ${fyStart})`,
    description:
      `File TDS quarterly return for Q2 ${fyLabel} (July to September ${fyStart}).`,
    due_date: `${fyStart}-10-31`,
  },
  {
    id: `tds-return-q3-${fyTag}`,
    period: `Q3 (October – December ${fyStart})`,
    description:
      `File TDS quarterly return for Q3 ${fyLabel} (October to December ${fyStart}).`,
    due_date: `${fyStart + 1}-01-31`,
  },
  {
    id: `tds-return-q4-${fyTag}`,
    period: `Q4 (January – March ${fyStart + 1})`,
    description:
      `File TDS quarterly return for Q4 ${fyLabel} (January to March ${fyStart + 1}).`,
    due_date: `${fyStart + 1}-05-31`,
  },
];

for (const qr of TDS_QUARTERLY_RETURNS) {
  deadlines.push({
    id: qr.id,
    title: `TDS Quarterly Return — ${qr.period}`,
    description: qr.description,
    category: 'tds',
    due_date: qr.due_date,
    applicable_to: 'All TDS deductors',
    period: qr.period,
    task_type: 'tds',
    priority: 'high',
  });
}

// ---------------------------------------------------------------------------
// TDS — Form 16 issue (June 15 of year after FY start)
// ---------------------------------------------------------------------------
deadlines.push({
  id: `tds-form16-${fyTag}`,
  title: `Form 16 Issue to Employees — ${fyLabel}`,
  description:
    `Issue Form 16 (TDS certificate for salary) to all employees for ${fyLabel}. ` +
    'Must be issued within 15 days of due date of filing Q4 TDS return.',
  category: 'tds',
  due_date: `${fyStart + 1}-06-15`,
  applicable_to: 'All employers who deduct TDS on salary',
  period: fyLabel,
  task_type: 'tds',
  priority: 'high',
});

// ---------------------------------------------------------------------------
// Advance Tax — FY 2026-27 installments
// ---------------------------------------------------------------------------
const ADVANCE_TAX_INSTALLMENTS: Array<{
  id: string;
  title: string;
  description: string;
  due_date: string;
  priority: ComplianceDeadline['priority'];
}> = [
  {
    id: `advance-tax-1st-${fyTag}`,
    title: 'Advance Tax — 1st Installment (15%)',
    description:
      `Pay 1st installment of advance tax (at least 15% of estimated annual tax liability) for ${fyLabel}.`,
    due_date: `${fyStart}-06-15`,
    priority: 'high',
  },
  {
    id: `advance-tax-2nd-${fyTag}`,
    title: 'Advance Tax — 2nd Installment (45%)',
    description:
      `Pay 2nd installment of advance tax (cumulative 45% of estimated annual tax liability) for ${fyLabel}.`,
    due_date: `${fyStart}-09-15`,
    priority: 'high',
  },
  {
    id: `advance-tax-3rd-${fyTag}`,
    title: 'Advance Tax — 3rd Installment (75%)',
    description:
      `Pay 3rd installment of advance tax (cumulative 75% of estimated annual tax liability) for ${fyLabel}.`,
    due_date: `${fyStart}-12-15`,
    priority: 'urgent',
  },
  {
    id: `advance-tax-4th-${fyTag}`,
    title: 'Advance Tax — 4th Installment (100%)',
    description:
      `Pay 4th and final installment of advance tax (100% of estimated annual tax liability) for ${fyLabel}.`,
    due_date: `${fyStart + 1}-03-15`,
    priority: 'urgent',
  },
];

for (const at of ADVANCE_TAX_INSTALLMENTS) {
  deadlines.push({
    id: at.id,
    title: at.title,
    description: at.description,
    category: 'advance_tax',
    due_date: at.due_date,
    applicable_to: 'All assessees with estimated tax liability above ₹10,000 (excluding 44AD/44ADA)',
    period: fyLabel,
    task_type: 'income_tax',
    priority: at.priority,
  });
}

// ---------------------------------------------------------------------------
// Income Tax — Key deadlines FY 2026-27
// ---------------------------------------------------------------------------
const INCOME_TAX_DEADLINES: Array<{
  id: string;
  title: string;
  description: string;
  due_date: string;
  applicable_to: string;
  priority: ComplianceDeadline['priority'];
}> = [
  {
    id: `itr-individuals-non-audit-${fyTag}`,
    title: 'ITR Filing — Individuals (Non-Audit Cases)',
    description:
      `File Income Tax Return for individuals and HUFs not subject to tax audit for ${fyLabel} (AY ${fyStart + 1}-${(fyStart + 2).toString().slice(-2)}).`,
    due_date: `${fyStart}-07-31`,
    applicable_to: 'Individuals, HUFs not liable for tax audit',
    priority: 'urgent',
  },
  {
    id: `tax-audit-report-${fyTag}`,
    title: 'Tax Audit Report (Form 3CA/3CB/3CD)',
    description:
      `Upload Tax Audit Report for taxpayers liable to tax audit under Section 44AB for ${fyLabel}.`,
    due_date: `${fyStart}-09-30`,
    applicable_to: 'Businesses/professionals with turnover above audit threshold',
    priority: 'urgent',
  },
  {
    id: `itr-audit-cases-${fyTag}`,
    title: 'ITR Filing — Audit Cases',
    description:
      `File Income Tax Return for individuals, firms, and other non-corporate taxpayers liable to audit for ${fyLabel}.`,
    due_date: `${fyStart}-10-31`,
    applicable_to: 'Taxpayers liable for tax audit (non-corporate)',
    priority: 'urgent',
  },
  {
    id: `itr-companies-${fyTag}`,
    title: 'ITR Filing — Companies',
    description:
      `File Income Tax Return for domestic and foreign companies for ${fyLabel} (AY ${fyStart + 1}-${(fyStart + 2).toString().slice(-2)}).`,
    due_date: `${fyStart}-11-30`,
    applicable_to: 'All companies (domestic and foreign)',
    priority: 'urgent',
  },
  {
    id: `itr-revised-belated-${fyTag}`,
    title: 'Revised / Belated ITR Deadline',
    description:
      `Last date to file revised return (correcting errors) or belated return (if original missed) for ${fyLabel}.`,
    due_date: `${fyStart}-12-31`,
    applicable_to: `All assessees who filed or need to file ITR for ${fyLabel}`,
    priority: 'high',
  },
];

for (const it of INCOME_TAX_DEADLINES) {
  deadlines.push({
    id: it.id,
    title: it.title,
    description: it.description,
    category: 'income_tax',
    due_date: it.due_date,
    applicable_to: it.applicable_to,
    period: fyLabel,
    task_type: 'income_tax',
    priority: it.priority,
  });
}

// ---------------------------------------------------------------------------
// ROC / MCA Deadlines
// ---------------------------------------------------------------------------
const ROC_DEADLINES: Array<{
  id: string;
  title: string;
  description: string;
  due_date: string;
  applicable_to: string;
  priority: ComplianceDeadline['priority'];
}> = [
  {
    id: `form11-llp-${fyTag}`,
    title: 'Form 11 — LLP Annual Return',
    description:
      `File Form 11 (Annual Return of LLP) for ${fyLabel} with the Registrar of Companies. ` +
      'Contains details of partners and changes during the year.',
    due_date: `${fyStart}-05-30`,
    applicable_to: 'All Limited Liability Partnerships (LLPs)',
    priority: 'high',
  },
  {
    id: `dir3-kyc-${fyStart}`,
    title: 'DIR-3 KYC — Director KYC',
    description:
      'Complete annual KYC filing for all directors holding DIN (Director Identification Number). ' +
      'Non-compliance results in deactivation of DIN.',
    due_date: `${fyStart}-09-30`,
    applicable_to: 'All individuals holding a DIN',
    priority: 'high',
  },
  {
    id: `aoc4-${fyTag}`,
    title: 'AOC-4 — Annual Accounts Filing',
    description:
      `File AOC-4 (Financial Statements) with the Registrar of Companies. ` +
      `Due within 30 days of AGM (assuming AGM in September ${fyStart}).`,
    due_date: `${fyStart}-10-29`,
    applicable_to: 'All private and public limited companies',
    priority: 'high',
  },
  {
    id: `form8-llp-${fyTag}`,
    title: 'Form 8 — LLP Statement of Accounts',
    description:
      `File Form 8 (Statement of Accounts and Solvency) for ${fyLabel} with the Registrar of Companies.`,
    due_date: `${fyStart}-10-30`,
    applicable_to: 'All Limited Liability Partnerships (LLPs)',
    priority: 'high',
  },
  {
    id: `mgt7-${fyTag}`,
    title: 'MGT-7 / MGT-7A — Annual Return',
    description:
      'File MGT-7 (Annual Return) for companies with paid-up capital ≥ ₹10 crore, or MGT-7A for small companies. ' +
      'Due within 60 days of AGM.',
    due_date: `${fyStart}-11-28`,
    applicable_to: 'All private and public limited companies',
    priority: 'high',
  },
];

for (const roc of ROC_DEADLINES) {
  deadlines.push({
    id: roc.id,
    title: roc.title,
    description: roc.description,
    category: 'roc',
    due_date: roc.due_date,
    applicable_to: roc.applicable_to,
    period: fyLabel,
    task_type: 'roc_mca',
    priority: roc.priority,
  });
}

// ---------------------------------------------------------------------------
// Payroll / PF / ESI — Monthly (15th and 25th of every month)
// ---------------------------------------------------------------------------
for (const { year, month } of FY_MONTHS) {
  const periodLabel = monthName(month, year);
  const idSuffix = periodLabel.toLowerCase().replace(' ', '-');

  // PF deposit — 15th of same month (for the previous month's wages)
  deadlines.push({
    id: `pf-deposit-${idSuffix}`,
    title: `PF Deposit — ${periodLabel}`,
    description:
      `Deposit Employees' Provident Fund (EPF) contributions for ${periodLabel} wages. ` +
      'Both employer (12%) and employee (12%) contributions must be deposited.',
    category: 'payroll',
    due_date: ymd(year, month, 15),
    applicable_to: 'All establishments registered under EPF & MP Act, 1952',
    period: periodLabel,
    task_type: 'payroll',
    priority: 'high',
  });

  // ESI deposit — 15th of same month
  deadlines.push({
    id: `esi-deposit-${idSuffix}`,
    title: `ESI Deposit — ${periodLabel}`,
    description:
      `Deposit Employees' State Insurance (ESI) contributions for ${periodLabel} wages. ` +
      'Employer (3.25%) and employee (0.75%) contributions.',
    category: 'payroll',
    due_date: ymd(year, month, 15),
    applicable_to: 'All establishments registered under ESI Act with 10+ employees',
    period: periodLabel,
    task_type: 'payroll',
    priority: 'high',
  });

  // PF return — 25th of same month
  deadlines.push({
    id: `pf-return-${idSuffix}`,
    title: `PF Monthly Return (ECR) — ${periodLabel}`,
    description:
      `File Electronic Challan cum Return (ECR) for ${periodLabel} on the EPFO unified portal. ` +
      'Upload wage details for all EPF members.',
    category: 'payroll',
    due_date: ymd(year, month, 25),
    applicable_to: 'All establishments registered under EPF & MP Act, 1952',
    period: periodLabel,
    task_type: 'payroll',
    priority: 'medium',
  });
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const COMPLIANCE_DEADLINES_FY2627: readonly ComplianceDeadline[] =
  deadlines as readonly ComplianceDeadline[];

// Alias for callers that want a generic name
export const COMPLIANCE_DEADLINES = COMPLIANCE_DEADLINES_FY2627;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns deadlines falling within the next `days` calendar days from today
 * (inclusive of today, exclusive of today + days).
 */
export function getUpcomingDeadlines(days: number): ComplianceDeadline[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + days);

  return COMPLIANCE_DEADLINES_FY2627.filter((d) => {
    const due = new Date(d.due_date);
    due.setHours(0, 0, 0, 0);
    return due >= today && due < cutoff;
  });
}

/**
 * Returns all deadlines for a specific calendar month and year.
 * month is 1-indexed (1 = January).
 */
export function getDeadlinesForMonth(year: number, month: number): ComplianceDeadline[] {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  return COMPLIANCE_DEADLINES_FY2627.filter((d) => d.due_date.startsWith(monthStr));
}
