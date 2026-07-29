'use server';

import { z } from 'zod';
import { db } from '@/db';
import { clients } from '@/db/schema';
import { eq, and, ilike, or } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth/getUser';
import type { Client } from '@/types';

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

const clientSchema = z.object({
  name: z.string().min(1).max(200),
  pan: z
    .string()
    .max(10)
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'PAN must be in format AAAAA9999A')
    .nullable()
    .optional(),
  gstin: z
    .string()
    .max(15)
    .regex(
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
      'GSTIN must be 15 characters in valid format',
    )
    .nullable()
    .optional(),
  contact_email: z.string().email().nullable().optional(),
  contact_phone: z
    .string()
    .max(15)
    .regex(/^[0-9+\- ]{7,15}$/, 'Invalid phone number')
    .nullable()
    .optional(),
});

type ClientInput = z.infer<typeof clientSchema>;
type PartialClientInput = Partial<ClientInput>;

/** Normalise empty strings to null so the DB receives clean nullable values. */
function normalizeClientInput(data: ClientInput): ClientInput {
  return {
    ...data,
    pan: data.pan || null,
    gstin: data.gstin || null,
    contact_email: data.contact_email || null,
    contact_phone: data.contact_phone || null,
  };
}

/** Partial variant of the normalizer for update operations. */
function normalizePartialClientInput(data: PartialClientInput): PartialClientInput {
  return {
    ...data,
    ...(Object.prototype.hasOwnProperty.call(data, 'pan') ? { pan: data.pan || null } : {}),
    ...(Object.prototype.hasOwnProperty.call(data, 'gstin') ? { gstin: data.gstin || null } : {}),
    ...(Object.prototype.hasOwnProperty.call(data, 'contact_email')
      ? { contact_email: data.contact_email || null }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(data, 'contact_phone')
      ? { contact_phone: data.contact_phone || null }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * List all active clients in the caller's org.
 * All authenticated users can read clients (needed for task creation).
 */
export async function getClients(): Promise<{ data: Client[] } | { error: string }> {
  const ctx = await resolveUser();
  if (isErrorResult(ctx)) return ctx;

  try {
    const data = await db
      .select()
      .from(clients)
      .where(and(eq(clients.org_id, ctx.orgId), eq(clients.is_active, true)));

    return { data };
  } catch (err) {
    console.error('[getClients]', err);
    return { error: 'Failed to fetch clients' };
  }
}

/**
 * Fetch a single client by ID. Returns null when not found.
 * Tenant-isolated: org_id must match the caller's org.
 */
export async function getClientById(
  id: string,
): Promise<{ data: Client | null } | { error: string }> {
  const ctx = await resolveUser();
  if (isErrorResult(ctx)) return ctx;

  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { error: 'Invalid client id' };

  try {
    const client = await db.query.clients.findFirst({
      where: (c, { and, eq }) =>
        and(eq(c.id, id), eq(c.org_id, ctx.orgId), eq(c.is_active, true)),
    });
    return { data: client ?? null };
  } catch (err) {
    console.error('[getClientById]', err);
    return { error: 'Failed to fetch client' };
  }
}

/**
 * Search clients by name, PAN, or GSTIN. Case-insensitive.
 * Returns active clients only.
 */
export async function searchClients(
  query: string,
): Promise<{ data: Client[] } | { error: string }> {
  const ctx = await resolveUser();
  if (isErrorResult(ctx)) return ctx;

  const q = query.trim();
  if (q.length < 1) return getClients();

  try {
    const data = await db
      .select()
      .from(clients)
      .where(
        and(
          eq(clients.org_id, ctx.orgId),
          eq(clients.is_active, true),
          or(
            ilike(clients.name, `%${q}%`),
            ilike(clients.pan, `%${q}%`),
            ilike(clients.gstin, `%${q}%`),
          ),
        ),
      );
    return { data };
  } catch (err) {
    console.error('[searchClients]', err);
    return { error: 'Failed to search clients' };
  }
}

/**
 * Create a new client. Org admin only.
 * PAN and GSTIN uniqueness is enforced within the org.
 */
export async function createClient(
  input: z.infer<typeof clientSchema>,
): Promise<{ data: Client } | { error: string }> {
  const ctx = await resolveOrgAdmin();
  if (isErrorResult(ctx)) return ctx;

  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.message };
  }

  const data = normalizeClientInput(parsed.data);

  // Uniqueness guards within org
  if (data.pan) {
    const existing = await db.query.clients.findFirst({
      where: (c, { and, eq }) =>
        and(eq(c.org_id, ctx.orgId), eq(c.pan, data.pan!), eq(c.is_active, true)),
      columns: { id: true },
    });
    if (existing) return { error: `A client with PAN ${data.pan} already exists` };
  }

  if (data.gstin) {
    const existing = await db.query.clients.findFirst({
      where: (c, { and, eq }) =>
        and(eq(c.org_id, ctx.orgId), eq(c.gstin, data.gstin!), eq(c.is_active, true)),
      columns: { id: true },
    });
    if (existing) return { error: `A client with GSTIN ${data.gstin} already exists` };
  }

  try {
    const [client] = await db
      .insert(clients)
      .values({ ...data, org_id: ctx.orgId })
      .returning();

    return { data: client };
  } catch (err) {
    console.error('[createClient]', err);
    return { error: 'Failed to create client' };
  }
}

/**
 * Update an existing client. Org admin only.
 * Partial update — only supplied fields are changed.
 */
export async function updateClient(
  id: string,
  input: Partial<z.infer<typeof clientSchema>>,
): Promise<{ data: Client } | { error: string }> {
  const ctx = await resolveOrgAdmin();
  if (isErrorResult(ctx)) return ctx;

  const idParsed = z.string().uuid().safeParse(id);
  if (!idParsed.success) return { error: 'Invalid client id' };

  const parsed = clientSchema.partial().safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.message };
  }

  const updates = normalizePartialClientInput(parsed.data);

  // Uniqueness guards for fields being updated
  if (updates.pan) {
    const existing = await db.query.clients.findFirst({
      where: (c, { and, eq, ne }) =>
        and(
          eq(c.org_id, ctx.orgId),
          eq(c.pan, updates.pan!),
          eq(c.is_active, true),
          ne(c.id, id),
        ),
      columns: { id: true },
    });
    if (existing) return { error: `A client with PAN ${updates.pan} already exists` };
  }

  if (updates.gstin) {
    const existing = await db.query.clients.findFirst({
      where: (c, { and, eq, ne }) =>
        and(
          eq(c.org_id, ctx.orgId),
          eq(c.gstin, updates.gstin!),
          eq(c.is_active, true),
          ne(c.id, id),
        ),
      columns: { id: true },
    });
    if (existing) return { error: `A client with GSTIN ${updates.gstin} already exists` };
  }

  try {
    const [client] = await db
      .update(clients)
      .set({ ...updates, updated_at: new Date() })
      .where(and(eq(clients.id, id), eq(clients.org_id, ctx.orgId)))
      .returning();

    if (!client) return { error: 'Client not found' };
    return { data: client };
  } catch (err) {
    console.error('[updateClient]', err);
    return { error: 'Failed to update client' };
  }
}

/**
 * Soft-delete a client (is_active = false). Org admin only.
 * Per CLAUDE.md rule 9: hard deletes are forbidden.
 * Tasks linked to this client remain intact for historical record.
 */
export async function deactivateClient(
  id: string,
): Promise<{ data: true } | { error: string }> {
  const ctx = await resolveOrgAdmin();
  if (isErrorResult(ctx)) return ctx;

  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { error: 'Invalid client id' };

  try {
    const [client] = await db
      .update(clients)
      .set({ is_active: false, updated_at: new Date() })
      .where(and(eq(clients.id, id), eq(clients.org_id, ctx.orgId)))
      .returning({ id: clients.id });

    if (!client) return { error: 'Client not found' };
    return { data: true };
  } catch (err) {
    console.error('[deactivateClient]', err);
    return { error: 'Failed to deactivate client' };
  }
}
