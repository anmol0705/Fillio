import { createClient } from '@/lib/supabase/client';

type SignInResult =
  | { success: true }
  | { success: false; error: string };

export async function signInWithPassword(
  email: string,
  password: string
): Promise<SignInResult> {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function signInWithMagicLink(email: string): Promise<SignInResult> {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}
