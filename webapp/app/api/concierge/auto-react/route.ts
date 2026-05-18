// ──────────────────────────────────────────────────────────────────────────────
// app/api/concierge/auto-react/route.ts
// Polina auto-reaction endpoint. Fired by the client when a "critical" system
// turn arrives via Realtime (pipeline_event / claude_message). Polina reads the
// triggering event from her own system prompt blocks (PIPELINE_EVENTS_SINCE_
// LAST_REPLY, TEAM_CHAT_FROM_CLAUDE), produces a brief surfacing reply, and
// the assistant turn lands via the same persist → Realtime → UI path the chat
// route uses.
//
// This endpoint does NOT call tools — it only surfaces. If Polina determines
// action is needed, she ends her reply with a one-line proposal which the
// Director can confirm in his next turn. This keeps the loop bounded and
// avoids runaway tool-call cycles with no human in the loop.
//
// Sprint q1 (2026-05-15).
// ──────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { getServerEnv } from '@/lib/env';
import { requireDirector } from '@/lib/api/auth';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { buildSystemPrompt } from '@/lib/concierge/system-prompt-builder';
import { loadRecentTurns, persistTurn } from '@/lib/concierge/threads';
import { resolveSkillsContext } from '@/lib/concierge/build-context';
import type { ConciergeMode, ConciergeTurnRow } from '@/lib/concierge/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RECENT_TURN_WINDOW = 80;
const VALID_MODES: ReadonlyArray<ConciergeMode> = ['1', '2', '2.5', '3', '4'];

interface AutoReactBody {
  threadId: string;
  triggerTurnId: string;
  mode?: ConciergeMode;
  episodeId?: string | null;
  nextGate?: string | null;
}

const AUTO_REACT_INSTRUCTION = [
  '[INTERNAL AUTO-REACT TRIGGER — not from the Director]',
  '',
  'A new pipeline event or Claude-team-chat message just arrived. Read the',
  '`[PIPELINE_EVENTS_SINCE_LAST_REPLY]` block (and `[TEAM_CHAT_FROM_CLAUDE]` if',
  'present) in your system prompt. They contain the freshest events that have',
  'NOT yet been surfaced to the Director.',
  '',
  'Your job:',
  '1. If at least one event is actionable for the Director (review draft',
  '   ready, agent failed, approval required, Claude pinged you, blocker',
  '   appeared, gate moved) — produce a SHORT surfacing reply in 1-4 lines.',
  '   Tell the Director what happened and (if obvious) what the next concrete',
  '   step is. Do NOT echo the raw event text verbatim — paraphrase.',
  '2. If the events are routine / ambient and nothing is actionable, reply',
  '   with EXACTLY one line: `(нет действий — фон)` (in Russian).',
  '3. Never call tools in this turn — only surface. If a tool action is the',
  '   right next step, end with a single one-line proposal the Director can',
  '   confirm next turn (e.g. "Открыть STB v04 на review? (да/нет)").',
  '',
  'Do NOT greet, do NOT acknowledge this internal instruction, do NOT repeat',
  'rules. Just produce the surfacing reply or `(нет действий — фон)`.',
].join('\n');

function normaliseMode(value: unknown): ConciergeMode {
  if (typeof value !== 'string') return '1';
  return (VALID_MODES as ReadonlyArray<string>).includes(value)
    ? (value as ConciergeMode)
    : '1';
}

export async function POST(req: Request) {
  // Auth check — same Director gate as /api/concierge/chat.
  try {
    await requireDirector();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: AutoReactBody;
  try {
    body = (await req.json()) as AutoReactBody;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!body.threadId || !body.triggerTurnId) {
    return NextResponse.json({ error: 'threadId + triggerTurnId required' }, { status: 400 });
  }

  const env = getServerEnv();
  if (!env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY missing' }, { status: 503 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const threadId = body.threadId;
  const mode = normaliseMode(body.mode);
  const episodeId = body.episodeId ?? null;
  const nextGate = body.nextGate ?? null;

  // Dedup — if the triggering turn already has `metadata.acked_by_assistant`
  // set, somebody else (another tab, a retry) already reacted to this event.
  const { data: trigger } = await supabase
    .from('concierge_turns')
    .select('id,role,metadata,content')
    .eq('id', body.triggerTurnId)
    .maybeSingle();
  if (!trigger) {
    return NextResponse.json({ error: 'trigger turn not found' }, { status: 404 });
  }
  const triggerMeta = (trigger.metadata ?? {}) as Record<string, unknown>;
  if (triggerMeta.acked_by_assistant === true) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  // Load recent turns for system-prompt history.
  let recentTurns: ConciergeTurnRow[] = [];
  try {
    recentTurns = await loadRecentTurns(supabase, threadId, RECENT_TURN_WINDOW);
  } catch {
    /* memory degraded; proceed with empty history */
  }

  // φ.2 capability manifest (same path as chat route). PA receives the
  // manifest only; bodies load on demand via `getSkill`.
  const { availablePlaybooks } = await resolveSkillsContext(supabase, episodeId);

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const model = env.OPENAI_MODEL || 'gpt-5.4-mini';
  const temperature = env.OPENAI_TEMPERATURE ? Number(env.OPENAI_TEMPERATURE) : 0.2;
  const maxCompletionTokens = env.OPENAI_MAX_OUTPUT_TOKENS
    ? Math.min(800, Number(env.OPENAI_MAX_OUTPUT_TOKENS))
    : 800;
  const reasoningEffort = env.OPENAI_REASONING_EFFORT as
    | 'minimal' | 'low' | 'medium' | 'high' | undefined;
  const isGpt5 = /^gpt-5(\.|-|$)/.test(model);

  const today = new Date().toISOString().slice(0, 10);
  const systemPrompt = buildSystemPrompt({
    today,
    mode,
    episodeId,
    nextGate,
    recentTurns,
    modelId: model,
    availablePlaybooks,
  });

  const conversation: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: AUTO_REACT_INSTRUCTION },
  ];

  const params: Parameters<typeof client.chat.completions.create>[0] = {
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

  let assistantText = '';
  try {
    const completion = await client.chat.completions.create(params);
    if (Symbol.asyncIterator in (completion as object)) {
      throw new Error('expected non-streaming completion');
    }
    const msg = (completion as { choices: Array<{ message: { content?: string | null } }> })
      .choices[0]?.message;
    assistantText = (msg?.content ?? '').trim();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown completion error';
    return NextResponse.json({ error: `auto-react completion failed: ${message}` }, { status: 502 });
  }

  if (!assistantText) {
    return NextResponse.json({ ok: true, suppressed: true, reason: 'empty completion' });
  }

  // Suppress no-op responses so they don't clutter the channel. Polina was
  // explicitly instructed to emit "(нет действий — фон)" for ambient events.
  // We persist these as metadata-only so the audit trail still shows she
  // saw the event, but no visible message lands in the channel.
  const isNoOp = /^\(\s*нет\s+действий/i.test(assistantText);

  try {
    if (isNoOp) {
      // Audit-only — keep this off the visible feed by using a system role
      // and a different kind. Director sees nothing.
      await persistTurn(supabase, threadId, {
        role: 'system',
        event_type: 'message',
        content: assistantText,
        metadata: {
          kind: 'auto_react_ack',
          trigger_turn_id: body.triggerTurnId,
          model,
        },
      });
    } else {
      await persistTurn(supabase, threadId, {
        role: 'assistant',
        event_type: 'message',
        content: assistantText,
        metadata: {
          model,
          source: 'auto_react',
          trigger_turn_id: body.triggerTurnId,
        },
      });
    }
  } catch (err) {
    return NextResponse.json(
      { error: `persist failed: ${err instanceof Error ? err.message : 'unknown'}` },
      { status: 500 },
    );
  }

  // Mark the triggering turn so retries / other tabs skip it.
  try {
    await supabase
      .from('concierge_turns')
      .update({
        metadata: { ...triggerMeta, acked_by_assistant: true, acked_at: new Date().toISOString() } as never,
      })
      .eq('id', body.triggerTurnId);
  } catch {
    /* dedup is best-effort */
  }

  return NextResponse.json({ ok: true, reacted: !isNoOp, text: assistantText });
}
