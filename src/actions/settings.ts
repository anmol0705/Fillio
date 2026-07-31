'use server';
import 'server-only';

import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getUser';
import { createAdminClient, createClient } from '@/lib/supabase/server';

const ChangePasswordSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
  new_password:     z.string().min(8, 'New password must be at least 8 characters'),
});

// ---------------------------------------------------------------------------
// changePassword
// Re-authenticates with the current password server-side (so the synthetic
// @filio.internal email never crosses the browser network), then updates.
// ---------------------------------------------------------------------------

export async function changePassword(raw: unknown): Promise<{ error: string | null }> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated.' };

  const parsed = ChangePasswordSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const { current_password, new_password } = parsed.data;

  // Fetch the email from the admin client — never sent to the browser
  const admin = createAdminClient();
  const { data: authUser, error: fetchError } = await admin.auth.admin.getUserById(user.id);
  if (fetchError || !authUser?.user?.email) return { error: 'Could not verify identity.' };

  const email = authUser.user.email;

  // Re-authenticate with the current password to verify ownership
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: current_password,
  });

  if (signInError) return { error: 'Current password is incorrect.' };

  // Update password via admin client (session already fresh from signIn above)
  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
    password: new_password,
  });

  if (updateError) return { error: updateError.message };

  return { error: null };
}
