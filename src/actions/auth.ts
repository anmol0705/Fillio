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

  if (trimmed.includes('@')) {
    // Email path — still need to verify the account exists and is active.
    // Reject @filio.internal attempts outright (synthetic internal domain).
    if (trimmed.endsWith('@filio.internal')) {
      return { error: 'Invalid credentials. Please use your User ID instead.' };
    }

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.email, trimmed),
      columns: { email: true, is_active: true },
    });

    // Use a single generic message to avoid confirming whether an email exists.
    if (!profile || !profile.is_active) {
      return { error: 'Invalid credentials.' };
    }

    return { email: profile.email };
  }

  // user_code path — look up the synthetic email in profiles.
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.user_code, trimmed),
    columns: { email: true, is_active: true },
  });

  // Single generic message — do not distinguish "not found" from "deactivated"
  // to prevent user_code enumeration attacks.
  if (!profile || !profile.is_active) {
    return { error: 'Invalid credentials.' };
  }

  return { email: profile.email };
}
