// NOT a server action — this is a Next.js Route Handler (GET /api/cron/digest).
// Protected by Authorization: Bearer ${CRON_SECRET}.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { db } from '@/db';
import { profiles, tasks, task_access } from '@/db/schema';
import { eq, inArray, ne, lte } from 'drizzle-orm';
import { Resend } from 'resend';
import { DailyDigest } from '@/emails/DailyDigest';
import { addDays, format } from 'date-fns';
import type { Task } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

const resend = new Resend(process.env.RESEND_API_KEY);
const BATCH_SIZE = 10;

// ---------------------------------------------------------------------------
// GET /api/cron/digest
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  // Auth guard
  const authHeader = request.headers.get('Authorization');
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cronStart = Date.now();
  console.log(JSON.stringify({ level: 'info', cron: 'digest', event: 'start', ts: new Date().toISOString() }));

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const now = new Date();
  const soonDate = addDays(now, 7);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  // ONE: load all active users
  let allUsers: { id: string; full_name: string; email: string }[];
  try {
    allUsers = await db
      .select({ id: profiles.id, full_name: profiles.full_name, email: profiles.email })
      .from(profiles)
      .where(eq(profiles.is_active, true));
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error', cron: 'digest', step: 'fetch_users',
      err: err instanceof Error ? err.message : String(err),
    }));
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }

  if (allUsers.length === 0) {
    return NextResponse.json({ success: true, emailsSent: 0 });
  }

  // TWO: load ALL task_access rows for all users in one query
  const allUserIds = allUsers.map((u) => u.id);
  let allAccessRows: { task_id: string; user_id: string }[];
  try {
    allAccessRows = await db
      .select({ task_id: task_access.task_id, user_id: task_access.user_id })
      .from(task_access)
      .where(inArray(task_access.user_id, allUserIds));
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error', cron: 'digest', step: 'fetch_access',
      err: err instanceof Error ? err.message : String(err),
    }));
    return NextResponse.json({ error: 'Failed to fetch access rows' }, { status: 500 });
  }

  // Build user → task_ids map
  const taskIdsByUser = new Map<string, string[]>();
  for (const row of allAccessRows) {
    const existing = taskIdsByUser.get(row.user_id) ?? [];
    existing.push(row.task_id);
    taskIdsByUser.set(row.user_id, existing);
  }

  // THREE: load all relevant tasks (due ≤ soonDate, not completed, active) in one query
  const allTaskIds = [...new Set(allAccessRows.map((r) => r.task_id))];

  type TaskRow = Pick<Task, 'id' | 'title' | 'due_at' | 'status'> & {
    client: { name: string } | null;
  };

  let relevantTasks: TaskRow[] = [];
  if (allTaskIds.length > 0) {
    try {
      relevantTasks = await db.query.tasks.findMany({
        where: (t, { and: qAnd, eq: qEq, isNotNull: qIsNotNull, lte: qLte }) =>
          qAnd(
            inArray(t.id, allTaskIds),
            qEq(t.is_active, true),
            ne(t.status, 'completed'),
            qIsNotNull(t.due_at),
            qLte(t.due_at, soonDate),
          ),
        with: { client: { columns: { name: true } } },
        columns: { id: true, title: true, due_at: true, status: true },
      }) as TaskRow[];
    } catch (err) {
      console.error(JSON.stringify({
        level: 'error', cron: 'digest', step: 'fetch_tasks',
        err: err instanceof Error ? err.message : String(err),
      }));
      return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
    }
  }

  const taskById = new Map<string, TaskRow>(relevantTasks.map((t) => [t.id, t]));

  // FOUR: build per-user lists in memory and send emails in parallel batches
  let emailsSent = 0;
  const errors: string[] = [];

  for (let i = 0; i < allUsers.length; i += BATCH_SIZE) {
    const batch = allUsers.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (user) => {
        const userTaskIds = taskIdsByUser.get(user.id) ?? [];
        const userTasks = userTaskIds
          .map((id) => taskById.get(id))
          .filter((t): t is TaskRow => t !== undefined);

        const overdueTasks = userTasks.filter(
          (t) => t.due_at && new Date(t.due_at) < todayStart,
        );
        const dueSoonTasks = userTasks.filter((t) => {
          if (!t.due_at) return false;
          const d = new Date(t.due_at);
          return d >= todayStart && d <= soonDate;
        });

        if (overdueTasks.length === 0 && dueSoonTasks.length === 0) return;

        const overdueItems = overdueTasks.map((t) => ({
          id: t.id,
          title: t.title,
          clientName: t.client?.name ?? null,
          daysOverdue: Math.floor(
            (now.getTime() - new Date(t.due_at!).getTime()) / 86_400_000,
          ),
        }));

        const dueSoonItems = dueSoonTasks.map((t) => ({
          id: t.id,
          title: t.title,
          clientName: t.client?.name ?? null,
          dueDate: format(new Date(t.due_at!), 'dd MMM yyyy'),
        }));

        try {
          await resend.emails.send({
            from: 'Filio <digest@filio.app>',
            to: user.email,
            subject: `Daily Digest — ${overdueTasks.length} overdue, ${dueSoonTasks.length} due soon`,
            react: DailyDigest({
              userName: user.full_name,
              appUrl,
              overdueItems,
              dueSoonItems,
            }),
          });
          emailsSent++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(JSON.stringify({ level: 'error', fn: 'digest', userId: user.id, err: msg }));
          errors.push(user.email);
        }
      }),
    );
  }

  console.log(JSON.stringify({
    level: 'info', cron: 'digest', event: 'complete',
    emailsSent, duration_ms: Date.now() - cronStart, ts: new Date().toISOString(),
  }));

  // Healthchecks.io dead-man's-switch ping (optional)
  const pingUrl = process.env.HC_PING_DIGEST_URL;
  if (pingUrl) {
    fetch(pingUrl).catch(() => {});
  }

  return NextResponse.json({
    success: true,
    emailsSent,
    failed: errors.length > 0 ? errors : undefined,
  });
}
