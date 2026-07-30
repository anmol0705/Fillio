'use server';
import 'server-only';

import { z } from 'zod';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { profiles } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth/getUser';
import { createAdminClient } from '@/lib/supabase/server';
import type { Profile } from '@/types';

// ---------------------------------------------------------------------------
// Shared admin guard
//
// Returns { ok: true, admin } or { ok: false, error }.
// Using a boolean `ok` discriminant — TypeScript narrows on boolean literals
// reliably, unlike string | null truthiness checks.
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
// getOrgUsers — list all members of the current admin's org
// ---------------------------------------------------------------------------

export async function getOrgUsers(): Promise<
  { error: string; data: null } | { error: null; data: Profile[] }
> {
  const result = await requireAdmin();
  if (!result.ok) return { error: result.error, data: null };

  const users = await db.query.profiles.findMany({
    where: (p, { eq }) => eq(p.org_id, result.admin.org_id),
    orderBy: (p, { asc }) => [asc(p.full_name)],
  });

  return { error: null, data: users as Profile[] };
}

// ---------------------------------------------------------------------------
// inviteUser — create an auth user + profile in one atomic step
//
// Flow:
//   1. Check email not already in this org
//   2. supabase.auth.admin.inviteUserByEmail() — creates auth user, sends invite email
//   3. Insert profile row using the returned auth user ID
//   4. If profile insert fails → delete the auth user (prevent ghost user)
// ---------------------------------------------------------------------------

const InviteSchema = z.object({
  email:               z.string().email('Enter a valid email address'),
  full_name:           z.string().min(2, 'Name must be at least 2 characters').max(100),
  is_org_admin:        z.boolean().default(false),
  can_mark_attendance: z.boolean().default(false),
});

export async function inviteUser(
  raw: unknown
): Promise<{ error: string } | { data: { id: string; email: string } }> {
  const result = await requireAdmin();
  if (!result.ok) return { error: result.error };

  const parsed = InviteSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const { email, full_name, is_org_admin, can_mark_attendance } = parsed.data;

  const existing = await db.query.profiles.findFirst({
    where: (p, { and, eq }) =>
      and(eq(p.org_id, result.admin.org_id), eq(p.email, email)),
  });
  if (existing) {
    return { error: 'A user with this email already exists in your organisation' };
  }

  const supabase = createAdminClient();

  const { data: authData, error: inviteError } =
    await supabase.auth.admin.inviteUserByEmail(email);

  if (inviteError) return { error: inviteError.message };

  try {
    await db.insert(profiles).values({
      id:                  authData.user.id,
      org_id:              result.admin.org_id,
      full_name,
      email,
      is_org_admin,
      can_mark_attendance,
    });
  } catch {
    await supabase.auth.admin.deleteUser(authData.user.id);
    return { error: 'Failed to create user profile. The invite was cancelled.' };
  }

  return { data: { id: authData.user.id, email } };
}

// ---------------------------------------------------------------------------
// updateUser — change name, admin status, attendance permission, or role
// ---------------------------------------------------------------------------

const UpdateSchema = z.object({
  userId:              z.string().uuid('Invalid user ID'),
  full_name:           z.string().min(2).max(100).optional(),
  is_org_admin:        z.boolean().optional(),
  can_mark_attendance: z.boolean().optional(),
  role_id:             z.string().uuid().nullable().optional(),
});

export async function updateUser(
  raw: unknown
): Promise<{ error: string } | { data: 'ok' }> {
  const result = await requireAdmin();
  if (!result.ok) return { error: result.error };

  const parsed = UpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const { userId, ...updates } = parsed.data;

  // Safety: prevent the last admin from removing their own admin status
  if (updates.is_org_admin === false && userId === result.admin.id) {
    const allAdmins = await db.query.profiles.findMany({
      where: (p, { and, eq }) =>
        and(
          eq(p.org_id, result.admin.org_id),
          eq(p.is_org_admin, true),
          eq(p.is_active, true),
        ),
    });
    if (allAdmins.length <= 1) {
      return { error: 'Cannot remove admin status — you are the only admin in this org' };
    }
  }

  await db
    .update(profiles)
    .set({ ...updates, updated_at: new Date() })
    .where(and(eq(profiles.id, userId), eq(profiles.org_id, result.admin.org_id)));

  return { data: 'ok' };
}

// ---------------------------------------------------------------------------
// deactivateUser — soft delete (is_active = false), never hard delete
// ---------------------------------------------------------------------------

export async function deactivateUser(
  userId: string
): Promise<{ error: string } | { data: 'ok' }> {
  const result = await requireAdmin();
  if (!result.ok) return { error: result.error };

  if (!z.string().uuid().safeParse(userId).success) {
    return { error: 'Invalid user ID' };
  }

  if (userId === result.admin.id) {
    return { error: 'You cannot deactivate your own account' };
  }

  await db
    .update(profiles)
    .set({ is_active: false, updated_at: new Date() })
    .where(and(eq(profiles.id, userId), eq(profiles.org_id, result.admin.org_id)));

  return { data: 'ok' };
}
