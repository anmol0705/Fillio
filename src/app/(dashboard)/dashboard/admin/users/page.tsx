import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/getUser';
import { getOrgUsers } from '@/actions/users';
import { getRoles } from '@/actions/roles';
import { UsersTable } from '@/components/users/UsersTable';

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // Fetch users and roles in parallel — they don't depend on each other
  const [usersResult, rolesResult] = await Promise.all([
    getOrgUsers(),
    getRoles(),
  ]);

  if (usersResult.error !== null) redirect('/dashboard');

  // Roles are optional — if fetching fails (e.g. non-admin somehow), just pass empty
  const roles = rolesResult.error !== null ? [] : rolesResult.data;

  return (
    <UsersTable
      users={usersResult.data}
      roles={roles}
      currentUserId={user.id}
    />
  );
}
