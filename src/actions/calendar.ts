'use server';
import 'server-only';

import { z } from 'zod';
import { and, eq, gte, lte, or } from 'drizzle-orm';
import { db } from '@/db';
import { calendar_events, reporting_relationships } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth/getUser';
import type { CalendarEventWithNames } from '@/types';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const eventSchema = z.object({
  title:       z.string().min(1).max(200).trim(),
  description: z.string().max(1000).trim().optional(),
  event_type:  z.enum(['meeting', 'deadline', 'other']),
  start_at:    z.string().datetime(),
  end_at:      z.string().datetime(),
  is_all_day:  z.boolean().default(false),
  assigned_to: z.string().uuid().nullable().optional(),
  task_id:     z.string().uuid().nullable().optional(),
});

// ---------------------------------------------------------------------------
// Helper — get profile with org_id and admin flag
// ---------------------------------------------------------------------------

async function getProfile(userId: string) {
  return db.query.profiles.findFirst({
    where: (p, { eq }) => eq(p.id, userId),
    columns: { org_id: true, is_org_admin: true },
  });
}

// ---------------------------------------------------------------------------
// Helper — can this user assign events to someone else?
// Admin: yes. User with direct reports: yes, only to their reports.
// ---------------------------------------------------------------------------

async function canAssignTo(
  assignerId: string,
  assigneeId: string,
  isAdmin: boolean,
  orgId: string,
): Promise<boolean> {
  // Always verify the assignee exists in this org — even admins cannot cross-tenant reference
  const assigneeProfile = await db.query.profiles.findFirst({
    where: (p, { and: qAnd, eq: qEq }) =>
      qAnd(qEq(p.id, assigneeId), qEq(p.org_id, orgId), qEq(p.is_active, true)),
    columns: { id: true },
  });
  if (!assigneeProfile) return false;

  if (isAdmin) return true;
  if (assignerId === assigneeId) return true;
  const rel = await db.query.reporting_relationships.findFirst({
    where: (r, { and: qAnd, eq: qEq }) =>
      qAnd(qEq(r.manager_id, assignerId), qEq(r.report_id, assigneeId)),
  });
  return rel !== undefined;
}

// ---------------------------------------------------------------------------
// Helper — resolve names for a list of events
// ---------------------------------------------------------------------------

async function resolveNames(
  rows: (typeof calendar_events.$inferSelect)[],
): Promise<CalendarEventWithNames[]> {
  const profileIds = [
    ...new Set([
      ...rows.map((e) => e.created_by),
      ...rows.map((e) => e.assigned_to).filter(Boolean) as string[],
    ]),
  ];
  const taskIds = [...new Set(rows.map((e) => e.task_id).filter(Boolean) as string[])];

  const [profileRows, taskRows] = await Promise.all([
    profileIds.length > 0
      ? db.query.profiles.findMany({
          where: (p, { inArray }) => inArray(p.id, profileIds),
          columns: { id: true, full_name: true },
        })
      : Promise.resolve([]),
    taskIds.length > 0
      ? db.query.tasks.findMany({
          where: (t, { inArray }) => inArray(t.id, taskIds),
          columns: { id: true, title: true },
        })
      : Promise.resolve([]),
  ]);

  const profileMap = new Map(profileRows.map((p) => [p.id, p]));
  const taskMap    = new Map(taskRows.map((t) => [t.id, t]));

  return rows.map((e) => ({
    ...e,
    creator:  profileMap.get(e.created_by) ?? { id: e.created_by, full_name: 'Unknown' },
    assignee: e.assigned_to ? (profileMap.get(e.assigned_to) ?? null) : null,
    task:     e.task_id     ? (taskMap.get(e.task_id) ?? null)        : null,
  }));
}

// ---------------------------------------------------------------------------
// getCalendarEvents — load events for a given month range
// ---------------------------------------------------------------------------

export async function getCalendarEvents(
  year: number,
  month: number, // 1-indexed
): Promise<{ error: string; data: null } | { error: null; data: CalendarEventWithNames[] }> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated', data: null };

  const profile = await getProfile(user.id);
  if (!profile) return { error: 'Profile not found', data: null };

  // Range: full month + one week buffer on each side for calendar display
  const rangeStart = new Date(year, month - 2, 22); // previous month tail
  const rangeEnd   = new Date(year, month, 14);      // next month head

  const rows = await db
    .select()
    .from(calendar_events)
    .where(
      and(
        eq(calendar_events.org_id, profile.org_id),
        gte(calendar_events.start_at, rangeStart),
        lte(calendar_events.start_at, rangeEnd),
        profile.is_org_admin
          ? undefined
          : or(
              eq(calendar_events.created_by, user.id),
              eq(calendar_events.assigned_to, user.id),
            ),
      ),
    )
    .orderBy(calendar_events.start_at);

  const data = await resolveNames(rows);
  return { error: null, data };
}

// ---------------------------------------------------------------------------
// createCalendarEvent
// ---------------------------------------------------------------------------

export async function createCalendarEvent(
  input: z.infer<typeof eventSchema>,
): Promise<{ error: string; data: null } | { error: null; data: CalendarEventWithNames }> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated', data: null };

  const profile = await getProfile(user.id);
  if (!profile) return { error: 'Profile not found', data: null };

  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message, data: null };

  const { title, description, event_type, start_at, end_at, is_all_day, assigned_to, task_id } =
    parsed.data;

  if (new Date(end_at) < new Date(start_at)) {
    return { error: 'End time cannot be before start time', data: null };
  }

  // Assignment permission check
  const effectiveAssignee = assigned_to ?? null;
  if (effectiveAssignee && effectiveAssignee !== user.id) {
    const allowed = await canAssignTo(user.id, effectiveAssignee, profile.is_org_admin, profile.org_id);
    if (!allowed) return { error: 'You can only assign events to your direct reports', data: null };
  }

  const [row] = await db
    .insert(calendar_events)
    .values({
      org_id:      profile.org_id,
      title,
      description: description ?? null,
      event_type,
      start_at:    new Date(start_at),
      end_at:      new Date(end_at),
      is_all_day,
      assigned_to: effectiveAssignee,
      created_by:  user.id,
      task_id:     task_id ?? null,
    })
    .returning();

  const [resolved] = await resolveNames([row]);
  return { error: null, data: resolved };
}

// ---------------------------------------------------------------------------
// updateCalendarEvent — creator or admin only
// ---------------------------------------------------------------------------

export async function updateCalendarEvent(
  id: string,
  input: z.infer<typeof eventSchema>,
): Promise<{ error: string; data: null } | { error: null; data: CalendarEventWithNames }> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated', data: null };

  const uuidCheck = z.string().uuid().safeParse(id);
  if (!uuidCheck.success) return { error: 'Invalid event ID', data: null };

  const profile = await getProfile(user.id);
  if (!profile) return { error: 'Profile not found', data: null };

  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message, data: null };

  const { title, description, event_type, start_at, end_at, is_all_day, assigned_to, task_id } =
    parsed.data;

  if (new Date(end_at) < new Date(start_at)) {
    return { error: 'End time cannot be before start time', data: null };
  }

  const effectiveAssignee = assigned_to ?? null;
  if (effectiveAssignee && effectiveAssignee !== user.id) {
    const allowed = await canAssignTo(user.id, effectiveAssignee, profile.is_org_admin, profile.org_id);
    if (!allowed) return { error: 'You can only assign events to your direct reports', data: null };
  }

  const [row] = await db
    .update(calendar_events)
    .set({
      title,
      description: description ?? null,
      event_type,
      start_at:    new Date(start_at),
      end_at:      new Date(end_at),
      is_all_day,
      assigned_to: effectiveAssignee,
      task_id:     task_id ?? null,
      updated_at:  new Date(),
    })
    .where(
      and(
        eq(calendar_events.id, id),
        eq(calendar_events.org_id, profile.org_id),
        profile.is_org_admin
          ? undefined
          : eq(calendar_events.created_by, user.id),
      ),
    )
    .returning();

  if (!row) return { error: 'Event not found or you do not have permission', data: null };

  const [resolved] = await resolveNames([row]);
  return { error: null, data: resolved };
}

// ---------------------------------------------------------------------------
// deleteCalendarEvent — creator or admin only
// ---------------------------------------------------------------------------

export async function deleteCalendarEvent(
  id: string,
): Promise<{ error: string } | { error: null }> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  const uuidCheck = z.string().uuid().safeParse(id);
  if (!uuidCheck.success) return { error: 'Invalid event ID' };

  const profile = await getProfile(user.id);
  if (!profile) return { error: 'Profile not found' };

  await db
    .delete(calendar_events)
    .where(
      and(
        eq(calendar_events.id, id),
        eq(calendar_events.org_id, profile.org_id),
        profile.is_org_admin
          ? undefined
          : eq(calendar_events.created_by, user.id),
      ),
    );

  return { error: null };
}
