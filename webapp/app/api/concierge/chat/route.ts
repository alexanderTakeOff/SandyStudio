// ──────────────────────────────────────────────────────────────────────────────
// app/api/concierge/chat/route.ts
// Studio Concierge / Prod Assistant streaming endpoint.
//
// Mode 2.5 Phase 1 (per ~/.claude/plans/valiant-soaring-karp.md, approved
// 2026-05-08):
// - Modular system prompt via lib/concierge/system-prompt-builder.ts
// - Long-term memory: turns persisted to concierge_threads / concierge_turns
//   (migration 0025) so the conversation survives reloads.
// - Backwards compatible — clients that send `messages[]` without threadId
//   still work; the server creates a thread on first call and returns its
//   id in the `X-Concierge-Thread-Id` response header.
//
// Tool-calling and Inngest dispatch land in a follow-up task within Phase 1.
// ──────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { Stream } from 'openai/streaming';
import type { ChatCompletionChunk } from 'openai/resources/chat/completions';
import { getServerEnv } from '@/lib/env';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { buildSystemPrompt } from '@/lib/concierge/system-prompt-builder';
import { createThread, getThread, persistTurn } from '@/lib/concierge/threads';
import type { ConciergeMode } from '@/lib/concierge/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  /** Optional thread to append to; when absent the server creates one. */
  threadId?: string;
  /** Active governance mode. Defaults to '1' (MANUAL). */
  mode?: ConciergeMode;
  /** Optional episode scope for pipeline-aware prompting. */
  episodeId?: string | null;
  /** Optional next pipeline gate hint, e.g. 'BRIEF', 'STB_ACT1'. */
  nextGate?: string | null;
}

const VALID_MODES: ReadonlyArray<ConciergeMode> = ['1', '2', '2.5', '3', '4'];

function normaliseMode(value: unknown): ConciergeMode {
  if (typeof value !== 'string') return '1';
  return (VALID_MODES as ReadonlyArray<string>).includes(value)
    ? (value as ConciergeMode)
    : '1';
}

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
          'OPENAI_API_KEY missing. Add it to webapp/.env.local to enable the Prod Assistant.',
      },
      { status: 503 },
    );
  }

  const mode = normaliseMode(body.mode);
  const episodeId = body.episodeId ?? null;
  const nextGate = body.nextGate ?? null;
  const lastUserMessage = body.messages[body.messages.length - 1];
  if (lastUserMessage.role !== 'user' || !lastUserMessage.content.trim()) {
    return NextResponse.json(
      { error: 'last message must be a non-empty user message' },
      { status: 400 },
    );
  }

  // Persistence is best-effort: if Supabase is unreachable the chat must still
  // work (graceful degradation). We capture the thread id even when writes
  // fail so the UI keeps a stable session anchor.
  const supabase = await createSupabaseServerClient();
  let threadId: string | null = body.threadId ?? null;
  let persistenceError: string | null = null;

  try {
    if (!threadId) {
      const thread = await createThread(supabase, {
        episodeId,
        activeMode: mode,
        activeGate: nextGate,
      });
      threadId = thread.id;
    } else {
      const existing = await getThread(supabase, threadId);
      if (!existing) {
        // Stale id from sessionStorage — start a new thread instead of failing.
        const thread = await createThread(supabase, {
          episodeId,
          activeMode: mode,
          activeGate: nextGate,
        });
        threadId = thread.id;
      }
    }
  } catch (err) {
    persistenceError = err instanceof Error ? err.message : 'unknown persistence error';
  }

  // Persist Director's incoming message before we kick off the LLM. If it
  // fails we proceed with the chat — only memory is degraded.
  if (threadId && !persistenceError) {
    try {
      await persistTurn(supabase, threadId, {
        role: 'director',
        event_type: 'message',
        content: lastUserMessage.content,
      });
    } catch (err) {
      persistenceError = err instanceof Error ? err.message : 'persist incoming failed';
    }
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  // Default per developers.openai.com/api/docs/models — gpt-5.4-mini is the
  // recommended low-latency / low-cost frontier model.
  const model = env.OPENAI_MODEL || 'gpt-5.4-mini';
  const temperature = env.OPENAI_TEMPERATURE ? Number(env.OPENAI_TEMPERATURE) : 0.2;
  const maxCompletionTokens = env.OPENAI_MAX_OUTPUT_TOKENS
    ? Number(env.OPENAI_MAX_OUTPUT_TOKENS)
    : 2000;
  const reasoningEffort = env.OPENAI_REASONING_EFFORT as
    | 'minimal'
    | 'low'
    | 'medium'
    | 'high'
    | undefined;

  const systemPrompt = buildSystemPrompt({
    today: new Date().toISOString().slice(0, 10),
    mode,
    episodeId,
    nextGate,
  });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let assistantBuffer = '';
      try {
        const params: Parameters<typeof client.chat.completions.create>[0] = {
          model,
          stream: true,
          messages: [
            { role: 'system', content: systemPrompt },
            ...body.messages.map((m) => ({ role: m.role, content: m.content })),
          ],
          max_completion_tokens: maxCompletionTokens,
        };
        const isGpt5 = /^gpt-5(\.|-|$)/.test(model);
        if (!isGpt5 && Number.isFinite(temperature)) {
          params.temperature = temperature;
        }
        if (reasoningEffort && isGpt5) {
          (params as { reasoning_effort?: string }).reasoning_effort = reasoningEffort;
        }

        const completion = (await client.chat.completions.create(
          params,
        )) as Stream<ChatCompletionChunk>;

        for await (const chunk of completion) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            assistantBuffer += delta;
            controller.enqueue(encoder.encode(delta));
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        const errLine = `\n\n⚠️ Upstream error: ${message}`;
        assistantBuffer += errLine;
        controller.enqueue(encoder.encode(errLine));
      } finally {
        controller.close();
        // Persist the assistant turn after the stream closes so we capture
        // the full reply. Best-effort — never throw inside the closer.
        if (threadId && assistantBuffer.trim() !== '') {
          try {
            await persistTurn(supabase, threadId, {
              role: 'assistant',
              event_type: 'message',
              content: assistantBuffer,
              metadata: { model },
            });
          } catch {
            // Already in finally — swallow secondary persistence failures.
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      ...(threadId ? { 'X-Concierge-Thread-Id': threadId } : {}),
      ...(persistenceError
        ? { 'X-Concierge-Persistence-Warning': persistenceError.slice(0, 200) }
        : {}),
    },
  });
}
