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
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Enums
// A pgEnum creates a Postgres-level enum type — the DB rejects any value
// not in this list. Better than a plain text column: invalid values are
// caught at the DB layer, not just in application code.
// ---------------------------------------------------------------------------

export const attendanceStatus = pgEnum('attendance_status', [
  'present',
  'absent',
  'half_day',
  'leave',
]);

// ---------------------------------------------------------------------------
// orgs
// One row = one CA firm using Filio.
// Every other table references this via org_id.
// ---------------------------------------------------------------------------

export const orgs = pgTable('orgs', {
  id:         uuid('id').primaryKey().defaultRandom(),
  name:       text('name').notNull(),
  slug:       text('slug').notNull().unique(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// profiles
// One row = one person in a firm.
// id matches auth.users.id — that's the bridge between Supabase Auth and our app.
// No FK to auth.users defined here because auth schema is outside Drizzle scope.
// ---------------------------------------------------------------------------

export const profiles = pgTable(
  'profiles',
  {
    id:                  uuid('id').primaryKey(),       // = auth.users.id
    org_id:              uuid('org_id').notNull().references(() => orgs.id),
    full_name:           text('full_name').notNull(),
    email:               text('email').notNull(),
    is_active:           boolean('is_active').notNull().default(true),
    is_org_admin:        boolean('is_org_admin').notNull().default(false),
    can_mark_attendance: boolean('can_mark_attendance').notNull().default(false),
    created_at:          timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at:          timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('profiles_org_id_idx').on(table.org_id),
  ],
);

// ---------------------------------------------------------------------------
// attendance_records
// One row = one person's attendance status on one specific date.
//
// Key design decision: unique('attendance_user_date_unique').on(user_id, date)
// This constraint means Postgres will REJECT a second row for the same person
// on the same day. This enables UPSERT — instead of "check if exists then
// insert or update" (two queries, race condition possible), you always INSERT
// and tell Postgres "on conflict, update instead". One query, always correct.
// ---------------------------------------------------------------------------

export const attendance_records = pgTable(
  'attendance_records',
  {
    id:         uuid('id').primaryKey().defaultRandom(),
    org_id:     uuid('org_id').notNull().references(() => orgs.id),
    user_id:    uuid('user_id').notNull().references(() => profiles.id),
    date:       date('date').notNull(),                    // stored as 'YYYY-MM-DD'
    status:     attendanceStatus('status').notNull(),
    note:       text('note'),                              // optional reason/comment
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('attendance_user_date_unique').on(table.user_id, table.date),
    index('attendance_org_date_idx').on(table.org_id, table.date),
  ],
);
