import { streamText, convertToCoreMessages } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { getCurrentUser } from '@/lib/auth/getUser';
import { db } from '@/db';
import { orgs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { createAiTools } from '@/lib/ai/tools';

export const dynamic = 'force-dynamic';

function systemPrompt(firmName: string) {
  return `You are the AI assistant built into Filio, a work management platform for ${firmName} CA firm.

You have live access to task data for this organisation only. You help the team:
- Check what tasks are overdue and who owns them
- Review upcoming deadlines
- See client task history (e.g. "when did we last file GST for Sharma & Co")
- Understand team workload distribution
- Create new tasks via natural language

Rules:
- Be concise. CA professionals are busy. Short answers unless detail is requested.
- Always refer to clients, tasks, and people by name, never by ID.
- Format dates as "12 Aug 2025".
- For task creation: call preview_task first, show the preview, ask "Shall I create this task?", and only call create_task after the user explicitly confirms.
- If data is unavailable or a match is ambiguous, say so — never guess.`.trim();
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const profile = await db.query.profiles.findFirst({
    where: (p, { eq }) => eq(p.id, user.id),
    columns: { org_id: true, is_org_admin: true },
  });
  if (!profile) return new Response('Unauthorized', { status: 401 });

  const org = await db.query.orgs.findFirst({
    where: (o, { eq: qe }) => qe(o.id, profile.org_id),
    columns: { name: true },
  });

  const body = await req.json() as { messages: unknown[] };

  const tools = createAiTools(profile.org_id, profile.is_org_admin, user.id);

  const result = streamText({
    model:    anthropic('claude-sonnet-4-6'),
    system:   systemPrompt(org?.name ?? 'your'),
    messages: convertToCoreMessages(body.messages as Parameters<typeof convertToCoreMessages>[0]),
    tools,
    maxSteps: 6,
  });

  return result.toDataStreamResponse();
}
