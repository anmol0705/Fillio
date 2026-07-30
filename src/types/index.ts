import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type {
  orgs, roles, profiles, clients,
  tasks, task_access, task_audit_log, task_messages,
  reporting_relationships, attendance_records, recurring_templates,
} from '@/db/schema';

export type Org                   = InferSelectModel<typeof orgs>;
export type Role                  = InferSelectModel<typeof roles>;
export type Profile               = InferSelectModel<typeof profiles>;
export type Client                = InferSelectModel<typeof clients>;
export type Task                  = InferSelectModel<typeof tasks>;
export type TaskAccess            = InferSelectModel<typeof task_access>;
export type TaskAuditLog          = InferSelectModel<typeof task_audit_log>;
export type TaskMessage           = InferSelectModel<typeof task_messages>;

// Shape used in the chat UI — message + sender name resolved
export type TaskMessageWithSender = TaskMessage & {
  sender: { id: string; full_name: string };
};
export type ReportingRelationship = InferSelectModel<typeof reporting_relationships>;
export type AttendanceRecord      = InferSelectModel<typeof attendance_records>;

// Convenience aliases for enum value types
export type TaskType     = Task['type'];
export type TaskStatus   = Task['status'];
export type TaskPriority = Task['priority'];
export type AccessLevel  = TaskAccess['level'];

// Shape returned by getMyTasks / getPoolTasks
export type TaskListItem = {
  id:             string;
  title:          string;
  type:           TaskType;
  status:         TaskStatus;
  priority:       TaskPriority;
  due_at:         Date | null;
  is_open_pool:   boolean;
  created_at:     Date;
  assignee:       { id: string; full_name: string } | null;
  client:         { id: string; name: string } | null;
  my_access:      AccessLevel | null;   // null for pool tasks the user hasn't claimed
};

// Shape returned by getTaskDetail
export type TaskDetail = Task & {
  creator:    { id: string; full_name: string };
  assignee:   { id: string; full_name: string } | null;
  client:     { id: string; name: string } | null;
  access:     (TaskAccess & { profile: { full_name: string } })[];
  audit_log:  (TaskAuditLog & { actor: { full_name: string } })[];
  my_access:  AccessLevel | null;
};

export type RecurringTemplate    = InferSelectModel<typeof recurring_templates>;
export type NewRecurringTemplate = InferInsertModel<typeof recurring_templates>;

// Stub — notifications table not built yet
export type Notification = {
  id:         string;
  org_id:     string;
  user_id:    string;
  task_id:    string | null;
  title:      string;
  body:       string | null;
  is_read:    boolean;
  created_at: Date;
};
