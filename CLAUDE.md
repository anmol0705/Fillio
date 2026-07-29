# Filio — CA Firm Work Management System
## CLAUDE.md v1.0 | The single source of truth for every agent in this project.

---

## THE MISSION
Build Filio — a work management SaaS for CA firms in India that replaces WhatsApp chaos with structured, auditable, accountable task management. The founding partner opens one screen and knows exactly what is overdue, who owns it, and what is coming due. Nothing else matters until that sentence is true.

This is not a portfolio project. This is a real product running on a real CA firm. Every line of code must be production-grade from day one.

---

## NON-NEGOTIABLES — READ BEFORE TOUCHING ANYTHING
These rules are absolute. No exceptions. No "just this once."

1. **TypeScript strict mode everywhere.** Zero `any`. If you cannot type it, you don't understand it well enough to write it.
2. **Every DB query filters by `org_id`.** Filio is multi-tenant. A breach where Org A sees Org B's data ends the product permanently.
3. **RLS is the security layer, not the application layer.** Supabase RLS policies are the last line of defence. Application-level org_id checks are defence in depth, not the primary guard.
4. **NEVER use `WITH CHECK (true)` in RLS policies.** Ever. Profile creation and audit log inserts use createAdminClient() (service role) only.
5. **NEVER use `supabase.auth.getSession()` in middleware.** Always use `supabase.auth.getUser()` — getSession() reads from cookie without server verification and is spoofable.
6. **`cookies()` from `next/headers` is async in Next.js 15.** Always `await cookies()`. Missing this causes runtime errors that are hard to debug.
7. **Tailwind v4 — CSS-first, no config file.** Do NOT create `tailwind.config.js` or `tailwind.config.ts`. They don't exist in v4. All customisation is in CSS.
8. **shadcn imports from `@/components/ui/`.** Never from the package directly.
9. **Soft delete only.** `is_active = false`. Never `DELETE FROM`. Ever. Historical data is the product.
10. **Server Actions for mutations.** No separate REST API in v1. No tRPC overhead. Next.js 15 Server Actions with proper Zod validation.
11. **`createAdminClient()` (service role) is ONLY for admin operations in server actions.** Never in client components. Never in middleware. Never in route handlers unless explicitly privileged.
12. **task_audit_log is immutable.** Insert via admin client only. No UPDATE or DELETE policies on this table.
13. **Supabase DATABASE_URL_DIRECT (port 5432) for drizzle-kit migrations only.** App runtime uses transaction pooler (port 6543). Wrong port = "prepared statement already exists" error.

---

## TECHNOLOGY STACK
```
Frontend:      Next.js 15 (App Router, Server Components, Server Actions)
Language:      TypeScript 5.x (strict mode, no any)
Styling:       Tailwind CSS v4 (CSS-first, no config file)
Components:    shadcn/ui (latest, Neutral base)
Database:      PostgreSQL 16 via Supabase (managed, ap-south-1 Mumbai)
ORM:           Drizzle ORM (postgres-js driver, prepare:false for pooler)
Auth:          Supabase Auth (@supabase/ssr, cookie-based sessions)
Realtime:      Supabase Realtime (Postgres CDC WebSockets for chat)
Notifications: SSE via Next.js Route Handler (server-push for bell)
Storage:       Supabase Storage (RLS bucket policies, 20MB limit, signed URLs)
Email:         Resend + React Email (daily digest, task notifications)
Tables:        TanStack Table v8 (headless, filter/sort/paginate)
DnD:           @dnd-kit/core + @dnd-kit/sortable (hierarchy builder)
Charts:        Recharts (workload dashboard)
Calendar:      react-big-calendar (deadline view)
Forms:         react-hook-form + zod (all forms, typed end-to-end)
Hosting:       Vercel (frontend), Supabase (all backend services)
```

---

## PROJECT STRUCTURE
```
filio/
├── CLAUDE.md                          ← YOU ARE HERE
├── .claude/
│   └── agents/                        ← All subagent definitions
│       ├── schema-engineer.md
│       ├── auth-security-engineer.md
│       ├── backend-engineer.md
│       ├── frontend-engineer.md
│       ├── realtime-engineer.md
│       ├── security-reviewer.md
│       └── qa-engineer.md
├── drizzle.config.ts                  ← Uses DATABASE_URL_DIRECT (port 5432)
├── drizzle/                           ← Generated SQL migrations
├── src/
│   ├── app/
│   │   ├── (auth)/                    ← login, callback, logout
│   │   │   ├── login/page.tsx
│   │   │   ├── auth/callback/route.ts
│   │   │   └── auth/logout/route.ts
│   │   ├── (dashboard)/               ← all protected pages
│   │   │   ├── layout.tsx             ← auth guard + sidebar shell
│   │   │   ├── page.tsx               ← accountability dashboard
│   │   │   ├── tasks/
│   │   │   │   ├── page.tsx           ← task list
│   │   │   │   ├── [id]/page.tsx      ← task detail + chat
│   │   │   │   └── pool/page.tsx      ← open task pool
│   │   │   ├── clients/page.tsx       ← client master
│   │   │   └── admin/
│   │   │       ├── hierarchy/page.tsx ← dnd-kit org tree
│   │   │       ├── users/page.tsx     ← user management
│   │   │       └── recurring/page.tsx ← recurring templates
│   │   ├── api/
│   │   │   ├── notifications/stream/route.ts  ← SSE endpoint
│   │   │   └── cron/
│   │   │       ├── recurring/route.ts ← task generation cron
│   │   │       └── digest/route.ts    ← daily email cron
│   │   └── layout.tsx                 ← root layout, providers
│   ├── actions/                       ← ALL server actions
│   │   ├── tasks.ts
│   │   ├── clients.ts
│   │   ├── hierarchy.ts
│   │   ├── users.ts
│   │   ├── dashboard.ts
│   │   ├── notifications.ts
│   │   └── recurring.ts
│   ├── components/
│   │   ├── ui/                        ← shadcn components (auto-generated)
│   │   ├── tasks/
│   │   │   ├── TaskTable.tsx          ← TanStack Table
│   │   │   ├── TaskCard.tsx
│   │   │   ├── TaskForm.tsx           ← create/edit modal
│   │   │   ├── TaskDetail.tsx         ← right panel layout
│   │   │   ├── TaskChat.tsx           ← Supabase Realtime client
│   │   │   ├── AuditLog.tsx           ← immutable timeline
│   │   │   ├── StatusBadge.tsx
│   │   │   ├── StatusStepper.tsx
│   │   │   ├── PriorityBadge.tsx
│   │   │   └── TaskTypeChip.tsx
│   │   ├── hierarchy/
│   │   │   ├── OrgTree.tsx            ← dnd-kit drag tree
│   │   │   ├── RoleNode.tsx
│   │   │   └── RoleEditor.tsx
│   │   ├── dashboard/
│   │   │   ├── StatsGrid.tsx
│   │   │   ├── OverdueTable.tsx
│   │   │   ├── WorkloadChart.tsx
│   │   │   └── DeadlineCalendar.tsx
│   │   ├── layout/
│   │   │   ├── AppSidebar.tsx         ← shadcn Sidebar
│   │   │   ├── Header.tsx
│   │   │   └── NotificationBell.tsx   ← SSE consumer
│   │   └── providers/
│   │       └── QueryProvider.tsx      ← TanStack Query
│   ├── db/
│   │   ├── schema.ts                  ← Drizzle schema (ALL tables)
│   │   ├── index.ts                   ← db (pooler) + dbDirect exports
│   │   ├── seed.ts                    ← firm seed data
│   │   └── rls.sql                    ← RLS policies (run in Supabase)
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts              ← createBrowserClient
│   │   │   └── server.ts              ← createClient + createAdminClient
│   │   ├── auth/
│   │   │   ├── getUser.ts             ← getCurrentUser (React cache)
│   │   │   └── signIn.ts              ← signInAndVerifyProfile (client-safe)
│   │   └── utils/
│   │       ├── hierarchy.ts           ← getUserSubtree CTE
│   │       └── permissions.ts        ← canUserAssignTo
│   ├── types/
│   │   └── index.ts                   ← All inferred Drizzle types
│   ├── emails/
│   │   └── DailyDigest.tsx            ← React Email template
│   └── middleware.ts                  ← Session refresh + route protection
├── supabase/
│   └── functions/
│       ├── recurring-tasks/index.ts   ← Deno Edge Function (cron)
│       └── daily-digest/index.ts      ← Deno Edge Function (cron)
└── vercel.json                        ← Cron job config
```

---

## DATABASE — 11 TABLES
All defined in `src/db/schema.ts`. Connection: pooler (6543) for app, direct (5432) for migrations.

**Core tables:** orgs, roles, profiles, clients, tasks, task_access, task_messages, task_audit_log, recurring_templates, attendance_records, notifications

**Critical design decisions:**
- `task_access` is the permission backbone. Task visibility = user in task_access. One RLS policy covers all.
- `task_audit_log` is immutable. Inserts via admin client only. No RLS UPDATE/DELETE.
- `profiles.id` = `auth.users.id`. No FK defined in Drizzle (auth schema not in Drizzle scope).
- `roles` is self-referencing via `parent_role_id`. Recursive CTE traverses the tree.
- All enums defined as `pgEnum` in schema.ts: taskType, taskStatus, taskPriority, accessLevel, attendanceStatus, auditAction, recurringCadence

**RLS helper functions (SECURITY DEFINER SET search_path = public):**
- `get_my_org_id()` — returns current user's org_id
- `is_org_admin()` — returns boolean
- `is_task_member(task_id uuid)` — checks task_access without recursive policy
- `is_task_owner(task_id uuid, user_id uuid)` — checks owner access level

---

## AUTHENTICATION FLOW
1. User visits /login → email+password or magic link
2. signInAndVerifyProfile() checks auth + profile existence
3. If profile missing → sign out → /login?error=no_profile
4. Middleware refreshes session on every request using getUser() (not getSession())
5. Protected routes: /dashboard/* requires auth, else → /login
6. /auth/logout excluded from isAuthPage check (never redirect POST logout)
7. getCurrentUser() is React cache() — deduped per request in Server Components

---

## CA TASK TAXONOMY
GST | TDS | Income Tax | Audit | ROC/MCA | Accounting | Payroll | Notice | Advisory | Other

---

## TASK STATUS WORKFLOW
not_started → in_progress → under_review → changes_requested → in_progress (loop)
under_review → approved → filed → completed
No backward transitions beyond changes_requested → in_progress.
Completed tasks are immutable.

---

## AGENT ORCHESTRATION RULES
When spawning subagents:
- **Schema Engineer**: any changes to src/db/schema.ts or drizzle migrations
- **Auth/Security Engineer**: any changes to src/lib/supabase/*, src/middleware.ts, src/db/rls.sql, src/lib/auth/*
- **Backend Engineer**: any changes to src/actions/*, src/lib/utils/*, src/api/cron/*
- **Frontend Engineer**: any changes to src/components/*, src/app/(dashboard)/* UI
- **Realtime Engineer**: Supabase Realtime subscriptions, SSE endpoints, TaskChat component
- **Security Reviewer**: reviews ALL code before any session closes. Read-only.
- **QA Engineer**: verifies done conditions, runs build, checks TypeScript errors

**Parallel rules:**
- Schema must be applied BEFORE backend or frontend agents start
- Auth must be verified BEFORE any protected page is built
- Backend server actions must exist BEFORE frontend components that call them
- Security Reviewer and QA Engineer always run AFTER, never in parallel with builders

---

## ENVIRONMENT VARIABLES
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=   ← new 2026 format (sb_publishable_...)
SUPABASE_SECRET_KEY=                    ← service role, server only, never expose
DATABASE_URL=                           ← pooler port 6543 (app runtime)
DATABASE_URL_DIRECT=                    ← direct port 5432 (migrations only)
RESEND_API_KEY=
CRON_SECRET=                            ← protects /api/cron/* endpoints
NEXT_PUBLIC_APP_URL=
```

---

## CURRENT STATUS
**Phase: NOT STARTED**
All planning complete. SRS written. Architecture finalized. Ready to build.

Sessions to complete:
- [ ] S0: Bootstrap (human) — repo, deps, .env.local
- [ ] S1: Schema + seed — Drizzle schema, drizzle-kit push, seed data
- [ ] S2: Auth + RLS — Supabase clients, middleware, login, RLS policies
- [ ] S3: Hierarchy + Clients — dnd-kit tree, client master CRUD
- [ ] S4: Task Engine — core business logic + task UI
- [ ] S5: Realtime + Recurring — chat, file upload, cron engine
- [ ] S6: Dashboard + Notifications — accountability view, SSE bell, email digest
- [ ] S7: Deploy + Launch — Vercel, real seed data, firm onboarding

**Done when:** Every person in the CA firm has logged in and the founding partner sees real overdue tasks in red on the dashboard.

---

## REFERENCE
- Full SRS: filio-srs.docx
- Competitive landscape: ERPCA, Jamku, MyTask (Filio beats all on UX, hierarchy config, and recurring engine)
- Tagline: "Know exactly what's done, what's overdue, and who's responsible."
