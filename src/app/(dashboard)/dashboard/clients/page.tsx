import { getClients } from '@/actions/clients';
import { ClientsClient } from '@/components/clients/ClientsClient';

export default async function ClientsPage() {
  const result = await getClients();

  if ('error' in result) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
        <p className="text-sm text-destructive font-medium">Failed to load clients</p>
        <p className="text-xs text-muted-foreground mt-0.5">{result.error}</p>
      </div>
    );
  }

  return <ClientsClient initialClients={result.data} />;
}
