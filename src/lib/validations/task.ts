import { z } from 'zod';

export const taskTypeValues = [
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
] as const;

export const taskStatusValues = [
  'not_started',
  'in_progress',
  'under_review',
  'changes_requested',
  'approved',
  'filed',
  'completed',
] as const;

export const taskPriorityValues = ['urgent', 'high', 'medium', 'low'] as const;

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500),
  description: z.string().max(5000).optional(),
  task_type: z.enum(taskTypeValues),
  priority: z.enum(taskPriorityValues).default('medium'),
  client_id: z.string().uuid().nullable().optional(),
  assignee_id: z.string().uuid().nullable().optional(),
  financial_year: z.string().max(10).optional(),
  due_at: z.string().datetime().nullable().optional(),
  is_open_pool: z.boolean().default(false),
});

export const updateStatusSchema = z.object({
  task_id: z.string().uuid(),
  new_status: z.enum(taskStatusValues),
});

export const addMessageSchema = z.object({
  task_id: z.string().uuid(),
  content: z.string().min(1).max(10000),
});

// Valid status transitions — enforced in updateTaskStatus
export const STATUS_TRANSITIONS: Record<string, string[]> = {
  not_started: ['in_progress'],
  in_progress: ['under_review'],
  under_review: ['changes_requested', 'approved'],
  changes_requested: ['in_progress'],
  approved: ['filed'],
  filed: ['completed'],
  completed: [],
};
