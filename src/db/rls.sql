-- =============================================================================
-- FILIO — Row Level Security
-- Run this entire file once in Supabase SQL Editor.
-- Re-running is safe — DROP POLICY IF EXISTS + CREATE handles idempotency.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- HELPER FUNCTIONS
-- These run as SECURITY DEFINER so they can read auth.users safely.
-- SET search_path = public prevents search-path hijacking attacks.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_my_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION is_org_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_org_admin FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

CREATE OR REPLACE FUNCTION is_task_member(task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM task_access
    WHERE task_access.task_id = $1
      AND task_access.user_id = auth.uid()
  );
$$;


-- =============================================================================
-- ENABLE RLS ON ALL TABLES
-- =============================================================================

ALTER TABLE orgs                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_access             ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_audit_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE reporting_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records      ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- ORGS
-- Any authenticated member can read their own org row.
-- Only service role (createAdminClient) can insert/update orgs.
-- =============================================================================

DROP POLICY IF EXISTS "orgs: member can read own org" ON orgs;
CREATE POLICY "orgs: member can read own org"
  ON orgs FOR SELECT
  USING (id = get_my_org_id());


-- =============================================================================
-- ROLES
-- Any org member can read roles (needed for dropdowns).
-- Only org admin can insert/update/delete.
-- =============================================================================

DROP POLICY IF EXISTS "roles: member can read own org roles" ON roles;
CREATE POLICY "roles: member can read own org roles"
  ON roles FOR SELECT
  USING (org_id = get_my_org_id());

DROP POLICY IF EXISTS "roles: admin can insert" ON roles;
CREATE POLICY "roles: admin can insert"
  ON roles FOR INSERT
  WITH CHECK (org_id = get_my_org_id() AND is_org_admin());

DROP POLICY IF EXISTS "roles: admin can update" ON roles;
CREATE POLICY "roles: admin can update"
  ON roles FOR UPDATE
  USING (org_id = get_my_org_id() AND is_org_admin());

DROP POLICY IF EXISTS "roles: admin can delete" ON roles;
CREATE POLICY "roles: admin can delete"
  ON roles FOR DELETE
  USING (org_id = get_my_org_id() AND is_org_admin());


-- =============================================================================
-- PROFILES
-- Members can read all profiles in their org (needed for assignee dropdowns).
-- Members can update their own profile only.
-- INSERT and privileged updates go through service role (createAdminClient).
-- =============================================================================

DROP POLICY IF EXISTS "profiles: member can read own org" ON profiles;
CREATE POLICY "profiles: member can read own org"
  ON profiles FOR SELECT
  USING (org_id = get_my_org_id());

DROP POLICY IF EXISTS "profiles: member can update own row" ON profiles;
CREATE POLICY "profiles: member can update own row"
  ON profiles FOR UPDATE
  USING (id = auth.uid() AND org_id = get_my_org_id())
  WITH CHECK (
    id = auth.uid()
    AND org_id = get_my_org_id()
    AND is_org_admin = (SELECT is_org_admin FROM profiles WHERE id = auth.uid())
    AND can_mark_attendance = (SELECT can_mark_attendance FROM profiles WHERE id = auth.uid())
  );


-- =============================================================================
-- CLIENTS
-- All org members can read and write clients (not admin-only).
-- =============================================================================

DROP POLICY IF EXISTS "clients: member can read" ON clients;
CREATE POLICY "clients: member can read"
  ON clients FOR SELECT
  USING (org_id = get_my_org_id());

DROP POLICY IF EXISTS "clients: member can insert" ON clients;
CREATE POLICY "clients: member can insert"
  ON clients FOR INSERT
  WITH CHECK (org_id = get_my_org_id());

DROP POLICY IF EXISTS "clients: member can update" ON clients;
CREATE POLICY "clients: member can update"
  ON clients FOR UPDATE
  USING (org_id = get_my_org_id());


-- =============================================================================
-- TASKS
-- A user can see a task if:
--   (a) they have a row in task_access for it, OR
--   (b) the task is marked is_open_pool = true (visible to whole org)
-- Both cases still require the task to belong to the user's org.
-- =============================================================================

DROP POLICY IF EXISTS "tasks: member can read accessible tasks" ON tasks;
CREATE POLICY "tasks: member can read accessible tasks"
  ON tasks FOR SELECT
  USING (
    org_id = get_my_org_id()
    AND is_active = true
    AND (
      is_open_pool = true
      OR is_task_member(id)
    )
  );

DROP POLICY IF EXISTS "tasks: member can insert" ON tasks;
CREATE POLICY "tasks: member can insert"
  ON tasks FOR INSERT
  WITH CHECK (org_id = get_my_org_id());

-- UPDATE allowed if user has any access (owner-level check is in app layer)
DROP POLICY IF EXISTS "tasks: member can update accessible tasks" ON tasks;
CREATE POLICY "tasks: member can update accessible tasks"
  ON tasks FOR UPDATE
  USING (
    org_id = get_my_org_id()
    AND (is_open_pool = true OR is_task_member(id))
  );


-- =============================================================================
-- TASK_ACCESS
-- Members can read access rows for tasks they themselves are on.
-- Inserts go through service role (createAdminClient) in server actions.
-- =============================================================================

DROP POLICY IF EXISTS "task_access: member can read own access rows" ON task_access;
CREATE POLICY "task_access: member can read own access rows"
  ON task_access FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_access.task_id
        AND t.org_id = get_my_org_id()
        AND (t.is_open_pool = true OR is_task_member(t.id))
    )
  );

-- task_access INSERT: must already be a member of the task (prevents self-granting via API)
DROP POLICY IF EXISTS "task_access: member can insert" ON task_access;
CREATE POLICY "task_access: member can insert"
  ON task_access FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_access.task_id
        AND t.org_id = get_my_org_id()
    )
    AND is_task_member(task_access.task_id)
  );

-- task_access UPDATE: must already be a member of the task
DROP POLICY IF EXISTS "task_access: member can upsert" ON task_access;
CREATE POLICY "task_access: member can upsert"
  ON task_access FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_access.task_id
        AND t.org_id = get_my_org_id()
    )
    AND is_task_member(task_access.task_id)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_access.task_id
        AND t.org_id = get_my_org_id()
    )
    AND is_task_member(task_access.task_id)
  );


-- =============================================================================
-- TASK_AUDIT_LOG
-- INSERT-only via server actions. Members can read logs for tasks they can see.
-- No UPDATE or DELETE policy — the table is immutable by design.
-- =============================================================================

DROP POLICY IF EXISTS "task_audit_log: member can read" ON task_audit_log;
CREATE POLICY "task_audit_log: member can read"
  ON task_audit_log FOR SELECT
  USING (
    org_id = get_my_org_id()
    AND (
      EXISTS (
        SELECT 1 FROM tasks t
        WHERE t.id = task_audit_log.task_id
          AND (t.is_open_pool = true OR is_task_member(t.id))
      )
    )
  );

-- task_audit_log: NO INSERT policy — inserts go through createAdminClient() only.
-- This table is immutable by design; direct user inserts are forbidden.
DROP POLICY IF EXISTS "task_audit_log: member can insert" ON task_audit_log;


-- =============================================================================
-- TASK_MESSAGES
-- Any user who can see the task can read and send messages.
-- =============================================================================

DROP POLICY IF EXISTS "task_messages: member can read" ON task_messages;
CREATE POLICY "task_messages: member can read"
  ON task_messages FOR SELECT
  USING (
    org_id = get_my_org_id()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_messages.task_id
        AND (t.is_open_pool = true OR is_task_member(t.id))
    )
  );

DROP POLICY IF EXISTS "task_messages: member can insert" ON task_messages;
CREATE POLICY "task_messages: member can insert"
  ON task_messages FOR INSERT
  WITH CHECK (
    org_id = get_my_org_id()
    AND sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_messages.task_id
        AND (t.is_open_pool = true OR is_task_member(t.id))
    )
  );


-- =============================================================================
-- REPORTING_RELATIONSHIPS
-- All org members can read the reporting structure.
-- Only admins can modify it.
-- =============================================================================

DROP POLICY IF EXISTS "reporting: member can read" ON reporting_relationships;
CREATE POLICY "reporting: member can read"
  ON reporting_relationships FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = reporting_relationships.manager_id
        AND p.org_id = get_my_org_id()
    )
  );

DROP POLICY IF EXISTS "reporting: admin can insert" ON reporting_relationships;
CREATE POLICY "reporting: admin can insert"
  ON reporting_relationships FOR INSERT
  WITH CHECK (
    is_org_admin()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = reporting_relationships.manager_id
        AND p.org_id = get_my_org_id()
    )
  );

DROP POLICY IF EXISTS "reporting: admin can delete" ON reporting_relationships;
CREATE POLICY "reporting: admin can delete"
  ON reporting_relationships FOR DELETE
  USING (
    is_org_admin()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = reporting_relationships.manager_id
        AND p.org_id = get_my_org_id()
    )
  );


-- =============================================================================
-- ATTENDANCE_RECORDS
-- Admins and attendance managers can read all records for their org.
-- Regular members can only read their own records.
-- Inserts/updates go through server actions which check permissions.
-- =============================================================================

DROP POLICY IF EXISTS "attendance: admin or manager can read all" ON attendance_records;
CREATE POLICY "attendance: admin or manager can read all"
  ON attendance_records FOR SELECT
  USING (
    org_id = get_my_org_id()
    AND (
      is_org_admin()
      OR (SELECT can_mark_attendance FROM profiles WHERE id = auth.uid())
      OR user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "attendance: admin or manager can insert" ON attendance_records;
CREATE POLICY "attendance: admin or manager can insert"
  ON attendance_records FOR INSERT
  WITH CHECK (
    org_id = get_my_org_id()
    AND (
      is_org_admin()
      OR (SELECT can_mark_attendance FROM profiles WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "attendance: admin or manager can update" ON attendance_records;
CREATE POLICY "attendance: admin or manager can update"
  ON attendance_records FOR UPDATE
  USING (
    org_id = get_my_org_id()
    AND (
      is_org_admin()
      OR (SELECT can_mark_attendance FROM profiles WHERE id = auth.uid())
    )
  );


-- =============================================================================
-- RECURRING_TEMPLATES
-- Only org admins can read and manage templates.
-- Cron job uses service role — bypasses RLS entirely.
-- =============================================================================

ALTER TABLE recurring_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recurring: admin can read" ON recurring_templates;
CREATE POLICY "recurring: admin can read"
  ON recurring_templates FOR SELECT
  USING (org_id = get_my_org_id() AND is_org_admin());

DROP POLICY IF EXISTS "recurring: admin can insert" ON recurring_templates;
CREATE POLICY "recurring: admin can insert"
  ON recurring_templates FOR INSERT
  WITH CHECK (org_id = get_my_org_id() AND is_org_admin());

DROP POLICY IF EXISTS "recurring: admin can update" ON recurring_templates;
CREATE POLICY "recurring: admin can update"
  ON recurring_templates FOR UPDATE
  USING (org_id = get_my_org_id() AND is_org_admin());

DROP POLICY IF EXISTS "recurring: admin can delete" ON recurring_templates;
CREATE POLICY "recurring: admin can delete"
  ON recurring_templates FOR DELETE
  USING (org_id = get_my_org_id() AND is_org_admin());


-- =============================================================================
-- NOTIFICATIONS
-- Users can read and mark-read their own notifications only.
-- INSERT is service-role only (createAdminClient in server actions).
-- Supabase Realtime CDC on this table drives the bell in real time.
-- =============================================================================

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications: user can read own" ON notifications;
CREATE POLICY "notifications: user can read own"
  ON notifications FOR SELECT
  USING (user_id = auth.uid() AND org_id = get_my_org_id());

DROP POLICY IF EXISTS "notifications: user can mark read" ON notifications;
CREATE POLICY "notifications: user can mark read"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid() AND org_id = get_my_org_id())
  WITH CHECK (user_id = auth.uid() AND org_id = get_my_org_id());


-- =============================================================================
-- CALENDAR_EVENTS
-- A user can see an event if they created it OR it was assigned to them.
-- Admins can see all events in their org.
-- A user can only insert events in their own org; assigned_to must be in org.
-- Only the creator or an admin can update/delete an event.
-- =============================================================================

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events: member can read own or assigned" ON calendar_events;
CREATE POLICY "events: member can read own or assigned"
  ON calendar_events FOR SELECT
  USING (
    org_id = get_my_org_id()
    AND (
      is_org_admin()
      OR created_by = auth.uid()
      OR assigned_to = auth.uid()
    )
  );

DROP POLICY IF EXISTS "events: member can insert" ON calendar_events;
CREATE POLICY "events: member can insert"
  ON calendar_events FOR INSERT
  WITH CHECK (
    org_id = get_my_org_id()
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "events: creator or admin can update" ON calendar_events;
CREATE POLICY "events: creator or admin can update"
  ON calendar_events FOR UPDATE
  USING (
    org_id = get_my_org_id()
    AND (created_by = auth.uid() OR is_org_admin())
  );

DROP POLICY IF EXISTS "events: creator or admin can delete" ON calendar_events;
CREATE POLICY "events: creator or admin can delete"
  ON calendar_events FOR DELETE
  USING (
    org_id = get_my_org_id()
    AND (created_by = auth.uid() OR is_org_admin())
  );


-- =============================================================================
-- HELPER: is_task_owner
-- Returns true if user_id has 'owner' access level on the given task.
-- Used in task_files DELETE policy. SECURITY DEFINER so it runs as owner
-- and cannot be bypassed by search_path manipulation.
-- =============================================================================

CREATE OR REPLACE FUNCTION is_task_owner(p_task_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM task_access
    WHERE task_access.task_id = p_task_id
      AND task_access.user_id = p_user_id
      AND task_access.level = 'owner'
  );
$$;

-- =============================================================================
-- TASK_FILES
-- Task members can read files on tasks they can see.
-- Any task member (editor+) can upload. Only uploader or owner can delete.
-- Actual bytes live in Supabase Storage (see bucket policy below).
-- =============================================================================

ALTER TABLE task_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_files: member can read" ON task_files;
CREATE POLICY "task_files: member can read"
  ON task_files FOR SELECT
  USING (
    org_id = get_my_org_id()
    AND is_active = true
    AND is_task_member(task_id)
  );

DROP POLICY IF EXISTS "task_files: member can insert" ON task_files;
CREATE POLICY "task_files: member can insert"
  ON task_files FOR INSERT
  WITH CHECK (
    org_id = get_my_org_id()
    AND uploaded_by = auth.uid()
    AND is_task_member(task_id)
  );

-- Soft delete only — uploader or task owner can deactivate
DROP POLICY IF EXISTS "task_files: uploader or owner can delete" ON task_files;
CREATE POLICY "task_files: uploader or owner can delete"
  ON task_files FOR UPDATE
  USING (
    org_id = get_my_org_id()
    AND (uploaded_by = auth.uid() OR is_task_owner(task_id, auth.uid()))
  )
  WITH CHECK (
    org_id = get_my_org_id()
    AND (uploaded_by = auth.uid() OR is_task_owner(task_id, auth.uid()))
  );


-- =============================================================================
-- STORAGE BUCKET: task-files
-- Run these in Supabase SQL Editor to secure the storage bucket.
-- Path structure: {org_id}/{task_id}/{uuid}-{filename}
-- =============================================================================

-- Allow task members to upload to their org/task path
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'task-files',
  'task-files',
  false,
  20971520,  -- 20 MB
  ARRAY[
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit   = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage SELECT — task members can read their org's files
DROP POLICY IF EXISTS "task-files: member can read" ON storage.objects;
CREATE POLICY "task-files: member can read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'task-files'
    AND (storage.foldername(name))[1] = get_my_org_id()::text
    AND is_task_member((storage.foldername(name))[2]::uuid)
  );

-- Storage INSERT — task members can upload to their org/task path
DROP POLICY IF EXISTS "task-files: member can upload" ON storage.objects;
CREATE POLICY "task-files: member can upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'task-files'
    AND (storage.foldername(name))[1] = get_my_org_id()::text
    AND is_task_member((storage.foldername(name))[2]::uuid)
  );

-- Storage DELETE — only via service role (server action uses admin client)
-- No user-facing DELETE policy — deletion is always done server-side


-- =============================================================================
-- DONE
-- =============================================================================
-- Verify with:
--   SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public'
--   ORDER BY tablename;
