import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/getUser';
import { db } from '@/db';
import { DashboardShell } from '@/components/layout/DashboardShell';
import type { Profile } from '@/types';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const profile = await db.query.profiles.findFirst({
    where: (p, { eq }) => eq(p.id, user.id),
  }) as Profile | undefined;

  if (!profile) redirect('/login?error=no_profile');

  return (
    <DashboardShell
      profile={profile}
      initialNotifications={[]}
      userId={user.id}
    >
      {children}
    </DashboardShell>
  );
}
