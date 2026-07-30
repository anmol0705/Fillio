import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/getUser';
import { getClients } from '@/actions/clients';
import { ClientsClient } from '@/components/clients/ClientsClient';

export default async function ClientsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const result = await getClients();
  if (result.error !== null) redirect('/dashboard');

  return <ClientsClient initialClients={result.data} />;
}
