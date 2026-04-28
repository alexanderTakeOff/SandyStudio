// ──────────────────────────────────────────────────────────────────────────────
// app/api/concierge/chat/route.ts
// Studio Concierge streaming endpoint per agents/exec/concierge.md §3.2.
// Sprint 9 = chat-skeleton: streams OpenAI responses. No tools, no dispatch.
// Provider switched to OpenAI on 2026-04-28 — Director's account is faster.
// ──────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { Stream } from 'openai/streaming';
import type { ChatCompletionChunk } from 'openai/resources/chat/completions';
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
- Match the user's language (Russian or English).
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

  const env = getServerEnv();
  if (!env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        error:
          'OPENAI_API_KEY missing. Add it to webapp/.env.local to enable the Concierge.',
      },
      { status: 503 },
    );
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  // Default per developers.openai.com/api/docs/models — gpt-5.4-mini is the
  // recommended low-latency / low-cost frontier model.
  const model = env.OPENAI_MODEL || 'gpt-5.4-mini';

  // Tunables — all optional, defaults align with the Director's .env.local intent.
  const temperature = env.OPENAI_TEMPERATURE ? Number(env.OPENAI_TEMPERATURE) : 0.2;
  const maxCompletionTokens = env.OPENAI_MAX_OUTPUT_TOKENS
    ? Number(env.OPENAI_MAX_OUTPUT_TOKENS)
    : 2000;
  // reasoning_effort is only meaningful for reasoning-capable models
  // (gpt-5 family, o-series). Pass it; OpenAI ignores it for plain chat models.
  const reasoningEffort = env.OPENAI_REASONING_EFFORT as
    | 'minimal'
    | 'low'
    | 'medium'
    | 'high'
    | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        // Build params dynamically so we don't send unsupported keys to older models.
        const params: Parameters<typeof client.chat.completions.create>[0] = {
          model,
          stream: true,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            ...body.messages.map((m) => ({ role: m.role, content: m.content })),
          ],
          max_completion_tokens: maxCompletionTokens,
        };
        // GPT-5 family (gpt-5, gpt-5.x, gpt-5.x-mini) rejects non-default temperature;
        // only pass it for legacy chat models (gpt-4o, gpt-4.1).
        const isGpt5 = /^gpt-5(\.|-|$)/.test(model);
        if (!isGpt5 && Number.isFinite(temperature)) {
          params.temperature = temperature;
        }
        if (reasoningEffort && isGpt5) {
          (params as { reasoning_effort?: string }).reasoning_effort = reasoningEffort;
        }

        // Cast to streaming variant — TS can't narrow the union when `stream`
        // is set on a dynamically-typed params object.
        const completion = (await client.chat.completions.create(
          params,
        )) as Stream<ChatCompletionChunk>;

        for await (const chunk of completion) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) controller.enqueue(encoder.encode(delta));
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
