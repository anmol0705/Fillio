'use server';
import 'server-only';

import { z } from 'zod';
import { and, eq, ilike, or } from 'drizzle-orm';

import { db } from '@/db';
import { clients } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth/getUser';
import type { Client, Profile } from '@/types';

// ---------------------------------------------------------------------------
// Org member guard
// Clients are accessible to all active org members, not just admins.
// Any team member needs to view and manage clients when creating tasks.
// ---------------------------------------------------------------------------

type MemberResult = { ok: false; error: string } | { ok: true; profile: Profile };

async function requireOrgMember(): Promise<MemberResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const profile = await db.query.profiles.findFirst({
    where: (p, { eq }) => eq(p.id, user.id),
  });

  if (!profile?.is_active) return { ok: false, error: 'Account is inactive' };
  return { ok: true, profile: profile as Profile };
}

// ---------------------------------------------------------------------------
// getClients — all active clients in the org, optionally filtered by name
// ---------------------------------------------------------------------------

export async function getClients(search?: string): Promise<
  { error: string; data: null } | { error: null; data: Client[] }
> {
  const result = await requireOrgMember();
  if (!result.ok) return { error: result.error, data: null };

  const rows = await db.query.clients.findMany({
    where: (c, { and, eq, or, ilike }) => {
      const orgFilter = and(eq(c.org_id, result.profile.org_id), eq(c.is_active, true));
      if (!search?.trim()) return orgFilter;
      // Search across name, PAN, and GSTIN
      const term = `%${search.trim()}%`;
      return and(orgFilter, or(ilike(c.name, term), ilike(c.pan, term), ilike(c.gstin, term)));
    },
    orderBy: (c, { asc }) => [asc(c.name)],
  });

  return { error: null, data: rows as Client[] };
}

// ---------------------------------------------------------------------------
// createClient
// ---------------------------------------------------------------------------

const ClientSchema = z.object({
  name:          z.string().min(1, 'Client name is required').max(200),
  pan:           z.string().max(10).nullable().optional(),
  gstin:         z.string().max(15).nullable().optional(),
  contact_email: z.string().email('Invalid email').nullable().optional(),
  contact_phone: z.string().max(20).nullable().optional(),
});

export async function createClient(
  raw: unknown
): Promise<{ error: string } | { data: Client }> {
  const result = await requireOrgMember();
  if (!result.ok) return { error: result.error };

  const parsed = ClientSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const { name, pan, gstin, contact_email, contact_phone } = parsed.data;

  // Reject duplicate name within the same org (case-insensitive)
  const existing = await db.query.clients.findFirst({
    where: (c, { and, eq, ilike }) =>
      and(eq(c.org_id, result.profile.org_id), eq(c.is_active, true), ilike(c.name, name)),
  });
  if (existing) return { error: `A client named "${name}" already exists` };

  const [created] = await db
    .insert(clients)
    .values({
      org_id:        result.profile.org_id,
      name:          name.trim(),
      pan:           pan?.trim().toUpperCase() ?? null,
      gstin:         gstin?.trim().toUpperCase() ?? null,
      contact_email: contact_email?.trim() ?? null,
      contact_phone: contact_phone?.trim() ?? null,
    })
    .returning();

  return { data: created as Client };
}

// ---------------------------------------------------------------------------
// updateClient
// ---------------------------------------------------------------------------

const UpdateClientSchema = z.object({
  clientId:      z.string().uuid(),
  name:          z.string().min(1).max(200).optional(),
  pan:           z.string().max(10).nullable().optional(),
  gstin:         z.string().max(15).nullable().optional(),
  contact_email: z.string().email('Invalid email').nullable().optional(),
  contact_phone: z.string().max(20).nullable().optional(),
});

export async function updateClient(
  raw: unknown
): Promise<{ error: string } | { data: Client }> {
  const result = await requireOrgMember();
  if (!result.ok) return { error: result.error };

  const parsed = UpdateClientSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const { clientId, name, pan, gstin, contact_email, contact_phone } = parsed.data;

  const updates: Partial<typeof clients.$inferInsert> = { updated_at: new Date() };
  if (name !== undefined)          updates.name          = name.trim();
  if (pan !== undefined)           updates.pan           = pan?.trim().toUpperCase() ?? null;
  if (gstin !== undefined)         updates.gstin         = gstin?.trim().toUpperCase() ?? null;
  if (contact_email !== undefined) updates.contact_email = contact_email?.trim() ?? null;
  if (contact_phone !== undefined) updates.contact_phone = contact_phone?.trim() ?? null;

  const [updated] = await db
    .update(clients)
    .set(updates)
    .where(and(eq(clients.id, clientId), eq(clients.org_id, result.profile.org_id)))
    .returning();

  if (!updated) return { error: 'Client not found' };
  return { data: updated as Client };
}

// ---------------------------------------------------------------------------
// deactivateClient — soft delete (is_active = false), never hard delete
// ---------------------------------------------------------------------------

export async function deactivateClient(
  clientId: string
): Promise<{ error: string } | { data: 'ok' }> {
  const result = await requireOrgMember();
  if (!result.ok) return { error: result.error };

  if (!z.string().uuid().safeParse(clientId).success) {
    return { error: 'Invalid client ID' };
  }

  await db
    .update(clients)
    .set({ is_active: false, updated_at: new Date() })
    .where(and(eq(clients.id, clientId), eq(clients.org_id, result.profile.org_id)));

  return { data: 'ok' };
}
