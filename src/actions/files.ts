'use server';
import 'server-only';

import { and, eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { createAdminClient } from '@/lib/supabase/server';
import { task_files, profiles } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth/getUser';
import type { TaskFileWithUploader } from '@/types';

const BUCKET = 'task-files';
const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

// ---------------------------------------------------------------------------
// Shared — get current user + profile, verify they are a task member
// ---------------------------------------------------------------------------

async function requireTaskMember(taskId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: 'Not authenticated' };

  const uuidCheck = z.string().uuid().safeParse(taskId);
  if (!uuidCheck.success) return { ok: false as const, error: 'Invalid task ID' };

  const profile = await db.query.profiles.findFirst({
    where: (p, { eq }) => eq(p.id, user.id),
    columns: { id: true, org_id: true, full_name: true },
  });
  if (!profile) return { ok: false as const, error: 'Profile not found' };

  // Check task_access — user must have any level of access
  const access = await db.query.task_access.findFirst({
    where: (a, { and: qAnd, eq: qEq }) =>
      qAnd(qEq(a.task_id, taskId), qEq(a.user_id, user.id)),
    columns: { level: true },
  });

  // Also allow if task is open pool and user is in the same org
  if (!access) {
    const task = await db.query.tasks.findFirst({
      where: (t, { and: qAnd, eq: qEq }) =>
        qAnd(qEq(t.id, taskId), qEq(t.org_id, profile.org_id), qEq(t.is_active, true)),
      columns: { is_open_pool: true },
    });
    if (!task?.is_open_pool) return { ok: false as const, error: 'No access to this task' };
  }

  return { ok: true as const, user, profile, accessLevel: access?.level ?? null };
}

// ---------------------------------------------------------------------------
// getTaskFiles — list all active files on a task
// ---------------------------------------------------------------------------

export async function getTaskFiles(taskId: string): Promise<
  { error: string; data: null } | { error: null; data: TaskFileWithUploader[] }
> {
  const guard = await requireTaskMember(taskId);
  if (!guard.ok) return { error: guard.error, data: null };

  const rows = await db
    .select({
      id:           task_files.id,
      task_id:      task_files.task_id,
      org_id:       task_files.org_id,
      uploaded_by:  task_files.uploaded_by,
      file_name:    task_files.file_name,
      file_size:    task_files.file_size,
      mime_type:    task_files.mime_type,
      storage_path: task_files.storage_path,
      is_active:    task_files.is_active,
      created_at:   task_files.created_at,
      uploader_id:  profiles.id,
      uploader_name: profiles.full_name,
    })
    .from(task_files)
    .innerJoin(profiles, eq(task_files.uploaded_by, profiles.id))
    .where(
      and(
        eq(task_files.task_id, taskId),
        eq(task_files.org_id, guard.profile.org_id),
        eq(task_files.is_active, true),
      ),
    )
    .orderBy(desc(task_files.created_at));

  const data: TaskFileWithUploader[] = rows.map((r) => ({
    id:           r.id,
    task_id:      r.task_id,
    org_id:       r.org_id,
    uploaded_by:  r.uploaded_by,
    file_name:    r.file_name,
    file_size:    r.file_size,
    mime_type:    r.mime_type,
    storage_path: r.storage_path,
    is_active:    r.is_active,
    created_at:   r.created_at,
    uploader:     { id: r.uploader_id, full_name: r.uploader_name },
  }));

  return { error: null, data };
}

// ---------------------------------------------------------------------------
// uploadFile — upload bytes to storage, insert metadata row
// ---------------------------------------------------------------------------

export async function uploadFile(
  taskId: string,
  formData: FormData,
): Promise<{ error: string; data: null } | { error: null; data: TaskFileWithUploader }> {
  const guard = await requireTaskMember(taskId);
  if (!guard.ok) return { error: guard.error, data: null };

  const file = formData.get('file');
  if (!(file instanceof File)) return { error: 'No file provided', data: null };

  // Validate size
  if (file.size > MAX_SIZE) return { error: 'File exceeds 20 MB limit', data: null };
  if (file.size === 0) return { error: 'File is empty', data: null };

  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { error: 'File type not allowed. Accepted: PDF, Excel, Word, CSV, images', data: null };
  }

  // Sanitise filename — remove non-ASCII and dangerous chars
  const safeName = file.name
    .replace(/[^a-zA-Z0-9._\-\s]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 200);

  const uniqueId    = crypto.randomUUID();
  const storagePath = `${guard.profile.org_id}/${taskId}/${uniqueId}-${safeName}`;

  const admin = createAdminClient();

  // Upload bytes to Supabase Storage
  const bytes = await file.arrayBuffer();
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, bytes, {
      contentType:  file.type,
      cacheControl: '3600',
      upsert:       false,
    });

  if (uploadError) {
    return { error: `Upload failed: ${uploadError.message}`, data: null };
  }

  // Insert metadata row
  const [row] = await db
    .insert(task_files)
    .values({
      task_id:      taskId,
      org_id:       guard.profile.org_id,
      uploaded_by:  guard.profile.id,
      file_name:    file.name,
      file_size:    file.size,
      mime_type:    file.type,
      storage_path: storagePath,
    })
    .returning();

  if (!row) {
    // Metadata insert failed — clean up the orphaned file
    await admin.storage.from(BUCKET).remove([storagePath]);
    return { error: 'Failed to save file metadata', data: null };
  }

  return {
    error: null,
    data:  {
      ...row,
      uploader: { id: guard.profile.id, full_name: guard.profile.full_name },
    },
  };
}

// ---------------------------------------------------------------------------
// getSignedUrl — generate a 1-hour signed download URL
// ---------------------------------------------------------------------------

export async function getSignedUrl(fileId: string): Promise<
  { error: string; data: null } | { error: null; data: { url: string; file_name: string } }
> {
  const uuidCheck = z.string().uuid().safeParse(fileId);
  if (!uuidCheck.success) return { error: 'Invalid file ID', data: null };

  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated', data: null };

  const profile = await db.query.profiles.findFirst({
    where: (p, { eq }) => eq(p.id, user.id),
    columns: { org_id: true },
  });
  if (!profile) return { error: 'Profile not found', data: null };

  // Fetch the file row, verify org membership
  const fileRow = await db.query.task_files.findFirst({
    where: (f, { and: qAnd, eq: qEq }) =>
      qAnd(qEq(f.id, fileId), qEq(f.org_id, profile.org_id), qEq(f.is_active, true)),
  });
  if (!fileRow) return { error: 'File not found', data: null };

  // Verify user has access to the task this file belongs to
  const access = await db.query.task_access.findFirst({
    where: (a, { and: qAnd, eq: qEq }) =>
      qAnd(qEq(a.task_id, fileRow.task_id), qEq(a.user_id, user.id)),
    columns: { level: true },
  });

  if (!access) {
    // Allow if task is open pool
    const task = await db.query.tasks.findFirst({
      where: (t, { eq: qEq }) => qEq(t.id, fileRow.task_id),
      columns: { is_open_pool: true },
    });
    if (!task?.is_open_pool) return { error: 'No access to this file', data: null };
  }

  const admin = createAdminClient();
  const { data: signedData, error: signError } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(fileRow.storage_path, 3600); // 1 hour

  if (signError || !signedData) {
    return { error: 'Failed to generate download link', data: null };
  }

  return { error: null, data: { url: signedData.signedUrl, file_name: fileRow.file_name } };
}

// ---------------------------------------------------------------------------
// deleteFile — soft delete metadata + remove bytes from storage
// ---------------------------------------------------------------------------

export async function deleteFile(fileId: string): Promise<
  { error: string } | { error: null }
> {
  const uuidCheck = z.string().uuid().safeParse(fileId);
  if (!uuidCheck.success) return { error: 'Invalid file ID' };

  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  const profile = await db.query.profiles.findFirst({
    where: (p, { eq }) => eq(p.id, user.id),
    columns: { org_id: true },
  });
  if (!profile) return { error: 'Profile not found' };

  const fileRow = await db.query.task_files.findFirst({
    where: (f, { and: qAnd, eq: qEq }) =>
      qAnd(qEq(f.id, fileId), qEq(f.org_id, profile.org_id), qEq(f.is_active, true)),
  });
  if (!fileRow) return { error: 'File not found' };

  // Only uploader or task owner can delete
  const isUploader = fileRow.uploaded_by === user.id;
  const isOwner = await db.query.task_access.findFirst({
    where: (a, { and: qAnd, eq: qEq }) =>
      qAnd(qEq(a.task_id, fileRow.task_id), qEq(a.user_id, user.id), qEq(a.level, 'owner')),
    columns: { level: true },
  });

  if (!isUploader && !isOwner) return { error: 'Only the uploader or task owner can delete files' };

  const admin = createAdminClient();

  // Soft-delete metadata first — if storage removal fails, the row is already
  // deactivated so no signed URLs can be issued for the missing bytes.
  await db
    .update(task_files)
    .set({ is_active: false })
    .where(and(eq(task_files.id, fileId), eq(task_files.org_id, profile.org_id)));

  // Best-effort storage removal — orphaned bytes are a cleanup concern,
  // not a data integrity breach (metadata is already deactivated above).
  await admin.storage.from(BUCKET).remove([fileRow.storage_path]);

  return { error: null };
}
