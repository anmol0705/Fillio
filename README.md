# Filio — CA Firm Work Management System

> "Know exactly what's done, what's overdue, and who's responsible."

Filio replaces the WhatsApp-group-plus-Excel-sheet stack that most Indian CA firms run on. It gives the founding partner one screen that shows every overdue task, who owns it, and what is coming due. It is production-grade multi-tenant SaaS built for real use inside a real CA firm.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Technology Stack](#2-technology-stack)
3. [Project Structure](#3-project-structure)
4. [Database Schema — All 11 Tables](#4-database-schema--all-11-tables)
5. [Authentication & Session Flow](#5-authentication--session-flow)
6. [Security Model](#6-security-model)
7. [Multi-Tenancy](#7-multi-tenancy)
8. [All Pages & Routes](#8-all-pages--routes)
9. [Server Actions (Mutations)](#9-server-actions-mutations)
10. [Cron Jobs](#10-cron-jobs)
11. [Real-Time & SSE](#11-real-time--sse)
12. [Email System](#12-email-system)
13. [Compliance Calendar](#13-compliance-calendar)
14. [Attendance Management](#14-attendance-management)
15. [Task Status Workflow](#15-task-status-workflow)
16. [CA Task Taxonomy](#16-ca-task-taxonomy)
17. [Role Hierarchy](#17-role-hierarchy)
18. [Recurring Task Engine](#18-recurring-task-engine)
19. [Environment Variables](#19-environment-variables)
20. [Local Development Setup](#20-local-development-setup)
21. [Manual Setup Steps (One-Time)](#21-manual-setup-steps-one-time)
22. [Production Deployment (Vercel)](#22-production-deployment-vercel)
23. [Feature Checklist](#23-feature-checklist)
24. [Roadmap](#24-roadmap)

---

## 1. Architecture Overview

Filio is a **unified full-stack Next.js application**. There is no separate backend server.

```
Browser
  │
  ▼
Next.js 16 (Vercel)
  ├── App Router — Server Components render pages server-side
  ├── Server Actions — all mutations (no REST API in v1)
  ├── Route Handlers — SSE stream, cron endpoints
  └── Middleware (src/proxy.ts) — session refresh + route protection
       │
       ▼
  Supabase (managed PostgreSQL 16, ap-south-1 Mumbai)
  ├── Database — Drizzle ORM over transaction pooler (port 6543)
  ├── Auth — @supabase/ssr cookie-based sessions
  ├── Realtime — CDC WebSockets for task chat
  └── Storage — private bucket for task file attachments
       │
       ▼
  Resend — transactional email (daily digest, task notifications)
```

**Single command to run locally:** `npm run dev`

**Single deployment target:** Vercel (cron jobs are declarative in `vercel.json`)

---

## 2. Technology Stack

| Layer | Library | Version | Notes |
|---|---|---|---|
| Framework | Next.js | 16.2.9 | App Router, Server Components |
| Language | TypeScript | 5.x | Strict mode, zero `any` |
| Styling | Tailwind CSS | v4 | CSS-first, no config file |
| Components | shadcn/ui | latest | Neutral base, `@/components/ui/` |
| Database | PostgreSQL 16 | via Supabase | Mumbai region |
| ORM | Drizzle ORM | 0.45.x | postgres-js driver, `prepare: false` |
| Auth | Supabase Auth | @supabase/ssr 0.12 | Cookie sessions |
| Realtime | Supabase Realtime | — | Postgres CDC WebSockets |
| Notifications | SSE | — | Next.js Route Handler |
| Storage | Supabase Storage | — | Private bucket, signed URLs |
| Email | Resend + React Email | 6.x | Daily digest |
| Tables | TanStack Table | v8 | Headless, filter/sort/paginate |
| DnD | @dnd-kit | 6.x / 10.x | Hierarchy tree builder |
| Charts | Recharts | 3.x | Workload dashboard |
| Calendar | react-big-calendar | 1.x | Deadline view |
| Forms | react-hook-form + zod | 7.x / 4.x | All forms, typed end-to-end |
| Hosting | Vercel | — | Frontend + crons |

---

## 3. Project Structure

```
filio/
├── drizzle.config.ts          ← Uses DATABASE_URL_DIRECT (port 5432, migrations only)
├── drizzle/                   ← Generated SQL migration files
├── vercel.json                ← 3 cron job declarations
├── src/
│   ├── proxy.ts               ← Next.js middleware (session refresh + route guard)
│   ├── app/
│   │   ├── layout.tsx         ← Root layout: viewport meta, providers
│   │   ├── page.tsx           ← Root redirect → /dashboard
│   │   ├── globals.css        ← Tailwind v4, CSS vars, mobile fixes
│   │   ├── (auth)/            ← Unauthenticated routes
│   │   │   ├── login/         ← Email + password login page
│   │   │   └── auth/
│   │   │       ├── callback/  ← OAuth / magic link callback
│   │   │       └── logout/    ← POST handler → sign out
│   │   ├── (dashboard)/       ← All protected pages (auth-guarded in layout)
│   │   │   ├── layout.tsx     ← Loads user + DashboardShell (sidebar + header)
│   │   │   ├── dashboard/
│   │   │   │   ├── page.tsx           ← Accountability dashboard
│   │   │   │   ├── tasks/
│   │   │   │   │   ├── page.tsx       ← Task list (TanStack Table)
│   │   │   │   │   ├── [id]/page.tsx  ← Task detail + chat + audit log
│   │   │   │   │   └── pool/page.tsx  ← Open task pool
│   │   │   │   ├── clients/page.tsx   ← Client master
│   │   │   │   ├── compliance/page.tsx ← Compliance calendar
│   │   │   │   └── admin/             ← Admin-only section
│   │   │   │       ├── hierarchy/     ← Drag-and-drop org tree
│   │   │   │       ├── users/         ← User management
│   │   │   │       ├── recurring/     ← Recurring task templates
│   │   │   │       └── attendance/    ← Daily attendance sheet
│   │   └── api/
│   │       ├── notifications/stream/  ← SSE endpoint (bell notifications)
│   │       └── cron/
│   │           ├── recurring/         ← Generates tasks from templates
│   │           ├── digest/            ← Sends daily email digest
│   │           └── compliance/        ← Sends compliance deadline alerts
│   ├── actions/               ← ALL server-side mutations ('use server')
│   │   ├── tasks.ts
│   │   ├── clients.ts
│   │   ├── hierarchy.ts
│   │   ├── users.ts
│   │   ├── dashboard.ts
│   │   ├── notifications.ts
│   │   ├── recurring.ts
│   │   └── attendance.ts
│   ├── components/
│   │   ├── ui/                ← shadcn auto-generated (Button, Dialog, etc.)
│   │   ├── layout/
│   │   │   ├── DashboardShell.tsx  ← Client component: owns mobile sidebar state
│   │   │   ├── AppSidebar.tsx      ← Desktop fixed sidebar + mobile overlay drawer
│   │   │   ├── Header.tsx          ← Sticky header, hamburger on mobile
│   │   │   └── NotificationBell.tsx ← SSE consumer, bell icon + popover
│   │   ├── tasks/
│   │   │   ├── TaskTable.tsx       ← TanStack Table with filter/sort
│   │   │   ├── TaskCard.tsx
│   │   │   ├── TaskForm.tsx        ← Create/edit modal (react-hook-form)
│   │   │   ├── TaskDetail.tsx      ← Task detail panel layout
│   │   │   ├── TaskChat.tsx        ← Supabase Realtime chat
│   │   │   ├── AuditLog.tsx        ← Immutable timeline
│   │   │   ├── StatusBadge.tsx
│   │   │   ├── StatusStepper.tsx
│   │   │   ├── PriorityBadge.tsx
│   │   │   └── TaskTypeChip.tsx
│   │   ├── hierarchy/
│   │   │   ├── OrgTree.tsx         ← dnd-kit drag tree
│   │   │   ├── RoleNode.tsx
│   │   │   └── RoleEditor.tsx
│   │   ├── dashboard/
│   │   │   ├── StatsGrid.tsx
│   │   │   ├── OverdueTable.tsx
│   │   │   ├── WorkloadChart.tsx   ← Recharts bar chart
│   │   │   └── DeadlineCalendar.tsx ← react-big-calendar
│   │   ├── compliance/
│   │   │   └── ComplianceCalendar.tsx ← Category filter + month nav
│   │   ├── attendance/
│   │   │   ├── AttendanceSheet.tsx    ← Daily P/A/H/L toggle sheet
│   │   │   └── MonthlySummary.tsx     ← Monthly counts per staff
│   │   └── providers/
│   │       └── QueryProvider.tsx      ← TanStack Query client
│   ├── db/
│   │   ├── schema.ts           ← Drizzle schema (all 11 tables + relations)
│   │   ├── index.ts            ← Exports `db` (pooler only, server-only)
│   │   ├── seed.ts             ← Firm seed data (run once)
│   │   └── rls.sql             ← Supabase RLS policies (run in SQL Editor)
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts       ← createBrowserClient (client components)
│   │   │   └── server.ts       ← createClient + createAdminClient (server only)
│   │   ├── auth/
│   │   │   ├── getUser.ts      ← getCurrentUser() with React cache()
│   │   │   └── signIn.ts       ← signInAndVerifyProfile (validates profile exists)
│   │   ├── compliance/
│   │   │   └── deadlines.ts    ← Static FY 2026-27 Indian deadlines (server-only)
│   │   ├── cron/
│   │   │   └── recurring.ts    ← generateRecurringTasks() logic (server-only)
│   │   └── utils/
│   │       ├── hierarchy.ts    ← getUserSubtree() recursive CTE
│   │       ├── permissions.ts  ← canUserAssignTo()
│   │       └── utils.ts        ← cn() class merge helper
│   ├── types/
│   │   └── index.ts            ← All Drizzle-inferred types
│   └── emails/
│       └── DailyDigest.tsx     ← React Email template
```

---

## 4. Database Schema — All 11 Tables

All tables live in the `public` schema. Connection: `DATABASE_URL` (pooler, port 6543) for the app; `DATABASE_URL_DIRECT` (port 5432) for `drizzle-kit push` only.

### `orgs`
The root tenant. Every other table has an `org_id` foreign key.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | Auto-generated |
| name | text | Display name of the firm |
| slug | text unique | URL-safe identifier |
| created_at | timestamptz | |

### `roles`
Self-referencing hierarchy tree. Recursive CTE traverses it.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| org_id | uuid FK → orgs | |
| name | text | e.g., "Partner", "Article Assistant" |
| color | text | Hex color for UI chip |
| parent_role_id | uuid nullable FK → roles | Self-reference for tree |
| sort_order | integer | Controls display order |
| created_at | timestamptz | |

### `profiles`
One row per user per org. `id` = `auth.users.id` (no FK — auth schema is outside Drizzle).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | = Supabase auth.users.id |
| org_id | uuid FK → orgs | |
| role_id | uuid nullable FK → roles | |
| full_name | text | |
| email | text | |
| avatar_url | text nullable | |
| is_active | boolean | Soft delete flag |
| is_org_admin | boolean | Admin gate for admin routes |
| created_at | timestamptz | |

### `clients`
The CA firm's client list. Every task belongs to a client.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| org_id | uuid FK → orgs | |
| name | text | |
| pan | text nullable | Permanent Account Number |
| gstin | text nullable | GST Identification Number |
| contact_email | text nullable | |
| contact_phone | text nullable | |
| is_active | boolean | Soft delete |
| created_at | timestamptz | |

### `tasks`
Core entity. Soft delete only (`is_active = false`).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| org_id | uuid FK → orgs | |
| title | text | |
| description | text nullable | |
| task_type | enum | gst/tds/income_tax/audit/roc_mca/accounting/payroll/notice/advisory/other |
| status | enum | not_started/in_progress/under_review/changes_requested/approved/filed/completed |
| priority | enum | urgent/high/medium/low |
| client_id | uuid nullable FK → clients | |
| assignee_id | uuid nullable FK → profiles | |
| creator_id | uuid FK → profiles | |
| financial_year | text nullable | e.g., "2025-26" |
| due_at | timestamptz nullable | |
| is_open_pool | boolean | If true, any org member can self-assign |
| is_active | boolean | Soft delete |
| created_at / updated_at | timestamptz | |

Indexes: `org_id`, `assignee_id`, `status`, `due_at`

### `task_access`
Permission backbone. A user sees a task if and only if they have a row here. One RLS policy covers all task visibility.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| task_id | uuid FK → tasks | |
| user_id | uuid FK → profiles | |
| access_level | enum | owner / editor / viewer |
| granted_at | timestamptz | |

Unique constraint on `(task_id, user_id)`.

### `task_messages`
Real-time chat per task. Supabase Realtime CDC subscription on this table.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| task_id | uuid FK → tasks | |
| sender_id | uuid FK → profiles | |
| content | text nullable | Text message |
| file_url | text nullable | Supabase Storage signed URL |
| file_name | text nullable | Original filename |
| created_at | timestamptz | |

### `task_audit_log`
Immutable. No UPDATE or DELETE RLS policy. Inserts only via `createAdminClient()` (service role).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| task_id | uuid FK → tasks | |
| actor_id | uuid FK → profiles | Who did it |
| action | enum | created/status_changed/reassigned/comment_added/file_uploaded/access_granted |
| old_value | text nullable | Previous state |
| new_value | text nullable | New state |
| created_at | timestamptz | |

### `recurring_templates`
Blueprint for auto-generated tasks. Cron job reads these daily.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| org_id | uuid FK → orgs | |
| title | text | Template task title |
| task_type | enum | CA task type |
| cadence | enum | monthly/quarterly/half_yearly/annually |
| default_priority | enum | |
| default_assignee_role_id | uuid nullable FK → roles | |
| default_client_id | uuid nullable FK → clients | |
| days_before_due | integer | Create task N days before deadline |
| is_active | boolean | |
| created_at | timestamptz | |

### `attendance_records`
Unique constraint on `(user_id, date)` — one record per person per day. Upsert pattern used.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| org_id | uuid FK → orgs | |
| user_id | uuid FK → profiles | |
| date | date | YYYY-MM-DD |
| status | enum | present/absent/half_day/leave |
| note | text nullable | Optional admin note |
| created_at | timestamptz | |

### `notifications`
Bell notifications. Inserted by cron and server actions via admin client. Read via SSE stream.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| org_id | uuid FK → orgs | |
| user_id | uuid FK → profiles | |
| task_id | uuid nullable FK → tasks | NULL for compliance/system notifications |
| title | text | |
| body | text nullable | |
| is_read | boolean | |
| created_at | timestamptz | |

---

## 5. Authentication & Session Flow

```
1. User visits /login
   └── Email + password form → signInAndVerifyProfile()
       ├── supabase.auth.signInWithPassword()
       └── Checks profiles table for matching id
           ├── No profile → signOut() → redirect /login?error=no_profile
           └── Profile found → session cookie set → redirect /dashboard

2. Every request hits src/proxy.ts (Next.js middleware)
   └── supabase.auth.getUser()  ← always server-verified, never spoofable
       ├── No user + protected route → redirect /login
       └── User + auth page → redirect /dashboard

3. Server Components call getCurrentUser()
   └── Wrapped in React cache() — deduped per request (one DB call max)

4. POST /auth/logout
   └── supabase.auth.signOut() → clears cookies → redirect /login
```

**Key rules:**
- `getUser()` always, never `getSession()` — getSession reads from cookie without server verification
- `cookies()` is always awaited (Next.js 15+ async API)
- `getCurrentUser()` is React `cache()` — safe to call multiple times in one render tree

---

## 6. Security Model

### Three layers (defence in depth)

**Layer 1 — Application (Drizzle queries)**
Every query in `src/actions/*` includes `eq(table.org_id, user.org_id)`. No query runs without a verified org_id from `getCurrentUser()`.

**Layer 2 — RLS (Postgres Row Level Security)**
All 11 tables have RLS enabled. Policies use four helper functions:
- `get_my_org_id()` — returns current user's org_id from profiles
- `is_org_admin()` — returns boolean
- `is_task_member(task_id)` — checks task_access without recursion
- `is_task_owner(task_id, user_id)` — checks owner access level

All helper functions use `SECURITY DEFINER SET search_path = public` to prevent search path injection.

**Layer 3 — Service Role**
`createAdminClient()` (service role key) bypasses RLS. Used only for:
- Profile creation (user onboarding)
- `task_audit_log` inserts (immutable log)
- `notifications` inserts (cron + server actions)
- `task_access` grants

**What is never done:**
- `WITH CHECK (true)` in any RLS policy
- `getSession()` in middleware
- Exposing `SUPABASE_SECRET_KEY` to the client
- `DELETE FROM` any table — soft delete only (`is_active = false`)
- `dbDirect` (direct connection) exported for app code — migrations only

---

## 7. Multi-Tenancy

Filio is multi-tenant. Each CA firm is one `org`. Data isolation is total.

- **Design principle:** `org_id` is on every table except `task_access` (which is scoped by `task_id` → `tasks.org_id`).
- **Application layer:** All server actions query with `eq(table.org_id, profile.org_id)`.
- **RLS layer:** `get_my_org_id()` is called in every policy — even if the app layer is bypassed (e.g. direct DB access), data cannot cross org boundaries.
- **Service role operations:** When admin client is used, org_id is always explicitly set from the verified session, never from client input.

---

## 8. All Pages & Routes

### Public Routes

| Route | Description |
|---|---|
| `/login` | Email + password login. Shows error messages for wrong credentials or missing profile. |
| `/auth/callback` | OAuth/magic-link callback handler |
| `/auth/logout` | POST-only. Signs out and redirects to `/login`. |

### Protected Routes (require authentication)

| Route | Access | Description |
|---|---|---|
| `/` | All users | Redirects to `/dashboard` |
| `/dashboard` | All users | Accountability dashboard: stats grid, overdue tasks, workload chart, deadline calendar |
| `/dashboard/tasks` | All users | Full task list with TanStack Table. Filter by status, type, assignee, priority. |
| `/dashboard/tasks/[id]` | Task members | Task detail: description, status stepper, assignee, due date, file uploads, chat, audit log |
| `/dashboard/tasks/pool` | All users | Open task pool — tasks with `is_open_pool = true`. Self-assign button. |
| `/dashboard/clients` | All users | Client master list. Admins can create/edit clients. |
| `/dashboard/compliance` | All users | Indian statutory compliance calendar. Category filter, month navigation, days-remaining chips. |
| `/dashboard/admin/hierarchy` | Org admin | Drag-and-drop role tree builder using dnd-kit. |
| `/dashboard/admin/users` | Org admin | User list. Invite, deactivate, change role, toggle admin. |
| `/dashboard/admin/recurring` | Org admin | Create/edit/delete recurring task templates. |
| `/dashboard/admin/attendance` | Org admin | Daily attendance sheet (P/A/H/L per staff) + monthly summary tab. |

### API Routes

| Route | Method | Description |
|---|---|---|
| `/api/notifications/stream` | GET | SSE endpoint. Sends unread notifications on connect, then heartbeat every 30s. Cleans up on client disconnect. |
| `/api/cron/recurring` | GET | Protected by `CRON_SECRET`. Generates tasks from active recurring templates. |
| `/api/cron/digest` | GET | Protected by `CRON_SECRET`. Sends daily email digest of overdue + due-today tasks. |
| `/api/cron/compliance` | GET | Protected by `CRON_SECRET`. Sends notification to org admins for compliance deadlines in next 7 days. |

---

## 9. Server Actions (Mutations)

All mutations go through `src/actions/*`. Every action is `'use server'`. All validate with Zod v4 (use `.issues`, not `.errors` — Zod v4 renamed the property).

### `tasks.ts`
- `createTask(input)` — creates task, grants owner access, writes audit log
- `updateTask(id, input)` — validates status transitions, writes audit log
- `updateTaskStatus(id, status)` — status-only update with workflow validation
- `assignTask(taskId, assigneeId)` — reassigns, grants editor access to new assignee
- `getMyTasks(filters?)` — tasks accessible to current user, supports filter by status/type/priority
- `getTaskDetail(id)` — full task with access list, audit log, message count
- `getOpenPoolTasks()` — tasks with `is_open_pool = true`
- `claimPoolTask(taskId)` — self-assigns an open pool task

### `clients.ts`
- `getClients()` — all active clients in org
- `createClient(input)` — admin only
- `updateClient(id, input)` — admin only
- `deactivateClient(id)` — soft delete, admin only

### `hierarchy.ts`
- `getRoles()` — all roles in org with parent info
- `createRole(input)` — admin only
- `updateRole(id, input)` — admin only, validates no circular parent
- `deleteRole(id)` — admin only, validates no profiles using this role
- `reorderRoles(roleIds)` — updates sort_order for drag-and-drop

### `users.ts`
- `getUsers()` — all active profiles with role
- `inviteUser(input)` — creates auth user + profile via admin client
- `updateUserRole(userId, roleId)` — admin only
- `toggleAdmin(userId)` — admin only
- `deactivateUser(userId)` — soft delete, admin only

### `dashboard.ts`
- `getDashboardStats()` — overdue count, due today, in-progress, completed this month
- `getOverdueTasks()` — tasks past due_at that are not completed
- `getWorkloadData()` — task count per assignee for workload chart
- `getUpcomingDeadlines()` — tasks due in next 30 days

### `notifications.ts`
- `getUnreadNotifications()` — latest 20 unread
- `markNotificationRead(id)` — marks single notification read
- `markAllRead()` — marks all read for current user

### `recurring.ts`
- `getTemplates()` — all recurring templates in org
- `createTemplate(input)` — admin only
- `updateTemplate(id, input)` — admin only, UUID-validated
- `deleteTemplate(id)` — soft delete, admin only, UUID-validated

### `attendance.ts`
- `getAttendanceForDate(date)` — all active staff with record for given date, admin only
- `markAttendance(input)` — upsert single record for one staff member, admin only
- `bulkMarkAttendance(input)` — upsert all records for a date (e.g. "Mark All Present"), admin only
- `getMonthlyAttendanceSummary(year, month)` — P/A/H/L counts per staff for month, admin only

---

## 10. Cron Jobs

All three crons are declared in `vercel.json` and run in Vercel's cron infrastructure. Each requires `Authorization: Bearer <CRON_SECRET>` in the request header.

| Job | Schedule | What it does |
|---|---|---|
| `/api/cron/recurring` | `0 1 * * *` (1 AM UTC daily) | Reads all active `recurring_templates`, calculates whether a task should be created based on cadence + `days_before_due`, creates tasks via admin client, grants access to the default assignee role subtree |
| `/api/cron/digest` | `0 7 * * 1-6` (7 AM UTC, Mon–Sat) | Fetches all org admins, gets their overdue + due-today tasks, sends a React Email digest via Resend |
| `/api/cron/compliance` | `0 8 * * *` (8 AM UTC daily) | Reads upcoming compliance deadlines for next 7 days from `src/lib/compliance/deadlines.ts`, sends bell notifications to all org admins (deduplicates: only one notification per deadline per org per day) |

---

## 11. Real-Time & SSE

### Task Chat (Supabase Realtime)
`src/components/tasks/TaskChat.tsx` subscribes to Supabase Realtime CDC on the `task_messages` table filtered by `task_id`. New messages appear instantly without polling. File uploads go to Supabase Storage in the `task-files` private bucket; the component requests a signed URL for display.

Cleanup: the Realtime subscription is removed in a `useEffect` cleanup function to prevent memory leaks.

### Notification Bell (SSE)
`/api/notifications/stream` is a Server-Sent Events endpoint:
1. On connect: fetches and sends all unread notifications as `data:` events
2. Every 30 seconds: sends a `heartbeat` event to keep the connection alive
3. On `request.signal` abort (tab closed / user navigates away): cleanup runs

`NotificationBell.tsx` connects with `new EventSource('/api/notifications/stream')`. On each notification event it updates the unread count badge. The popover shows the last 10 notifications with click-to-read.

---

## 12. Email System

**Provider:** Resend (`RESEND_API_KEY`)

**Template:** `src/emails/DailyDigest.tsx` — React Email component. Shows:
- Overdue tasks table (red header)
- Due today tasks table (amber header)
- Links back to Filio for each task
- Firm name from org

**Trigger:** `/api/cron/digest` runs Mon–Sat at 7 AM UTC. Sends one email per org admin. Empty digest (no overdue, no due today) is not sent.

---

## 13. Compliance Calendar

**Source:** `src/lib/compliance/deadlines.ts` — static, typed, `server-only` module.

Covers FY 2026-27 (April 2026 – March 2027):

| Category | What's included |
|---|---|
| GST | GSTR-1 (11th), GSTR-3B (20th), GSTR-2B reconciliation (14th) — monthly |
| TDS | Deposit (7th, March exception: April 30), Quarterly returns Q1–Q4 |
| Advance Tax | 4 installments: Jun 15, Sep 15, Dec 15, Mar 15 |
| Income Tax | ITR-U (individuals Jul 31), ITR Audit (Oct 31), Companies (Nov 30), Belated (Dec 31) |
| ROC/MCA | AOC-4 (Oct 29), MGT-7 (Nov 28), DIR-3 KYC (Sep 30), LLP Form 11 (May 30), Form 8 (Oct 30) |
| Payroll | PF/ESI deposit (15th), PF/ESI return (25th) — monthly |

**UI** (`ComplianceCalendar.tsx`):
- Category filter pills
- Month navigation (previous/next)
- Deadline cards with colored left border by category
- Days-remaining chip: red (≤7 days), amber (≤30 days), green (future)

**Cron alert**: `/api/cron/compliance` runs daily at 8 AM UTC and sends bell notifications for deadlines falling within the next 7 days.

---

## 14. Attendance Management

Admin-only feature accessible at `/dashboard/admin/attendance`.

**Daily tab:**
- Shows all active staff sorted by role hierarchy then name
- Four toggle buttons per row: P (Present), A (Absent), H (Half Day), L (Leave)
- Optimistic UI update — button clicks feel instant, revert on error
- "Mark All Present" button runs `bulkMarkAttendance` in one server action call
- Upsert pattern: `onConflictDoUpdate` on `(user_id, date)` — safe to click multiple times

**Monthly tab:**
- Shows P/A/H/L counts per staff for the selected month/year
- Totals row at bottom

---

## 15. Task Status Workflow

```
not_started
     │
     ▼
 in_progress  ◄────────────────────┐
     │                             │
     ▼                             │
under_review                changes_requested
     │                             ▲
     ├──────────────────────────────┘
     │
     ▼
  approved
     │
     ▼
   filed
     │
     ▼
 completed  (immutable — no further transitions)
```

- No backward transitions beyond `changes_requested → in_progress`
- Completed tasks are immutable — status cannot be changed once completed
- Transitions are enforced in `updateTaskStatus()` server action

---

## 16. CA Task Taxonomy

Every task has one `task_type`:

| Value | Display | Description |
|---|---|---|
| `gst` | GST | GST returns, reconciliation |
| `tds` | TDS | TDS deduction, deposit, returns |
| `income_tax` | Income Tax | ITR filing, assessments |
| `audit` | Audit | Statutory and internal audits |
| `roc_mca` | ROC/MCA | Company law filings |
| `accounting` | Accounting | Bookkeeping, finalization |
| `payroll` | Payroll | Salary processing, PF/ESI |
| `notice` | Notice | Income Tax / GST notices |
| `advisory` | Advisory | Tax planning, business advisory |
| `other` | Other | Anything else |

---

## 17. Role Hierarchy

Roles are a self-referencing tree (`parent_role_id`). The founding partner is at the top; article assistants are at the leaves.

Example structure:
```
Partner
└── Manager
    ├── Senior Associate
    │   └── Article Assistant
    └── Semi-Senior
        └── Article Assistant
```

**`getUserSubtree(userId)`** in `src/lib/utils/hierarchy.ts` uses a recursive CTE to return all role IDs below a given user's role. This is used when a manager creates a task — all people in their subtree are automatically granted viewer access.

**Drag-and-drop** (`OrgTree.tsx`) uses `@dnd-kit/core` + `@dnd-kit/sortable`. Roles can be re-parented by dragging. `sort_order` is updated on drop.

---

## 18. Recurring Task Engine

1. Admin creates a `recurring_templates` entry: title, task_type, cadence, default assignee role, default client, `days_before_due`
2. Every day at 1 AM UTC, `/api/cron/recurring` runs
3. For each active template, the engine calculates whether a task should be created today based on:
   - `cadence` (monthly / quarterly / half-yearly / annually)
   - `days_before_due` (how many days before the period's deadline to create the task)
4. If yes: creates the task, assigns it to the first active profile with `default_assignee_role_id`, grants access, writes audit log entry
5. Deduplication: checks if a task from this template was already created in the current period before creating a new one

---

## 19. Environment Variables

Create `.env.local` in the project root:

```env
# Supabase — from your project settings page
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...

# Service role key — NEVER expose to client, never commit to git
SUPABASE_SECRET_KEY=eyJ...

# Database connections (two different ports for two different purposes)
DATABASE_URL=postgresql://postgres.xxx:password@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
DATABASE_URL_DIRECT=postgresql://postgres.xxx:password@db.xxx.supabase.co:5432/postgres

# Email
RESEND_API_KEY=re_...

# Cron protection — any random 32+ char string
CRON_SECRET=your-random-secret-here

# App URL (used in email links)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Port explanation:**
- Port **6543** = transaction pooler → used by the app at runtime. Drizzle must have `prepare: false` for pooler compatibility.
- Port **5432** = direct connection → used only by `drizzle-kit push` for schema migrations. Never in app code.

---

## 20. Local Development Setup

### Prerequisites
- Node.js 20+
- A Supabase project (free tier works)
- A Resend account (free tier works for development)

### Steps

```bash
# 1. Clone the repo
git clone <repo-url>
cd filio

# 2. Install dependencies
npm install

# 3. Create .env.local with values from Section 19

# 4. Run the dev server
npm run dev
```

The app runs at `http://localhost:3000`. Complete the one-time manual steps in Section 21 before attempting to log in.

### Useful commands

```bash
# Push schema to Supabase (first time + after schema changes)
npx drizzle-kit push

# Seed the database with org, roles, and sample clients
npm run seed

# Type-check without building
npx tsc --noEmit

# Production build
npm run build -- --webpack
```

---

## 21. Manual Setup Steps (One-Time)

These must be done once before the app is usable. They require access to the Supabase dashboard.

### Step 1 — Push Schema
```bash
npx drizzle-kit push
```
Creates all 11 tables using `DATABASE_URL_DIRECT`.

### Step 2 — Seed the Database
Edit `src/db/seed.ts` with your firm's actual name and role structure, then:
```bash
npm run seed
```

### Step 3 — Apply RLS Policies
1. Supabase Dashboard → SQL Editor
2. Paste the full contents of `src/db/rls.sql`
3. Click Run

This enables RLS on all 11 tables and creates the 4 helper functions.

### Step 4 — Enable Realtime
Supabase Dashboard → Database → Replication → enable on:
- `task_messages`
- `notifications`
- `tasks`

### Step 5 — Create Storage Bucket
Supabase Dashboard → Storage:
1. New bucket: `task-files`
2. Set to **Private**
3. Max size: 20MB
4. Add RLS policy allowing task members to read and upload

### Step 6 — Create First User
1. Supabase Dashboard → Authentication → Users → Invite user
2. Note the user's UUID from the Users list
3. In SQL Editor:
```sql
INSERT INTO public.profiles (id, org_id, full_name, email, is_org_admin)
VALUES (
  '<user-uuid-from-auth>',
  '<org-uuid-from-seed-output>',
  'Founding Partner Name',
  'partner@yourfirm.com',
  true
);
```

### Step 7 — Configure Resend
1. Create account at resend.com
2. Add/verify your sending domain
3. Copy API key → `RESEND_API_KEY` in `.env.local`

### Step 8 — Set CRON_SECRET
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Copy output → `CRON_SECRET` in `.env.local`.

### Step 9 — Deploy to Vercel
```bash
npm i -g vercel
vercel
```
Add all environment variables in Vercel project settings. Set `NEXT_PUBLIC_APP_URL` to your production domain.

### Step 10 — Update Supabase Auth Redirect URL
Supabase Dashboard → Authentication → URL Configuration:
- Add to Redirect URLs: `https://your-vercel-domain.vercel.app/auth/callback`

---

## 22. Production Deployment (Vercel)

Push to your connected Git repo — Vercel builds and deploys automatically. The three cron jobs in `vercel.json` start running on Vercel's cron infrastructure immediately after deployment.

```json
{
  "crons": [
    { "path": "/api/cron/recurring", "schedule": "0 1 * * *" },
    { "path": "/api/cron/digest",    "schedule": "0 7 * * 1-6" },
    { "path": "/api/cron/compliance","schedule": "0 8 * * *" }
  ]
}
```

Each cron endpoint verifies `Authorization: Bearer <CRON_SECRET>` before running.

Change `NEXT_PUBLIC_APP_URL` in Vercel environment variables to your production Vercel URL so email links point to the right domain.

---

## 23. Feature Checklist

### Task Management
- [x] Create, edit, and view tasks
- [x] CA-specific task types (GST, TDS, ITR, Audit, ROC, Payroll, Notice, Advisory)
- [x] Priority levels (Urgent, High, Medium, Low)
- [x] Status workflow with validation (not_started → completed)
- [x] Visual status stepper
- [x] Open task pool with self-assignment
- [x] Financial year tagging
- [x] Task filtering by status, type, priority, assignee
- [x] File attachments (Supabase Storage, signed URLs)
- [x] Real-time chat per task (Supabase Realtime CDC)
- [x] Immutable audit log per task

### People & Access
- [x] Multi-tenant org isolation (every query scoped to org_id)
- [x] Role hierarchy (self-referencing tree, drag-and-drop)
- [x] User management (invite, deactivate, role change, toggle admin)
- [x] Task access control (owner / editor / viewer per task)
- [x] Org admin role with admin-only routes and server action guards

### Dashboard & Visibility
- [x] Stats grid (overdue, due today, in-progress, completed this month)
- [x] Overdue task table with assignee
- [x] Workload chart (Recharts, tasks per person)
- [x] Deadline calendar (react-big-calendar)

### Automation
- [x] Recurring task engine (monthly / quarterly / half-yearly / annually)
- [x] Indian statutory compliance calendar (FY 2026-27, all major deadlines)
- [x] Daily email digest (overdue + due today) via Resend
- [x] Compliance deadline notifications (7-day advance bell alert via cron)

### Attendance
- [x] Daily attendance sheet (Present / Absent / Half Day / Leave)
- [x] Bulk "Mark All Present" action
- [x] Monthly attendance summary per staff member

### Notifications
- [x] Real-time bell notifications via SSE (Server-Sent Events)
- [x] Compliance deadline alerts
- [x] Task assignment notifications

### Security
- [x] Three-layer security (application + RLS + service role)
- [x] Soft delete only (no DELETE FROM anywhere)
- [x] Immutable audit log (INSERT only via service role)
- [x] getUser() in middleware (not spoofable getSession())
- [x] server-only guard on all DB and admin modules

### Mobile & UX
- [x] Mobile-responsive from 390px (iPhone SE) upward
- [x] Mobile sidebar as slide-in overlay drawer with backdrop
- [x] 44px minimum touch targets on all interactive elements
- [x] Horizontal scroll on tables without page overflow
- [x] Stacked form fields on mobile (1-col → 2-col on sm+)
- [x] iOS Safari viewport, text-size-adjust, and input rendering fixes
- [x] Consistent container (max-w-7xl mx-auto px-4 sm:px-6 lg:px-8)

---

## 24. Roadmap

### V1.1 — Quick Wins
- [ ] Notice Management enhancement (auto-calculate response deadlines, escalation)
- [ ] Dependency tasks ("GSTR-3B cannot start until GSTR-1 is filed")
- [ ] Sub-task checklists within a task
- [ ] ICAI attendance report PDF export

### V1.2 — High Value
- [ ] Client Portal (document request → anonymous upload link → task file)
- [ ] Time Tracking (per-task timer, billable/non-billable, client monthly summary)
- [ ] Client Health Score (RAG status on client list from task overdue ratio)
- [ ] CBDT/CBIC deadline shift sync (webhook or scraper for official notifications)

### V2.0 — Platform Plays
- [ ] GST invoice generation (from time tracking data)
- [ ] WhatsApp / email-to-task bridge
- [ ] Bulk compliance actions (mark 50 clients as "GSTR-1 filed" at once)
- [ ] Advanced analytics (per-partner revenue, client mix, firm productivity)
- [ ] AI deadline assistant (flag when CBDT/CBIC moves a deadline)

### V3.0 — Moat Builders
- [ ] Multi-firm task delegation (cross-org referral workflow)
- [ ] Benchmark analytics (firm vs. peer comparison)
- [ ] AI-assisted GSTR-2B reconciliation
- [ ] ICAI articleship hours tracker + completion certificate

---

*Built with Next.js 16, Supabase, Drizzle ORM, and Tailwind CSS v4.*
*Deployed on Vercel. Database on Supabase Mumbai (ap-south-1).*
