import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

export type CurrentUser = {
  id: string;
  email: string;
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user || !user.email) return null;
  return { id: user.id, email: user.email };
});
