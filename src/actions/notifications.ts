'use server';

import { db } from '@/db';
import { notifications } from '@/db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth/getUser';
import type { Notification } from '@/types';

export async function getInitialNotifications(): Promise<
  { data: Notification[] } | { error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  const profile = await db.query.profiles.findFirst({
    where: (p, { eq }) => eq(p.id, user.id),
    columns: { org_id: true },
  });
  if (!profile) return { error: 'Profile not found' };

  try {
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
      .limit(50);

    return { data: rows as Notification[] };
  } catch (err) {
    console.error('[getInitialNotifications]', err);
    return { error: 'Failed to fetch notifications' };
  }
}
