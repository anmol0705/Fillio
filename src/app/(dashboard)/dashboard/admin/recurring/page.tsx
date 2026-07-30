import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/getUser';
import { getRecurringTemplates } from '@/actions/recurring';
import { getRoles } from '@/actions/roles';
import { getClients } from '@/actions/clients';
import { RecurringClient } from '@/components/recurring/RecurringClient';

export default async function RecurringPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [templatesResult, rolesResult, clientsResult] = await Promise.all([
    getRecurringTemplates(),
    getRoles(),
    getClients(),
  ]);

  if (templatesResult.error && templatesResult.error === 'Unauthorised') {
    redirect('/dashboard');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Recurring Tasks</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Templates that auto-create tasks on a fixed schedule. Runs daily at 6:30 AM IST.
        </p>
      </div>

      <RecurringClient
        initialTemplates={templatesResult.data ?? []}
        roles={rolesResult.data ?? []}
        clients={clientsResult.data ?? []}
      />
    </div>
  );
}
