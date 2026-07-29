import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getInitialNotifications } from '@/actions/notifications';

// Realtime subscription has moved to the browser (NotificationBell.tsx uses
// Supabase Realtime directly). This endpoint now serves only as a simple
// JSON fetch for the initial unread notification list — no long-lived
// streaming, no serverless duration risk.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const result = await getInitialNotifications();
  if ('error' in result) {
    return NextResponse.json({ notifications: [] });
  }
  return NextResponse.json({ notifications: result.data });
}
