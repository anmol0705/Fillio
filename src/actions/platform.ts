'use server';
import 'server-only';

import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getUser';
import { db } from '@/db';
import { orgs } from '@/db/schema';

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
  admin_email: z.string().email('Invalid email address'),
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
