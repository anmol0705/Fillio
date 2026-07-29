import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  date,
  unique,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const taskType = pgEnum('task_type', [
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
]);

export const taskStatus = pgEnum('task_status', [
  'not_started',
  'in_progress',
  'under_review',
  'changes_requested',
  'approved',
  'filed',
  'completed',
]);

export const taskPriority = pgEnum('task_priority', [
  'urgent',
  'high',
  'medium',
  'low',
]);

export const accessLevel = pgEnum('access_level', [
  'owner',
  'editor',
  'viewer',
]);

export const attendanceStatus = pgEnum('attendance_status', [
  'present',
  'absent',
  'half_day',
  'leave',
]);

export const auditAction = pgEnum('audit_action', [
  'created',
  'status_changed',
  'reassigned',
  'comment_added',
  'file_uploaded',
  'access_granted',
]);

export const recurringCadence = pgEnum('recurring_cadence', [
  'monthly',
  'quarterly',
  'half_yearly',
  'annually',
]);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const orgs = pgTable('orgs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => orgs.id),
    name: text('name').notNull(),
    color: text('color').notNull().default('#6366f1'),
    parent_role_id: uuid('parent_role_id').references((): AnyPgColumn => roles.id),
    sort_order: integer('sort_order').notNull().default(0),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('roles_org_id_idx').on(table.org_id),
  ],
);

export const profiles = pgTable(
  'profiles',
  {
    // Equals auth.users.id — FK intentionally omitted (auth schema outside Drizzle scope)
    id: uuid('id').primaryKey(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => orgs.id),
    role_id: uuid('role_id').references(() => roles.id),
    full_name: text('full_name').notNull(),
    email: text('email').notNull(),
    avatar_url: text('avatar_url'),
    is_active: boolean('is_active').notNull().default(true),
    is_org_admin: boolean('is_org_admin').notNull().default(false),
    can_mark_attendance: boolean('can_mark_attendance').notNull().default(false),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('profiles_org_id_idx').on(table.org_id),
  ],
);

export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => orgs.id),
    name: text('name').notNull(),
    pan: text('pan'),
    gstin: text('gstin'),
    contact_email: text('contact_email'),
    contact_phone: text('contact_phone'),
    is_active: boolean('is_active').notNull().default(true),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('clients_org_id_idx').on(table.org_id),
  ],
);

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => orgs.id),
    title: text('title').notNull(),
    description: text('description'),
    task_type: taskType('task_type').notNull(),
    status: taskStatus('status').notNull().default('not_started'),
    priority: taskPriority('priority').notNull().default('medium'),
    client_id: uuid('client_id').references(() => clients.id),
    assignee_id: uuid('assignee_id').references(() => profiles.id),
    creator_id: uuid('creator_id')
      .notNull()
      .references(() => profiles.id),
    financial_year: text('financial_year'),
    due_at: timestamp('due_at', { withTimezone: true }),
    is_open_pool: boolean('is_open_pool').notNull().default(false),
    is_active: boolean('is_active').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('tasks_org_id_idx').on(table.org_id),
    index('tasks_assignee_id_idx').on(table.assignee_id),
    index('tasks_status_idx').on(table.status),
    index('tasks_due_at_idx').on(table.due_at),
  ],
);

export const task_access = pgTable(
  'task_access',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    task_id: uuid('task_id')
      .notNull()
      .references(() => tasks.id),
    user_id: uuid('user_id')
      .notNull()
      .references(() => profiles.id),
    access_level: accessLevel('access_level').notNull(),
    granted_at: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('task_access_task_user_unique').on(table.task_id, table.user_id),
    index('task_access_task_id_idx').on(table.task_id),
    index('task_access_user_id_idx').on(table.user_id),
  ],
);

export const task_messages = pgTable(
  'task_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    task_id: uuid('task_id')
      .notNull()
      .references(() => tasks.id),
    sender_id: uuid('sender_id')
      .notNull()
      .references(() => profiles.id),
    content: text('content'),
    file_url: text('file_url'),
    file_name: text('file_name'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('task_messages_task_id_idx').on(table.task_id),
  ],
);

export const task_audit_log = pgTable(
  'task_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    task_id: uuid('task_id')
      .notNull()
      .references(() => tasks.id),
    actor_id: uuid('actor_id')
      .notNull()
      .references(() => profiles.id),
    action: auditAction('action').notNull(),
    old_value: text('old_value'),
    new_value: text('new_value'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('task_audit_log_task_id_idx').on(table.task_id),
  ],
);

export const recurring_templates = pgTable(
  'recurring_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => orgs.id),
    title: text('title').notNull(),
    task_type: taskType('task_type').notNull(),
    cadence: recurringCadence('cadence').notNull(),
    default_priority: taskPriority('default_priority').notNull().default('medium'),
    default_assignee_role_id: uuid('default_assignee_role_id').references(() => roles.id),
    default_client_id: uuid('default_client_id').references(() => clients.id),
    days_before_due: integer('days_before_due').notNull().default(7),
    is_active: boolean('is_active').notNull().default(true),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('recurring_templates_org_active_idx').on(table.org_id, table.is_active),
  ],
);

export const attendance_records = pgTable(
  'attendance_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => orgs.id),
    user_id: uuid('user_id')
      .notNull()
      .references(() => profiles.id),
    date: date('date').notNull(),
    status: attendanceStatus('status').notNull(),
    note: text('note'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('attendance_user_date_unique').on(table.user_id, table.date),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => orgs.id),
    user_id: uuid('user_id')
      .notNull()
      .references(() => profiles.id),
    task_id: uuid('task_id').references(() => tasks.id),
    title: text('title').notNull(),
    body: text('body'),
    is_read: boolean('is_read').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('notifications_user_id_idx').on(table.user_id),
    index('notifications_is_read_idx').on(table.is_read),
    index('notifications_org_id_idx').on(table.org_id),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const orgsRelations = relations(orgs, ({ many }) => ({
  roles: many(roles),
  profiles: many(profiles),
  clients: many(clients),
  tasks: many(tasks),
  recurring_templates: many(recurring_templates),
  attendance_records: many(attendance_records),
  notifications: many(notifications),
}));

export const rolesRelations = relations(roles, ({ one, many }) => ({
  org: one(orgs, { fields: [roles.org_id], references: [orgs.id] }),
  parent_role: one(roles, {
    fields: [roles.parent_role_id],
    references: [roles.id],
    relationName: 'roleHierarchy',
  }),
  child_roles: many(roles, { relationName: 'roleHierarchy' }),
  profiles: many(profiles),
  recurring_templates: many(recurring_templates),
}));

export const profilesRelations = relations(profiles, ({ one, many }) => ({
  org: one(orgs, { fields: [profiles.org_id], references: [orgs.id] }),
  role: one(roles, { fields: [profiles.role_id], references: [roles.id] }),
  assigned_tasks: many(tasks, { relationName: 'assignedTasks' }),
  created_tasks: many(tasks, { relationName: 'createdTasks' }),
  task_access: many(task_access),
  task_messages: many(task_messages),
  task_audit_log: many(task_audit_log),
  attendance_records: many(attendance_records),
  notifications: many(notifications),
}));

export const clientsRelations = relations(clients, ({ one, many }) => ({
  org: one(orgs, { fields: [clients.org_id], references: [orgs.id] }),
  tasks: many(tasks),
  recurring_templates: many(recurring_templates),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  org: one(orgs, { fields: [tasks.org_id], references: [orgs.id] }),
  client: one(clients, { fields: [tasks.client_id], references: [clients.id] }),
  assignee: one(profiles, {
    fields: [tasks.assignee_id],
    references: [profiles.id],
    relationName: 'assignedTasks',
  }),
  creator: one(profiles, {
    fields: [tasks.creator_id],
    references: [profiles.id],
    relationName: 'createdTasks',
  }),
  access: many(task_access),
  messages: many(task_messages),
  auditLog: many(task_audit_log),
  notifications: many(notifications),
}));

export const taskAccessRelations = relations(task_access, ({ one }) => ({
  task: one(tasks, { fields: [task_access.task_id], references: [tasks.id] }),
  user: one(profiles, { fields: [task_access.user_id], references: [profiles.id] }),
}));

export const taskMessagesRelations = relations(task_messages, ({ one }) => ({
  task: one(tasks, { fields: [task_messages.task_id], references: [tasks.id] }),
  sender: one(profiles, { fields: [task_messages.sender_id], references: [profiles.id] }),
}));

export const taskAuditLogRelations = relations(task_audit_log, ({ one }) => ({
  task: one(tasks, { fields: [task_audit_log.task_id], references: [tasks.id] }),
  actor: one(profiles, { fields: [task_audit_log.actor_id], references: [profiles.id] }),
}));

export const recurringTemplatesRelations = relations(recurring_templates, ({ one }) => ({
  org: one(orgs, { fields: [recurring_templates.org_id], references: [orgs.id] }),
  default_assignee_role: one(roles, {
    fields: [recurring_templates.default_assignee_role_id],
    references: [roles.id],
  }),
  default_client: one(clients, {
    fields: [recurring_templates.default_client_id],
    references: [clients.id],
  }),
}));

export const attendanceRecordsRelations = relations(attendance_records, ({ one }) => ({
  org: one(orgs, { fields: [attendance_records.org_id], references: [orgs.id] }),
  user: one(profiles, { fields: [attendance_records.user_id], references: [profiles.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  org: one(orgs, { fields: [notifications.org_id], references: [orgs.id] }),
  user: one(profiles, { fields: [notifications.user_id], references: [profiles.id] }),
  task: one(tasks, { fields: [notifications.task_id], references: [tasks.id] }),
}));
