'use server';

import { z } from 'zod';
import { db } from '@/db';
import { attendance_records, profiles } from '@/db/schema';
import { eq, and, gte, lt, inArray, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth/getUser';
import type { AttendanceRecord, Profile } from '@/types';

// ---------------------------------------------------------------------------
// Permission guard
//
// Two kinds of users can mark attendance:
//   1. Org admins (is_org_admin = true) — always allowed
//   2. Users granted the specific permission (can_mark_attendance = true)
//
// This function is called at the top of every action that writes attendance.
// If it returns { error }, the action immediately returns that error without
// touching the database.
//
// Returning { orgId } means the caller is authorised — and gives us the
// org_id we'll need for every query (so we don't have to fetch it again).
// ---------------------------------------------------------------------------

type ManagerContext = { orgId: string };

async function resolveAttendanceManager(): Promise<ManagerContext | { error: string }> {
  // Step 1: confirm there is a logged-in user
  const user = await getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  // Step 2: load their profile to check permissions
  // We only select the columns we actually need — not SELECT *
  const profile = await db.query.profiles.findFirst({
    where: (p, { eq }) => eq(p.id, user.id),
    columns: { org_id: true, is_org_admin: true, can_mark_attendance: true },
  });

  if (!profile) return { error: 'Profile not found' };

  // Step 3: check permission — either flag grants access
  if (!profile.is_org_admin && !profile.can_mark_attendance) {
    return { error: 'Forbidden: attendance manager permission required' };
  }

  return { orgId: profile.org_id };
}

// Small helper so we can write `if (isErr(ctx)) return ctx`
// instead of `if ('error' in ctx) return ctx` everywhere.
function isErr(v: unknown): v is { error: string } {
  return typeof v === 'object' && v !== null && 'error' in v;
}

// ---------------------------------------------------------------------------
// Zod schemas
//
// Zod validates data shape and content before it touches the DB.
// .safeParse() returns { success: true, data } or { success: false, error }
// — it never throws, so you always handle both cases explicitly.
// ---------------------------------------------------------------------------

const attendanceStatusSchema = z.enum(['present', 'absent', 'half_day', 'leave']);

// Date must be a string in YYYY-MM-DD format — matches the Postgres `date` column
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

const markAttendanceSchema = z.object({
  user_id: z.string().uuid('Invalid user_id'),
  date:    dateSchema,
  status:  attendanceStatusSchema,
  note:    z.string().max(500).optional(),
});

const bulkMarkSchema = z.object({
  date:    dateSchema,
  records: z
    .array(z.object({
      user_id: z.string().uuid(),
      status:  attendanceStatusSchema,
    }))
    .min(1, 'At least one record required'),
});

// ---------------------------------------------------------------------------
// getAttendanceForDate
//
// Returns every active staff member in the org with their attendance record
// for the given date (or null if not yet marked).
//
// This is a READ action — it uses the regular db client, not adminClient.
// Only attendance managers can call it (they need to see everyone's status).
// ---------------------------------------------------------------------------

export type AttendanceRow = {
  profile: Profile;
  record:  AttendanceRecord | null;
};

export async function getAttendanceForDate( date: string,): Promise<{ data: AttendanceRow[] } | { error: string }> {
  const ctx = await resolveAttendanceManager();
  if (isErr(ctx)) return ctx;

  const parsed = dateSchema.safeParse(date);
  if (!parsed.success) return { error: 'Invalid date format' };

  try {
    // Fetch all active staff in this org
    const staffList = await db
      .select()
      .from(profiles)
      .where(and(eq(profiles.org_id, ctx.orgId), eq(profiles.is_active, true)));

    if (staffList.length === 0) return { data: [] };

    // Fetch all attendance records for these users on this date in ONE query.
    // This is the "batch query" pattern — instead of one query per person
    // (N+1 problem), we fetch all records at once and join in JavaScript.
    const userIds = staffList.map((p) => p.id);
    const records = await db
      .select()
      .from(attendance_records)
      .where(
        and(
          eq(attendance_records.org_id, ctx.orgId),
          eq(attendance_records.date, parsed.data),
          inArray(attendance_records.user_id, userIds),
        ),
      );

    // Build a Map for O(1) lookup: user_id → record
    const recordByUserId = new Map<string, AttendanceRecord>();
    for (const r of records) {
      recordByUserId.set(r.user_id, r);
    }

    const data: AttendanceRow[] = staffList.map((p) => ({
      profile: p,
      record:  recordByUserId.get(p.id) ?? null,
    }));

    return { data };
  } catch (err) {
    console.error('[getAttendanceForDate]', err);
    return { error: 'Failed to fetch attendance' };
  }
}

// ---------------------------------------------------------------------------
// markAttendance
//
// Upsert one attendance record for one person on one date.
//
// UPSERT explained:
//   INSERT INTO attendance_records (org_id, user_id, date, status, note)
//   VALUES (...)
//   ON CONFLICT (user_id, date)       ← the unique constraint we defined
//   DO UPDATE SET status = ..., note = ...
//
// This means: try to insert. If a row already exists for this (user, date)
// pair, update it instead. One query, no race condition, no duplicate rows.
// ---------------------------------------------------------------------------

export async function markAttendance(
  input: z.infer<typeof markAttendanceSchema>,
): Promise<{ data: AttendanceRecord } | { error: string }> {
  const ctx = await resolveAttendanceManager();
  if (isErr(ctx)) return ctx;

  const parsed = markAttendanceSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const { user_id, date, status, note } = parsed.data;

  // Security check: confirm the target user actually belongs to this org.
  // Never trust user_id that came from the browser — someone could send any UUID.
  const targetProfile = await db.query.profiles.findFirst({
    where: (p, { and, eq }) =>
      and(eq(p.id, user_id), eq(p.org_id, ctx.orgId), eq(p.is_active, true)),
    columns: { id: true },
  });
  if (!targetProfile) return { error: 'User not found in your organisation' };

  try {
    const [record] = await db
      .insert(attendance_records)
      .values({ org_id: ctx.orgId, user_id, date, status, note: note ?? null })
      .onConflictDoUpdate({
        target: [attendance_records.user_id, attendance_records.date],
        set:    { status, note: note ?? null },
      })
      .returning();

    if (!record) return { error: 'Failed to save record' };
    return { data: record };
  } catch (err) {
    console.error('[markAttendance]', err);
    return { error: 'Failed to mark attendance' };
  }
}

// ---------------------------------------------------------------------------
// bulkMarkAttendance
//
// Upsert attendance for the entire team for one date in a single DB call.
// The UI sends one big array — we validate all user_ids belong to this org,
// then insert them all at once. One round-trip to the DB for any team size.
// ---------------------------------------------------------------------------

export async function bulkMarkAttendance(
  input: z.infer<typeof bulkMarkSchema>,
): Promise<{ data: number } | { error: string }> {
  const ctx = await resolveAttendanceManager();
  if (isErr(ctx)) return ctx;

  const parsed = bulkMarkSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const { date, records: inputRecords } = parsed.data;

  // Deduplicate user_ids (browser might send duplicates)
  const userIds = [...new Set(inputRecords.map((r) => r.user_id))];

  // Verify ALL user_ids belong to this org in a single query
  const validProfiles = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(
      and(
        eq(profiles.org_id, ctx.orgId),
        eq(profiles.is_active, true),
        inArray(profiles.id, userIds),
      ),
    );

  const validIds = new Set(validProfiles.map((p) => p.id));
  const invalidIds = userIds.filter((id) => !validIds.has(id));

  if (invalidIds.length > 0) {
    return { error: `Unknown user IDs: ${invalidIds.join(', ')}` };
  }

  try {
    const rows = inputRecords.map((r) => ({
      org_id:  ctx.orgId,
      user_id: r.user_id,
      date,
      status:  r.status,
      note:    null as string | null,
    }));

    await db
      .insert(attendance_records)
      .values(rows)
      .onConflictDoUpdate({
        target: [attendance_records.user_id, attendance_records.date],
        // sql`excluded.status` means "use the value we just tried to insert"
        set:    { status: sql`excluded.status`, note: sql`excluded.note` },
      });

    return { data: rows.length };
  } catch (err) {
    console.error('[bulkMarkAttendance]', err);
    return { error: 'Failed to bulk mark attendance' };
  }
}

// ---------------------------------------------------------------------------
// getMonthlyAttendanceSummary
//
// Returns per-person counts (present / absent / half_day / leave) for a
// given month. Fetches all records for the month in ONE query, then
// aggregates in JavaScript — faster than GROUP BY for small teams.
// ---------------------------------------------------------------------------

export type MonthlySummaryRow = {
  profile:    Profile;
  present:    number;
  absent:     number;
  half_day:   number;
  leave:      number;
  total_days: number;
};

export async function getMonthlyAttendanceSummary(
  year: number,
  month: number,
): Promise<{ data: MonthlySummaryRow[] } | { error: string }> {
  const ctx = await resolveAttendanceManager();
  if (isErr(ctx)) return ctx;

  const parsed = z.object({
    year:  z.number().int().min(2020).max(2100),
    month: z.number().int().min(1).max(12),
  }).safeParse({ year, month });
  if (!parsed.success) return { error: 'Invalid year or month' };

  // Build the date range as YYYY-MM-DD strings
  const mm        = String(parsed.data.month).padStart(2, '0');
  const startDate = `${parsed.data.year}-${mm}-01`;

  const nextMonth = parsed.data.month === 12 ? 1 : parsed.data.month + 1;
  const nextYear  = parsed.data.month === 12 ? parsed.data.year + 1 : parsed.data.year;
  const endDate   = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  try {
    const staffList = await db
      .select()
      .from(profiles)
      .where(and(eq(profiles.org_id, ctx.orgId), eq(profiles.is_active, true)));

    if (staffList.length === 0) return { data: [] };

    // One query for all records in the month — not one per person
    const monthRecords = await db
      .select({ user_id: attendance_records.user_id, status: attendance_records.status })
      .from(attendance_records)
      .where(
        and(
          eq(attendance_records.org_id, ctx.orgId),
          gte(attendance_records.date, startDate),
          lt(attendance_records.date, endDate),
        ),
      );

    // Aggregate in JavaScript
    type Counts = { present: number; absent: number; half_day: number; leave: number; total_days: number };
    const countsByUser = new Map<string, Counts>();

    for (const row of monthRecords) {
      const c = countsByUser.get(row.user_id) ?? { present: 0, absent: 0, half_day: 0, leave: 0, total_days: 0 };
      c.total_days += 1;
      if (row.status === 'present')  c.present  += 1;
      if (row.status === 'absent')   c.absent   += 1;
      if (row.status === 'half_day') c.half_day += 1;
      if (row.status === 'leave')    c.leave    += 1;
      countsByUser.set(row.user_id, c);
    }

    const zero: Counts = { present: 0, absent: 0, half_day: 0, leave: 0, total_days: 0 };

    const data: MonthlySummaryRow[] = staffList.map((p) => ({
      profile: p,
      ...(countsByUser.get(p.id) ?? zero),
    }));

    return { data };
  } catch (err) {
    console.error('[getMonthlyAttendanceSummary]', err);
    return { error: 'Failed to fetch monthly summary' };
  }
}

// ---------------------------------------------------------------------------
// getMyAttendance — any authenticated user can view their own records
// ---------------------------------------------------------------------------

export type MyAttendanceRecord = {
  date:   string;              // 'YYYY-MM-DD'
  status: 'present' | 'absent' | 'half_day' | 'leave';
  note:   string | null;
};

export type MyAttendanceSummary = {
  records:    MyAttendanceRecord[];
  present:    number;
  absent:     number;
  half_day:   number;
  leave:      number;
  total_days: number;
};

export async function getMyAttendance(
  year: number,
  month: number,
): Promise<{ data: MyAttendanceSummary } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  const parsed = z.object({
    year:  z.number().int().min(2020).max(2100),
    month: z.number().int().min(1).max(12),
  }).safeParse({ year, month });
  if (!parsed.success) return { error: 'Invalid year or month' };

  const mm        = String(parsed.data.month).padStart(2, '0');
  const startDate = `${parsed.data.year}-${mm}-01`;
  const nextMonth = parsed.data.month === 12 ? 1 : parsed.data.month + 1;
  const nextYear  = parsed.data.month === 12 ? parsed.data.year + 1 : parsed.data.year;
  const endDate   = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  const rows = await db
    .select({
      date:   attendance_records.date,
      status: attendance_records.status,
      note:   attendance_records.note,
    })
    .from(attendance_records)
    .where(
      and(
        eq(attendance_records.user_id, user.id),
        gte(attendance_records.date, startDate),
        lt(attendance_records.date, endDate),
      ),
    )
    .orderBy(attendance_records.date);

  const summary = { present: 0, absent: 0, half_day: 0, leave: 0, total_days: rows.length };
  for (const r of rows) {
    if (r.status === 'present')  summary.present  += 1;
    if (r.status === 'absent')   summary.absent   += 1;
    if (r.status === 'half_day') summary.half_day += 1;
    if (r.status === 'leave')    summary.leave    += 1;
  }

  return { data: { records: rows, ...summary } };
}
