'use server';
import 'server-only';

import { z } from 'zod';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db } from '@/db';
import { tasks, task_access, task_audit_log, task_messages, profiles, clients } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth/getUser';
import type {
  Profile, TaskListItem, TaskDetail,
  TaskType, TaskStatus, TaskPriority, AccessLevel,
  TaskMessageWithSender,
} from '@/types';

// ---------------------------------------------------------------------------
// Status transition map — enforces the exact workflow from the spec.
// completed has no valid transitions (immutable).
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  not_started:       ['in_progress'],
  in_progress:       ['under_review'],
  under_review:      ['changes_requested', 'approved'],
  changes_requested: ['in_progress'],
  approved:          ['filed'],
  filed:             ['completed'],
  completed:         [],
};

// ---------------------------------------------------------------------------
// Org member guard — all task operations require an active org member
// ---------------------------------------------------------------------------

type MemberResult = { ok: false; error: string } | { ok: true; profile: Profile };

async function requireOrgMember(): Promise<MemberResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const profile = await db.query.profiles.findFirst({
    where: (p, { eq }) => eq(p.id, user.id),
  });

  if (!profile?.is_active) return { ok: false, error: 'Account is inactive' };
  return { ok: true, profile: profile as Profile };
}

// ---------------------------------------------------------------------------
// Task access guard — checks user has at least `minLevel` on a specific task.
//
// Access hierarchy: owner > editor > viewer
// Completed tasks are readable by anyone with access but editable by nobody.
// ---------------------------------------------------------------------------

const ACCESS_RANK: Record<AccessLevel, number> = { owner: 3, editor: 2, viewer: 1 };

async function getTaskAccess(
  taskId: string,
  userId: string,
): Promise<AccessLevel | null> {
  const row = await db.query.task_access.findFirst({
    where: (ta, { and, eq }) =>
      and(eq(ta.task_id, taskId), eq(ta.user_id, userId)),
  });
  return (row?.level ?? null) as AccessLevel | null;
}

async function requireTaskAccess(
  taskId: string,
  userId: string,
  minLevel: AccessLevel,
): Promise<{ ok: false; error: string } | { ok: true; level: AccessLevel }> {
  const level = await getTaskAccess(taskId, userId);
  if (!level) return { ok: false, error: 'Task not found or access denied' };
  if (ACCESS_RANK[level] < ACCESS_RANK[minLevel]) {
    return { ok: false, error: 'You do not have permission for this action' };
  }
  return { ok: true, level };
}

// ---------------------------------------------------------------------------
// insertAuditLog — always insert via the same db connection (server-side,
// bypasses RLS). Audit log is INSERT-only; never update or delete these rows.
// ---------------------------------------------------------------------------

async function insertAuditLog(entry: {
  task_id:  string;
  org_id:   string;
  actor_id: string;
  action:   typeof task_audit_log.$inferInsert['action'];
  payload?: Record<string, unknown>;
}) {
  await db.insert(task_audit_log).values({
    task_id:  entry.task_id,
    org_id:   entry.org_id,
    actor_id: entry.actor_id,
    action:   entry.action,
    payload:  entry.payload ?? null,
  });
}

// ---------------------------------------------------------------------------
// getMyTasks — tasks the current user has explicit access to
// Supports optional filters: status, type, priority
// ---------------------------------------------------------------------------

export type TaskFilters = {
  status?:   TaskStatus;
  type?:     TaskType;
  priority?: TaskPriority;
};

export async function getMyTasks(filters: TaskFilters = {}): Promise<
  { error: string; data: null } | { error: null; data: TaskListItem[] }
> {
  const result = await requireOrgMember();
  if (!result.ok) return { error: result.error, data: null };

  const userId = result.profile.id;

  // Get task IDs this user has access to
  const accessRows = await db.query.task_access.findMany({
    where: (ta, { eq }) => eq(ta.user_id, userId),
    columns: { task_id: true, level: true },
  });

  if (accessRows.length === 0) return { error: null, data: [] };

  const taskIds   = accessRows.map((r) => r.task_id);
  const accessMap = new Map(accessRows.map((r) => [r.task_id, r.level as AccessLevel]));

  // Aliases for joining profiles twice (creator and assignee)
  const assigneeAlias = alias(profiles, 'assignee');

  const rows = await db
    .select({
      id:           tasks.id,
      title:        tasks.title,
      type:         tasks.type,
      status:       tasks.status,
      priority:     tasks.priority,
      due_at:       tasks.due_at,
      is_open_pool: tasks.is_open_pool,
      created_at:   tasks.created_at,
      assignee_id:  tasks.assignee_id,
      assignee_name: assigneeAlias.full_name,
      client_id:    tasks.client_id,
      client_name:  clients.name,
    })
    .from(tasks)
    .leftJoin(assigneeAlias, eq(assigneeAlias.id, tasks.assignee_id))
    .leftJoin(clients, eq(clients.id, tasks.client_id))
    .where(
      and(
        eq(tasks.org_id, result.profile.org_id),
        eq(tasks.is_active, true),
        inArray(tasks.id, taskIds),
        filters.status   ? eq(tasks.status,   filters.status)   : undefined,
        filters.type     ? eq(tasks.type,      filters.type)     : undefined,
        filters.priority ? eq(tasks.priority,  filters.priority) : undefined,
      )
    )
    .orderBy(desc(tasks.created_at));

  const data: TaskListItem[] = rows.map((r) => ({
    id:           r.id,
    title:        r.title,
    type:         r.type,
    status:       r.status,
    priority:     r.priority,
    due_at:       r.due_at,
    is_open_pool: r.is_open_pool,
    created_at:   r.created_at,
    assignee:     r.assignee_id ? { id: r.assignee_id, full_name: r.assignee_name ?? '' } : null,
    client:       r.client_id   ? { id: r.client_id,   name: r.client_name ?? '' }        : null,
    my_access:    accessMap.get(r.id) ?? null,
  }));

  return { error: null, data };
}

// ---------------------------------------------------------------------------
// getPoolTasks — all open-pool tasks in the org visible to any member
// ---------------------------------------------------------------------------

export async function getPoolTasks(): Promise<
  { error: string; data: null } | { error: null; data: TaskListItem[] }
> {
  const result = await requireOrgMember();
  if (!result.ok) return { error: result.error, data: null };

  const userId = result.profile.id;

  // User's existing access on pool tasks (so we can show if they already claimed)
  const accessRows = await db.query.task_access.findMany({
    where: (ta, { eq }) => eq(ta.user_id, userId),
    columns: { task_id: true, level: true },
  });
  const accessMap = new Map(accessRows.map((r) => [r.task_id, r.level as AccessLevel]));

  const assigneeAlias = alias(profiles, 'assignee');

  const rows = await db
    .select({
      id:           tasks.id,
      title:        tasks.title,
      type:         tasks.type,
      status:       tasks.status,
      priority:     tasks.priority,
      due_at:       tasks.due_at,
      is_open_pool: tasks.is_open_pool,
      created_at:   tasks.created_at,
      assignee_id:  tasks.assignee_id,
      assignee_name: assigneeAlias.full_name,
      client_id:    tasks.client_id,
      client_name:  clients.name,
    })
    .from(tasks)
    .leftJoin(assigneeAlias, eq(assigneeAlias.id, tasks.assignee_id))
    .leftJoin(clients, eq(clients.id, tasks.client_id))
    .where(
      and(
        eq(tasks.org_id, result.profile.org_id),
        eq(tasks.is_active, true),
        eq(tasks.is_open_pool, true),
      )
    )
    .orderBy(desc(tasks.created_at));

  const data: TaskListItem[] = rows.map((r) => ({
    id:           r.id,
    title:        r.title,
    type:         r.type,
    status:       r.status,
    priority:     r.priority,
    due_at:       r.due_at,
    is_open_pool: r.is_open_pool,
    created_at:   r.created_at,
    assignee:     r.assignee_id ? { id: r.assignee_id, full_name: r.assignee_name ?? '' } : null,
    client:       r.client_id   ? { id: r.client_id,   name: r.client_name ?? '' }        : null,
    my_access:    accessMap.get(r.id) ?? null,
  }));

  return { error: null, data };
}

// ---------------------------------------------------------------------------
// getTaskDetail — single task with full related data
// ---------------------------------------------------------------------------

export async function getTaskDetail(taskId: string): Promise<
  { error: string; data: null } | { error: null; data: TaskDetail }
> {
  if (!z.string().uuid().safeParse(taskId).success) {
    return { error: 'Invalid task ID', data: null };
  }

  const result = await requireOrgMember();
  if (!result.ok) return { error: result.error, data: null };

  const userId = result.profile.id;

  // Fetch task
  const task = await db.query.tasks.findFirst({
    where: (t, { and, eq }) =>
      and(eq(t.id, taskId), eq(t.org_id, result.profile.org_id), eq(t.is_active, true)),
  });

  // Allow access if user has task_access OR task is open pool
  const myAccess = await getTaskAccess(taskId, userId);
  if (!task) return { error: 'Task not found', data: null };
  if (!myAccess && !task.is_open_pool) return { error: 'Access denied', data: null };

  // Batch-fetch all profiles needed (creator + assignee + access list)
  const accessRows = await db.query.task_access.findMany({
    where: (ta, { eq }) => eq(ta.task_id, taskId),
  });

  const profileIds = [
    task.creator_id,
    task.assignee_id,
    ...accessRows.map((r) => r.user_id),
  ].filter(Boolean) as string[];

  const [allProfiles, clientRow, auditRows] = await Promise.all([
    db.query.profiles.findMany({
      where: (p, { inArray }) => inArray(p.id, [...new Set(profileIds)]),
      columns: { id: true, full_name: true },
    }),
    task.client_id
      ? db.query.clients.findFirst({
          where: (c, { eq }) => eq(c.id, task.client_id!),
          columns: { id: true, name: true },
        })
      : Promise.resolve(null),
    db.query.task_audit_log.findMany({
      where: (a, { eq }) => eq(a.task_id, taskId),
      orderBy: (a, { asc }) => [asc(a.created_at)],
    }),
  ]);

  const profileMap = new Map(allProfiles.map((p) => [p.id, p]));

  const detail: TaskDetail = {
    ...(task as any),
    creator:  profileMap.get(task.creator_id) ?? { id: task.creator_id, full_name: 'Unknown' },
    assignee: task.assignee_id ? (profileMap.get(task.assignee_id) ?? null) : null,
    client:   clientRow ?? null,
    access:   accessRows.map((r) => ({
      ...r,
      profile: profileMap.get(r.user_id) ?? { full_name: 'Unknown' },
    })) as TaskDetail['access'],
    audit_log: auditRows.map((r) => ({
      ...r,
      actor: profileMap.get(r.actor_id) ?? { full_name: 'Unknown' },
    })) as TaskDetail['audit_log'],
    my_access: myAccess,
  };

  return { error: null, data: detail };
}

// ---------------------------------------------------------------------------
// createTask
// ---------------------------------------------------------------------------

const CreateTaskSchema = z.object({
  title:          z.string().min(1, 'Title is required').max(300),
  description:    z.string().max(5000).optional(),
  type:           z.enum(['gst','tds','income_tax','audit','roc_mca','accounting','payroll','notice','advisory','other']),
  priority:       z.enum(['urgent','high','medium','low']).default('medium'),
  due_at:         z.string().datetime({ offset: true }).nullable().optional(),
  client_id:      z.string().uuid().nullable().optional(),
  financial_year: z.string().max(10).nullable().optional(),
  assignee_id:    z.string().uuid().nullable().optional(),
  is_open_pool:   z.boolean().default(false),
});

export async function createTask(
  raw: unknown
): Promise<{ error: string } | { data: { id: string } }> {
  const result = await requireOrgMember();
  if (!result.ok) return { error: result.error };

  const parsed = CreateTaskSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const { due_at, ...rest } = parsed.data;
  const creatorId = result.profile.id;
  const orgId     = result.profile.org_id;

  const [task] = await db
    .insert(tasks)
    .values({
      org_id:     orgId,
      creator_id: creatorId,
      due_at:     due_at ? new Date(due_at) : null,
      ...rest,
    })
    .returning({ id: tasks.id });

  // Grant owner access to creator, editor to assignee (if different)
  const accessEntries: (typeof task_access.$inferInsert)[] = [
    { task_id: task.id, user_id: creatorId, level: 'owner', granted_by: creatorId },
  ];

  const assigneeId = parsed.data.assignee_id;
  if (assigneeId && assigneeId !== creatorId) {
    accessEntries.push({
      task_id: task.id, user_id: assigneeId, level: 'editor', granted_by: creatorId,
    });
  }

  await db.insert(task_access).values(accessEntries);

  await insertAuditLog({
    task_id:  task.id,
    org_id:   orgId,
    actor_id: creatorId,
    action:   'created',
    payload:  { title: parsed.data.title },
  });

  return { data: { id: task.id } };
}

// ---------------------------------------------------------------------------
// updateTask — owner only, blocked on completed tasks
// ---------------------------------------------------------------------------

const UpdateTaskSchema = z.object({
  taskId:         z.string().uuid(),
  title:          z.string().min(1).max(300).optional(),
  description:    z.string().max(5000).nullable().optional(),
  priority:       z.enum(['urgent','high','medium','low']).optional(),
  due_at:         z.string().datetime({ offset: true }).nullable().optional(),
  client_id:      z.string().uuid().nullable().optional(),
  financial_year: z.string().max(10).nullable().optional(),
  assignee_id:    z.string().uuid().nullable().optional(),
  is_open_pool:   z.boolean().optional(),
});

export async function updateTask(
  raw: unknown
): Promise<{ error: string } | { data: 'ok' }> {
  const result = await requireOrgMember();
  if (!result.ok) return { error: result.error };

  const parsed = UpdateTaskSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const { taskId, due_at, ...rest } = parsed.data;

  const access = await requireTaskAccess(taskId, result.profile.id, 'owner');
  if (!access.ok) return { error: access.error };

  const task = await db.query.tasks.findFirst({
    where: (t, { eq }) => eq(t.id, taskId),
    columns: { status: true, assignee_id: true },
  });
  if (!task) return { error: 'Task not found' };
  if (task.status === 'completed') return { error: 'Completed tasks cannot be edited' };

  const prevAssigneeId = task.assignee_id;
  const newAssigneeId  = parsed.data.assignee_id;

  await db
    .update(tasks)
    .set({ ...rest, due_at: due_at !== undefined ? (due_at ? new Date(due_at) : null) : undefined, updated_at: new Date() })
    .where(eq(tasks.id, taskId));

  // If assignee changed, update task_access
  if (newAssigneeId !== undefined && newAssigneeId !== prevAssigneeId) {
    if (newAssigneeId && newAssigneeId !== result.profile.id) {
      await db
        .insert(task_access)
        .values({ task_id: taskId, user_id: newAssigneeId, level: 'editor', granted_by: result.profile.id })
        .onConflictDoNothing();
    }
    await insertAuditLog({
      task_id:  taskId,
      org_id:   result.profile.org_id,
      actor_id: result.profile.id,
      action:   'reassigned',
      payload:  { from: prevAssigneeId, to: newAssigneeId },
    });
  } else {
    await insertAuditLog({
      task_id:  taskId,
      org_id:   result.profile.org_id,
      actor_id: result.profile.id,
      action:   'edited',
    });
  }

  return { data: 'ok' };
}

// ---------------------------------------------------------------------------
// updateTaskStatus — editor or owner, enforces transition table
// ---------------------------------------------------------------------------

export async function updateTaskStatus(
  taskId: string,
  newStatus: TaskStatus,
): Promise<{ error: string } | { data: 'ok' }> {
  if (!z.string().uuid().safeParse(taskId).success) return { error: 'Invalid task ID' };

  const result = await requireOrgMember();
  if (!result.ok) return { error: result.error };

  const access = await requireTaskAccess(taskId, result.profile.id, 'editor');
  if (!access.ok) return { error: access.error };

  const task = await db.query.tasks.findFirst({
    where: (t, { eq }) => eq(t.id, taskId),
    columns: { status: true, org_id: true },
  });
  if (!task) return { error: 'Task not found' };
  if (task.status === 'completed') return { error: 'Completed tasks are immutable' };

  const allowed = VALID_TRANSITIONS[task.status];
  if (!allowed.includes(newStatus)) {
    return { error: `Cannot transition from ${task.status} to ${newStatus}` };
  }

  await db.update(tasks).set({ status: newStatus, updated_at: new Date() }).where(eq(tasks.id, taskId));

  await insertAuditLog({
    task_id:  taskId,
    org_id:   task.org_id,
    actor_id: result.profile.id,
    action:   'status_changed',
    payload:  { from: task.status, to: newStatus },
  });

  return { data: 'ok' };
}

// ---------------------------------------------------------------------------
// deleteTask — soft delete, owner only
// ---------------------------------------------------------------------------

export async function deleteTask(
  taskId: string,
): Promise<{ error: string } | { data: 'ok' }> {
  if (!z.string().uuid().safeParse(taskId).success) return { error: 'Invalid task ID' };

  const result = await requireOrgMember();
  if (!result.ok) return { error: result.error };

  const access = await requireTaskAccess(taskId, result.profile.id, 'owner');
  if (!access.ok) return { error: access.error };

  await db.update(tasks).set({ is_active: false, updated_at: new Date() }).where(eq(tasks.id, taskId));

  return { data: 'ok' };
}

// ---------------------------------------------------------------------------
// grantAccess — owner grants editor or viewer access to any org member
// ---------------------------------------------------------------------------

export async function grantAccess(
  taskId: string,
  targetUserId: string,
  level: 'editor' | 'viewer',
): Promise<{ error: string } | { data: 'ok' }> {
  if (!z.string().uuid().safeParse(taskId).success) return { error: 'Invalid task ID' };
  if (!z.string().uuid().safeParse(targetUserId).success) return { error: 'Invalid user ID' };

  const result = await requireOrgMember();
  if (!result.ok) return { error: result.error };

  const access = await requireTaskAccess(taskId, result.profile.id, 'owner');
  if (!access.ok) return { error: access.error };

  // Verify target user is in same org
  const targetProfile = await db.query.profiles.findFirst({
    where: (p, { and, eq }) =>
      and(eq(p.id, targetUserId), eq(p.org_id, result.profile.org_id)),
    columns: { id: true, full_name: true },
  });
  if (!targetProfile) return { error: 'User not found in your organisation' };

  await db
    .insert(task_access)
    .values({ task_id: taskId, user_id: targetUserId, level, granted_by: result.profile.id })
    .onConflictDoUpdate({
      target: [task_access.task_id, task_access.user_id],
      set:    { level, granted_by: result.profile.id },
    });

  await insertAuditLog({
    task_id:  taskId,
    org_id:   result.profile.org_id,
    actor_id: result.profile.id,
    action:   'access_granted',
    payload:  { to: targetProfile.full_name, level },
  });

  return { data: 'ok' };
}

// ---------------------------------------------------------------------------
// claimPoolTask — any org member can self-assign an open-pool task
// ---------------------------------------------------------------------------

export async function claimPoolTask(
  taskId: string,
): Promise<{ error: string } | { data: 'ok' }> {
  if (!z.string().uuid().safeParse(taskId).success) return { error: 'Invalid task ID' };

  const result = await requireOrgMember();
  if (!result.ok) return { error: result.error };

  const task = await db.query.tasks.findFirst({
    where: (t, { and, eq }) =>
      and(eq(t.id, taskId), eq(t.org_id, result.profile.org_id), eq(t.is_active, true)),
    columns: { id: true, is_open_pool: true, assignee_id: true, org_id: true, status: true },
  });

  if (!task) return { error: 'Task not found' };
  if (!task.is_open_pool) return { error: 'This task is not in the open pool' };
  if (task.status === 'completed') return { error: 'Task is already completed' };
  if (task.assignee_id === result.profile.id) return { error: 'You already own this task' };

  const userId = result.profile.id;

  // Atomic conditional update — only succeeds if assignee_id is still NULL or
  // already this user at the moment the DB executes the statement. This prevents
  // a race where two concurrent claims both pass the application-level check and
  // the second silently overwrites the first.
  const updated = await db
    .update(tasks)
    .set({ assignee_id: userId, updated_at: new Date() })
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.is_open_pool, true),
        or(isNull(tasks.assignee_id), eq(tasks.assignee_id, userId)),
      )
    )
    .returning({ id: tasks.id });

  if (updated.length === 0) {
    return { error: 'This task was just claimed by someone else. Refresh to see the latest.' };
  }

  await db
    .insert(task_access)
    .values({ task_id: taskId, user_id: userId, level: 'editor', granted_by: userId })
    .onConflictDoNothing();

  await insertAuditLog({
    task_id:  taskId,
    org_id:   task.org_id,
    actor_id: userId,
    action:   'reassigned',
    payload:  { from: task.assignee_id, to: userId, via: 'pool_claim' },
  });

  return { data: 'ok' };
}

// ---------------------------------------------------------------------------
// getTaskMessages — load full message history for a task (server-side initial
// load; Realtime handles incremental updates after that)
// ---------------------------------------------------------------------------

export async function getTaskMessages(taskId: string): Promise<
  { error: string; data: null } | { error: null; data: TaskMessageWithSender[] }
> {
  if (!z.string().uuid().safeParse(taskId).success) {
    return { error: 'Invalid task ID', data: null };
  }

  const result = await requireOrgMember();
  if (!result.ok) return { error: result.error, data: null };

  const task = await db.query.tasks.findFirst({
    where: (t, { and, eq }) =>
      and(eq(t.id, taskId), eq(t.org_id, result.profile.org_id), eq(t.is_active, true)),
    columns: { id: true, is_open_pool: true },
  });
  if (!task) return { error: 'Task not found', data: null };

  const myAccess = await getTaskAccess(taskId, result.profile.id);
  if (!myAccess && !task.is_open_pool) return { error: 'Access denied', data: null };

  const rows = await db.query.task_messages.findMany({
    where: (m, { eq }) => eq(m.task_id, taskId),
    orderBy: (m, { asc }) => [asc(m.created_at)],
  });

  if (rows.length === 0) return { error: null, data: [] };

  const senderIds = [...new Set(rows.map((r) => r.sender_id))];
  const senders   = await db.query.profiles.findMany({
    where: (p, { inArray }) => inArray(p.id, senderIds),
    columns: { id: true, full_name: true },
  });
  const senderMap = new Map(senders.map((s) => [s.id, s]));

  const data: TaskMessageWithSender[] = rows.map((r) => ({
    ...r,
    sender: senderMap.get(r.sender_id) ?? { id: r.sender_id, full_name: 'Unknown' },
  }));

  return { error: null, data };
}

// ---------------------------------------------------------------------------
// sendMessage — any user with any access level (or open pool) can send
// ---------------------------------------------------------------------------

export async function sendMessage(
  taskId: string,
  body:   string,
): Promise<{ error: string } | { data: TaskMessageWithSender }> {
  if (!z.string().uuid().safeParse(taskId).success) return { error: 'Invalid task ID' };

  const trimmed = body.trim();
  if (!trimmed)               return { error: 'Message cannot be empty' };
  if (trimmed.length > 4000)  return { error: 'Message too long (max 4000 characters)' };

  const result = await requireOrgMember();
  if (!result.ok) return { error: result.error };

  const task = await db.query.tasks.findFirst({
    where: (t, { and, eq }) =>
      and(eq(t.id, taskId), eq(t.org_id, result.profile.org_id), eq(t.is_active, true)),
    columns: { id: true, is_open_pool: true, org_id: true },
  });
  if (!task) return { error: 'Task not found' };

  const myAccess = await getTaskAccess(taskId, result.profile.id);
  if (!myAccess && !task.is_open_pool) return { error: 'Access denied' };

  const [msg] = await db
    .insert(task_messages)
    .values({
      task_id:   taskId,
      org_id:    task.org_id,
      sender_id: result.profile.id,
      body:      trimmed,
    })
    .returning();

  await insertAuditLog({
    task_id:  taskId,
    org_id:   task.org_id,
    actor_id: result.profile.id,
    action:   'comment_added',
  });

  return {
    data: {
      ...msg,
      sender: { id: result.profile.id, full_name: result.profile.full_name },
    },
  };
}
