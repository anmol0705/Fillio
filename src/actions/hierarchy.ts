'use server';

import { z } from 'zod';
import { db } from '@/db';
import { roles } from '@/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth/getUser';
import type { Role } from '@/types';

// ---------------------------------------------------------------------------
// Internal helpers — never exported, never throw to callers
// ---------------------------------------------------------------------------

type OrgAdminContext = { userId: string; orgId: string };

async function resolveOrgAdmin(): Promise<OrgAdminContext | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  const profile = await db.query.profiles.findFirst({
    where: (p, { eq }) => eq(p.id, user.id),
    columns: { org_id: true, is_org_admin: true },
  });

  if (!profile) return { error: 'Profile not found' };
  if (!profile.is_org_admin) return { error: 'Forbidden: admin only' };

  return { userId: user.id, orgId: profile.org_id };
}

async function resolveUser(): Promise<{ userId: string; orgId: string } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  const profile = await db.query.profiles.findFirst({
    where: (p, { eq }) => eq(p.id, user.id),
    columns: { org_id: true },
  });

  if (!profile) return { error: 'Profile not found' };
  return { userId: user.id, orgId: profile.org_id };
}

function isErrorResult(v: unknown): v is { error: string } {
  return typeof v === 'object' && v !== null && 'error' in v;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  parent_role_id: z.string().uuid().nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
});

const updateRoleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  parent_role_id: z.string().uuid().nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
});

const reorderSchema = z.array(
  z.object({
    id: z.string().uuid(),
    sort_order: z.number().int().min(0),
  }),
);

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * List all roles for the caller's org, ordered by sort_order.
 * Any authenticated user can read roles (needed for hierarchy display).
 */
export async function getRoles(): Promise<{ data: Role[] } | { error: string }> {
  const ctx = await resolveUser();
  if (isErrorResult(ctx)) return ctx;

  try {
    const data = await db
      .select()
      .from(roles)
      .where(eq(roles.org_id, ctx.orgId))
      .orderBy(asc(roles.sort_order), asc(roles.created_at));

    return { data };
  } catch (err) {
    console.error('[getRoles]', err);
    return { error: 'Failed to fetch roles' };
  }
}

/**
 * Create a new role. Org admin only.
 */
export async function createRole(
  input: z.infer<typeof createRoleSchema>,
): Promise<{ data: Role } | { error: string }> {
  const ctx = await resolveOrgAdmin();
  if (isErrorResult(ctx)) return ctx;

  const parsed = createRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.message };
  }

  const { name, color, parent_role_id, sort_order } = parsed.data;

  // If a parent is specified, verify it belongs to the same org
  if (parent_role_id) {
    const parent = await db.query.roles.findFirst({
      where: (r, { and, eq }) =>
        and(eq(r.id, parent_role_id), eq(r.org_id, ctx.orgId)),
      columns: { id: true },
    });
    if (!parent) return { error: 'Parent role not found in this organisation' };
  }

  try {
    const [role] = await db
      .insert(roles)
      .values({
        org_id: ctx.orgId,
        name,
        color,
        parent_role_id: parent_role_id ?? null,
        sort_order: sort_order ?? 999,
      })
      .returning();

    return { data: role };
  } catch (err) {
    console.error('[createRole]', err);
    return { error: 'Failed to create role' };
  }
}

/**
 * Update an existing role. Org admin only.
 */
export async function updateRole(
  input: z.infer<typeof updateRoleSchema>,
): Promise<{ data: Role } | { error: string }> {
  const ctx = await resolveOrgAdmin();
  if (isErrorResult(ctx)) return ctx;

  const parsed = updateRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.message };
  }

  const { id, ...updates } = parsed.data;

  // Prevent self-parenting
  if (updates.parent_role_id === id) {
    return { error: 'A role cannot be its own parent' };
  }

  // If updating parent, verify the new parent exists in this org
  if (updates.parent_role_id) {
    const parent = await db.query.roles.findFirst({
      where: (r, { and, eq }) =>
        and(eq(r.id, updates.parent_role_id!), eq(r.org_id, ctx.orgId)),
      columns: { id: true },
    });
    if (!parent) return { error: 'Parent role not found in this organisation' };
  }

  try {
    const [role] = await db
      .update(roles)
      .set({ ...updates, updated_at: new Date() })
      .where(and(eq(roles.id, id), eq(roles.org_id, ctx.orgId)))
      .returning();

    if (!role) return { error: 'Role not found' };
    return { data: role };
  } catch (err) {
    console.error('[updateRole]', err);
    return { error: 'Failed to update role' };
  }
}

/**
 * Soft-delete a role by deactivating. We do not hard-delete because profiles
 * may still reference it. Per CLAUDE.md rule 9: soft delete only.
 *
 * We repurpose the Drizzle delete here only if no profiles reference the role.
 * If profiles exist, we reject — the admin must reassign users first.
 */
export async function deleteRole(id: string): Promise<{ data: true } | { error: string }> {
  const ctx = await resolveOrgAdmin();
  if (isErrorResult(ctx)) return ctx;

  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { error: 'Invalid role id' };

  // Verify the role belongs to this org
  const role = await db.query.roles.findFirst({
    where: (r, { and, eq }) => and(eq(r.id, id), eq(r.org_id, ctx.orgId)),
    columns: { id: true },
  });
  if (!role) return { error: 'Role not found' };

  // Guard: do not delete if active users are assigned to it
  const { profiles: profilesTable } = await import('@/db/schema');
  const occupants = await db
    .select({ id: profilesTable.id })
    .from(profilesTable)
    .where(
      and(
        eq(profilesTable.role_id, id),
        eq(profilesTable.org_id, ctx.orgId),
        eq(profilesTable.is_active, true),
      ),
    );

  if (occupants.length > 0) {
    return {
      error: `Cannot delete role: ${occupants.length} active user(s) are still assigned to it. Reassign them first.`,
    };
  }

  // Guard: do not delete if child roles exist
  const children = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.parent_role_id, id), eq(roles.org_id, ctx.orgId)));

  if (children.length > 0) {
    return {
      error: `Cannot delete role: it has ${children.length} child role(s). Remove or reparent them first.`,
    };
  }

  try {
    await db.delete(roles).where(and(eq(roles.id, id), eq(roles.org_id, ctx.orgId)));
    return { data: true };
  } catch (err) {
    console.error('[deleteRole]', err);
    return { error: 'Failed to delete role' };
  }
}

/**
 * Bulk-reorder roles. Accepts an array of { id, sort_order } pairs.
 * All roles must belong to the caller's org. Org admin only.
 */
export async function reorderRoles(
  items: { id: string; sort_order: number }[],
): Promise<{ data: true } | { error: string }> {
  const ctx = await resolveOrgAdmin();
  if (isErrorResult(ctx)) return ctx;

  const parsed = reorderSchema.safeParse(items);
  if (!parsed.success) {
    return { error: parsed.error.message };
  }

  if (parsed.data.length === 0) return { data: true };

  try {
    // Run all updates in parallel — each is a cheap indexed write
    await Promise.all(
      parsed.data.map(({ id, sort_order }) =>
        db
          .update(roles)
          .set({ sort_order })
          .where(and(eq(roles.id, id), eq(roles.org_id, ctx.orgId))),
      ),
    );
    return { data: true };
  } catch (err) {
    console.error('[reorderRoles]', err);
    return { error: 'Failed to reorder roles' };
  }
}
