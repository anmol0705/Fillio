import { db } from '@/db';
import { profiles } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Returns true if the given user is an org admin for the given org.
 * Always filters by both userId AND orgId so a user from org A cannot
 * impersonate admin status in org B.
 */
export async function isOrgAdmin(userId: string, orgId: string): Promise<boolean> {
  const row = await db
    .select({ is_org_admin: profiles.is_org_admin })
    .from(profiles)
    .where(and(eq(profiles.id, userId), eq(profiles.org_id, orgId)))
    .then((r) => r[0] ?? null);

  return row?.is_org_admin ?? false;
}
