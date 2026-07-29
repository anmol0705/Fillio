import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type {
  orgs,
  roles,
  profiles,
  clients,
  tasks,
  task_access,
  task_messages,
  task_audit_log,
  recurring_templates,
  attendance_records,
  notifications,
} from '@/db/schema';

export type Org = InferSelectModel<typeof orgs>;
export type Role = InferSelectModel<typeof roles>;
export type Profile = InferSelectModel<typeof profiles>;
export type Client = InferSelectModel<typeof clients>;
export type Task = InferSelectModel<typeof tasks>;
export type TaskAccess = InferSelectModel<typeof task_access>;
export type TaskMessage = InferSelectModel<typeof task_messages>;
export type TaskAuditLog = InferSelectModel<typeof task_audit_log>;
export type RecurringTemplate = InferSelectModel<typeof recurring_templates>;
export type AttendanceRecord = InferSelectModel<typeof attendance_records>;
export type Notification = InferSelectModel<typeof notifications>;

export type NewTask = InferInsertModel<typeof tasks>;
export type NewProfile = InferInsertModel<typeof profiles>;
export type NewClient = InferInsertModel<typeof clients>;
export type NewTaskMessage = InferInsertModel<typeof task_messages>;
export type NewTaskAuditLog = InferInsertModel<typeof task_audit_log>;
export type NewNotification = InferInsertModel<typeof notifications>;
export type NewRecurringTemplate = InferInsertModel<typeof recurring_templates>;

export type TaskWithRelations = Task & {
  client: Client | null;
  assignee: Profile | null;
  creator: Profile;
};

export type TaskDetailWithAll = TaskWithRelations & {
  accessList: (TaskAccess & { user: Profile })[];
  auditLog: (TaskAuditLog & { actor: Profile })[];
  messageCount: number;
};
