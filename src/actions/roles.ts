'use server';
import 'server-only';

import { z } from 'zod';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { roles, profiles } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth/getUser';
import type { Profile, Role } from '@/types';

// ---------------------------------------------------------------------------
// Shared admin guard
//
// Returns { ok: true, admin } or { ok: false, error }.
// Using a boolean `ok` discriminant instead of checking string | null — TypeScript
// narrows discriminated unions reliably on boolean literals.
// ---------------------------------------------------------------------------

type AdminResult =
  | { ok: false; error: string }
  | { ok: true; admin: Profile };

async function requireAdmin(): Promise<AdminResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const profile = await db.query.profiles.findFirst({
    where: (p, { eq }) => eq(p.id, user.id),
  });

  if (!profile?.is_org_admin) return { ok: false, error: 'Not authorized' };
  return { ok: true, admin: profile as Profile };
}

// ---------------------------------------------------------------------------
// getRoles — list all roles in the org
// ---------------------------------------------------------------------------

export async function getRoles(): Promise<
  { error: string; data: null } | { error: null; data: Role[] }
> {
  const result = await requireAdmin();
  if (!result.ok) return { error: result.error, data: null };

  const data = await db.query.roles.findMany({
    where: (r, { and: qAnd, eq }) => qAnd(eq(r.org_id, result.admin.org_id), eq(r.is_active, true)),
    orderBy: (r, { asc }) => [asc(r.name)],
  });

  return { error: null, data: data as Role[] };
}

// ---------------------------------------------------------------------------
// createRole
// ---------------------------------------------------------------------------

const RoleSchema = z.object({
  name:   z.string().min(1, 'Name is required').max(60),
  colour: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a hex colour like #3B82F6'),
});

export async function createRole(
  raw: unknown
): Promise<{ error: string } | { data: Role }> {
  const result = await requireAdmin();
  if (!result.ok) return { error: result.error };

  const parsed = RoleSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const { name, colour } = parsed.data;

  const existing = await db.query.roles.findFirst({
    where: (r, { and, eq, ilike }) =>
      and(eq(r.org_id, result.admin.org_id), ilike(r.name, name)),
  });
  if (existing) return { error: `A role named "${name}" already exists` };

  const [created] = await db
    .insert(roles)
    .values({ org_id: result.admin.org_id, name: name.trim(), colour })
    .returning();

  return { data: created as Role };
}

// ---------------------------------------------------------------------------
// updateRole — rename or recolour
// ---------------------------------------------------------------------------

const UpdateRoleSchema = z.object({
  roleId: z.string().uuid(),
  name:   z.string().min(1).max(60).optional(),
  colour: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export async function updateRole(
  raw: unknown
): Promise<{ error: string } | { data: 'ok' }> {
  const result = await requireAdmin();
  if (!result.ok) return { error: result.error };

  const parsed = UpdateRoleSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const { roleId, ...updates } = parsed.data;

  await db
    .update(roles)
    .set(updates)
    .where(and(eq(roles.id, roleId), eq(roles.org_id, result.admin.org_id)));

  return { data: 'ok' };
}

// ---------------------------------------------------------------------------
// deleteRole — only allowed if no active users have this role
//
// We give a meaningful error instead of letting Postgres throw a raw FK
// constraint violation.
// ---------------------------------------------------------------------------

export async function deleteRole(
  roleId: string
): Promise<{ error: string } | { data: 'ok' }> {
  const result = await requireAdmin();
  if (!result.ok) return { error: result.error };

  if (!z.string().uuid().safeParse(roleId).success) {
    return { error: 'Invalid role ID' };
  }

  const usersWithRole = await db.query.profiles.findMany({
    where: (p, { and, eq }) =>
      and(
        eq(p.org_id, result.admin.org_id),
        eq(p.role_id, roleId),
        eq(p.is_active, true),
      ),
    columns: { id: true },
  });

  if (usersWithRole.length > 0) {
    return {
      error: `Cannot delete — ${usersWithRole.length} active member${usersWithRole.length !== 1 ? 's have' : ' has'} this role. Reassign them first.`,
    };
  }

  await db
    .update(roles)
    .set({ is_active: false })
    .where(and(eq(roles.id, roleId), eq(roles.org_id, result.admin.org_id)));

  return { data: 'ok' };
}
