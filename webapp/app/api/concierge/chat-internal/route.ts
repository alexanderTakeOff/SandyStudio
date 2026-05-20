// ──────────────────────────────────────────────────────────────────────────────
// app/api/concierge/chat-internal/route.ts
// TD-20.B autonomy 2026-05-20 — Polina auto-reaction endpoint.
//
// Called server-to-server by the `exec-pa-react` Inngest function when a
// non-Director turn (ambient pipeline event or claude_message from Тео)
// lands in a concierge_thread and Polina should react without waiting on
// Director input.
//
// Differs from /api/concierge/chat:
//   - No Director message in the body — invocation is triggered, not typed.
//   - No tool dispatch — auto-react is reflective only. PA can describe
//     what just happened and announce intent, but cannot fire destructive
//     tools without Director's verbal approval (which she does not have).
//   - No streaming — caller is Inngest, not a browser. Result is a single
//     persisted assistant turn that Realtime broadcasts to the UI.
//   - Anti-cascade guard: if the last turn in the thread is already an
//     assistant turn newer than ANTI_CASCADE_WINDOW_MS, skip — avoids PA
//     replying to her own freshly-published reaction.
//
// AUTH: Bearer token in `PA_INTERNAL_TOKEN`. The Inngest function holds
// the same env var; distinct from TEAM_CHAT_TOKEN so we can revoke either
// channel independently.
// ──────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import { z } from 'zod';
import { getServerEnv } from '@/lib/env';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { buildSystemPrompt } from '@/lib/concierge/system-prompt-builder';
import { getThread, loadRecentTurns, persistTurn } from '@/lib/concierge/threads';
import { resolveSkillsContext } from '@/lib/concierge/build-context';
import type { ConciergeMode } from '@/lib/concierge/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ANTI_CASCADE_WINDOW_MS = 10_000;
const RECENT_TURN_WINDOW = 80;

const Body = z.object({
  thread_id: z.string().uuid(),
  source: z.enum(['ambient', 'claude_message']),
  trigger_id: z.string().min(1),
  event_type: z.string().optional(),
});

function getAuthToken(req: Request): string | null {
  const h = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

export async function POST(req: Request) {
  const expected = process.env.PA_INTERNAL_TOKEN?.trim();
  if (!expected) {
    return NextResponse.json(
      { error: 'PA_INTERNAL_TOKEN env var is not configured' },
      { status: 503 },
    );
  }
  const presented = getAuthToken(req);
  if (!presented || presented !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 400 },
    );
  }

  const env = getServerEnv();
  if (!env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY missing' }, { status: 503 });
  }

  const supabase = createSupabaseServiceRoleClient();

  // Verify the thread exists and is open before doing any expensive work.
  const thread = await getThread(supabase, parsed.thread_id);
  if (!thread) {
    return NextResponse.json({ skipped: 'thread_not_found' }, { status: 200 });
  }
  if (thread.ended_at) {
    return NextResponse.json({ skipped: 'thread_ended' }, { status: 200 });
  }

  const recentTurns = await loadRecentTurns(supabase, parsed.thread_id, RECENT_TURN_WINDOW);

  // Anti-cascade guard: if the last turn is already an assistant turn newer
  // than ANTI_CASCADE_WINDOW_MS, PA just spoke — don't pile on. This
  // protects against tool-fired-event-fired-PA-fired-tool storms.
  const lastTurn = recentTurns[recentTurns.length - 1];
  if (lastTurn && lastTurn.role === 'assistant') {
    const lastTs = new Date(lastTurn.created_at).getTime();
    if (Number.isFinite(lastTs) && Date.now() - lastTs < ANTI_CASCADE_WINDOW_MS) {
      return NextResponse.json({ skipped: 'recent_assistant_turn' }, { status: 200 });
    }
  }

  const mode: ConciergeMode = (thread.active_mode as ConciergeMode | null) ?? '1';
  const episodeId: string | null = thread.episode_id ?? null;
  const nextGate: string | null = thread.active_gate ?? null;
  const today = new Date().toISOString().slice(0, 10);

  const { availablePlaybooks } = await resolveSkillsContext(supabase, episodeId);

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
  const isGpt5 = /^gpt-5(\.|-|$)/.test(model);

  const systemPrompt = buildSystemPrompt({
    today,
    mode,
    episodeId,
    nextGate,
    recentTurns,
    modelId: model,
    availablePlaybooks,
    autoReact: true,
  });

  // Synthetic user message that names what triggered the reaction. Anchors
  // the model's attention since pure system-prompt-only calls can be hit
  // and miss with gpt-5.* on long threads.
  const triggerLabel =
    parsed.source === 'ambient'
      ? `[autonomous trigger] pipeline event ${parsed.event_type ?? 'unknown'} (activity_event ${parsed.trigger_id})`
      : `[autonomous trigger] team-chat message from Тео (turn ${parsed.trigger_id})`;
  const conversation: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content:
        `${triggerLabel}\n\n` +
        'Recap what just happened in this thread (read the recent turns above) and decide whether to act now or wait for Director. Keep the response short. Do not request tools.',
    },
  ];

  const params: ChatCompletionCreateParamsNonStreaming = {
    model,
    messages: conversation,
    max_completion_tokens: maxCompletionTokens,
    stream: false,
  };
  if (!isGpt5 && Number.isFinite(temperature)) {
    params.temperature = temperature;
  }
  if (reasoningEffort && isGpt5) {
    (params as { reasoning_effort?: string }).reasoning_effort = reasoningEffort;
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  let assistantText = '';
  try {
    const completion = await client.chat.completions.create(params);
    if (Symbol.asyncIterator in (completion as object)) {
      throw new Error('expected non-streaming completion');
    }
    const msg = (completion as { choices: Array<{ message: { content?: string | null } }> }).choices[0]?.message;
    assistantText = (msg?.content ?? '').trim();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown OpenAI error';
    return NextResponse.json({ error: 'openai_failed', detail: message }, { status: 502 });
  }

  if (!assistantText) {
    return NextResponse.json({ skipped: 'empty_response' }, { status: 200 });
  }

  await persistTurn(supabase, parsed.thread_id, {
    role: 'assistant',
    event_type: 'message',
    content: assistantText,
    metadata: {
      auto_react: true,
      source: parsed.source,
      trigger_id: parsed.trigger_id,
      event_type: parsed.event_type ?? null,
    },
  });

  return NextResponse.json({
    ok: true,
    thread_id: parsed.thread_id,
    chars: assistantText.length,
  });
}
