import { getTemplates } from '@/actions/recurring';
import { RecurringClient } from '@/components/recurring/RecurringClient';

export const metadata = {
  title: 'Recurring Templates | Filio',
};

export default async function RecurringPage() {
  const result = await getTemplates();

  // Graceful degradation — page still renders even if DB is unavailable
  const templates = 'data' in result ? result.data : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Recurring Templates</h1>
        <p className="text-sm text-muted-foreground">
          Templates auto-generate tasks on their cadence schedule.
        </p>
        {'error' in result && (
          <p className="text-sm text-destructive mt-1">{result.error}</p>
        )}
      </div>
      <RecurringClient initialTemplates={templates} />
    </div>
  );
}
