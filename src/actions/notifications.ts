'use server';
import 'server-only';

import { and, eq, desc } from 'drizzle-orm';
import { db } from '@/db';
import { createAdminClient } from '@/lib/supabase/server';
import { notifications } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth/getUser';
import type { Notification } from '@/types';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// getNotifications — called on layout load to seed the bell
// ---------------------------------------------------------------------------

export async function getNotifications(): Promise<
  { error: string; data: null } | { error: null; data: Notification[] }
> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated', data: null };

  const profile = await db.query.profiles.findFirst({
    where: (p, { eq }) => eq(p.id, user.id),
    columns: { org_id: true },
  });
  if (!profile) return { error: 'Profile not found', data: null };

  const rows = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.user_id, user.id),
        eq(notifications.org_id, profile.org_id),
      ),
    )
    .orderBy(desc(notifications.created_at))
    .limit(30);

  return { error: null, data: rows };
}

// ---------------------------------------------------------------------------
// markAsRead — mark a single notification
// ---------------------------------------------------------------------------

export async function markAsRead(
  id: string,
): Promise<{ error: string } | { error: null }> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  const uuidCheck = z.string().uuid().safeParse(id);
  if (!uuidCheck.success) return { error: 'Invalid notification ID' };

  const profile = await db.query.profiles.findFirst({
    where: (p, { eq }) => eq(p.id, user.id),
    columns: { org_id: true },
  });
  if (!profile) return { error: 'Profile not found' };

  await db
    .update(notifications)
    .set({ is_read: true })
    .where(and(eq(notifications.id, id), eq(notifications.user_id, user.id), eq(notifications.org_id, profile.org_id)));

  return { error: null };
}

// ---------------------------------------------------------------------------
// markAllAsRead — mark all unread notifications for the current user
// ---------------------------------------------------------------------------

export async function markAllAsRead(): Promise<{ error: string } | { error: null }> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  const profile = await db.query.profiles.findFirst({
    where: (p, { eq }) => eq(p.id, user.id),
    columns: { org_id: true },
  });
  if (!profile) return { error: 'Profile not found' };

  await db
    .update(notifications)
    .set({ is_read: true })
    .where(and(eq(notifications.user_id, user.id), eq(notifications.org_id, profile.org_id), eq(notifications.is_read, false)));

  return { error: null };
}

// ---------------------------------------------------------------------------
// insertNotification — internal helper, called from task server actions.
// Uses admin client so it bypasses RLS (users cannot insert their own).
// Fire-and-forget — never throws, logs on failure.
// ---------------------------------------------------------------------------

export async function insertNotification({
  org_id,
  user_id,
  task_id,
  type,
  title,
  body,
}: {
  org_id:  string;
  user_id: string;
  task_id: string | null;
  type:    'task_assigned' | 'task_reassigned' | 'task_under_review';
  title:   string;
  body?:   string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from('notifications').insert({
      org_id,
      user_id,
      task_id,
      type,
      title,
      body: body ?? null,
      is_read: false,
    });
  } catch (err) {
    console.error('[insertNotification] failed:', err);
  }
}
