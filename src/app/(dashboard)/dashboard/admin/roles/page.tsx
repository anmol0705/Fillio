import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/getUser';
import { getRoles } from '@/actions/roles';
import { RolesManager } from '@/components/roles/RolesManager';

export default async function RolesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const result = await getRoles();
  if (result.error !== null) redirect('/dashboard');

  return <RolesManager initialRoles={result.data} />;
}
