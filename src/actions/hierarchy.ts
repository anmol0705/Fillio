'use server';
import 'server-only';

import { z } from 'zod';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/db';
import { reporting_relationships, profiles } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth/getUser';
import type { Profile, Role, ReportingRelationship } from '@/types';

// ---------------------------------------------------------------------------
// Admin guard — same ok/error discriminant pattern as users/roles
// ---------------------------------------------------------------------------

type AdminResult = { ok: false; error: string } | { ok: true; admin: Profile };

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
// ReportingStructure shape — both the list view and graph view consume this
// ---------------------------------------------------------------------------

export type ReportingStructure = {
  profiles: Profile[];
  roles: Role[];
  relationships: Pick<ReportingRelationship, 'manager_id' | 'report_id'>[];
};

// ---------------------------------------------------------------------------
// getReportingStructure
// Returns all active profiles + all roles + all relationships in the org.
// Single fetch, two views (list + graph) both derived from this data client-side.
// ---------------------------------------------------------------------------

export async function getReportingStructure(): Promise<{ error: string; data: null } | { error: null; data: ReportingStructure }> {
  const result = await requireAdmin();
  if (!result.ok) return { error: result.error, data: null };

  const orgId = result.admin.org_id;

  // Fetch profiles and roles in parallel
  const [allProfiles, allRoles] = await Promise.all([
    db.query.profiles.findMany({
      where: (p, { and, eq }) => and(eq(p.org_id, orgId), eq(p.is_active, true)),
      orderBy: (p, { asc }) => [asc(p.full_name)],
    }),
    db.query.roles.findMany({
      where: (r, { eq }) => eq(r.org_id, orgId),
    }),
  ]);

  const profileIds = allProfiles.map((p) => p.id);

  // Relationships don't have org_id — scope them via the profile IDs we just fetched
  const allRelationships =
    profileIds.length > 0
      ? await db
          .select({ manager_id: reporting_relationships.manager_id, report_id: reporting_relationships.report_id })
          .from(reporting_relationships)
          .where(inArray(reporting_relationships.manager_id, profileIds))
      : [];

  return {
    error: null,
    data: {
      profiles: allProfiles as Profile[],
      roles: allRoles as Role[],
      relationships: allRelationships,
    },
  };
}

// ---------------------------------------------------------------------------
// addReporting — person A reports to person B
//
// Guards (in order):
//   1. Both IDs are valid UUIDs
//   2. A !== B (can't report to yourself)
//   3. Both profiles belong to the admin's org
//   4. Circular check — would adding this create a cycle?
//      (PostgreSQL recursive CTE traverses A's current subtree; if B is found, reject)
//   5. INSERT ... ON CONFLICT DO NOTHING — idempotent, no error if already exists
// ---------------------------------------------------------------------------

const AddSchema = z.object({
  reportId:  z.string().uuid('Invalid profile ID'),
  managerId: z.string().uuid('Invalid profile ID'),
});

export async function addReporting(
  raw: unknown
): Promise<{ error: string } | { data: 'ok' }> {
  const result = await requireAdmin();
  if (!result.ok) return { error: result.error };

  const parsed = AddSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const { reportId, managerId } = parsed.data;

  if (reportId === managerId) return { error: 'A person cannot report to themselves' };

  // Verify both profiles are in this org
  const orgProfiles = await db.query.profiles.findMany({
    where: (p, { and, eq, inArray }) =>
      and(eq(p.org_id, result.admin.org_id), inArray(p.id, [reportId, managerId])),
    columns: { id: true },
  });

  if (orgProfiles.length < 2) {
    return { error: 'One or both users do not belong to your organisation' };
  }

  // Circular check: get everyone reportId currently manages (at any depth).
  // If managerId appears in that set, adding this edge creates a cycle.
  //
  // Example: Partner → Manager (Manager reports to Partner).
  // If we try to add Partner reports to Manager, the CTE from Manager's
  // subtree would include Partner → cycle detected.
  const circularRows = await db.execute(sql`
    WITH RECURSIVE subtree AS (
      SELECT report_id AS id, 1 AS depth
      FROM reporting_relationships
      WHERE manager_id = ${reportId}

      UNION ALL

      SELECT rr.report_id, s.depth + 1
      FROM reporting_relationships rr
      JOIN subtree s ON rr.manager_id = s.id
      WHERE s.depth < 20
    )
    SELECT id FROM subtree WHERE id = ${managerId}
    LIMIT 1
  `);

  if (circularRows.length > 0) {
    return { error: 'This would create a circular reporting loop' };
  }

  // Insert — the PRIMARY KEY (manager_id, report_id) handles duplicates
  await db
    .insert(reporting_relationships)
    .values({ manager_id: managerId, report_id: reportId })
    .onConflictDoNothing();

  return { data: 'ok' };
}

// ---------------------------------------------------------------------------
// removeReporting — delete one relationship
// ---------------------------------------------------------------------------

const RemoveSchema = z.object({
  reportId:  z.string().uuid(),
  managerId: z.string().uuid(),
});

export async function removeReporting(
  raw: unknown
): Promise<{ error: string } | { data: 'ok' }> {
  const result = await requireAdmin();
  if (!result.ok) return { error: result.error };

  const parsed = RemoveSchema.safeParse(raw);
  if (!parsed.success) return { error: 'Invalid input' };

  const { reportId, managerId } = parsed.data;

  // Verify the manager belongs to this org before deleting
  const managerProfile = await db.query.profiles.findFirst({
    where: (p, { and, eq }) =>
      and(eq(p.org_id, result.admin.org_id), eq(p.id, managerId)),
    columns: { id: true },
  });

  if (!managerProfile) return { error: 'User not found in your organisation' };

  await db
    .delete(reporting_relationships)
    .where(
      and(
        eq(reporting_relationships.manager_id, managerId),
        eq(reporting_relationships.report_id, reportId),
      )
    );

  return { data: 'ok' };
}

// ---------------------------------------------------------------------------
// getSubtree — everyone who reports to managerId, directly or indirectly
//
// Used later in task assignment: a manager can only assign tasks to people
// in their subtree. Returns an array of profile IDs.
//
// Security: verifies managerId belongs to the caller's org before querying —
// without this, any authenticated user could enumerate profile IDs from
// another tenant by passing an arbitrary managerId.
//
// Safety: depth < 20 cap prevents infinite recursion if a loop was ever
// introduced by a seed script or direct DB edit that bypassed addReporting.
// ---------------------------------------------------------------------------

export async function getSubtree(managerId: string): Promise<string[]> {
  if (!z.string().uuid().safeParse(managerId).success) return [];

  const user = await getCurrentUser();
  if (!user) return [];

  const [callerProfile, managerProfile] = await Promise.all([
    db.query.profiles.findFirst({
      where: (p, { eq }) => eq(p.id, user.id),
      columns: { org_id: true },
    }),
    db.query.profiles.findFirst({
      where: (p, { eq }) => eq(p.id, managerId),
      columns: { org_id: true },
    }),
  ]);

  if (!callerProfile || !managerProfile) return [];
  if (callerProfile.org_id !== managerProfile.org_id) return [];

  const rows = await db.execute(sql`
    WITH RECURSIVE subtree AS (
      SELECT report_id AS id, 1 AS depth
      FROM reporting_relationships
      WHERE manager_id = ${managerId}

      UNION ALL

      SELECT rr.report_id, s.depth + 1
      FROM reporting_relationships rr
      JOIN subtree s ON rr.manager_id = s.id
      WHERE s.depth < 20
    )
    SELECT id FROM subtree
  `);

  return rows.map((r) => r.id as string);
}
