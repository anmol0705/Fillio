import { db } from '@/db';
import { profiles } from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

/**
 * Returns all role IDs in the subtree rooted at `rootRoleId` (inclusive).
 * Uses a recursive CTE traversing roles.parent_role_id.
 * All rows are filtered by org_id for tenant isolation.
 */
export async function getUserSubtreeRoleIds(
  rootRoleId: string,
  orgId: string,
): Promise<string[]> {
  const result = await db.execute(sql`
    WITH RECURSIVE subtree AS (
      SELECT id
      FROM roles
      WHERE id = ${rootRoleId}::uuid
        AND org_id = ${orgId}::uuid

      UNION ALL

      SELECT r.id
      FROM roles r
      INNER JOIN subtree s ON r.parent_role_id = s.id
      WHERE r.org_id = ${orgId}::uuid
    )
    SELECT id FROM subtree
  `);

  // postgres-js returns an array of row objects
  return (result as unknown as { id: string }[]).map((r) => r.id);
}

/**
 * Returns the profile IDs of all active users whose role is anywhere in the
 * subtree rooted at `rootRoleId`.
 */
export async function getUserSubtree(
  rootRoleId: string,
  orgId: string,
): Promise<string[]> {
  const roleIds = await getUserSubtreeRoleIds(rootRoleId, orgId);
  if (roleIds.length === 0) return [];

  const users = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(
      and(
        inArray(profiles.role_id, roleIds),
        eq(profiles.org_id, orgId),
        eq(profiles.is_active, true),
      ),
    );

  return users.map((u) => u.id);
}

/**
 * Returns true if `targetUserId` is within the assignable subtree of
 * `assignerUserId`.
 *
 * Rules:
 *  - Org admins can assign to anyone (no subtree restriction).
 *  - Otherwise the target must be in the role subtree of the assigner's role.
 *  - Both users must belong to `orgId`.
 */
export async function canUserAssignTo(
  assignerUserId: string,
  targetUserId: string,
  orgId: string,
): Promise<boolean> {
  const [assigner, target] = await Promise.all([
    db
      .select({
        role_id: profiles.role_id,
        is_org_admin: profiles.is_org_admin,
        org_id: profiles.org_id,
      })
      .from(profiles)
      .where(and(eq(profiles.id, assignerUserId), eq(profiles.org_id, orgId)))
      .then((r) => r[0] ?? null),

    db
      .select({ id: profiles.id, org_id: profiles.org_id })
      .from(profiles)
      .where(and(eq(profiles.id, targetUserId), eq(profiles.org_id, orgId)))
      .then((r) => r[0] ?? null),
  ]);

  if (!assigner || !target) return false;

  // Org admins can assign to anyone in the same org
  if (assigner.is_org_admin) return true;

  // Users without a role cannot assign
  if (!assigner.role_id) return false;

  const subtreeUserIds = await getUserSubtree(assigner.role_id, orgId);
  return subtreeUserIds.includes(targetUserId);
}
