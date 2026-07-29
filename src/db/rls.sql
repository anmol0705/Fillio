-- ============================================================
-- FILIO RLS POLICIES
-- Run this entire file in Supabase SQL Editor
-- Idempotent: DROP POLICY IF EXISTS before every CREATE POLICY
-- ============================================================

-- ============================================================
-- HELPER FUNCTIONS (SECURITY DEFINER SET search_path = public)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_org_admin FROM public.profiles WHERE id = auth.uid()),
    false
  )
$$;

CREATE OR REPLACE FUNCTION public.is_task_member(p_task_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.task_access
    WHERE task_id = p_task_id AND user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.is_attendance_manager()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT can_mark_attendance FROM public.profiles WHERE id = auth.uid()),
    false
  )
$$;

CREATE OR REPLACE FUNCTION public.is_task_owner(p_task_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.task_access
    WHERE task_id = p_task_id
      AND user_id = p_user_id
      AND access_level = 'owner'
  )
$$;

-- ============================================================
-- ENABLE RLS ON ALL 11 TABLES
-- ============================================================

ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- ORGS
-- ============================================================

DROP POLICY IF EXISTS "orgs_select_own" ON public.orgs;
CREATE POLICY "orgs_select_own" ON public.orgs
  FOR SELECT USING (id = get_my_org_id());

-- ============================================================
-- ROLES
-- ============================================================

DROP POLICY IF EXISTS "roles_select_org" ON public.roles;
CREATE POLICY "roles_select_org" ON public.roles
  FOR SELECT USING (org_id = get_my_org_id());

DROP POLICY IF EXISTS "roles_insert_admin" ON public.roles;
CREATE POLICY "roles_insert_admin" ON public.roles
  FOR INSERT WITH CHECK (org_id = get_my_org_id() AND is_org_admin());

DROP POLICY IF EXISTS "roles_update_admin" ON public.roles;
CREATE POLICY "roles_update_admin" ON public.roles
  FOR UPDATE USING (org_id = get_my_org_id() AND is_org_admin());

DROP POLICY IF EXISTS "roles_delete_admin" ON public.roles;
CREATE POLICY "roles_delete_admin" ON public.roles
  FOR DELETE USING (org_id = get_my_org_id() AND is_org_admin());

-- ============================================================
-- PROFILES
-- Users can read all profiles in their org.
-- Profile creation is via createAdminClient() (service role) only.
-- Service role bypasses RLS — no INSERT policy needed or wanted.
-- No DELETE policy — soft delete only (is_active = false via UPDATE).
-- ============================================================

DROP POLICY IF EXISTS "profiles_select_org" ON public.profiles;
CREATE POLICY "profiles_select_org" ON public.profiles
  FOR SELECT USING (org_id = get_my_org_id());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND is_org_admin = (SELECT is_org_admin FROM public.profiles WHERE id = auth.uid())
    AND org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    AND is_active = (SELECT is_active FROM public.profiles WHERE id = auth.uid())
    AND can_mark_attendance = (SELECT can_mark_attendance FROM public.profiles WHERE id = auth.uid())
  );

-- ============================================================
-- CLIENTS
-- ============================================================

DROP POLICY IF EXISTS "clients_select_org" ON public.clients;
CREATE POLICY "clients_select_org" ON public.clients
  FOR SELECT USING (org_id = get_my_org_id());

DROP POLICY IF EXISTS "clients_insert_admin" ON public.clients;
CREATE POLICY "clients_insert_admin" ON public.clients
  FOR INSERT WITH CHECK (org_id = get_my_org_id() AND is_org_admin());

DROP POLICY IF EXISTS "clients_update_admin" ON public.clients;
CREATE POLICY "clients_update_admin" ON public.clients
  FOR UPDATE USING (org_id = get_my_org_id() AND is_org_admin());

-- Soft delete only — no DELETE policy on clients

-- ============================================================
-- TASKS
-- SELECT: task member OR open pool task in same org
-- INSERT: any org member (org_id scoped)
-- UPDATE: task members only (no backward status transitions enforced here — app layer)
-- No DELETE — soft delete via is_active = false
-- ============================================================

DROP POLICY IF EXISTS "tasks_select_member" ON public.tasks;
CREATE POLICY "tasks_select_member" ON public.tasks
  FOR SELECT USING (
    org_id = get_my_org_id()
    AND (
      is_open_pool = true
      OR is_task_member(id)
    )
  );

DROP POLICY IF EXISTS "tasks_insert_org" ON public.tasks;
CREATE POLICY "tasks_insert_org" ON public.tasks
  FOR INSERT WITH CHECK (org_id = get_my_org_id());

DROP POLICY IF EXISTS "tasks_update_member" ON public.tasks;
CREATE POLICY "tasks_update_member" ON public.tasks
  FOR UPDATE USING (
    org_id = get_my_org_id()
    AND is_task_member(id)
  );

-- ============================================================
-- TASK_ACCESS
-- SELECT: any task member can see who else has access
-- INSERT/UPDATE/DELETE: handled by admin client (service role) only
-- No RLS INSERT/DELETE policies — admin client bypasses RLS
-- ============================================================

DROP POLICY IF EXISTS "task_access_select_member" ON public.task_access;
CREATE POLICY "task_access_select_member" ON public.task_access
  FOR SELECT USING (is_task_member(task_id));

-- ============================================================
-- TASK_MESSAGES
-- ============================================================

DROP POLICY IF EXISTS "task_messages_select_member" ON public.task_messages;
CREATE POLICY "task_messages_select_member" ON public.task_messages
  FOR SELECT USING (is_task_member(task_id));

DROP POLICY IF EXISTS "task_messages_insert_member" ON public.task_messages;
CREATE POLICY "task_messages_insert_member" ON public.task_messages
  FOR INSERT WITH CHECK (
    is_task_member(task_id)
    AND sender_id = auth.uid()
  );

-- ============================================================
-- TASK_AUDIT_LOG (immutable — SELECT via RLS, inserts via admin client only)
-- NO INSERT, UPDATE, or DELETE policies. Ever.
-- ============================================================

DROP POLICY IF EXISTS "task_audit_log_select_member" ON public.task_audit_log;
CREATE POLICY "task_audit_log_select_member" ON public.task_audit_log
  FOR SELECT USING (is_task_member(task_id));

-- ============================================================
-- RECURRING_TEMPLATES
-- ============================================================

DROP POLICY IF EXISTS "recurring_templates_select_org" ON public.recurring_templates;
CREATE POLICY "recurring_templates_select_org" ON public.recurring_templates
  FOR SELECT USING (org_id = get_my_org_id());

DROP POLICY IF EXISTS "recurring_templates_insert_admin" ON public.recurring_templates;
CREATE POLICY "recurring_templates_insert_admin" ON public.recurring_templates
  FOR INSERT WITH CHECK (org_id = get_my_org_id() AND is_org_admin());

DROP POLICY IF EXISTS "recurring_templates_update_admin" ON public.recurring_templates;
CREATE POLICY "recurring_templates_update_admin" ON public.recurring_templates
  FOR UPDATE USING (org_id = get_my_org_id() AND is_org_admin());

-- ============================================================
-- ATTENDANCE_RECORDS
-- ============================================================

DROP POLICY IF EXISTS "attendance_select_org_admin" ON public.attendance_records;
DROP POLICY IF EXISTS "attendance_select_manager" ON public.attendance_records;
CREATE POLICY "attendance_select_manager" ON public.attendance_records
  FOR SELECT USING (
    org_id = get_my_org_id()
    AND (user_id = auth.uid() OR is_org_admin() OR is_attendance_manager())
  );

DROP POLICY IF EXISTS "attendance_insert_admin" ON public.attendance_records;
DROP POLICY IF EXISTS "attendance_insert_manager" ON public.attendance_records;
CREATE POLICY "attendance_insert_manager" ON public.attendance_records
  FOR INSERT WITH CHECK (
    org_id = get_my_org_id()
    AND (is_org_admin() OR is_attendance_manager())
  );

DROP POLICY IF EXISTS "attendance_update_admin" ON public.attendance_records;
DROP POLICY IF EXISTS "attendance_update_manager" ON public.attendance_records;
CREATE POLICY "attendance_update_manager" ON public.attendance_records
  FOR UPDATE USING (
    org_id = get_my_org_id()
    AND (is_org_admin() OR is_attendance_manager())
  );

-- ============================================================
-- NOTIFICATIONS
-- Inserts via admin client only — no INSERT policy.
-- ============================================================

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT USING (user_id = auth.uid() AND org_id = get_my_org_id());

DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());
