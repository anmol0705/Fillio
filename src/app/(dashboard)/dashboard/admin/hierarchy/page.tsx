import { getRoles } from '@/actions/hierarchy';
import { OrgTree } from '@/components/hierarchy/OrgTree';

export default async function HierarchyPage() {
  const result = await getRoles();

  if ('error' in result) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
        <p className="text-sm text-destructive font-medium">Failed to load roles</p>
        <p className="text-xs text-muted-foreground mt-0.5">{result.error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <OrgTree initialRoles={result.data} />
    </div>
  );
}
