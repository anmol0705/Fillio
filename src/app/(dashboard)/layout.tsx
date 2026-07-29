import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/getUser';
import { db } from '@/db';
import { getInitialNotifications } from '@/actions/notifications';
import { DashboardShell } from '@/components/layout/DashboardShell';
import type { Profile } from '@/types';

// All dashboard routes require auth and real-time DB reads — never statically render
export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [profile, notificationsResult] = await Promise.all([
    db.query.profiles.findFirst({
      where: (p, { eq }) => eq(p.id, user.id),
    }) as Promise<Profile | undefined>,
    getInitialNotifications(),
  ]);

  if (!profile) redirect('/login?error=no_profile');

  const initialNotifications =
    'data' in notificationsResult ? notificationsResult.data : [];

  return (
    <DashboardShell
      profile={profile}
      initialNotifications={initialNotifications}
      userId={user.id}
    >
      {children}
    </DashboardShell>
  );
}
