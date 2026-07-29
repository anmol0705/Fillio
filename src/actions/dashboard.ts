'use server';

import { db } from '@/db';
import { tasks, task_access, profiles } from '@/db/schema';
import { eq, and, lt, gte, lte, count, inArray, ne } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth/getUser';
import { addDays, startOfMonth, endOfMonth } from 'date-fns';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DashboardStats = {
  totalTasks: number;
  overdueTasks: number;
  dueSoonTasks: number;
  completedThisMonth: number;
  underReview: number;
};

export type OverdueTask = {
  id: string;
  title: string;
  due_at: Date;
  daysOverdue: number;
  assignee: { id: string; full_name: string } | null;
  client: { name: string } | null;
};

export type WorkloadEntry = {
  userId: string;
  userName: string;
  inProgress: number;
  underReview: number;
};

export type UpcomingDeadline = {
  id: string;
  title: string;
  due_at: Date;
  daysLeft: number;
  client: { name: string } | null;
  assignee: { full_name: string } | null;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type UserContext = { userId: string; orgId: string };

async function resolveUser(): Promise<UserContext | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  const profile = await db.query.profiles.findFirst({
    where: (p, { eq }) => eq(p.id, user.id),
    columns: { id: true, org_id: true },
  });

  if (!profile) return { error: 'Profile not found' };
  return { userId: user.id, orgId: profile.org_id };
}

function isErrorResult(v: unknown): v is { error: string } {
  return typeof v === 'object' && v !== null && 'error' in v;
}

// ---------------------------------------------------------------------------
// getDashboardStats
// ---------------------------------------------------------------------------

export async function getDashboardStats(): Promise<
  { data: DashboardStats } | { error: string }
> {
  const ctx = await resolveUser();
  if (isErrorResult(ctx)) return ctx;

  try {
    // Fetch task IDs the caller has access to
    const accessRows = await db
      .select({ task_id: task_access.task_id })
      .from(task_access)
      .where(eq(task_access.user_id, ctx.userId));

    if (accessRows.length === 0) {
      return {
        data: {
          totalTasks: 0,
          overdueTasks: 0,
          dueSoonTasks: 0,
          completedThisMonth: 0,
          underReview: 0,
        },
      };
    }

    const taskIds = accessRows.map((r) => r.task_id);
    const now = new Date();
    const soonDate = addDays(now, 7);
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const [total, overdue, dueSoon, completedMonth, review] = await Promise.all([
      db
        .select({ count: count() })
        .from(tasks)
        .where(
          and(
            inArray(tasks.id, taskIds),
            eq(tasks.is_active, true),
          ),
        )
        .then((r) => Number(r[0]?.count ?? 0)),

      db
        .select({ count: count() })
        .from(tasks)
        .where(
          and(
            inArray(tasks.id, taskIds),
            eq(tasks.is_active, true),
            lt(tasks.due_at, now),
          ),
        )
        .then((r) => Number(r[0]?.count ?? 0)),

      db
        .select({ count: count() })
        .from(tasks)
        .where(
          and(
            inArray(tasks.id, taskIds),
            eq(tasks.is_active, true),
            gte(tasks.due_at, now),
            lte(tasks.due_at, soonDate),
          ),
        )
        .then((r) => Number(r[0]?.count ?? 0)),

      db
        .select({ count: count() })
        .from(tasks)
        .where(
          and(
            inArray(tasks.id, taskIds),
            eq(tasks.is_active, true),
            eq(tasks.status, 'completed'),
            gte(tasks.updated_at, monthStart),
            lte(tasks.updated_at, monthEnd),
          ),
        )
        .then((r) => Number(r[0]?.count ?? 0)),

      db
        .select({ count: count() })
        .from(tasks)
        .where(
          and(
            inArray(tasks.id, taskIds),
            eq(tasks.is_active, true),
            eq(tasks.status, 'under_review'),
          ),
        )
        .then((r) => Number(r[0]?.count ?? 0)),
    ]);

    return {
      data: {
        totalTasks: total,
        overdueTasks: overdue,
        dueSoonTasks: dueSoon,
        completedThisMonth: completedMonth,
        underReview: review,
      },
    };
  } catch (err) {
    console.error('[getDashboardStats]', err);
    return { error: 'Failed to load dashboard stats' };
  }
}

// ---------------------------------------------------------------------------
// getOverdueTasks
// Admin / manager view: shows overdue tasks across the caller's org, scoped to
// tasks the caller has access to (task_access row). Limit 20, oldest-first.
// ---------------------------------------------------------------------------

export async function getOverdueTasks(): Promise<
  { data: OverdueTask[] } | { error: string }
> {
  const ctx = await resolveUser();
  if (isErrorResult(ctx)) return ctx;

  try {
    const accessRows = await db
      .select({ task_id: task_access.task_id })
      .from(task_access)
      .where(eq(task_access.user_id, ctx.userId));

    if (accessRows.length === 0) return { data: [] };

    const taskIds = accessRows.map((r) => r.task_id);
    const now = new Date();

    const result = await db.query.tasks.findMany({
      where: (t, { and, eq, lt, isNotNull }) =>
        and(
          inArray(t.id, taskIds),
          eq(t.is_active, true),
          isNotNull(t.due_at),
          lt(t.due_at, now),
          ne(t.status, 'completed'),
        ),
      with: {
        assignee: { columns: { id: true, full_name: true } },
        client: { columns: { name: true } },
      },
      orderBy: (t, { asc }) => [asc(t.due_at)],
      limit: 20,
    });

    const data: OverdueTask[] = result
      .map((t) => ({
        id: t.id,
        title: t.title,
        due_at: t.due_at!,
        daysOverdue: Math.floor(
          (now.getTime() - new Date(t.due_at!).getTime()) / 86_400_000,
        ),
        assignee: t.assignee
          ? { id: t.assignee.id, full_name: t.assignee.full_name }
          : null,
        client: t.client ? { name: t.client.name } : null,
      }));

    return { data };
  } catch (err) {
    console.error('[getOverdueTasks]', err);
    return { error: 'Failed to load overdue tasks' };
  }
}

// ---------------------------------------------------------------------------
// getWorkload
// Returns per-user in_progress + under_review counts for the caller's org.
// Only returns entries where at least one task is active.
// ---------------------------------------------------------------------------

export async function getWorkload(): Promise<
  { data: WorkloadEntry[] } | { error: string }
> {
  const ctx = await resolveUser();
  if (isErrorResult(ctx)) return ctx;

  try {
    const orgUsers = await db.query.profiles.findMany({
      where: (p, { and, eq }) =>
        and(eq(p.org_id, ctx.orgId), eq(p.is_active, true)),
      columns: { id: true, full_name: true },
    });

    if (orgUsers.length === 0) return { data: [] };

    const userIds = orgUsers.map((u) => u.id);

    // Single query per status to avoid N+1 — then merge in memory
    const [inProgressRows, underReviewRows] = await Promise.all([
      db
        .select({ assignee_id: tasks.assignee_id, cnt: count() })
        .from(tasks)
        .where(
          and(
            eq(tasks.org_id, ctx.orgId),
            eq(tasks.is_active, true),
            eq(tasks.status, 'in_progress'),
            inArray(tasks.assignee_id, userIds),
          ),
        )
        .groupBy(tasks.assignee_id),

      db
        .select({ assignee_id: tasks.assignee_id, cnt: count() })
        .from(tasks)
        .where(
          and(
            eq(tasks.org_id, ctx.orgId),
            eq(tasks.is_active, true),
            eq(tasks.status, 'under_review'),
            inArray(tasks.assignee_id, userIds),
          ),
        )
        .groupBy(tasks.assignee_id),
    ]);

    const inProgressMap = new Map<string, number>();
    for (const r of inProgressRows) {
      if (r.assignee_id) inProgressMap.set(r.assignee_id, Number(r.cnt));
    }

    const underReviewMap = new Map<string, number>();
    for (const r of underReviewRows) {
      if (r.assignee_id) underReviewMap.set(r.assignee_id, Number(r.cnt));
    }

    const workload: WorkloadEntry[] = orgUsers
      .map((u) => ({
        userId: u.id,
        userName: u.full_name,
        inProgress: inProgressMap.get(u.id) ?? 0,
        underReview: underReviewMap.get(u.id) ?? 0,
      }))
      .filter((e) => e.inProgress + e.underReview > 0)
      .sort(
        (a, b) =>
          b.inProgress + b.underReview - (a.inProgress + a.underReview),
      );

    return { data: workload };
  } catch (err) {
    console.error('[getWorkload]', err);
    return { error: 'Failed to load workload' };
  }
}

// ---------------------------------------------------------------------------
// getUpcomingDeadlines
// Returns tasks due within the next `days` days (default 14) that the caller
// has access to, excluding completed tasks, sorted by due_at asc.
// ---------------------------------------------------------------------------

export async function getUpcomingDeadlines(
  days = 14,
): Promise<{ data: UpcomingDeadline[] } | { error: string }> {
  const ctx = await resolveUser();
  if (isErrorResult(ctx)) return ctx;

  try {
    const accessRows = await db
      .select({ task_id: task_access.task_id })
      .from(task_access)
      .where(eq(task_access.user_id, ctx.userId));

    if (accessRows.length === 0) return { data: [] };

    const taskIds = accessRows.map((r) => r.task_id);
    const now = new Date();
    const future = addDays(now, days);

    const result = await db.query.tasks.findMany({
      where: (t, { and, eq, gte, lte, isNotNull }) =>
        and(
          inArray(t.id, taskIds),
          eq(t.is_active, true),
          isNotNull(t.due_at),
          gte(t.due_at, now),
          lte(t.due_at, future),
          ne(t.status, 'completed'),
        ),
      with: {
        client: { columns: { name: true } },
        assignee: { columns: { full_name: true } },
      },
      orderBy: (t, { asc }) => [asc(t.due_at)],
    });

    const data: UpcomingDeadline[] = result
      .map((t) => ({
        id: t.id,
        title: t.title,
        due_at: t.due_at!,
        daysLeft: Math.ceil(
          (new Date(t.due_at!).getTime() - now.getTime()) / 86_400_000,
        ),
        client: t.client ? { name: t.client.name } : null,
        assignee: t.assignee ? { full_name: t.assignee.full_name } : null,
      }));

    return { data };
  } catch (err) {
    console.error('[getUpcomingDeadlines]', err);
    return { error: 'Failed to load upcoming deadlines' };
  }
}
