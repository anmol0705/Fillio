'use server';
import 'server-only';

import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { createAdminClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getUser';
import { db } from '@/db';
import { orgs, profiles } from '@/db/schema';

// ---------------------------------------------------------------------------
// Platform admin guard — only the person whose email matches PLATFORM_ADMIN_EMAIL
// can use these actions. This is not an org-level check; it's app-owner level.
// ---------------------------------------------------------------------------

async function requirePlatformAdmin() {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: 'Not authenticated' };

  const allowed = process.env.PLATFORM_ADMIN_EMAIL;
  if (!allowed || user.email !== allowed) {
    return { ok: false as const, error: 'Unauthorized' };
  }
  return { ok: true as const, user };
}

// ---------------------------------------------------------------------------
// listOrgs — all organisations for the platform admin overview
// ---------------------------------------------------------------------------

export async function listOrgs(): Promise<
  { error: string; data: null } | { error: null; data: { id: string; name: string; slug: string; created_at: Date }[] }
> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return { error: guard.error, data: null };

  const data = await db.select().from(orgs).orderBy(orgs.created_at);
  return { error: null, data };
}

// ---------------------------------------------------------------------------
// createOrg — create org + first admin user, send them an invite email
// ---------------------------------------------------------------------------

const CreateOrgSchema = z.object({
  firm_name:   z.string().min(2, 'Firm name must be at least 2 characters').max(100),
  firm_slug:   z.string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
  admin_name:  z.string().min(2, 'Name must be at least 2 characters').max(100),
  admin_email: z
    .string()
    .email('Invalid email address')
    .refine(v => !v.toLowerCase().endsWith('@filio.internal'), {
      message: 'Cannot use an internal domain as the admin email',
    }),
});

export async function createOrg(raw: unknown): Promise<
  { error: string; data: null } | { error: null; data: { org_id: string; admin_id: string } }
> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return { error: guard.error, data: null };

  const parsed = CreateOrgSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input', data: null };

  const { firm_name, firm_slug, admin_name, admin_email } = parsed.data;
  const admin = createAdminClient();

  // 1. Create org
  const { data: orgData, error: orgError } = await admin
    .from('orgs')
    .insert({ name: firm_name, slug: firm_slug })
    .select('id')
    .single();

  if (orgError || !orgData) {
    if (orgError?.code === '23505') return { error: `Slug "${firm_slug}" is already taken`, data: null };
    return { error: orgError?.message ?? 'Failed to create organisation', data: null };
  }

  const orgId = orgData.id;

  // 2. Invite the admin user — Supabase sends invite email automatically
  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    admin_email,
    {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      data: { full_name: admin_name },
    },
  );

  if (inviteError || !inviteData?.user) {
    // Roll back the org so we don't leave an orphan
    await admin.from('orgs').delete().eq('id', orgId);
    return { error: inviteError?.message ?? 'Failed to invite admin user', data: null };
  }

  const adminUserId = inviteData.user.id;

  // 3. Create the profile row
  const { error: profileError } = await admin.from('profiles').insert({
    id:                  adminUserId,
    org_id:              orgId,
    full_name:           admin_name,
    email:               admin_email,
    is_org_admin:        true,
    can_mark_attendance: true,
  });

  if (profileError) {
    // Roll back both
    await admin.auth.admin.deleteUser(adminUserId);
    await admin.from('orgs').delete().eq('id', orgId);
    return { error: profileError.message ?? 'Failed to create admin profile', data: null };
  }

  return { error: null, data: { org_id: orgId, admin_id: adminUserId } };
}

// ---------------------------------------------------------------------------
// listOrgMembers — all users in a specific org
// ---------------------------------------------------------------------------

export async function listOrgMembers(orgId: string): Promise<
  { error: string; data: null } | { error: null; data: { id: string; full_name: string; email: string; user_code: string | null; is_org_admin: boolean; is_active: boolean }[] }
> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return { error: guard.error, data: null };

  const uuidCheck = z.string().uuid().safeParse(orgId);
  if (!uuidCheck.success) return { error: 'Invalid org ID', data: null };

  const data = await db
    .select({
      id:           profiles.id,
      full_name:    profiles.full_name,
      email:        profiles.email,
      user_code:    profiles.user_code,
      is_org_admin: profiles.is_org_admin,
      is_active:    profiles.is_active,
    })
    .from(profiles)
    .where(eq(profiles.org_id, orgId))
    .orderBy(profiles.full_name);

  return { error: null, data };
}

// ---------------------------------------------------------------------------
// createUserInOrg — platform admin creates a user directly with user_code + password
// No invite email — user logs in immediately with their user_code and password.
// ---------------------------------------------------------------------------

const USER_CODE_REGEX = /^[a-z0-9][a-z0-9._-]{1,29}$/;

const CreateUserSchema = z.object({
  org_id:    z.string().uuid('Invalid org'),
  full_name: z.string().min(2, 'Name too short').max(100),
  user_code: z
    .string()
    .min(2, 'User ID must be at least 2 characters')
    .max(30, 'User ID must be 30 characters or less')
    .toLowerCase()
    .regex(USER_CODE_REGEX, 'User ID can only contain lowercase letters, numbers, dots, hyphens, and underscores'),
  password:  z.string().min(8, 'Password must be at least 8 characters'),
  is_admin:  z.boolean().default(false),
});

export async function createUserInOrg(raw: unknown): Promise<
  { error: string; data: null } | { error: null; data: { user_id: string; user_code: string } }
> {
  const guard = await requirePlatformAdmin();
  if (!guard.ok) return { error: guard.error, data: null };

  const parsed = CreateUserSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input', data: null };

  const { org_id, full_name, user_code, password, is_admin } = parsed.data;
  const admin = createAdminClient();

  // Check org exists
  const orgRow = await db.query.orgs.findFirst({
    where: eq(orgs.id, org_id),
    columns: { id: true },
  });
  if (!orgRow) return { error: 'Organisation not found', data: null };

  // Check user_code is globally unique
  const existing = await db.query.profiles.findFirst({
    where: eq(profiles.user_code, user_code),
    columns: { id: true },
  });
  if (existing) return { error: `User ID "${user_code}" is already taken`, data: null };

  // Synthetic email — never shown to the user, only used internally for Supabase Auth
  const syntheticEmail = `${user_code}@filio.internal`;

  // Create Supabase Auth user with password (email_confirm: true skips verification)
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email:          syntheticEmail,
    password,
    email_confirm:  true,
  });

  if (authError || !authData?.user) {
    return { error: authError?.message ?? 'Failed to create user', data: null };
  }

  const userId = authData.user.id;

  // Create profile row
  const { error: profileError } = await admin.from('profiles').insert({
    id:                  userId,
    org_id,
    full_name,
    email:               syntheticEmail,
    user_code,
    is_org_admin:        is_admin,
    can_mark_attendance: is_admin,
  });

  if (profileError) {
    // Roll back auth user to avoid orphan
    await admin.auth.admin.deleteUser(userId);
    if (profileError.code === '23505') return { error: `User ID "${user_code}" is already taken`, data: null };
    return { error: profileError.message ?? 'Failed to create profile', data: null };
  }

  return { error: null, data: { user_id: userId, user_code } };
}
