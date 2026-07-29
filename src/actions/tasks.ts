'use server';

import { z } from 'zod';
import { db } from '@/db';
import { tasks, task_access, task_messages } from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth/getUser';
import { createAdminClient } from '@/lib/supabase/server';
import {
  createTaskSchema,
  updateStatusSchema,
  addMessageSchema,
  STATUS_TRANSITIONS,
} from '@/lib/validations/task';
import type { Task, TaskWithRelations, TaskDetailWithAll, Profile, TaskAccess, TaskAuditLog } from '@/types';

// ---------------------------------------------------------------------------
// Internal context helpers
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
// Admin-only write helpers
// task_audit_log, task_access, notifications must go through adminClient
// ---------------------------------------------------------------------------

type AuditAction =
  | 'created'
  | 'status_changed'
  | 'reassigned'
  | 'comment_added'
  | 'file_uploaded'
  | 'access_granted';

async function insertAuditLog(params: {
  task_id: string;
  actor_id: string;
  action: AuditAction;
  old_value?: string | null;
  new_value?: string | null;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from('task_audit_log').insert({
    task_id: params.task_id,
    actor_id: params.actor_id,
    action: params.action,
    old_value: params.old_value ?? null,
    new_value: params.new_value ?? null,
  });
  if (error) {
    // Audit log failures are non-fatal but must be logged server-side
    console.error('[insertAuditLog]', error);
  }
}

async function insertNotification(params: {
  org_id: string;
  user_id: string;
  task_id: string;
  title: string;
  body?: string;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from('notifications').insert(params);
  if (error) {
    console.error('[insertNotification]', error);
  }
}

// ---------------------------------------------------------------------------
// createTask
// ---------------------------------------------------------------------------

export async function createTask(
  input: z.infer<typeof createTaskSchema>,
): Promise<{ data: Task } | { error: string }> {
  const ctx = await resolveUser();
  if (isErrorResult(ctx)) return ctx;

  const parsed = createTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.message };
  }

  const data = parsed.data;

  // Validate client_id belongs to same org if provided
  if (data.client_id) {
    const client = await db.query.clients.findFirst({
      where: (c, { and, eq }) =>
        and(eq(c.id, data.client_id!), eq(c.org_id, ctx.orgId), eq(c.is_active, true)),
      columns: { id: true },
    });
    if (!client) return { error: 'Client not found in this organisation' };
  }

  // Validate assignee_id belongs to same org if provided
  if (data.assignee_id) {
    const assignee = await db.query.profiles.findFirst({
      where: (p, { and, eq }) =>
        and(eq(p.id, data.assignee_id!), eq(p.org_id, ctx.orgId), eq(p.is_active, true)),
      columns: { id: true },
    });
    if (!assignee) return { error: 'Assignee not found in this organisation' };
  }

  try {
    const [task] = await db
      .insert(tasks)
      .values({
        ...data,
        org_id: ctx.orgId,
        creator_id: ctx.userId,
        due_at: data.due_at ? new Date(data.due_at) : null,
      })
      .returning();

    const admin = createAdminClient();

    // task_access rows must be inserted via adminClient — no RLS INSERT policy
    const accessRows: {
      task_id: string;
      user_id: string;
      access_level: 'owner' | 'editor' | 'viewer';
    }[] = [{ task_id: task.id, user_id: ctx.userId, access_level: 'owner' }];

    if (data.assignee_id && data.assignee_id !== ctx.userId) {
      accessRows.push({
        task_id: task.id,
        user_id: data.assignee_id,
        access_level: 'editor',
      });
    }

    const { error: accessError } = await admin.from('task_access').insert(accessRows);
    if (accessError) {
      console.error(JSON.stringify({ level: 'error', fn: 'createTask', step: 'task_access', err: accessError.message }));
      // Rollback: delete the task we just created so no orphan is left
      await db.delete(tasks).where(eq(tasks.id, task.id));
      return { error: 'Failed to create task — access grant failed. Please try again.' };
    }

    await insertAuditLog({
      task_id: task.id,
      actor_id: ctx.userId,
      action: 'created',
      new_value: task.title,
    });

    if (data.assignee_id && data.assignee_id !== ctx.userId) {
      await insertNotification({
        org_id: ctx.orgId,
        user_id: data.assignee_id,
        task_id: task.id,
        title: 'New task assigned',
        body: task.title,
      });
    }

    return { data: task };
  } catch (err) {
    console.error('[createTask]', err);
    return { error: 'Failed to create task' };
  }
}

// ---------------------------------------------------------------------------
// updateTaskStatus
// ---------------------------------------------------------------------------

export async function updateTaskStatus(
  input: z.infer<typeof updateStatusSchema>,
): Promise<{ data: Task } | { error: string }> {
  const ctx = await resolveUser();
  if (isErrorResult(ctx)) return ctx;

  const parsed = updateStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.message };
  }

  const { task_id, new_status } = parsed.data;

  // Verify caller has edit or owner access to this task
  const access = await db.query.task_access.findFirst({
    where: (ta, { and, eq, inArray }) =>
      and(
        eq(ta.task_id, task_id),
        eq(ta.user_id, ctx.userId),
        inArray(ta.access_level, ['owner', 'editor']),
      ),
    columns: { access_level: true },
  });
  if (!access) return { error: 'Forbidden: no edit access to this task' };

  const task = await db.query.tasks.findFirst({
    where: (t, { and, eq }) =>
      and(eq(t.id, task_id), eq(t.org_id, ctx.orgId), eq(t.is_active, true)),
  });
  if (!task) return { error: 'Task not found' };

  if (task.status === 'completed') {
    return { error: 'Completed tasks are immutable' };
  }

  const allowed = STATUS_TRANSITIONS[task.status] ?? [];
  if (!allowed.includes(new_status)) {
    return { error: `Invalid transition: ${task.status} → ${new_status}` };
  }

  try {
    const [updated] = await db
      .update(tasks)
      .set({ status: new_status, updated_at: new Date() })
      .where(and(eq(tasks.id, task_id), eq(tasks.org_id, ctx.orgId)))
      .returning();

    await insertAuditLog({
      task_id,
      actor_id: ctx.userId,
      action: 'status_changed',
      old_value: task.status,
      new_value: new_status,
    });

    // Notify task creator when a different user submits for review
    if (new_status === 'under_review' && task.creator_id !== ctx.userId) {
      await insertNotification({
        org_id: ctx.orgId,
        user_id: task.creator_id,
        task_id,
        title: 'Task ready for review',
        body: task.title,
      });
    }

    return { data: updated };
  } catch (err) {
    console.error('[updateTaskStatus]', err);
    return { error: 'Failed to update task status' };
  }
}

// ---------------------------------------------------------------------------
// getMyTasks
// ---------------------------------------------------------------------------

const filtersSchema = z
  .object({
    status: z
      .enum([
        'not_started',
        'in_progress',
        'under_review',
        'changes_requested',
        'approved',
        'filed',
        'completed',
      ])
      .optional(),
    task_type: z
      .enum([
        'gst',
        'tds',
        'income_tax',
        'audit',
        'roc_mca',
        'accounting',
        'payroll',
        'notice',
        'advisory',
        'other',
      ])
      .optional(),
    priority: z.enum(['urgent', 'high', 'medium', 'low']).optional(),
    assignee_id: z.string().uuid().optional(),
  })
  .optional();

export async function getMyTasks(
  filters?: z.infer<typeof filtersSchema>,
): Promise<{ data: TaskWithRelations[] } | { error: string }> {
  const ctx = await resolveUser();
  if (isErrorResult(ctx)) return ctx;

  const parsedFilters = filtersSchema.safeParse(filters);
  if (!parsedFilters.success) return { error: 'Invalid filters' };
  const f = parsedFilters.data;

  try {
    // Fetch task IDs the user has access to
    const accessRows = await db
      .select({ task_id: task_access.task_id })
      .from(task_access)
      .where(eq(task_access.user_id, ctx.userId));

    if (accessRows.length === 0) return { data: [] };

    const taskIds = accessRows.map((r) => r.task_id);

    const result = await db.query.tasks.findMany({
      where: (t, { and, eq, inArray }) => {
        const conditions = [
          inArray(t.id, taskIds),
          eq(t.org_id, ctx.orgId),
          eq(t.is_active, true),
        ];
        if (f?.status) {
          conditions.push(eq(t.status, f.status));
        }
        if (f?.priority) {
          conditions.push(eq(t.priority, f.priority));
        }
        if (f?.task_type) {
          conditions.push(eq(t.task_type, f.task_type));
        }
        if (f?.assignee_id) {
          conditions.push(eq(t.assignee_id, f.assignee_id));
        }
        return and(...conditions);
      },
      with: {
        client: true,
        assignee: true,
        creator: true,
      },
      orderBy: (t, { desc }) => [desc(t.updated_at)],
    });

    return { data: result as TaskWithRelations[] };
  } catch (err) {
    console.error('[getMyTasks]', err);
    return { error: 'Failed to fetch tasks' };
  }
}

// ---------------------------------------------------------------------------
// getTaskDetail
// ---------------------------------------------------------------------------

export async function getTaskDetail(
  id: string,
): Promise<{ data: TaskDetailWithAll | null } | { error: string }> {
  const ctx = await resolveUser();
  if (isErrorResult(ctx)) return ctx;

  const idParsed = z.string().uuid().safeParse(id);
  if (!idParsed.success) return { error: 'Invalid task id' };

  try {
    const task = await db.query.tasks.findFirst({
      where: (t, { and, eq }) =>
        and(eq(t.id, id), eq(t.org_id, ctx.orgId), eq(t.is_active, true)),
      with: {
        client: true,
        assignee: true,
        creator: true,
        access: {
          with: { user: true },
        },
        auditLog: {
          with: { actor: true },
          orderBy: (al, { asc }) => [asc(al.created_at)],
        },
        messages: {
          orderBy: (m, { asc }) => [asc(m.created_at)],
        },
      },
    });

    if (!task) return { data: null };

    // Enforce access control: caller must be in task_access OR task is open pool
    const hasAccess = task.access.some((a) => a.user_id === ctx.userId);
    if (!hasAccess && !task.is_open_pool) return { data: null };

    const detail: TaskDetailWithAll = {
      // Core task fields
      id: task.id,
      org_id: task.org_id,
      title: task.title,
      description: task.description,
      task_type: task.task_type,
      status: task.status,
      priority: task.priority,
      client_id: task.client_id,
      assignee_id: task.assignee_id,
      creator_id: task.creator_id,
      financial_year: task.financial_year,
      due_at: task.due_at,
      is_open_pool: task.is_open_pool,
      is_active: task.is_active,
      created_at: task.created_at,
      updated_at: task.updated_at,
      // Relations
      client: task.client ?? null,
      assignee: task.assignee ?? null,
      creator: task.creator as Profile,
      accessList: task.access as (TaskAccess & { user: Profile })[],
      auditLog: task.auditLog as (TaskAuditLog & { actor: Profile })[],
      messageCount: task.messages.length,
    };

    return { data: detail };
  } catch (err) {
    console.error('[getTaskDetail]', err);
    return { error: 'Failed to fetch task detail' };
  }
}

// ---------------------------------------------------------------------------
// getPoolTasks
// ---------------------------------------------------------------------------

export async function getPoolTasks(): Promise<{ data: TaskWithRelations[] } | { error: string }> {
  const ctx = await resolveUser();
  if (isErrorResult(ctx)) return ctx;

  try {
    const result = await db.query.tasks.findMany({
      where: (t, { and, eq }) =>
        and(eq(t.org_id, ctx.orgId), eq(t.is_open_pool, true), eq(t.is_active, true)),
      with: {
        client: true,
        assignee: true,
        creator: true,
      },
      orderBy: (t, { desc }) => [desc(t.created_at)],
    });

    return { data: result as TaskWithRelations[] };
  } catch (err) {
    console.error('[getPoolTasks]', err);
    return { error: 'Failed to fetch pool tasks' };
  }
}

// ---------------------------------------------------------------------------
// claimPoolTask
// ---------------------------------------------------------------------------

export async function claimPoolTask(
  task_id: string,
): Promise<{ data: Task } | { error: string }> {
  const ctx = await resolveUser();
  if (isErrorResult(ctx)) return ctx;

  const idParsed = z.string().uuid().safeParse(task_id);
  if (!idParsed.success) return { error: 'Invalid task id' };

  const task = await db.query.tasks.findFirst({
    where: (t, { and, eq }) =>
      and(
        eq(t.id, task_id),
        eq(t.org_id, ctx.orgId),
        eq(t.is_open_pool, true),
        eq(t.is_active, true),
      ),
    columns: { id: true, assignee_id: true },
  });
  if (!task) return { error: 'Task not found in pool' };

  try {
    const [updated] = await db
      .update(tasks)
      .set({ assignee_id: ctx.userId, is_open_pool: false, updated_at: new Date() })
      .where(and(eq(tasks.id, task_id), eq(tasks.org_id, ctx.orgId)))
      .returning();

    const admin = createAdminClient();

    // Only insert access row if user doesn't already have one (e.g. creator)
    const existing = await db.query.task_access.findFirst({
      where: (ta, { and, eq }) =>
        and(eq(ta.task_id, task_id), eq(ta.user_id, ctx.userId)),
      columns: { id: true },
    });

    if (!existing) {
      const { error: accessError } = await admin.from('task_access').insert({
        task_id,
        user_id: ctx.userId,
        access_level: 'editor',
      });
      if (accessError) {
        console.error('[claimPoolTask] task_access insert failed', accessError);
      }
    }

    await insertAuditLog({
      task_id,
      actor_id: ctx.userId,
      action: 'reassigned',
      new_value: ctx.userId,
    });

    return { data: updated };
  } catch (err) {
    console.error('[claimPoolTask]', err);
    return { error: 'Failed to claim task' };
  }
}

// ---------------------------------------------------------------------------
// grantTaskAccess
// ---------------------------------------------------------------------------

export async function grantTaskAccess(params: {
  task_id: string;
  user_id: string;
  access_level: 'editor' | 'viewer';
}): Promise<{ data: true } | { error: string }> {
  const ctx = await resolveUser();
  if (isErrorResult(ctx)) return ctx;

  const taskIdParsed = z.string().uuid().safeParse(params.task_id);
  if (!taskIdParsed.success) return { error: 'Invalid task id' };

  const userIdParsed = z.string().uuid().safeParse(params.user_id);
  if (!userIdParsed.success) return { error: 'Invalid user id' };

  if (!['editor', 'viewer'].includes(params.access_level)) {
    return { error: 'access_level must be editor or viewer' };
  }

  // Caller must be the task owner
  const ownerAccess = await db.query.task_access.findFirst({
    where: (ta, { and, eq }) =>
      and(
        eq(ta.task_id, params.task_id),
        eq(ta.user_id, ctx.userId),
        eq(ta.access_level, 'owner'),
      ),
    columns: { id: true },
  });
  if (!ownerAccess) return { error: 'Forbidden: only task owner can grant access' };

  // Target user must exist in same org
  const targetProfile = await db.query.profiles.findFirst({
    where: (p, { and, eq }) =>
      and(eq(p.id, params.user_id), eq(p.org_id, ctx.orgId), eq(p.is_active, true)),
    columns: { id: true },
  });
  if (!targetProfile) return { error: 'User not found in organisation' };

  try {
    const admin = createAdminClient();
    const { error: upsertError } = await admin.from('task_access').upsert(
      {
        task_id: params.task_id,
        user_id: params.user_id,
        access_level: params.access_level,
      },
      { onConflict: 'task_id,user_id' },
    );
    if (upsertError) return { error: `Failed to grant access: ${upsertError.message}` };

    await insertAuditLog({
      task_id: params.task_id,
      actor_id: ctx.userId,
      action: 'access_granted',
      new_value: `${params.user_id}:${params.access_level}`,
    });

    return { data: true };
  } catch (err) {
    console.error('[grantTaskAccess]', err);
    return { error: 'Failed to grant access' };
  }
}

// ---------------------------------------------------------------------------
// addTaskMessage
// ---------------------------------------------------------------------------

export async function addTaskMessage(
  input: z.infer<typeof addMessageSchema>,
): Promise<{ data: true } | { error: string }> {
  const ctx = await resolveUser();
  if (isErrorResult(ctx)) return ctx;

  const parsed = addMessageSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.message };
  }

  const { task_id, content } = parsed.data;

  // Caller must have any access level (viewer can read; but can they comment?)
  // Per product intent: any access row allows messaging
  const access = await db.query.task_access.findFirst({
    where: (ta, { and, eq }) =>
      and(eq(ta.task_id, task_id), eq(ta.user_id, ctx.userId)),
    columns: { access_level: true },
  });
  if (!access) return { error: 'Forbidden: no access to this task' };

  // Verify task is in same org and active
  const task = await db.query.tasks.findFirst({
    where: (t, { and, eq }) =>
      and(eq(t.id, task_id), eq(t.org_id, ctx.orgId), eq(t.is_active, true)),
    columns: { id: true },
  });
  if (!task) return { error: 'Task not found' };

  try {
    await db.insert(task_messages).values({
      task_id,
      sender_id: ctx.userId,
      content,
    });

    await insertAuditLog({
      task_id,
      actor_id: ctx.userId,
      action: 'comment_added',
    });

    return { data: true };
  } catch (err) {
    console.error('[addTaskMessage]', err);
    return { error: 'Failed to send message' };
  }
}

// ---------------------------------------------------------------------------
// updateTask (soft field update — title, description, priority, due_at)
// ---------------------------------------------------------------------------

const updateTaskFieldsSchema = z.object({
  task_id: z.string().uuid(),
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).nullable().optional(),
  priority: z.enum(['urgent', 'high', 'medium', 'low']).optional(),
  due_at: z.string().datetime().nullable().optional(),
  assignee_id: z.string().uuid().nullable().optional(),
  financial_year: z.string().max(10).optional(),
});

export async function updateTask(
  input: z.infer<typeof updateTaskFieldsSchema>,
): Promise<{ data: Task } | { error: string }> {
  const ctx = await resolveUser();
  if (isErrorResult(ctx)) return ctx;

  const parsed = updateTaskFieldsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.message };
  }

  const { task_id, ...fields } = parsed.data;

  // Must be owner to update task fields
  const ownerAccess = await db.query.task_access.findFirst({
    where: (ta, { and, eq }) =>
      and(
        eq(ta.task_id, task_id),
        eq(ta.user_id, ctx.userId),
        eq(ta.access_level, 'owner'),
      ),
    columns: { id: true },
  });
  if (!ownerAccess) return { error: 'Forbidden: only task owner can update task fields' };

  const task = await db.query.tasks.findFirst({
    where: (t, { and, eq }) =>
      and(eq(t.id, task_id), eq(t.org_id, ctx.orgId), eq(t.is_active, true)),
    columns: { id: true, status: true, creator_id: true, assignee_id: true },
  });
  if (!task) return { error: 'Task not found' };
  if (task.status === 'completed') return { error: 'Completed tasks are immutable' };

  // Validate new assignee if changing
  if (fields.assignee_id !== undefined && fields.assignee_id !== null) {
    const assignee = await db.query.profiles.findFirst({
      where: (p, { and, eq }) =>
        and(eq(p.id, fields.assignee_id!), eq(p.org_id, ctx.orgId), eq(p.is_active, true)),
      columns: { id: true },
    });
    if (!assignee) return { error: 'Assignee not found in this organisation' };
  }

  try {
    const updates: Partial<typeof tasks.$inferInsert> = {
      updated_at: new Date(),
    };
    if (fields.title !== undefined) updates.title = fields.title;
    if (fields.description !== undefined) updates.description = fields.description;
    if (fields.priority !== undefined) updates.priority = fields.priority;
    if (fields.due_at !== undefined) updates.due_at = fields.due_at ? new Date(fields.due_at) : null;
    if (fields.assignee_id !== undefined) updates.assignee_id = fields.assignee_id;
    if (fields.financial_year !== undefined) updates.financial_year = fields.financial_year;

    const [updated] = await db
      .update(tasks)
      .set(updates)
      .where(and(eq(tasks.id, task_id), eq(tasks.org_id, ctx.orgId)))
      .returning();

    // If assignee changed, grant editor access to new assignee
    if (
      fields.assignee_id !== undefined &&
      fields.assignee_id !== null &&
      fields.assignee_id !== task.assignee_id
    ) {
      const admin = createAdminClient();
      await admin.from('task_access').upsert(
        {
          task_id,
          user_id: fields.assignee_id,
          access_level: 'editor',
        },
        { onConflict: 'task_id,user_id' },
      );

      await insertAuditLog({
        task_id,
        actor_id: ctx.userId,
        action: 'reassigned',
        old_value: task.assignee_id ?? null,
        new_value: fields.assignee_id,
      });

      await insertNotification({
        org_id: ctx.orgId,
        user_id: fields.assignee_id,
        task_id,
        title: 'Task assigned to you',
        body: updated.title,
      });
    }

    return { data: updated };
  } catch (err) {
    console.error('[updateTask]', err);
    return { error: 'Failed to update task' };
  }
}

// ---------------------------------------------------------------------------
// deactivateTask (soft delete — is_active = false)
// ---------------------------------------------------------------------------

export async function deactivateTask(
  task_id: string,
): Promise<{ data: true } | { error: string }> {
  const ctx = await resolveUser();
  if (isErrorResult(ctx)) return ctx;

  const idParsed = z.string().uuid().safeParse(task_id);
  if (!idParsed.success) return { error: 'Invalid task id' };

  // Only owner can delete
  const ownerAccess = await db.query.task_access.findFirst({
    where: (ta, { and, eq }) =>
      and(
        eq(ta.task_id, task_id),
        eq(ta.user_id, ctx.userId),
        eq(ta.access_level, 'owner'),
      ),
    columns: { id: true },
  });
  if (!ownerAccess) return { error: 'Forbidden: only task owner can delete this task' };

  try {
    const [deactivated] = await db
      .update(tasks)
      .set({ is_active: false, updated_at: new Date() })
      .where(and(eq(tasks.id, task_id), eq(tasks.org_id, ctx.orgId)))
      .returning({ id: tasks.id });

    if (!deactivated) return { error: 'Task not found' };
    return { data: true };
  } catch (err) {
    console.error('[deactivateTask]', err);
    return { error: 'Failed to deactivate task' };
  }
}

// ---------------------------------------------------------------------------
// getTaskMessages — for realtime chat hydration on first load
// ---------------------------------------------------------------------------

export async function getTaskMessages(
  task_id: string,
): Promise<{ data: { id: string; task_id: string; content: string | null; file_url: string | null; file_name: string | null; sender_id: string; created_at: Date; sender: Profile }[] } | { error: string }> {
  const ctx = await resolveUser();
  if (isErrorResult(ctx)) return ctx;

  const idParsed = z.string().uuid().safeParse(task_id);
  if (!idParsed.success) return { error: 'Invalid task id' };

  // Verify access
  const access = await db.query.task_access.findFirst({
    where: (ta, { and, eq }) =>
      and(eq(ta.task_id, task_id), eq(ta.user_id, ctx.userId)),
    columns: { access_level: true },
  });

  // Also allow pool tasks (visible to all org members)
  if (!access) {
    const poolTask = await db.query.tasks.findFirst({
      where: (t, { and, eq }) =>
        and(eq(t.id, task_id), eq(t.org_id, ctx.orgId), eq(t.is_open_pool, true)),
      columns: { id: true },
    });
    if (!poolTask) return { error: 'Forbidden: no access to this task' };
  }

  try {
    const messages = await db.query.task_messages.findMany({
      where: (m, { eq }) => eq(m.task_id, task_id),
      with: { sender: true },
      orderBy: (m, { asc }) => [asc(m.created_at)],
    });

    return {
      data: messages.map((m) => ({
        id: m.id,
        task_id: m.task_id,
        content: m.content,
        file_url: m.file_url,
        file_name: m.file_name,
        sender_id: m.sender_id,
        created_at: m.created_at,
        sender: m.sender as Profile,
      })),
    };
  } catch (err) {
    console.error('[getTaskMessages]', err);
    return { error: 'Failed to fetch messages' };
  }
}

// Re-export inArray so callers don't need direct drizzle-orm import for task queries
export { inArray };
