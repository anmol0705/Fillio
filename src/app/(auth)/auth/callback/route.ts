import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Verify profile exists — no profile means the user was never onboarded
      const admin = createAdminClient();
      const { data: profile } = await admin
        .from('profiles')
        .select('id')
        .eq('id', data.user.id)
        .single();

      if (!profile) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?error=no_profile`);
      }

      return NextResponse.redirect(`${origin}/dashboard`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_error`);
}
