import type { InferSelectModel } from 'drizzle-orm';
import type { orgs, profiles, attendance_records } from '@/db/schema';

export type Org               = InferSelectModel<typeof orgs>;
export type Profile           = InferSelectModel<typeof profiles>;
export type AttendanceRecord  = InferSelectModel<typeof attendance_records>;
