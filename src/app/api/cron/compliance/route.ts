// NOT a server action — this is a Next.js Route Handler (POST /api/cron/compliance).
// Protected by Authorization: Bearer ${CRON_SECRET}.
// Sends compliance deadline notifications to all org admins for deadlines
// falling within the next 7 days. Skips if a notification with the same
// title was already created for the org today.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { db } from '@/db';
import { profiles, notifications } from '@/db/schema';
import { eq, and, gte, sql } from 'drizzle-orm';
import { createAdminClient } from '@/lib/supabase/server';
import { getUpcomingDeadlines } from '@/lib/compliance/deadlines';

export const runtime = 'nodejs';
export const maxDuration = 300;

// ---------------------------------------------------------------------------
// POST /api/cron/compliance
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  // Auth guard — same pattern as /api/cron/recurring
  const authHeader = request.headers.get('Authorization');
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cronStart = Date.now();
  console.log(JSON.stringify({ level: 'info', cron: 'compliance', event: 'start', ts: new Date().toISOString() }));

  const upcomingDeadlines = getUpcomingDeadlines(7);

  if (upcomingDeadlines.length === 0) {
    console.log(JSON.stringify({
      level: 'info',
      cron: 'compliance',
      event: 'complete',
      notificationsSent: 0,
      deadlinesChecked: 0,
      duration_ms: Date.now() - cronStart,
      ts: new Date().toISOString(),
    }));
    return NextResponse.json({ success: true, notificationsSent: 0 });
  }

  // Midnight today (server time, UTC) — used to detect already-sent notifications
  const todayMidnight = new Date();
  todayMidnight.setUTCHours(0, 0, 0, 0);

  // Fetch all active org admins grouped by org_id
  let adminProfiles: Array<{ id: string; org_id: string }>;
  try {
    adminProfiles = await db
      .select({ id: profiles.id, org_id: profiles.org_id })
      .from(profiles)
      .where(
        and(
          eq(profiles.is_active, true),
          eq(profiles.is_org_admin, true),
        ),
      );
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error',
      cron: 'compliance',
      err: err instanceof Error ? err.message : String(err),
      ts: new Date().toISOString(),
    }));
    return NextResponse.json(
      { error: 'Failed to fetch org admins' },
      { status: 500 },
    );
  }

  if (adminProfiles.length === 0) {
    console.log(JSON.stringify({
      level: 'info',
      cron: 'compliance',
      event: 'complete',
      notificationsSent: 0,
      deadlinesChecked: upcomingDeadlines.length,
      duration_ms: Date.now() - cronStart,
      ts: new Date().toISOString(),
    }));
    return NextResponse.json({ success: true, notificationsSent: 0 });
  }

  // Group admins by org_id so we can check per-org deduplication efficiently
  const orgToAdmins = new Map<string, string[]>();
  for (const admin of adminProfiles) {
    const existing = orgToAdmins.get(admin.org_id) ?? [];
    existing.push(admin.id);
    orgToAdmins.set(admin.org_id, existing);
  }

  const orgIds = [...orgToAdmins.keys()];

  // Fetch all compliance notification titles already sent today across all orgs
  // to avoid per-org-per-deadline N² queries.
  let existingTodayRows: Array<{ org_id: string; title: string }>;
  try {
    existingTodayRows = await db
      .select({ org_id: notifications.org_id, title: notifications.title })
      .from(notifications)
      .where(
        and(
          // Only compliance-related notifications (no task_id = compliance cron notifications)
          sql`${notifications.task_id} IS NULL`,
          gte(notifications.created_at, todayMidnight),
          sql`${notifications.org_id} = ANY(ARRAY[${sql.join(
            orgIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )}])`,
        ),
      );
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error',
      cron: 'compliance',
      err: err instanceof Error ? err.message : String(err),
      ts: new Date().toISOString(),
    }));
    return NextResponse.json(
      { error: 'Failed to check existing notifications' },
      { status: 500 },
    );
  }

  // Build a Set of 'orgId|title' pairs that already exist today
  const alreadySent = new Set<string>();
  for (const row of existingTodayRows) {
    alreadySent.add(`${row.org_id}|${row.title}`);
  }

  const adminClient = createAdminClient();
  let notificationsSent = 0;
  const insertErrors: string[] = [];

  for (const [orgId, adminIds] of orgToAdmins) {
    for (const deadline of upcomingDeadlines) {
      const notifTitle = `Compliance Due: ${deadline.title}`;
      const dedupeKey = `${orgId}|${notifTitle}`;

      // Skip if already sent today for this org
      if (alreadySent.has(dedupeKey)) continue;

      const body =
        `${deadline.description} — Due on ${deadline.due_date}. ` +
        `Applicable to: ${deadline.applicable_to}.`;

      // Insert one notification per admin in the org
      for (const adminId of adminIds) {
        try {
          const { error } = await adminClient.from('notifications').insert({
            org_id: orgId,
            user_id: adminId,
            task_id: null,
            title: notifTitle,
            body,
            is_read: false,
          });

          if (error) {
            console.error(JSON.stringify({
              level: 'error',
              cron: 'compliance',
              err: `Insert error for org=${orgId} user=${adminId}: ${error.message}`,
              ts: new Date().toISOString(),
            }));
            insertErrors.push(`${orgId}/${adminId}`);
          } else {
            notificationsSent++;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          console.error(JSON.stringify({
            level: 'error',
            cron: 'compliance',
            err: `Unexpected error for org=${orgId} user=${adminId}: ${msg}`,
            ts: new Date().toISOString(),
          }));
          insertErrors.push(`${orgId}/${adminId}`);
        }
      }

      // Mark as sent in our local deduplication set so subsequent
      // admins in the same org don't re-trigger a duplicate check loop.
      // (The next iteration of orgId is a different org — no collision.)
      alreadySent.add(dedupeKey);
    }
  }

  const deadlinesChecked = upcomingDeadlines.length;

  console.log(JSON.stringify({
    level: 'info',
    cron: 'compliance',
    event: 'complete',
    notificationsSent,
    deadlinesChecked,
    duration_ms: Date.now() - cronStart,
    ts: new Date().toISOString(),
  }));

  // Healthchecks.io dead-man's-switch ping (optional — set HC_PING_COMPLIANCE_URL in env)
  const pingUrl = process.env.HC_PING_COMPLIANCE_URL;
  if (pingUrl) {
    fetch(pingUrl).catch(() => {}); // fire-and-forget, never block the response
  }

  return NextResponse.json({
    success: true,
    notificationsSent,
    deadlinesChecked,
    orgsProcessed: orgToAdmins.size,
    failed: insertErrors.length > 0 ? insertErrors : undefined,
  });
}
