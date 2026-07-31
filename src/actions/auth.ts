'use server';
import 'server-only';

import { db } from '@/db';
import { profiles } from '@/db/schema';
import { eq } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// resolveLoginIdentifier
// Accepts either an email address or a user_code.
// Returns the email to use for Supabase Auth signInWithPassword.
// ---------------------------------------------------------------------------

export async function resolveLoginIdentifier(
  input: string,
): Promise<{ email: string } | { error: string }> {
  const trimmed = input.trim().toLowerCase();

  // If it looks like an email, use it directly
  if (trimmed.includes('@')) {
    return { email: trimmed };
  }

  // Otherwise treat as user_code — look up the email in profiles
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.user_code, trimmed),
    columns: { email: true, is_active: true },
  });

  if (!profile) return { error: 'User ID not found. Check your user ID or use your email address.' };
  if (!profile.is_active) return { error: 'Your account has been deactivated. Contact your administrator.' };

  return { email: profile.email };
}
