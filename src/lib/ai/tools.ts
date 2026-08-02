import { tool } from 'ai';
import { z } from 'zod';
import { and, eq, lt, lte, gte, ne, isNotNull } from 'drizzle-orm';
import { db } from '@/db';
import { tasks, profiles, clients } from '@/db/schema';

// ---------------------------------------------------------------------------
// createAiTools — all tools close over orgId from the authenticated session.
// orgId is NEVER taken from the client request body.
// ---------------------------------------------------------------------------

export function createAiTools(orgId: string, isAdmin: boolean, userId: string) {
  const now  = new Date();

  const TYPE_LABEL: Record<string, string> = {
    gst: 'GST', tds: 'TDS', income_tax: 'Income Tax', audit: 'Audit',
    roc_mca: 'ROC/MCA', accounting: 'Accounting', payroll: 'Payroll',
    notice: 'Notice', advisory: 'Advisory', other: 'Other',
  };
  const STATUS_LABEL: Record<string, string> = {
    not_started: 'Not started', in_progress: 'In progress',
    under_review: 'Under review', changes_requested: 'Changes requested',
    approved: 'Approved', filed: 'Filed', completed: 'Completed',
  };

  function fmtDate(d: Date | null | undefined) {
    if (!d) return 'no due date';
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // ── Shared: batch-fetch profile and client names ──────────────────────────

  async function resolveNames(
    rows: { assignee_id: string | null; client_id?: string | null }[],
  ) {
    const pIds = [...new Set(rows.map(r => r.assignee_id).filter(Boolean) as string[])];
    const cIds = [...new Set(rows.map(r => r.client_id).filter(Boolean) as string[])];
    const [pRows, cRows] = await Promise.all([
      pIds.length ? db.query.profiles.findMany({ where: (p, { inArray }) => inArray(p.id, pIds), columns: { id: true, full_name: true } }) : [],
      cIds.length ? db.query.clients.findMany({ where: (c, { inArray }) => inArray(c.id, cIds), columns: { id: true, name: true } }) : [],
    ]);
    return {
      pMap: new Map(pRows.map(p => [p.id, p.full_name])),
      cMap: new Map(cRows.map(c => [c.id, c.name])),
    };
  }

  // ── Tool: get_overdue_tasks ──────────────────────────────────────────────

  const get_overdue_tasks = tool({
    description:
      'Get overdue tasks for the organisation. Optionally filter by client name or assignee name.',
    parameters: z.object({
      client_name:   z.string().optional().describe('Partial client name (case-insensitive)'),
      assignee_name: z.string().optional().describe('Partial assignee name (case-insensitive)'),
    }),
    execute: async ({ client_name, assignee_name }: { client_name?: string; assignee_name?: string }) => {
      const rows = await db
        .select({ id: tasks.id, title: tasks.title, type: tasks.type, due_at: tasks.due_at, status: tasks.status, assignee_id: tasks.assignee_id, client_id: tasks.client_id })
        .from(tasks)
        .where(and(eq(tasks.org_id, orgId), eq(tasks.is_active, true), ne(tasks.status, 'completed'), isNotNull(tasks.due_at), lt(tasks.due_at, now)))
        .orderBy(tasks.due_at);

      if (rows.length === 0) return { count: 0, tasks: [], message: 'No overdue tasks — everything is on track.' };

      const { pMap, cMap } = await resolveNames(rows);

      let result = rows.map(t => ({
        id:          t.id,
        title:       t.title,
        type:        TYPE_LABEL[t.type] ?? t.type,
        daysOverdue: Math.max(1, Math.floor((now.getTime() - new Date(t.due_at!).getTime()) / 86400000)),
        status:      STATUS_LABEL[t.status] ?? t.status,
        assignee:    t.assignee_id ? (pMap.get(t.assignee_id) ?? 'Unknown') : 'Unassigned',
        client:      t.client_id  ? (cMap.get(t.client_id)   ?? 'Unknown') : null,
      }));

      if (client_name)   result = result.filter(t => t.client?.toLowerCase().includes(client_name.toLowerCase()));
      if (assignee_name) result = result.filter(t => t.assignee.toLowerCase().includes(assignee_name.toLowerCase()));

      return { count: result.length, tasks: result };
    },
  });

  // ── Tool: get_upcoming_deadlines ─────────────────────────────────────────

  const get_upcoming_deadlines = tool({
    description: 'Get upcoming task deadlines within the next N days (default 14).',
    parameters: z.object({
      days:          z.number().min(1).max(90).default(14),
      client_name:   z.string().optional(),
      assignee_name: z.string().optional(),
    }),
    execute: async ({ days, client_name, assignee_name }: { days: number; client_name?: string; assignee_name?: string }) => {
      const end = new Date(now.getTime() + days * 86400000);
      const rows = await db
        .select({ id: tasks.id, title: tasks.title, type: tasks.type, due_at: tasks.due_at, status: tasks.status, assignee_id: tasks.assignee_id, client_id: tasks.client_id })
        .from(tasks)
        .where(and(eq(tasks.org_id, orgId), eq(tasks.is_active, true), ne(tasks.status, 'completed'), isNotNull(tasks.due_at), gte(tasks.due_at, now), lte(tasks.due_at, end)))
        .orderBy(tasks.due_at);

      if (rows.length === 0) return { count: 0, tasks: [], message: `No deadlines in the next ${days} days.` };

      const { pMap, cMap } = await resolveNames(rows);
      let result = rows.map(t => ({
        id:       t.id,
        title:    t.title,
        type:     TYPE_LABEL[t.type] ?? t.type,
        due:      fmtDate(t.due_at),
        daysLeft: Math.max(0, Math.floor((new Date(t.due_at!).getTime() - now.getTime()) / 86400000)),
        status:   STATUS_LABEL[t.status] ?? t.status,
        assignee: t.assignee_id ? (pMap.get(t.assignee_id) ?? 'Unknown') : 'Unassigned',
        client:   t.client_id  ? (cMap.get(t.client_id)   ?? 'Unknown') : null,
      }));

      if (client_name)   result = result.filter(t => t.client?.toLowerCase().includes(client_name.toLowerCase()));
      if (assignee_name) result = result.filter(t => t.assignee.toLowerCase().includes(assignee_name.toLowerCase()));

      return { count: result.length, tasks: result };
    },
  });

  // ── Tool: get_client_task_history ────────────────────────────────────────

  const get_client_task_history = tool({
    description: 'Get full task history for a specific client, including completed tasks.',
    parameters: z.object({
      client_name: z.string().describe('Client name (partial match supported)'),
      task_type:   z.string().optional().describe('Filter by type: gst, tds, income_tax, etc.'),
      limit:       z.number().min(1).max(50).default(20),
    }),
    execute: async ({ client_name, task_type, limit }: { client_name: string; task_type?: string; limit: number }) => {
      const clientRows = await db.query.clients.findMany({
        where: (c, { and: qa, eq: qe, ilike: qi }) =>
          qa(qe(c.org_id, orgId), qe(c.is_active, true), qi(c.name, `%${client_name}%`)),
        columns: { id: true, name: true },
      });
      if (clientRows.length === 0) return { error: `No client found matching "${client_name}"` };

      const client = clientRows[0];
      const conditions = [eq(tasks.org_id, orgId), eq(tasks.is_active, true), eq(tasks.client_id, client.id)];
      if (task_type) conditions.push(eq(tasks.type, task_type as 'gst'));

      const rows = await db
        .select({ id: tasks.id, title: tasks.title, type: tasks.type, status: tasks.status, due_at: tasks.due_at, assignee_id: tasks.assignee_id, created_at: tasks.created_at })
        .from(tasks)
        .where(and(...conditions))
        .orderBy(tasks.created_at)
        .limit(limit);

      if (rows.length === 0) return { client: client.name, count: 0, tasks: [], message: `No tasks found for ${client.name}.` };

      const { pMap } = await resolveNames(rows);
      return {
        client: client.name,
        count:  rows.length,
        tasks:  rows.map(t => ({
          id:       t.id,
          title:    t.title,
          type:     TYPE_LABEL[t.type] ?? t.type,
          status:   STATUS_LABEL[t.status] ?? t.status,
          due:      fmtDate(t.due_at),
          created:  fmtDate(t.created_at),
          assignee: t.assignee_id ? (pMap.get(t.assignee_id) ?? 'Unknown') : 'Unassigned',
        })),
      };
    },
  });

  // ── Tool: get_team_workload ──────────────────────────────────────────────

  const get_team_workload = tool({
    description: 'Get current task workload per team member.',
    parameters: z.object({}),
    execute: async () => {
      const rows = await db
        .select({ assignee_id: tasks.assignee_id, status: tasks.status, due_at: tasks.due_at })
        .from(tasks)
        .where(and(eq(tasks.org_id, orgId), eq(tasks.is_active, true), ne(tasks.status, 'completed'), isNotNull(tasks.assignee_id)));

      if (rows.length === 0) return { message: 'No active tasks assigned to anyone.' };

      const pIds = [...new Set(rows.map(r => r.assignee_id).filter(Boolean) as string[])];
      const pRows = await db.query.profiles.findMany({ where: (p, { inArray }) => inArray(p.id, pIds), columns: { id: true, full_name: true } });
      const pMap  = new Map(pRows.map(p => [p.id, p.full_name]));

      const map = new Map<string, { name: string; notStarted: number; inProgress: number; underReview: number; overdue: number }>();
      for (const t of rows) {
        if (!t.assignee_id) continue;
        if (!map.has(t.assignee_id)) map.set(t.assignee_id, { name: pMap.get(t.assignee_id) ?? 'Unknown', notStarted: 0, inProgress: 0, underReview: 0, overdue: 0 });
        const e = map.get(t.assignee_id)!;
        if (t.status === 'not_started')  e.notStarted++;
        if (t.status === 'in_progress')  e.inProgress++;
        if (t.status === 'under_review') e.underReview++;
        if (t.due_at && new Date(t.due_at) < now) e.overdue++;
      }

      return {
        team: [...map.values()]
          .map(m => ({ ...m, total: m.notStarted + m.inProgress + m.underReview }))
          .sort((a, b) => b.total - a.total),
      };
    },
  });

  // ── Tool: preview_task ───────────────────────────────────────────────────

  const preview_task = tool({
    description: 'Preview a task before creating it. ALWAYS call this first, then ask the user to confirm.',
    parameters: z.object({
      title:         z.string(),
      type:          z.enum(['gst','tds','income_tax','audit','roc_mca','accounting','payroll','notice','advisory','other']),
      client_name:   z.string().optional(),
      assignee_name: z.string().optional(),
      due_date:      z.string().optional().describe('YYYY-MM-DD'),
      priority:      z.enum(['urgent','high','medium','low']).default('medium'),
    }),
    execute: async ({ title, type, client_name, assignee_name, due_date, priority }: {
      title: string; type: string; client_name?: string; assignee_name?: string; due_date?: string; priority: string;
    }) => {
      const [clientRows, assigneeRows] = await Promise.all([
        client_name
          ? db.query.clients.findMany({ where: (c, { and: qa, eq: qe, ilike: qi }) => qa(qe(c.org_id, orgId), qe(c.is_active, true), qi(c.name, `%${client_name}%`)), columns: { id: true, name: true }, limit: 3 })
          : [],
        assignee_name
          ? db.query.profiles.findMany({ where: (p, { and: qa, eq: qe, ilike: qi }) => qa(qe(p.org_id, orgId), qe(p.is_active, true), qi(p.full_name, `%${assignee_name}%`)), columns: { id: true, full_name: true }, limit: 3 })
          : [],
      ]);

      const client   = clientRows[0]   ?? null;
      const assignee = assigneeRows[0] ?? null;

      return {
        preview: {
          title,
          type:     TYPE_LABEL[type] ?? type,
          priority,
          client:   client   ? client.name       : client_name   ? `⚠ No match for "${client_name}"`   : 'No client',
          assignee: assignee ? assignee.full_name : assignee_name ? `⚠ No match for "${assignee_name}"` : 'Unassigned',
          due:      due_date ? fmtDate(new Date(due_date)) : 'No due date',
        },
        clientId:   client?.id   ?? null,
        assigneeId: assignee?.id ?? null,
      };
    },
  });

  // ── Tool: create_task ────────────────────────────────────────────────────

  const create_task = tool({
    description: 'Create a task. Only call AFTER preview_task and explicit user confirmation.',
    parameters: z.object({
      title:      z.string(),
      type:       z.enum(['gst','tds','income_tax','audit','roc_mca','accounting','payroll','notice','advisory','other']),
      priority:   z.enum(['urgent','high','medium','low']).default('medium'),
      clientId:   z.string().uuid().optional(),
      assigneeId: z.string().uuid().optional(),
      due_date:   z.string().optional().describe('YYYY-MM-DD'),
    }),
    execute: async ({ title, type, priority, clientId, assigneeId, due_date }: {
      title: string; type: string; priority: string; clientId?: string; assigneeId?: string; due_date?: string;
    }) => {
      const { createAdminClient } = await import('@/lib/supabase/server');
      const admin = createAdminClient();

      const { data, error } = await admin
        .from('tasks')
        .insert({
          org_id:      orgId,
          title,
          type,
          priority,
          status:      'not_started',
          client_id:   clientId   ?? null,
          assignee_id: assigneeId ?? null,
          creator_id:  userId,
          due_at:      due_date ? new Date(due_date).toISOString() : null,
          is_active:   true,
        })
        .select('id')
        .single();

      if (error || !data) return { success: false, error: error?.message ?? 'Failed to create task' };

      await admin.from('task_access').insert({ task_id: data.id, user_id: userId, level: 'owner', granted_by: userId });
      if (assigneeId && assigneeId !== userId) {
        await admin.from('task_access').insert({ task_id: data.id, user_id: assigneeId, level: 'editor', granted_by: userId });
      }

      return { success: true, taskId: data.id, message: `Task "${title}" created successfully.` };
    },
  });

  return { get_overdue_tasks, get_upcoming_deadlines, get_client_task_history, get_team_workload, preview_task, create_task };
}
