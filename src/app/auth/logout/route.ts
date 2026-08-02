import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Use request.url as base so this works on any domain (local, Vercel preview, production)
  // without depending on NEXT_PUBLIC_APP_URL being set correctly.
  return NextResponse.redirect(new URL('/login', request.url));
}

// Guard against accidental GET navigation (e.g. pasting the URL in the browser)
export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/login', request.url));
}
