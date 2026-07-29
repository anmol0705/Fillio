'use server';

import { z } from 'zod';
import { db } from '@/db';
import { recurring_templates } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth/getUser';
import type { RecurringTemplate } from '@/types';

// ---------------------------------------------------------------------------
// Internal auth helpers — never throw; callers check for error key
// ---------------------------------------------------------------------------

type ProfileCtx = {
  id: string;
  org_id: string;
  is_org_admin: boolean;
};

async function resolveProfile(): Promise<ProfileCtx | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  const profile = await db.query.profiles.findFirst({
    where: (p, { eq }) => eq(p.id, user.id),
    columns: { id: true, org_id: true, is_org_admin: true },
  });

  if (!profile) return { error: 'Profile not found' };
  return profile;
}

function isErr(v: unknown): v is { error: string } {
  return typeof v === 'object' && v !== null && 'error' in v;
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const templateSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500),
  task_type: z.enum([
    'gst',
    'tds',
    'income_tax',
    'audit',
    'roc_mca',
    'accounting',
    'payroll',
    'notice',
    'advisory',
    'other',
  ]),
  cadence: z.enum(['monthly', 'quarterly', 'half_yearly', 'annually']),
  default_priority: z
    .enum(['urgent', 'high', 'medium', 'low'])
    .default('medium'),
  default_assignee_role_id: z.string().uuid().nullable().optional(),
  default_client_id: z.string().uuid().nullable().optional(),
  days_before_due: z
    .number()
    .int()
    .min(1)
    .max(365)
    .default(7),
});

type TemplateInput = z.infer<typeof templateSchema>;

// ---------------------------------------------------------------------------
// Server actions
// ---------------------------------------------------------------------------

export async function getTemplates(): Promise<
  { data: RecurringTemplate[] } | { error: string }
> {
  const ctx = await resolveProfile();
  if (isErr(ctx)) return ctx;

  try {
    const rows = await db
      .select()
      .from(recurring_templates)
      .where(
        and(
          eq(recurring_templates.org_id, ctx.org_id),
          eq(recurring_templates.is_active, true),
        ),
      );
    return { data: rows };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch templates';
    return { error: msg };
  }
}

export async function createTemplate(
  input: TemplateInput,
): Promise<{ data: RecurringTemplate } | { error: string }> {
  const ctx = await resolveProfile();
  if (isErr(ctx)) return ctx;
  if (!ctx.is_org_admin) return { error: 'Forbidden: org admin only' };

  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Validation error' };
  }

  try {
    const [template] = await db
      .insert(recurring_templates)
      .values({ ...parsed.data, org_id: ctx.org_id })
      .returning();
    return { data: template };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to create template';
    return { error: msg };
  }
}

export async function updateTemplate(
  id: string,
  input: Partial<TemplateInput>,
): Promise<{ data: RecurringTemplate } | { error: string }> {
  const ctx = await resolveProfile();
  if (isErr(ctx)) return ctx;
  if (!ctx.is_org_admin) return { error: 'Forbidden: org admin only' };

  if (!z.string().uuid().safeParse(id).success) return { error: 'Invalid template ID' };

  const parsed = templateSchema.partial().safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Validation error' };
  }

  try {
    const [template] = await db
      .update(recurring_templates)
      .set({ ...parsed.data, updated_at: new Date() })
      .where(
        and(
          eq(recurring_templates.id, id),
          eq(recurring_templates.org_id, ctx.org_id),
        ),
      )
      .returning();

    if (!template) return { error: 'Template not found' };
    return { data: template };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to update template';
    return { error: msg };
  }
}

export async function deleteTemplate(
  id: string,
): Promise<{ data: true } | { error: string }> {
  const ctx = await resolveProfile();
  if (isErr(ctx)) return ctx;
  if (!ctx.is_org_admin) return { error: 'Forbidden: org admin only' };

  if (!z.string().uuid().safeParse(id).success) return { error: 'Invalid template ID' };

  try {
    const [row] = await db
      .update(recurring_templates)
      .set({ is_active: false, updated_at: new Date() })
      .where(
        and(
          eq(recurring_templates.id, id),
          eq(recurring_templates.org_id, ctx.org_id),
        ),
      )
      .returning({ id: recurring_templates.id });

    if (!row) return { error: 'Template not found' };
    return { data: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to delete template';
    return { error: msg };
  }
}

// generateTasksFromTemplates lives in src/lib/cron/recurring.ts (not a server action)
// so it cannot be invoked as an RPC endpoint by authenticated users.
