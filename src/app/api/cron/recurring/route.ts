import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { generateTasksFromTemplates } from '@/lib/cron/recurring';

// Run on Node.js runtime — needs DB access and admin Supabase client
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  // Guard: reject requests without valid CRON_SECRET
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cronStart = Date.now();
  console.log(JSON.stringify({ level: 'info', cron: 'recurring', event: 'start', ts: new Date().toISOString() }));

  try {
    const count = await generateTasksFromTemplates();

    console.log(JSON.stringify({
      level: 'info',
      cron: 'recurring',
      event: 'complete',
      tasksCreated: count,
      duration_ms: Date.now() - cronStart,
      ts: new Date().toISOString(),
    }));

    // Healthchecks.io dead-man's-switch ping (optional — set HC_PING_RECURRING_URL in env)
    const pingUrl = process.env.HC_PING_RECURRING_URL;
    if (pingUrl) {
      fetch(pingUrl).catch(() => {}); // fire-and-forget, never block the response
    }

    return NextResponse.json({ success: true, tasksCreated: count });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      cron: 'recurring',
      err: error instanceof Error ? error.message : String(error),
      ts: new Date().toISOString(),
    }));
    const message =
      error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
