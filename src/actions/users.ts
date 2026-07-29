'use server';

import { z } from 'zod';
import { db } from '@/db';
import { profiles } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth/getUser';
import { createAdminClient } from '@/lib/supabase/server';
import type { Profile } from '@/types';

// ---------------------------------------------------------------------------
// Internal context helpers
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

const inviteUserSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1).max(200),
  role_id: z.string().uuid().nullable().optional(),
  is_org_admin: z.boolean().default(false),
});

const updateUserSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().min(1).max(200).optional(),
  role_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional(),
  is_org_admin: z.boolean().optional(),
  can_mark_attendance: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Returns all active users in the caller's org.
 * Any authenticated user can read the org roster (needed for task assignment).
 */
export async function getOrgUsers(): Promise<{ data: Profile[] } | { error: string }> {
  const ctx = await resolveUser();
  if (isErrorResult(ctx)) return ctx;

  try {
    const data = await db
      .select()
      .from(profiles)
      .where(and(eq(profiles.org_id, ctx.orgId), eq(profiles.is_active, true)));

    return { data };
  } catch (err) {
    console.error('[getOrgUsers]', err);
    return { error: 'Failed to fetch users' };
  }
}

/**
 * Returns the full profile of the currently authenticated user, or null.
 * Does NOT require org membership — used at the very start of the auth flow.
 */
export async function getCurrentUserProfile(): Promise<
  { data: Profile } | { data: null } | { error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { data: null };

  try {
    const profile = await db.query.profiles.findFirst({
      where: (p, { eq }) => eq(p.id, user.id),
    });
    return { data: profile ?? null };
  } catch (err) {
    console.error('[getCurrentUserProfile]', err);
    return { error: 'Failed to fetch profile' };
  }
}

/**
 * Invite a new user to the org.
 * Uses createAdminClient() for both auth.admin.inviteUserByEmail and
 * profile creation — both bypass RLS intentionally (no INSERT policy on
 * profiles for non-admin users, per CLAUDE.md rule 4).
 */
export async function inviteUser(
  input: z.infer<typeof inviteUserSchema>,
): Promise<{ data: { userId: string } } | { error: string }> {
  const ctx = await resolveOrgAdmin();
  if (isErrorResult(ctx)) return ctx;

  const parsed = inviteUserSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.message };
  }

  const { email, full_name, role_id, is_org_admin } = parsed.data;

  // Validate role_id belongs to this org if provided
  if (role_id) {
    const { roles } = await import('@/db/schema');
    const role = await db.query.roles.findFirst({
      where: (r, { and, eq }) => and(eq(r.id, role_id), eq(r.org_id, ctx.orgId)),
      columns: { id: true },
    });
    if (!role) return { error: 'Role not found in this organisation' };
  }

  const admin = createAdminClient();

  // Step 1: Create Supabase auth user via admin API (sends invite email)
  const { data: authData, error: authError } = await admin.auth.admin.inviteUserByEmail(email);
  if (authError) return { error: authError.message };

  // Step 2: Create profile via admin client — bypasses RLS (rule 4)
  const { error: profileError } = await admin.from('profiles').insert({
    id: authData.user.id,
    org_id: ctx.orgId,
    role_id: role_id ?? null,
    full_name,
    email,
    is_org_admin,
    is_active: true,
  });

  if (profileError) {
    // Best-effort cleanup: delete the auth user so the invite isn't dangling
    await admin.auth.admin.deleteUser(authData.user.id);
    return { error: `Profile creation failed: ${profileError.message}` };
  }

  return { data: { userId: authData.user.id } };
}

/**
 * Update a user's profile fields. Org admin only.
 * Soft-deactivation (is_active: false) is the only way to "remove" a user.
 */
export async function updateUser(
  input: z.infer<typeof updateUserSchema>,
): Promise<{ data: Profile } | { error: string }> {
  const ctx = await resolveOrgAdmin();
  if (isErrorResult(ctx)) return ctx;

  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.message };
  }

  const { id, ...updates } = parsed.data;

  // Prevent admins from removing their own admin status if they are the only admin
  if (updates.is_org_admin === false && id === ctx.userId) {
    const adminCount = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(
        and(
          eq(profiles.org_id, ctx.orgId),
          eq(profiles.is_org_admin, true),
          eq(profiles.is_active, true),
        ),
      );

    if (adminCount.length <= 1) {
      return { error: 'Cannot remove the last org admin. Promote another user first.' };
    }
  }

  // Validate role_id belongs to this org if being updated
  if (updates.role_id) {
    const { roles } = await import('@/db/schema');
    const role = await db.query.roles.findFirst({
      where: (r, { and, eq }) => and(eq(r.id, updates.role_id!), eq(r.org_id, ctx.orgId)),
      columns: { id: true },
    });
    if (!role) return { error: 'Role not found in this organisation' };
  }

  try {
    const [profile] = await db
      .update(profiles)
      .set({ ...updates, updated_at: new Date() })
      .where(and(eq(profiles.id, id), eq(profiles.org_id, ctx.orgId)))
      .returning();

    if (!profile) return { error: 'User not found' };
    return { data: profile };
  } catch (err) {
    console.error('[updateUser]', err);
    return { error: 'Failed to update user' };
  }
}

/**
 * Soft-deactivate a user. Org admin only.
 * Per CLAUDE.md rule 9: no hard deletes ever.
 */
export async function deactivateUser(
  userId: string,
): Promise<{ data: true } | { error: string }> {
  const ctx = await resolveOrgAdmin();
  if (isErrorResult(ctx)) return ctx;

  const parsed = z.string().uuid().safeParse(userId);
  if (!parsed.success) return { error: 'Invalid user id' };

  if (userId === ctx.userId) {
    return { error: 'You cannot deactivate yourself' };
  }

  try {
    const [profile] = await db
      .update(profiles)
      .set({ is_active: false, updated_at: new Date() })
      .where(and(eq(profiles.id, userId), eq(profiles.org_id, ctx.orgId)))
      .returning({ id: profiles.id });

    if (!profile) return { error: 'User not found' };
    return { data: true };
  } catch (err) {
    console.error('[deactivateUser]', err);
    return { error: 'Failed to deactivate user' };
  }
}
