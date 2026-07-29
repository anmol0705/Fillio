import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

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
