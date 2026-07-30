import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/getUser';
import { listOrgs } from '@/actions/platform';
import { PlatformClient } from '@/components/platform/PlatformClient';

export const dynamic = 'force-dynamic';

export default async function PlatformPage() {
  const user = await getCurrentUser();

  // Must be logged in and must be the platform admin
  if (!user) redirect('/login');

  const allowed = process.env.PLATFORM_ADMIN_EMAIL;
  if (!allowed || user.email !== allowed) redirect('/dashboard');

  const result = await listOrgs();
  const orgs = result.error === null ? result.data : [];

  return <PlatformClient initialOrgs={orgs} />;
}
