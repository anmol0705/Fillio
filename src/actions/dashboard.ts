'use server';
import 'server-only';

import { and, count, eq, gt, gte, lt, lte, ne, isNotNull } from 'drizzle-orm';
import { db } from '@/db';
import { tasks, profiles, clients, task_access } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth/getUser';

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type DashboardStats = {
  totalTasks:         number;
  overdueTasks:       number;
  dueSoonTasks:       number;
  completedThisMonth: number;
  underReview:        number;
};

export type MemberStats = {
  myTotal:      number;
  myOverdue:    number;
  myDueSoon:    number;
  myInProgress: number;
  myUnderReview: number;
};

export type OverdueTask = {
  id:          string;
  title:       string;
  type:        string;
  daysOverdue: number;
  assignee:    { id: string; full_name: string } | null;
  client:      { id: string; name: string } | null;
};

export type WorkloadEntry = {
  userId:      string;
  userName:    string;
  inProgress:  number;
  underReview: number;
  notStarted:  number;
};

export type UpcomingDeadline = {
  id:       string;
  title:    string;
  type:     string;
  due_at:   Date;
  assignee: { id: string; full_name: string } | null;
  client:   { id: string; name: string } | null;
};

export type DashboardData = {
  isAdmin:      boolean;
  userId:       string;
  stats:        DashboardStats;
  memberStats:  MemberStats;
  overdue:      OverdueTask[];
  myOverdue:    OverdueTask[];
  workload:     WorkloadEntry[];
  deadlines:    UpcomingDeadline[];
  myDeadlines:  UpcomingDeadline[];
};

// ---------------------------------------------------------------------------
// getDashboardData
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

  const { org_id: orgId, is_org_admin: isAdmin } = profile;
  const now        = new Date();
  const weekEnd    = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const activeNotCompleted = and(
    eq(tasks.org_id, orgId),
    eq(tasks.is_active, true),
    ne(tasks.status, 'completed'),
  );

  const myActiveNotCompleted = and(
    eq(tasks.org_id, orgId),
    eq(tasks.is_active, true),
    ne(tasks.status, 'completed'),
    eq(tasks.assignee_id, user.id),
  );

  const [
    totalRow,
    overdueRow,
    dueSoonRow,
    completedRow,
    underReviewRow,
    myTotalRow,
    myOverdueRow,
    myDueSoonRow,
    myInProgressRow,
    myUnderReviewRow,
    overdueTaskRows,
    myOverdueTaskRows,
    activeTaskRows,
    deadlineRows,
    myDeadlineRows,
  ] = await Promise.all([
    // Firm-wide stats
    db.select({ value: count() }).from(tasks).where(activeNotCompleted),
    db.select({ value: count() }).from(tasks).where(and(activeNotCompleted, isNotNull(tasks.due_at), lt(tasks.due_at, now))),
    db.select({ value: count() }).from(tasks).where(and(activeNotCompleted, isNotNull(tasks.due_at), gte(tasks.due_at, now), lte(tasks.due_at, weekEnd))),
    db.select({ value: count() }).from(tasks).where(and(eq(tasks.org_id, orgId), eq(tasks.is_active, true), eq(tasks.status, 'completed'), gte(tasks.updated_at, monthStart))),
    db.select({ value: count() }).from(tasks).where(and(activeNotCompleted, eq(tasks.status, 'under_review'))),

    // Member-specific stats
    db.select({ value: count() }).from(tasks).where(myActiveNotCompleted),
    db.select({ value: count() }).from(tasks).where(and(myActiveNotCompleted, isNotNull(tasks.due_at), lt(tasks.due_at, now))),
    db.select({ value: count() }).from(tasks).where(and(myActiveNotCompleted, isNotNull(tasks.due_at), gte(tasks.due_at, now), lte(tasks.due_at, weekEnd))),
    db.select({ value: count() }).from(tasks).where(and(myActiveNotCompleted, eq(tasks.status, 'in_progress'))),
    db.select({ value: count() }).from(tasks).where(and(myActiveNotCompleted, eq(tasks.status, 'under_review'))),

    // Firm-wide overdue list
    db.select({ id: tasks.id, title: tasks.title, type: tasks.type, due_at: tasks.due_at, assignee_id: tasks.assignee_id, client_id: tasks.client_id })
      .from(tasks)
      .where(and(activeNotCompleted, isNotNull(tasks.due_at), lt(tasks.due_at, now)))
      .orderBy(tasks.due_at),

    // My overdue list
    db.select({ id: tasks.id, title: tasks.title, type: tasks.type, due_at: tasks.due_at, assignee_id: tasks.assignee_id, client_id: tasks.client_id })
      .from(tasks)
      .where(and(myActiveNotCompleted, isNotNull(tasks.due_at), lt(tasks.due_at, now)))
      .orderBy(tasks.due_at),

    // Active tasks for workload chart
    db.select({ assignee_id: tasks.assignee_id, status: tasks.status })
      .from(tasks)
      .where(and(eq(tasks.org_id, orgId), eq(tasks.is_active, true), isNotNull(tasks.assignee_id), ne(tasks.status, 'completed'))),

    // Firm deadlines (next 60 days)
    db.select({ id: tasks.id, title: tasks.title, type: tasks.type, due_at: tasks.due_at, assignee_id: tasks.assignee_id, client_id: tasks.client_id })
      .from(tasks)
      .where(and(activeNotCompleted, isNotNull(tasks.due_at), gte(tasks.due_at, now), lte(tasks.due_at, new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000))))
      .orderBy(tasks.due_at),

    // My deadlines (next 60 days)
    db.select({ id: tasks.id, title: tasks.title, type: tasks.type, due_at: tasks.due_at, assignee_id: tasks.assignee_id, client_id: tasks.client_id })
      .from(tasks)
      .where(and(myActiveNotCompleted, isNotNull(tasks.due_at), gte(tasks.due_at, now), lte(tasks.due_at, new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000))))
      .orderBy(tasks.due_at),
  ]);

  // Resolve names in batch
  const allTaskRows = [...overdueTaskRows, ...myOverdueTaskRows, ...deadlineRows, ...myDeadlineRows];
  const assigneeIds = [...new Set(allTaskRows.map(t => t.assignee_id).filter(Boolean) as string[])];
  const clientIds   = [...new Set(allTaskRows.map(t => t.client_id).filter(Boolean) as string[])];
  const workloadIds = [...new Set(activeTaskRows.map(t => t.assignee_id).filter(Boolean) as string[])];
  const allProfileIds = [...new Set([...assigneeIds, ...workloadIds])];

  const [profileRows, clientRows] = await Promise.all([
    allProfileIds.length > 0
      ? db.query.profiles.findMany({ where: (p, { inArray }) => inArray(p.id, allProfileIds), columns: { id: true, full_name: true } })
      : [],
    clientIds.length > 0
      ? db.query.clients.findMany({ where: (c, { inArray }) => inArray(c.id, clientIds), columns: { id: true, name: true } })
      : [],
  ]);

  const profileMap = new Map(profileRows.map(p => [p.id, p]));
  const clientMap  = new Map(clientRows.map(c => [c.id, c]));

  function buildOverdue(rows: typeof overdueTaskRows): OverdueTask[] {
    return rows.map(t => ({
      id:          t.id,
      title:       t.title,
      type:        t.type,
      daysOverdue: Math.max(1, Math.floor((now.getTime() - new Date(t.due_at!).getTime()) / 86400000)),
      assignee:    t.assignee_id ? (profileMap.get(t.assignee_id) ?? null) : null,
      client:      t.client_id  ? (clientMap.get(t.client_id) ?? null) : null,
    }));
  }

  function buildDeadlines(rows: typeof deadlineRows): UpcomingDeadline[] {
    return rows.map(t => ({
      id:       t.id,
      title:    t.title,
      type:     t.type,
      due_at:   t.due_at!,
      assignee: t.assignee_id ? (profileMap.get(t.assignee_id) ?? null) : null,
      client:   t.client_id  ? (clientMap.get(t.client_id) ?? null) : null,
    }));
  }

  // Workload chart
  const workloadMap = new Map<string, { inProgress: number; underReview: number; notStarted: number }>();
  for (const t of activeTaskRows) {
    if (!t.assignee_id) continue;
    if (!workloadMap.has(t.assignee_id)) workloadMap.set(t.assignee_id, { inProgress: 0, underReview: 0, notStarted: 0 });
    const e = workloadMap.get(t.assignee_id)!;
    if (t.status === 'in_progress')   e.inProgress++;
    if (t.status === 'under_review')  e.underReview++;
    if (t.status === 'not_started')   e.notStarted++;
  }

  const workload: WorkloadEntry[] = [...workloadMap.entries()]
    .map(([userId, c]) => ({ userId, userName: profileMap.get(userId)?.full_name ?? 'Unknown', ...c }))
    .sort((a, b) => (b.inProgress + b.underReview) - (a.inProgress + a.underReview));

  return {
    error: null,
    data: {
      isAdmin,
      userId: user.id,
      stats: {
        totalTasks:         totalRow[0]?.value      ?? 0,
        overdueTasks:       overdueRow[0]?.value    ?? 0,
        dueSoonTasks:       dueSoonRow[0]?.value    ?? 0,
        completedThisMonth: completedRow[0]?.value  ?? 0,
        underReview:        underReviewRow[0]?.value ?? 0,
      },
      memberStats: {
        myTotal:       myTotalRow[0]?.value       ?? 0,
        myOverdue:     myOverdueRow[0]?.value     ?? 0,
        myDueSoon:     myDueSoonRow[0]?.value     ?? 0,
        myInProgress:  myInProgressRow[0]?.value  ?? 0,
        myUnderReview: myUnderReviewRow[0]?.value ?? 0,
      },
      overdue:      buildOverdue(overdueTaskRows),
      myOverdue:    buildOverdue(myOverdueTaskRows),
      workload,
      deadlines:    buildDeadlines(deadlineRows),
      myDeadlines:  buildDeadlines(myDeadlineRows),
    },
  };
}
