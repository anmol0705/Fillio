'use server';
import 'server-only';

import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { recurring_templates } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth/getUser';
import type { RecurringTemplate } from '@/types';

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const templateSchema = z.object({
  title:                    z.string().min(2).max(200).trim(),
  task_type:                z.enum(['gst','tds','income_tax','audit','roc_mca','accounting','payroll','notice','advisory','other']),
  cadence:                  z.enum(['monthly','quarterly','half_yearly','annually']),
  priority:                 z.enum(['urgent','high','medium','low']).default('medium'),
  default_assignee_role_id: z.string().uuid().nullable().optional(),
  default_client_id:        z.string().uuid().nullable().optional(),
  due_in_days:              z.number().int().min(1).max(365),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAdminProfile() {
  const user = await getCurrentUser();
  if (!user) return null;
  const profile = await db.query.profiles.findFirst({
    where: (p, { eq }) => eq(p.id, user.id),
    columns: { org_id: true, is_org_admin: true },
  });
  if (!profile?.is_org_admin) return null;
  return { userId: user.id, orgId: profile.org_id };
}

// ---------------------------------------------------------------------------
// getRecurringTemplates
// ---------------------------------------------------------------------------

export async function getRecurringTemplates(): Promise<
  { error: string; data: null } | { error: null; data: RecurringTemplate[] }
> {
  const admin = await getAdminProfile();
  if (!admin) return { error: 'Unauthorised', data: null };

  const rows = await db.query.recurring_templates.findMany({
    where: (t, { eq }) => eq(t.org_id, admin.orgId),
    orderBy: (t, { desc }) => [desc(t.created_at)],
  });

  return { error: null, data: rows };
}

// ---------------------------------------------------------------------------
// createRecurringTemplate
// ---------------------------------------------------------------------------

export async function createRecurringTemplate(
  input: z.infer<typeof templateSchema>,
): Promise<{ error: string; data: null } | { error: null; data: RecurringTemplate }> {
  const admin = await getAdminProfile();
  if (!admin) return { error: 'Unauthorised', data: null };

  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message, data: null };

  const [row] = await db
    .insert(recurring_templates)
    .values({
      org_id:                   admin.orgId,
      title:                    parsed.data.title,
      task_type:                parsed.data.task_type,
      cadence:                  parsed.data.cadence,
      priority:                 parsed.data.priority,
      default_assignee_role_id: parsed.data.default_assignee_role_id ?? null,
      default_client_id:        parsed.data.default_client_id ?? null,
      due_in_days:              parsed.data.due_in_days,
      is_active:                true,
      created_by:               admin.userId,
    })
    .returning();

  return { error: null, data: row };
}

// ---------------------------------------------------------------------------
// updateRecurringTemplate
// ---------------------------------------------------------------------------

export async function updateRecurringTemplate(
  id: string,
  input: z.infer<typeof templateSchema>,
): Promise<{ error: string; data: null } | { error: null; data: RecurringTemplate }> {
  const admin = await getAdminProfile();
  if (!admin) return { error: 'Unauthorised', data: null };

  const uuidResult = z.string().uuid().safeParse(id);
  if (!uuidResult.success) return { error: 'Invalid template ID', data: null };

  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message, data: null };

  const [row] = await db
    .update(recurring_templates)
    .set({
      title:                    parsed.data.title,
      task_type:                parsed.data.task_type,
      cadence:                  parsed.data.cadence,
      priority:                 parsed.data.priority,
      default_assignee_role_id: parsed.data.default_assignee_role_id ?? null,
      default_client_id:        parsed.data.default_client_id ?? null,
      due_in_days:              parsed.data.due_in_days,
      updated_at:               new Date(),
    })
    .where(
      and(
        eq(recurring_templates.id, id),
        eq(recurring_templates.org_id, admin.orgId),
      ),
    )
    .returning();

  if (!row) return { error: 'Template not found', data: null };
  return { error: null, data: row };
}

// ---------------------------------------------------------------------------
// toggleTemplateActive
// ---------------------------------------------------------------------------

export async function toggleTemplateActive(
  id: string,
  isActive: boolean,
): Promise<{ error: string } | { error: null }> {
  const admin = await getAdminProfile();
  if (!admin) return { error: 'Unauthorised' };

  const uuidResult = z.string().uuid().safeParse(id);
  if (!uuidResult.success) return { error: 'Invalid template ID' };

  await db
    .update(recurring_templates)
    .set({ is_active: isActive, updated_at: new Date() })
    .where(
      and(
        eq(recurring_templates.id, id),
        eq(recurring_templates.org_id, admin.orgId),
      ),
    );

  return { error: null };
}

// ---------------------------------------------------------------------------
// deleteRecurringTemplate — soft delete
// ---------------------------------------------------------------------------

export async function deleteRecurringTemplate(
  id: string,
): Promise<{ error: string } | { error: null }> {
  const admin = await getAdminProfile();
  if (!admin) return { error: 'Unauthorised' };

  const uuidResult = z.string().uuid().safeParse(id);
  if (!uuidResult.success) return { error: 'Invalid template ID' };

  // Hard delete is acceptable for templates — they carry no audit trail.
  // A deleted template simply stops spawning tasks; no historical harm.
  await db
    .delete(recurring_templates)
    .where(
      and(
        eq(recurring_templates.id, id),
        eq(recurring_templates.org_id, admin.orgId),
      ),
    );

  return { error: null };
}
