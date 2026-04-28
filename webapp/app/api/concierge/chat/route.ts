// ──────────────────────────────────────────────────────────────────────────────
// app/api/concierge/chat/route.ts
// Studio Concierge streaming endpoint per agents/exec/concierge.md §3.2.
// Sprint 9 = chat-skeleton: streams Claude responses. No tools, no dispatch.
// ──────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getServerEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
}

const SYSTEM_PROMPT = `You are SandyStudio's Studio Concierge (agent ID: EXEC-CONC).

SandyStudio is an AI-first animation studio building multi-episode comedy series. \
The user is the Director / CEO — final authority on everything.

Your job:
- Answer questions about the studio: what is happening, what is blocked, who is pending approval, budget status, recent activity.
- Be concise, calm, and production-grade. No fluff. No emojis.
- Use markdown for structure (lists, code blocks for filenames, links).
- When you don't know something, say so plainly. Never invent state.

You are a NEW agent — Sprint 9 ships a chat-skeleton only:
- You DO NOT yet have tools to read the database directly.
- You DO NOT yet have authority to trigger jobs or approve assets.
- If asked to take an action, explain that this lands in Sprint 10 and suggest the manual UI path.

System awareness:
- Current sprint: Sprint 9 (Build webapp).
- Stack: Next.js 15 + Supabase + Inngest, local-first on Director's workstation.
- Today's date: ${new Date().toISOString().slice(0, 10)}.

Hard rules:
- NEVER claim to have approved or rejected anything.
- NEVER fabricate episode codes, asset filenames, or budget numbers.
- If the user wants to change governance mode or LOCK an asset — refuse and remind them only the Director can.`;

export async function POST(req: Request) {
  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: 'messages[] required' }, { status: 400 });
  }

  const { ANTHROPIC_API_KEY } = getServerEnv();
  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          'ANTHROPIC_API_KEY missing. Add it to webapp/.env.local to enable the Concierge.',
      },
      { status: 503 },
    );
  }

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        const response = await client.messages.stream({
          // BOARD-FIN routing: Sonnet for the Concierge default per CLAUDE.md §5.
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
        });

        for await (const event of response) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        controller.enqueue(encoder.encode(`\n\n⚠️ Upstream error: ${message}`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
