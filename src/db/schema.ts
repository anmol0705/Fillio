import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  date,
  unique,
  index,
  primaryKey,
  jsonb,
  integer,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const attendanceStatus = pgEnum('attendance_status', [
  'present', 'absent', 'half_day', 'leave',
]);

export const taskType = pgEnum('task_type', [
  'gst', 'tds', 'income_tax', 'audit', 'roc_mca',
  'accounting', 'payroll', 'notice', 'advisory', 'other',
]);

export const taskStatus = pgEnum('task_status', [
  'not_started', 'in_progress', 'under_review',
  'changes_requested', 'approved', 'filed', 'completed',
]);

export const taskPriority = pgEnum('task_priority', [
  'urgent', 'high', 'medium', 'low',
]);

export const accessLevel = pgEnum('access_level', [
  'owner', 'editor', 'viewer',
]);

export const auditAction = pgEnum('audit_action', [
  'created', 'status_changed', 'reassigned',
  'access_granted', 'edited', 'comment_added',
]);

export const recurringCadence = pgEnum('recurring_cadence', [
  'monthly', 'quarterly', 'half_yearly', 'annually',
]);

// ---------------------------------------------------------------------------
// orgs
// ---------------------------------------------------------------------------

export const orgs = pgTable('orgs', {
  id:         uuid('id').primaryKey().defaultRandom(),
  name:       text('name').notNull(),
  slug:       text('slug').notNull().unique(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// roles
// ---------------------------------------------------------------------------

export const roles = pgTable(
  'roles',
  {
    id:         uuid('id').primaryKey().defaultRandom(),
    org_id:     uuid('org_id').notNull().references(() => orgs.id),
    name:       text('name').notNull(),
    colour:     text('colour').notNull().default('#6B7280'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('roles_org_id_idx').on(table.org_id)],
);

// ---------------------------------------------------------------------------
// profiles
// ---------------------------------------------------------------------------

export const profiles = pgTable(
  'profiles',
  {
    id:                  uuid('id').primaryKey(),
    org_id:              uuid('org_id').notNull().references(() => orgs.id),
    role_id:             uuid('role_id').references(() => roles.id),
    full_name:           text('full_name').notNull(),
    email:               text('email').notNull(),
    is_active:           boolean('is_active').notNull().default(true),
    is_org_admin:        boolean('is_org_admin').notNull().default(false),
    can_mark_attendance: boolean('can_mark_attendance').notNull().default(false),
    created_at:          timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at:          timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('profiles_org_id_idx').on(table.org_id)],
);

// ---------------------------------------------------------------------------
// clients
// ---------------------------------------------------------------------------

export const clients = pgTable(
  'clients',
  {
    id:            uuid('id').primaryKey().defaultRandom(),
    org_id:        uuid('org_id').notNull().references(() => orgs.id),
    name:          text('name').notNull(),
    pan:           text('pan'),
    gstin:         text('gstin'),
    contact_email: text('contact_email'),
    contact_phone: text('contact_phone'),
    is_active:     boolean('is_active').notNull().default(true),
    created_at:    timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at:    timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('clients_org_id_idx').on(table.org_id)],
);

// ---------------------------------------------------------------------------
// tasks
//
// assignee_id: the person responsible for doing the work.
// creator_id:  the person who created the task (gets owner access).
// is_open_pool: when true, any org member can see and claim this task.
// financial_year: optional string like "2024-25" for CA context.
// ---------------------------------------------------------------------------

export const tasks = pgTable(
  'tasks',
  {
    id:             uuid('id').primaryKey().defaultRandom(),
    org_id:         uuid('org_id').notNull().references(() => orgs.id),
    title:          text('title').notNull(),
    description:    text('description'),
    type:           taskType('type').notNull(),
    status:         taskStatus('status').notNull().default('not_started'),
    priority:       taskPriority('priority').notNull().default('medium'),
    due_at:         timestamp('due_at', { withTimezone: true }),
    client_id:      uuid('client_id').references(() => clients.id),
    financial_year: text('financial_year'),
    assignee_id:    uuid('assignee_id').references(() => profiles.id),
    creator_id:     uuid('creator_id').notNull().references(() => profiles.id),
    is_open_pool:   boolean('is_open_pool').notNull().default(false),
    is_active:      boolean('is_active').notNull().default(true),
    created_at:     timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at:     timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('tasks_org_id_idx').on(table.org_id),
    index('tasks_assignee_idx').on(table.assignee_id),
    index('tasks_status_idx').on(table.status),
  ],
);

// ---------------------------------------------------------------------------
// task_access
//
// This is the permission backbone. A user can see a task only if they have
// a row here. Three levels:
//   owner  — created the task; can edit everything, grant access, soft-delete
//   editor — assignee; can change status and add comments
//   viewer — read-only + can add comments
//
// unique(task_id, user_id) — one access level per person per task.
// ---------------------------------------------------------------------------

export const task_access = pgTable(
  'task_access',
  {
    id:         uuid('id').primaryKey().defaultRandom(),
    task_id:    uuid('task_id').notNull().references(() => tasks.id),
    user_id:    uuid('user_id').notNull().references(() => profiles.id),
    level:      accessLevel('level').notNull(),
    granted_by: uuid('granted_by').references(() => profiles.id),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('task_access_unique').on(table.task_id, table.user_id),
    index('task_access_task_idx').on(table.task_id),
    index('task_access_user_idx').on(table.user_id),
  ],
);

// ---------------------------------------------------------------------------
// task_audit_log
//
// Immutable event log — INSERT only, no UPDATE or DELETE ever.
// payload stores context: old/new status, who was granted access, etc.
// actor_id is who performed the action.
// ---------------------------------------------------------------------------

export const task_audit_log = pgTable(
  'task_audit_log',
  {
    id:         uuid('id').primaryKey().defaultRandom(),
    task_id:    uuid('task_id').notNull().references(() => tasks.id),
    org_id:     uuid('org_id').notNull().references(() => orgs.id),
    actor_id:   uuid('actor_id').notNull().references(() => profiles.id),
    action:     auditAction('action').notNull(),
    payload:    jsonb('payload'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('audit_task_idx').on(table.task_id)],
);

// ---------------------------------------------------------------------------
// task_messages
//
// Chat messages on a task. Any user with task_access (any level) can send.
// INSERT-only — messages are never edited or deleted (audit trail).
// Supabase Realtime CDC listens to this table for live updates.
// ---------------------------------------------------------------------------

export const task_messages = pgTable(
  'task_messages',
  {
    id:         uuid('id').primaryKey().defaultRandom(),
    task_id:    uuid('task_id').notNull().references(() => tasks.id),
    org_id:     uuid('org_id').notNull().references(() => orgs.id),
    sender_id:  uuid('sender_id').notNull().references(() => profiles.id),
    body:       text('body').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('messages_task_idx').on(table.task_id),
    index('messages_org_idx').on(table.org_id),
  ],
);

// ---------------------------------------------------------------------------
// reporting_relationships
// ---------------------------------------------------------------------------

export const reporting_relationships = pgTable(
  'reporting_relationships',
  {
    manager_id: uuid('manager_id').notNull().references(() => profiles.id),
    report_id:  uuid('report_id').notNull().references(() => profiles.id),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.manager_id, table.report_id] }),
    index('rr_manager_idx').on(table.manager_id),
    index('rr_report_idx').on(table.report_id),
  ],
);

// ---------------------------------------------------------------------------
// attendance_records
// ---------------------------------------------------------------------------

export const attendance_records = pgTable(
  'attendance_records',
  {
    id:         uuid('id').primaryKey().defaultRandom(),
    org_id:     uuid('org_id').notNull().references(() => orgs.id),
    user_id:    uuid('user_id').notNull().references(() => profiles.id),
    date:       date('date').notNull(),
    status:     attendanceStatus('status').notNull(),
    note:       text('note'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('attendance_user_date_unique').on(table.user_id, table.date),
    index('attendance_org_date_idx').on(table.org_id, table.date),
  ],
);

// ---------------------------------------------------------------------------
// recurring_templates
//
// Admin-created templates that the cron job uses to spawn real tasks.
// cadence controls when it fires (see /api/cron/recurring for logic).
// due_in_days: task due_at is set to (creation_date + due_in_days).
// default_assignee_role_id: cron picks the first active user with this role.
// If no user found, task is created as open pool.
// ---------------------------------------------------------------------------

export const recurring_templates = pgTable(
  'recurring_templates',
  {
    id:                       uuid('id').primaryKey().defaultRandom(),
    org_id:                   uuid('org_id').notNull().references(() => orgs.id),
    title:                    text('title').notNull(),
    task_type:                taskType('task_type').notNull(),
    cadence:                  recurringCadence('cadence').notNull(),
    priority:                 taskPriority('priority').notNull().default('medium'),
    default_assignee_role_id: uuid('default_assignee_role_id').references(() => roles.id),
    default_client_id:        uuid('default_client_id').references(() => clients.id),
    due_in_days:              integer('due_in_days').notNull().default(30),
    is_active:                boolean('is_active').notNull().default(true),
    created_by:               uuid('created_by').notNull().references(() => profiles.id),
    created_at:               timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at:               timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('recurring_org_id_idx').on(table.org_id)],
);
