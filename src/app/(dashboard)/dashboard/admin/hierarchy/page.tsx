import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/getUser';
import { getReportingStructure } from '@/actions/hierarchy';
import { ReportingManager } from '@/components/hierarchy/ReportingManager';
import { ReportingGraph } from '@/components/hierarchy/ReportingGraph';

// searchParams lets us track which tab is active via ?view=graph in the URL
export default async function HierarchyPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const result = await getReportingStructure();
  if (result.error !== null) redirect('/dashboard');

  const params = await searchParams;
  const view = params.view === 'graph' ? 'graph' : 'list';

  const listHref  = '/dashboard/admin/hierarchy?view=list';
  const graphHref = '/dashboard/admin/hierarchy?view=graph';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">Reporting Structure</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Define who reports to whom. One person can report to multiple managers.
        </p>
      </div>

      {/* Stats */}
      <div className="flex gap-6 text-sm text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">{result.data.profiles.length}</span> people
        </span>
        <span>
          <span className="font-medium text-foreground">{result.data.relationships.length}</span> reporting relationships
        </span>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit">
        <a
          href={listHref}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors min-h-[40px] flex items-center ${
            view === 'list'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          List
        </a>
        <a
          href={graphHref}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors min-h-[40px] flex items-center ${
            view === 'graph'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Graph
        </a>
      </div>

      {/* Views */}
      {view === 'list' ? (
        <ReportingManager data={result.data} />
      ) : (
        <ReportingGraph data={result.data} />
      )}
    </div>
  );
}
