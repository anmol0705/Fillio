'use server';
import 'server-only';

import { and, count, eq, gt, gte, lt, lte, ne, isNotNull } from 'drizzle-orm';
import { db } from '@/db';
import { tasks, profiles, clients } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth/getUser';

// ---------------------------------------------------------------------------
// Exported types — consumed by the dashboard components
// ---------------------------------------------------------------------------

export type DashboardStats = {
  totalTasks:         number;
  overdueTasks:       number;
  dueSoonTasks:       number;   // due within 7 days, not yet completed
  completedThisMonth: number;
  underReview:        number;
};

export type OverdueTask = {
  id:         string;
  title:      string;
  daysOverdue: number;
  assignee:   { id: string; full_name: string } | null;
  client:     { id: string; name: string } | null;
};

export type WorkloadEntry = {
  userId:      string;
  userName:    string;
  inProgress:  number;
  underReview: number;
};

export type UpcomingDeadline = {
  id:     string;
  title:  string;
  due_at: Date;
  client: { id: string; name: string } | null;
};

export type DashboardData = {
  stats:     DashboardStats;
  overdue:   OverdueTask[];
  workload:  WorkloadEntry[];
  deadlines: UpcomingDeadline[];
};

// ---------------------------------------------------------------------------
// getDashboardData — single function, all queries run in parallel
// ---------------------------------------------------------------------------

export async function getDashboardData(): Promise<
  { error: string; data: null } | { error: null; data: DashboardData }
> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated', data: null };

  const profile = await db.query.profiles.findFirst({
    where: (p, { eq }) => eq(p.id, user.id),
    columns: { org_id: true, is_org_admin: true },
  });
  if (!profile) return { error: 'Profile not found', data: null };

  const orgId = profile.org_id;
  const now   = new Date();

  // Week boundary — 7 days from now at end of day
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);
  weekEnd.setHours(23, 59, 59, 999);

  // Month boundary — first day of current month at midnight
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Run all heavy queries in parallel
  const [
    totalRow,
    overdueRow,
    dueSoonRow,
    completedRow,
    underReviewRow,
    overdueTaskRows,
    activeTaskRows,
    deadlineRows,
  ] = await Promise.all([
    // 1. Total active tasks
    db
      .select({ value: count() })
      .from(tasks)
      .where(and(eq(tasks.org_id, orgId), eq(tasks.is_active, true), ne(tasks.status, 'completed'))),

    // 2. Overdue count
    db
      .select({ value: count() })
      .from(tasks)
      .where(
        and(
          eq(tasks.org_id, orgId),
          eq(tasks.is_active, true),
          ne(tasks.status, 'completed'),
          isNotNull(tasks.due_at),
          lt(tasks.due_at, now),
        ),
      ),

    // 3. Due within 7 days (not overdue, not completed)
    db
      .select({ value: count() })
      .from(tasks)
      .where(
        and(
          eq(tasks.org_id, orgId),
          eq(tasks.is_active, true),
          ne(tasks.status, 'completed'),
          isNotNull(tasks.due_at),
          gte(tasks.due_at, now),
          lte(tasks.due_at, weekEnd),
        ),
      ),

    // 4. Completed this month
    db
      .select({ value: count() })
      .from(tasks)
      .where(
        and(
          eq(tasks.org_id, orgId),
          eq(tasks.is_active, true),
          eq(tasks.status, 'completed'),
          gte(tasks.updated_at, monthStart),
        ),
      ),

    // 5. Under review count
    db
      .select({ value: count() })
      .from(tasks)
      .where(
        and(
          eq(tasks.org_id, orgId),
          eq(tasks.is_active, true),
          eq(tasks.status, 'under_review'),
        ),
      ),

    // 6. Full overdue task rows (for the table)
    db
      .select({
        id:          tasks.id,
        title:       tasks.title,
        due_at:      tasks.due_at,
        assignee_id: tasks.assignee_id,
        client_id:   tasks.client_id,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.org_id, orgId),
          eq(tasks.is_active, true),
          ne(tasks.status, 'completed'),
          isNotNull(tasks.due_at),
          lt(tasks.due_at, now),
        ),
      )
      .orderBy(tasks.due_at),   // oldest due_at first = most overdue first

    // 7. Active (in_progress + under_review) tasks for workload chart
    db
      .select({
        assignee_id: tasks.assignee_id,
        status:      tasks.status,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.org_id, orgId),
          eq(tasks.is_active, true),
          isNotNull(tasks.assignee_id),
        ),
      ),

    // 8. Upcoming deadlines — next 60 days (for calendar)
    db
      .select({
        id:       tasks.id,
        title:    tasks.title,
        due_at:   tasks.due_at,
        client_id: tasks.client_id,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.org_id, orgId),
          eq(tasks.is_active, true),
          ne(tasks.status, 'completed'),
          isNotNull(tasks.due_at),
          gte(tasks.due_at, now),
          lte(tasks.due_at, new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)),
        ),
      )
      .orderBy(tasks.due_at),
  ]);

  // ---------------------------------------------------------------------------
  // Resolve assignee and client names in two batch queries
  // ---------------------------------------------------------------------------

  const assigneeIds = [
    ...new Set(overdueTaskRows.map((t) => t.assignee_id).filter(Boolean) as string[]),
  ];
  const clientIds = [
    ...new Set(
      [...overdueTaskRows, ...deadlineRows]
        .map((t) => t.client_id)
        .filter(Boolean) as string[],
    ),
  ];
  const workloadAssigneeIds = [
    ...new Set(activeTaskRows.map((t) => t.assignee_id).filter(Boolean) as string[]),
  ];
  const allProfileIds = [...new Set([...assigneeIds, ...workloadAssigneeIds])];

  const [profileRows, clientRows] = await Promise.all([
    allProfileIds.length > 0
      ? db.query.profiles.findMany({
          where: (p, { inArray }) => inArray(p.id, allProfileIds),
          columns: { id: true, full_name: true },
        })
      : Promise.resolve([]),
    clientIds.length > 0
      ? db.query.clients.findMany({
          where: (c, { inArray }) => inArray(c.id, clientIds),
          columns: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const profileMap = new Map(profileRows.map((p) => [p.id, p]));
  const clientMap  = new Map(clientRows.map((c) => [c.id, c]));

  // ---------------------------------------------------------------------------
  // Build overdue list
  // ---------------------------------------------------------------------------

  const overdue: OverdueTask[] = overdueTaskRows.map((t) => {
    const msOverdue  = now.getTime() - new Date(t.due_at!).getTime();
    const daysOverdue = Math.max(1, Math.floor(msOverdue / (1000 * 60 * 60 * 24)));
    return {
      id:          t.id,
      title:       t.title,
      daysOverdue,
      assignee:    t.assignee_id ? (profileMap.get(t.assignee_id) ?? null) : null,
      client:      t.client_id  ? (clientMap.get(t.client_id)   ?? null) : null,
    };
  });

  // ---------------------------------------------------------------------------
  // Build workload chart — count in_progress and under_review per assignee
  // ---------------------------------------------------------------------------

  const workloadMap = new Map<string, { inProgress: number; underReview: number }>();
  for (const t of activeTaskRows) {
    if (!t.assignee_id) continue;
    if (!workloadMap.has(t.assignee_id)) {
      workloadMap.set(t.assignee_id, { inProgress: 0, underReview: 0 });
    }
    const entry = workloadMap.get(t.assignee_id)!;
    if (t.status === 'in_progress')  entry.inProgress++;
    if (t.status === 'under_review') entry.underReview++;
  }

  const workload: WorkloadEntry[] = [...workloadMap.entries()]
    .map(([userId, counts]) => ({
      userId,
      userName:    profileMap.get(userId)?.full_name ?? 'Unknown',
      inProgress:  counts.inProgress,
      underReview: counts.underReview,
    }))
    .filter((e) => e.inProgress + e.underReview > 0)
    .sort((a, b) => (b.inProgress + b.underReview) - (a.inProgress + a.underReview));

  // ---------------------------------------------------------------------------
  // Build deadline calendar events
  // ---------------------------------------------------------------------------

  const deadlines: UpcomingDeadline[] = deadlineRows.map((t) => ({
    id:     t.id,
    title:  t.title,
    due_at: t.due_at!,
    client: t.client_id ? (clientMap.get(t.client_id) ?? null) : null,
  }));

  // ---------------------------------------------------------------------------
  // Compose stats
  // ---------------------------------------------------------------------------

  const stats: DashboardStats = {
    totalTasks:         totalRow[0]?.value       ?? 0,
    overdueTasks:       overdueRow[0]?.value      ?? 0,
    dueSoonTasks:       dueSoonRow[0]?.value      ?? 0,
    completedThisMonth: completedRow[0]?.value    ?? 0,
    underReview:        underReviewRow[0]?.value  ?? 0,
  };

  return { error: null, data: { stats, overdue, workload, deadlines } };
}
