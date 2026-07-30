import 'server-only';

const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'DATABASE_URL',
  'CRON_SECRET',
  'NEXT_PUBLIC_APP_URL',
] as const;

// Skip at build time — vars are only needed at runtime.
// NEXT_PHASE is set to 'phase-production-build' during `next build`.
if (process.env.NEXT_PHASE !== 'phase-production-build') {
  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      throw new Error(
        `[Filio] Missing required environment variable: ${key}\n` +
        `Add it to .env.local for development or Vercel environment variables for production.`
      );
    }
  }
}

export {};
