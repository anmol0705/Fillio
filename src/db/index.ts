import '@/lib/env';
import 'server-only';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Pooler (port 6543) — app runtime. prepare:false required for PgBouncer.
// DATABASE_URL must be the Supabase transaction pooler connection string.
// NOTE: Drizzle queries run as the DATABASE_URL Postgres role and bypass
// Supabase RLS. All queries must explicitly filter by org_id. RLS provides
// defence-in-depth for direct Supabase client calls only.
const poolerClient = postgres(process.env.DATABASE_URL!, { prepare: false });
export const db = drizzle(poolerClient, { schema });

// dbDirect (port 5432) is only used by drizzle-kit migrations and src/db/seed.ts.
// It is NOT exported here to prevent accidental use in app runtime code.
// Import it directly in migration scripts: import postgres from 'postgres'; ...
