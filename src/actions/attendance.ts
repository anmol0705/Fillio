'use server';

import { z } from 'zod';
import { db } from '@/db';
import { attendance_records, profiles, roles } from '@/db/schema';
import { eq, and, gte, lt, sql, inArray } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth/getUser';
import type { AttendanceRecord, Profile, Role } from '@/types';

// ---------------------------------------------------------------------------
// Attendance manager guard — requires is_org_admin OR can_mark_attendance
// ---------------------------------------------------------------------------

type AttendanceManagerContext = { orgId: string };

async function resolveAttendanceManager(): Promise<AttendanceManagerContext | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Unauthorized' } as const;

  const profile = await db.query.profiles.findFirst({
    where: (p, { eq }) => eq(p.id, user.id),
    columns: { org_id: true, is_org_admin: true, can_mark_attendance: true },
  });

  if (!profile) return { error: 'Profile not found' } as const;
  if (!profile.is_org_admin && !profile.can_mark_attendance) {
    return { error: 'Forbidden: attendance manager permission required' } as const;
  }

  return { orgId: profile.org_id } as const;
}

function isErr(r: unknown): r is { error: string } {
  return typeof r === 'object' && r !== null && 'error' in r;
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const attendanceStatusSchema = z.enum(['present', 'absent', 'half_day', 'leave']);

const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

const markAttendanceSchema = z.object({
  user_id: z.string().uuid('Invalid user_id'),
  date: dateStringSchema,
  status: attendanceStatusSchema,
  note: z.string().max(500).optional(),
});

const bulkMarkAttendanceSchema = z.object({
  date: dateStringSchema,
  records: z
    .array(
      z.object({
        user_id: z.string().uuid('Invalid user_id'),
        status: attendanceStatusSchema,
      }),
    )
    .min(1, 'At least one record is required'),
});

const monthlyQuerySchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProfileWithRole = Profile & { role: Role | null };

export type AttendanceForDateRow = {
  profile: ProfileWithRole;
  record: AttendanceRecord | null;
};

export type MonthlySummaryRow = {
  profile: ProfileWithRole;
  present: number;
  absent: number;
  half_day: number;
  leave: number;
  total_days: number;
};

// ---------------------------------------------------------------------------
// getAttendanceForDate
// ---------------------------------------------------------------------------

/**
 * Returns all active staff in the org with their attendance record for a
 * given date. Sorted by role sort_order ascending, then by full_name.
 * Requires org admin.
 */
export async function getAttendanceForDate(
  date: string,
): Promise<{ data: AttendanceForDateRow[] } | { error: string }> {
  const ctx = await resolveAttendanceManager();
  if (isErr(ctx)) return ctx;

  const parsed = dateStringSchema.safeParse(date);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid date' };

  try {
    // Fetch all active profiles with their role in one query
    const profileRows = await db.query.profiles.findMany({
      where: (p, { eq, and }) =>
        and(eq(p.org_id, ctx.orgId), eq(p.is_active, true)),
      with: {
        role: true,
      },
      orderBy: (p, { asc }) => [asc(p.full_name)],
    });

    if (profileRows.length === 0) return { data: [] };

    // Fetch all attendance records for these users on the given date
    const userIds = profileRows.map((p) => p.id);

    // Use a single query rather than N+1
    const records = await db
      .select()
      .from(attendance_records)
      .where(
        and(
          eq(attendance_records.org_id, ctx.orgId),
          eq(attendance_records.date, parsed.data),
          // Filter by users in this org — already covered by org_id check,
          // but explicit user_id IN improves index usage.
          inArray(attendance_records.user_id, userIds),
        ),
      );

    const recordByUserId = new Map<string, AttendanceRecord>();
    for (const r of records) {
      recordByUserId.set(r.user_id, r);
    }

    // Sort by role sort_order then full_name
    const sorted = [...profileRows].sort((a, b) => {
      const aSortOrder = a.role?.sort_order ?? 9999;
      const bSortOrder = b.role?.sort_order ?? 9999;
      if (aSortOrder !== bSortOrder) return aSortOrder - bSortOrder;
      return a.full_name.localeCompare(b.full_name);
    });

    const data: AttendanceForDateRow[] = sorted.map((p) => ({
      profile: {
        ...p,
        role: p.role ?? null,
      },
      record: recordByUserId.get(p.id) ?? null,
    }));

    return { data };
  } catch (err) {
    console.error('[getAttendanceForDate]', err);
    return { error: 'Failed to fetch attendance' };
  }
}

// ---------------------------------------------------------------------------
// markAttendance
// ---------------------------------------------------------------------------

/**
 * Upsert a single attendance record for a staff member on a given date.
 * Uses the (user_id, date) unique constraint for conflict resolution.
 * Requires org admin.
 */
export async function markAttendance(
  input: z.infer<typeof markAttendanceSchema>,
): Promise<{ data: AttendanceRecord } | { error: string }> {
  const ctx = await resolveAttendanceManager();
  if (isErr(ctx)) return ctx;

  const parsed = markAttendanceSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const { user_id, date, status, note } = parsed.data;

  // Verify the target user belongs to the admin's org — never trust client input for org
  const targetProfile = await db.query.profiles.findFirst({
    where: (p, { eq, and }) =>
      and(eq(p.id, user_id), eq(p.org_id, ctx.orgId), eq(p.is_active, true)),
    columns: { id: true },
  });

  if (!targetProfile) {
    return { error: 'User not found or does not belong to your organisation' };
  }

  try {
    const [record] = await db
      .insert(attendance_records)
      .values({
        org_id: ctx.orgId,
        user_id,
        date,
        status,
        note: note ?? null,
      })
      .onConflictDoUpdate({
        target: [attendance_records.user_id, attendance_records.date],
        set: {
          status,
          note: note ?? null,
        },
      })
      .returning();

    if (!record) return { error: 'Failed to save attendance record' };

    return { data: record };
  } catch (err) {
    console.error('[markAttendance]', err);
    return { error: 'Failed to mark attendance' };
  }
}

// ---------------------------------------------------------------------------
// bulkMarkAttendance
// ---------------------------------------------------------------------------

/**
 * Upsert attendance for multiple staff on a single date.
 * All user_ids must belong to the admin's org.
 * Returns the count of records upserted.
 * Requires org admin.
 */
export async function bulkMarkAttendance(
  input: z.infer<typeof bulkMarkAttendanceSchema>,
): Promise<{ data: number } | { error: string }> {
  const ctx = await resolveAttendanceManager();
  if (isErr(ctx)) return ctx;

  const parsed = bulkMarkAttendanceSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const { date, records: inputRecords } = parsed.data;

  // Verify all user_ids belong to this org in a single query
  const userIds = [...new Set(inputRecords.map((r) => r.user_id))];

  const orgProfiles = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(
      and(
        eq(profiles.org_id, ctx.orgId),
        eq(profiles.is_active, true),
        inArray(profiles.id, userIds),
      ),
    );

  const validUserIds = new Set(orgProfiles.map((p) => p.id));
  const invalidIds = userIds.filter((id) => !validUserIds.has(id));

  if (invalidIds.length > 0) {
    return {
      error: `The following user IDs do not belong to your organisation: ${invalidIds.join(', ')}`,
    };
  }

  try {
    const valuesToInsert = inputRecords.map((r) => ({
      org_id: ctx.orgId,
      user_id: r.user_id,
      date,
      status: r.status,
      note: null as string | null,
    }));

    await db
      .insert(attendance_records)
      .values(valuesToInsert)
      .onConflictDoUpdate({
        target: [attendance_records.user_id, attendance_records.date],
        set: {
          status: sql`excluded.status`,
          note: sql`excluded.note`,
        },
      });

    return { data: valuesToInsert.length };
  } catch (err) {
    console.error('[bulkMarkAttendance]', err);
    return { error: 'Failed to bulk mark attendance' };
  }
}

// ---------------------------------------------------------------------------
// getMonthlyAttendanceSummary
// ---------------------------------------------------------------------------

/**
 * Returns per-staff attendance counts for a given month/year.
 * Only active profiles are included. Staff with zero records still appear
 * with all counts at 0.
 * Requires org admin.
 */
export async function getMonthlyAttendanceSummary(
  year: number,
  month: number,
): Promise<{ data: MonthlySummaryRow[] } | { error: string }> {
  const ctx = await resolveAttendanceManager();
  if (isErr(ctx)) return ctx;

  const parsed = monthlyQuerySchema.safeParse({ year, month });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid year/month' };

  // Build date range for the month — 'YYYY-MM-DD' strings
  const monthStr = String(parsed.data.month).padStart(2, '0');
  const startDate = `${parsed.data.year}-${monthStr}-01`;

  // Last day of the month: first day of next month minus 1
  const nextMonth = parsed.data.month === 12 ? 1 : parsed.data.month + 1;
  const nextYear = parsed.data.month === 12 ? parsed.data.year + 1 : parsed.data.year;
  const nextMonthStr = String(nextMonth).padStart(2, '0');
  const endDateExclusive = `${nextYear}-${nextMonthStr}-01`;

  try {
    // Fetch all active profiles with role
    const profileRows = await db.query.profiles.findMany({
      where: (p, { eq, and }) =>
        and(eq(p.org_id, ctx.orgId), eq(p.is_active, true)),
      with: { role: true },
      orderBy: (p, { asc }) => [asc(p.full_name)],
    });

    if (profileRows.length === 0) return { data: [] };

    // Fetch all attendance records for this org in the given month
    const monthRecords = await db
      .select({
        user_id: attendance_records.user_id,
        status: attendance_records.status,
      })
      .from(attendance_records)
      .where(
        and(
          eq(attendance_records.org_id, ctx.orgId),
          gte(attendance_records.date, startDate),
          lt(attendance_records.date, endDateExclusive),
        ),
      );

    // Aggregate counts per user_id
    type StatusCounts = {
      present: number;
      absent: number;
      half_day: number;
      leave: number;
      total_days: number;
    };

    const countsByUser = new Map<string, StatusCounts>();

    for (const row of monthRecords) {
      const existing = countsByUser.get(row.user_id) ?? {
        present: 0,
        absent: 0,
        half_day: 0,
        leave: 0,
        total_days: 0,
      };

      existing.total_days += 1;

      if (row.status === 'present') existing.present += 1;
      else if (row.status === 'absent') existing.absent += 1;
      else if (row.status === 'half_day') existing.half_day += 1;
      else if (row.status === 'leave') existing.leave += 1;

      countsByUser.set(row.user_id, existing);
    }

    // Sort by role sort_order then full_name
    const sorted = [...profileRows].sort((a, b) => {
      const aSortOrder = a.role?.sort_order ?? 9999;
      const bSortOrder = b.role?.sort_order ?? 9999;
      if (aSortOrder !== bSortOrder) return aSortOrder - bSortOrder;
      return a.full_name.localeCompare(b.full_name);
    });

    const data: MonthlySummaryRow[] = sorted.map((p) => {
      const counts = countsByUser.get(p.id) ?? {
        present: 0,
        absent: 0,
        half_day: 0,
        leave: 0,
        total_days: 0,
      };

      return {
        profile: { ...p, role: p.role ?? null },
        ...counts,
      };
    });

    return { data };
  } catch (err) {
    console.error('[getMonthlyAttendanceSummary]', err);
    return { error: 'Failed to fetch monthly attendance summary' };
  }
}
