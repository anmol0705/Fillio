import { NextResponse } from 'next/server';
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/db';
import { createAdminClient } from '@/lib/supabase/server';
import { recurring_templates, tasks, task_access, profiles } from '@/db/schema';

// ---------------------------------------------------------------------------
// IST helpers
// ---------------------------------------------------------------------------

function getTodayIST(): Date {
  // IST = UTC+5:30 = 330 minutes ahead
  const now = new Date();
  return new Date(now.getTime() + 330 * 60 * 1000);
}

function shouldFireToday(cadence: string, today: Date): boolean {
  const day   = today.getDate();
  const month = today.getMonth(); // 0-indexed: Jan=0, Apr=3, Jul=6, Oct=9

  if (day !== 1) return false; // all cadences fire on the 1st of the month

  switch (cadence) {
    case 'monthly':     return true;
    case 'quarterly':   return [0, 3, 6, 9].includes(month);   // Jan, Apr, Jul, Oct
    case 'half_yearly': return [3, 9].includes(month);          // Apr, Oct
    case 'annually':    return month === 3;                      // Apr only
    default:            return false;
  }
}

// ---------------------------------------------------------------------------
// GET /api/cron/recurring
// Called by Vercel cron at 1 AM UTC (6:30 AM IST) daily.
// Protected by Authorization: Bearer <CRON_SECRET> header.
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const today    = getTodayIST();
  const log: string[] = [];
  let tasksCreated = 0;
  let errors       = 0;

  try {
    // Load all active templates across all orgs
    const templates = await db.query.recurring_templates.findMany({
      where: (t, { eq }) => eq(t.is_active, true),
    });

    for (const template of templates) {
      if (!shouldFireToday(template.cadence, today)) continue;

      log.push(`Processing template "${template.title}" (${template.cadence}) for org ${template.org_id}`);

      try {
        // Resolve assignee — first active user with the specified role, if any
        let assigneeId: string | null = null;
        if (template.default_assignee_role_id) {
          const assigneeProfile = await db.query.profiles.findFirst({
            where: (p, { and, eq }) =>
              and(
                eq(p.org_id, template.org_id),
                eq(p.role_id, template.default_assignee_role_id!),
                eq(p.is_active, true),
              ),
            columns: { id: true },
          });
          assigneeId = assigneeProfile?.id ?? null;
        }

        // Due date = today + due_in_days
        const dueAt = new Date(today);
        dueAt.setDate(dueAt.getDate() + template.due_in_days);

        // Use service role for inserts — no user session in cron context
        const supabase = createAdminClient();

        // Insert the task
        const { data: taskRow, error: taskError } = await supabase
          .from('tasks')
          .insert({
            org_id:       template.org_id,
            title:        template.title,
            type:         template.task_type,
            status:       'not_started',
            priority:     template.priority,
            due_at:       dueAt.toISOString(),
            client_id:    template.default_client_id ?? null,
            assignee_id:  assigneeId,
            creator_id:   template.created_by,
            is_open_pool: assigneeId === null, // open pool if no assignee found
            is_active:    true,
          })
          .select('id')
          .single();

        if (taskError || !taskRow) {
          log.push(`  ERROR creating task: ${taskError?.message}`);
          errors++;
          continue;
        }

        const taskId = taskRow.id;

        // Build access rows — creator always gets owner
        const accessRows: { task_id: string; user_id: string; level: 'owner' | 'editor'; granted_by: string }[] = [
          { task_id: taskId, user_id: template.created_by, level: 'owner', granted_by: template.created_by },
        ];
        if (assigneeId && assigneeId !== template.created_by) {
          accessRows.push({ task_id: taskId, user_id: assigneeId, level: 'editor', granted_by: template.created_by });
        }

        const { error: accessError } = await supabase
          .from('task_access')
          .insert(accessRows);

        if (accessError) {
          // Orphan protection — delete the task so no orphan exists
          await supabase.from('tasks').delete().eq('id', taskId);
          log.push(`  ERROR inserting task_access, task deleted (orphan protected): ${accessError.message}`);
          errors++;
          continue;
        }

        // Audit log entry
        await supabase.from('task_audit_log').insert({
          task_id:  taskId,
          org_id:   template.org_id,
          actor_id: template.created_by,
          action:   'created',
          payload:  { source: 'recurring_cron', template_id: template.id },
        });

        tasksCreated++;
        log.push(`  OK — task ${taskId} created, assignee: ${assigneeId ?? 'open pool'}`);

      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.push(`  EXCEPTION for template ${template.id}: ${message}`);
        errors++;
      }
    }

    return NextResponse.json({
      ok:           true,
      date_ist:     today.toISOString(),
      tasksCreated,
      errors,
      log,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
