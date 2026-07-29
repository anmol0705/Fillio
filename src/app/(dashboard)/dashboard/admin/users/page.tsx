import { getOrgUsers } from '@/actions/users';
import { UsersClient } from '@/components/users/UsersClient';

export default async function UsersPage() {
  const result = await getOrgUsers();

  if ('error' in result) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
        <p className="text-sm text-destructive font-medium">Failed to load users</p>
        <p className="text-xs text-muted-foreground mt-0.5">{result.error}</p>
      </div>
    );
  }

  return <UsersClient initialUsers={result.data} />;
}
