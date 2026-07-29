// NOT a server action — imported only by /api/cron/recurring/route.ts.
// Do NOT add 'use server' here.
import 'server-only';

import { db } from '@/db';
import { recurring_templates } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { createAdminClient } from '@/lib/supabase/server';
import { addDays } from 'date-fns';

export async function generateTasksFromTemplates(orgId?: string): Promise<number> {
  const admin = createAdminClient();
  const now = new Date();

  const allTemplates = await db
    .select()
    .from(recurring_templates)
    .where(eq(recurring_templates.is_active, true));

  const filtered = orgId
    ? allTemplates.filter((t) => t.org_id === orgId)
    : allTemplates;

  let created = 0;

  for (const template of filtered) {
    if (!shouldFireToday(template.cadence, template.days_before_due, now)) continue;

    const adminProfile = await db.query.profiles.findFirst({
      where: (p, { and: qAnd, eq: qEq }) =>
        qAnd(
          qEq(p.org_id, template.org_id),
          qEq(p.is_org_admin, true),
          qEq(p.is_active, true),
        ),
      columns: { id: true },
    });
    if (!adminProfile) continue;

    let assigneeId: string | null = null;
    if (template.default_assignee_role_id) {
      const assignee = await db.query.profiles.findFirst({
        where: (p, { and: qAnd, eq: qEq }) =>
          qAnd(
            qEq(p.org_id, template.org_id),
            qEq(p.role_id, template.default_assignee_role_id!),
            qEq(p.is_active, true),
          ),
        columns: { id: true },
      });
      assigneeId = assignee?.id ?? null;
    }

    const targetDate = getTargetDate(template.cadence, now);
    const dueDate = targetDate ?? addDays(now, template.days_before_due);
    dueDate.setHours(23, 59, 59, 0);

    const { data: task, error: taskError } = await admin
      .from('tasks')
      .insert({
        org_id: template.org_id,
        title: template.title,
        task_type: template.task_type,
        priority: template.default_priority,
        client_id: template.default_client_id ?? null,
        assignee_id: assigneeId,
        creator_id: adminProfile.id,
        due_at: dueDate.toISOString(),
        status: 'not_started',
        is_open_pool: assigneeId === null,
        is_active: true,
      })
      .select()
      .single();

    if (taskError || !task) continue;

    const accessRows: { task_id: string; user_id: string; access_level: string }[] = [
      { task_id: task.id, user_id: adminProfile.id, access_level: 'owner' },
    ];
    if (assigneeId && assigneeId !== adminProfile.id) {
      accessRows.push({ task_id: task.id, user_id: assigneeId, access_level: 'editor' });
    }

    const { error: accessError } = await admin.from('task_access').insert(accessRows);
    if (accessError) {
      console.error(JSON.stringify({ level: 'error', fn: 'generateTasks', step: 'task_access', taskId: task.id, err: accessError.message }));
      await admin.from('tasks').delete().eq('id', task.id);
      continue;
    }

    await admin.from('task_audit_log').insert({
      task_id: task.id,
      actor_id: adminProfile.id,
      action: 'created',
      new_value: `[recurring] ${template.title}`,
    });

    if (assigneeId) {
      await admin.from('notifications').insert({
        org_id: template.org_id,
        user_id: assigneeId,
        task_id: task.id,
        title: 'New task assigned',
        body: `Recurring task "${template.title}" has been assigned to you.`,
      });
    }

    created++;
  }

  return created;
}

function shouldFireToday(cadence: string, daysBeforeDue: number, date: Date): boolean {
  const targetDate = getTargetDate(cadence, date);
  if (!targetDate) return false;
  const fireDate = new Date(targetDate);
  fireDate.setDate(fireDate.getDate() - daysBeforeDue);
  return (
    fireDate.getFullYear() === date.getFullYear() &&
    fireDate.getMonth() === date.getMonth() &&
    fireDate.getDate() === date.getDate()
  );
}

function getTargetDate(cadence: string, date: Date): Date | null {
  const y = date.getFullYear();
  const m = date.getMonth(); // 0-indexed
  switch (cadence) {
    case 'monthly': {
      // Last day of current month
      return new Date(y, m + 1, 0);
    }
    case 'quarterly': {
      // Quarter ends: Mar(2), Jun(5), Sep(8), Dec(11)
      const quarterEndMonths = [2, 5, 8, 11];
      const nextEnd = quarterEndMonths.find((em) => em >= m) ?? 11;
      return new Date(y, nextEnd + 1, 0);
    }
    case 'half_yearly': {
      // Indian FY: Apr–Sep → H1 ends Sep 30; Oct–Mar → H2 ends Mar 31
      // m is 0-indexed: Apr=3, Sep=8, Oct=9, Mar=2
      if (m >= 3 && m <= 8) return new Date(y, 9, 0);   // Sep 30 (H1 end)
      if (m <= 2) return new Date(y, 3, 0);              // Mar 31 this year (H2 end, Jan/Feb/Mar)
      return new Date(y + 1, 3, 0);                      // Mar 31 next year (H2 end, Oct/Nov/Dec)
    }
    case 'annually': {
      // Financial year ends March 31
      const fyEndYear = m <= 2 ? y : y + 1;
      return new Date(fyEndYear, 3, 0); // Mar 31
    }
    default:
      return null;
  }
}
