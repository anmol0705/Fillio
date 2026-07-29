import { NextResponse } from 'next/server';
import { db } from '@/db';
import { sql } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({
      status: 'ok',
      db: 'connected',
      latency_ms: Date.now() - start,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: 'error',
        db: 'unreachable',
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
