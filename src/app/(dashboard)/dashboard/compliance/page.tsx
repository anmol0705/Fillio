import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/getUser';
import { getCalendarEvents } from '@/actions/calendar';
import { db } from '@/db';
import { CalendarClient } from '@/components/calendar/CalendarClient';

export default async function CalendarPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const profile = await db.query.profiles.findFirst({
    where: (p, { eq }) => eq(p.id, user.id),
    columns: { org_id: true, is_org_admin: true },
  });
  if (!profile) redirect('/login');

  // Load current month
  const now = new Date();
  const result = await getCalendarEvents(now.getFullYear(), now.getMonth() + 1);

  // Load org members for the assignee dropdown (admins + managers see everyone)
  const members = await db.query.profiles.findMany({
    where: (p, { and, eq }) => and(eq(p.org_id, profile.org_id), eq(p.is_active, true)),
    columns: { id: true, full_name: true },
    orderBy: (p, { asc }) => [asc(p.full_name)],
  });

  // Load active tasks for the optional task link dropdown
  const activeTasks = await db.query.tasks.findMany({
    where: (t, { and, eq, ne }) =>
      and(eq(t.org_id, profile.org_id), eq(t.is_active, true), ne(t.status, 'completed')),
    columns: { id: true, title: true },
    orderBy: (t, { desc }) => [desc(t.created_at)],
    limit: 100,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Calendar</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Your activities and events assigned to you.
        </p>
      </div>

      <CalendarClient
        initialEvents={result.data ?? []}
        currentUserId={user.id}
        isAdmin={profile.is_org_admin}
        members={members}
        tasks={activeTasks}
      />
    </div>
  );
}
