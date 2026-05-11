// ──────────────────────────────────────────────────────────────────────────────
// app/api/concierge/chat/route.ts
// Studio Concierge / Prod Assistant streaming endpoint.
//
// Mode 2.5 Phase 1 (per ~/.claude/plans/valiant-soaring-karp.md, approved
// 2026-05-08):
// - Modular system prompt via lib/concierge/system-prompt-builder.ts
// - Long-term memory via concierge_threads / concierge_turns (migration 0025).
// - OpenAI function calling (Phase 1-B 2026-05-11): tools registered in
//   lib/concierge/tools/* let the assistant read studio state and trigger
//   actions on the Director's verbal approval. Tool calls and their results
//   are persisted as `tool_call` / `tool_result` turns.
//
// Backwards compatible — clients that send `messages[]` without threadId
// still work; the server creates a thread and returns id in the
// `X-Concierge-Thread-Id` response header.
// ──────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from 'openai/resources/chat/completions';
import { getServerEnv, PUBLIC_ENV } from '@/lib/env';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import path from 'node:path';
import { buildSystemPrompt } from '@/lib/concierge/system-prompt-builder';
import { createThread, getThread, loadRecentTurns, persistTurn } from '@/lib/concierge/threads';
import { findTool, openaiSchemas } from '@/lib/concierge/tools';
import type { ToolContext, ToolResult } from '@/lib/concierge/tools';
import type { ConciergeMode, ConciergeTurnRow } from '@/lib/concierge/types';
import {
  captureFeedback,
  captureSimple,
  detectToggle,
  parseMarker,
  readCaptureState,
  stripToggleMarkers,
} from '@/lib/concierge/feedback-capture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  threadId?: string;
  mode?: ConciergeMode;
  episodeId?: string | null;
  nextGate?: string | null;
}

const VALID_MODES: ReadonlyArray<ConciergeMode> = ['1', '2', '2.5', '3', '4'];
const MAX_TOOL_ROUNDS = 5;
const RECENT_TURN_WINDOW = 20;

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

  // Service-role client: chat route is gated by middleware auth (Director-only).
  // For mutating tools we forward the Director's cookies to existing API routes
  // so requireDirector() still applies and audit attribution is preserved.
  const supabase = createSupabaseServiceRoleClient();
  const cookieHeader = req.headers.get('cookie');
  const appOrigin = PUBLIC_ENV.APP_URL || 'http://localhost:3000';

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

  // Director-side feedback markers — captured BEFORE the LLM sees the
  // message so we always log even if generation fails downstream. The full
  // message still goes to the LLM so PA can acknowledge it naturally.
  //
  // Marker types:
  //   1. !fb [N] / !todo [N]   — bundle last N turns + optional note
  //   2. ===PAON=== / ===PAOFF=== — toggle ambient capture for this thread
  //   3. Any message while ambient capture is ON     — logged as one-liner
  const marker = parseMarker(lastUserMessage.content);
  const toggle = detectToggle(lastUserMessage.content);
  const worktreeRoot = path.resolve(process.cwd(), '..');

  // Resolve incoming capture state from history BEFORE we persist this
  // turn (otherwise we'd see ourselves).
  let captureActive = false;
  if (threadId) {
    try {
      captureActive = await readCaptureState(supabase, threadId);
    } catch {
      /* default false */
    }
  }
  // Apply this message's toggles.
  if (toggle === 'on') captureActive = true;
  if (toggle === 'off') captureActive = false;

  // Anything captured-ish gets event_type='feedback' for indexing.
  const isCapturedTurn =
    Boolean(marker) || toggle !== null || captureActive;

  let captureLogPath: string | null = null;
  let captureTurnCount = 0;

  // Persist Director's incoming message.
  if (threadId && !persistenceError) {
    try {
      const metadata = marker
        ? { marker: marker.kind, window_size: marker.windowSize, note: marker.note }
        : toggle
          ? { marker: toggle === 'on' ? 'paon' : 'paoff' }
          : captureActive
            ? { marker: 'ambient', via_toggle: true }
            : undefined;
      await persistTurn(supabase, threadId, {
        role: 'director',
        event_type: isCapturedTurn ? 'feedback' : 'message',
        content: lastUserMessage.content,
        metadata,
      });
    } catch (err) {
      persistenceError = err instanceof Error ? err.message : 'persist incoming failed';
    }
  }

  // Marker-driven bundle capture (with window of prior turns).
  if (marker && threadId) {
    try {
      const res = await captureFeedback({
        marker,
        threadId,
        episodeId,
        supabase,
        worktreeRoot,
      });
      if (res.ok) {
        captureLogPath = res.logPath;
        captureTurnCount = res.turnCount;
      }
    } catch { /* best-effort */ }
  }

  // Toggle events themselves — single-line log entry.
  if (toggle && threadId) {
    try {
      const cleaned = stripToggleMarkers(lastUserMessage.content);
      const res = await captureSimple({
        kind: toggle === 'on' ? 'paon' : 'paoff',
        content: cleaned
          ? `(toggle ${toggle.toUpperCase()}) ${cleaned}`
          : `(toggle ${toggle.toUpperCase()})`,
        threadId,
        episodeId,
        worktreeRoot,
      });
      if (res.ok && !captureLogPath) captureLogPath = res.logPath;
    } catch { /* best-effort */ }
  }

  // Ambient capture — messages that aren't markers or toggles but landed
  // while ===PAON=== is active. Skip if a marker already handled this turn.
  if (!marker && !toggle && captureActive && threadId) {
    try {
      const res = await captureSimple({
        kind: 'ambient',
        content: lastUserMessage.content,
        threadId,
        episodeId,
        worktreeRoot,
      });
      if (res.ok && !captureLogPath) {
        captureLogPath = res.logPath;
        captureTurnCount = 1;
      }
    } catch { /* best-effort */ }
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
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
    today: new Date().toISOString().slice(0, 10),
    mode,
    episodeId,
    nextGate,
  });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let assistantBuffer = '';
      const writeToClient = (text: string) => {
        if (!text) return;
        assistantBuffer += text;
        controller.enqueue(encoder.encode(text));
      };
      try {
        const conversation: ChatCompletionMessageParam[] = [
          { role: 'system', content: systemPrompt },
          ...body.messages.map<ChatCompletionMessageParam>((m) => ({
            role: m.role,
            content: m.content,
          })),
        ];

        // Tool-call loop. Each round: ask the model. If it emits tool_calls,
        // execute them, persist `tool_call` + `tool_result` turns, append
        // to conversation, repeat. Otherwise stream the final text and exit.
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const isLastRound = round === MAX_TOOL_ROUNDS - 1;

          // Refresh recent turns each round so verbal-approval detection
          // sees the latest director utterance even if it landed mid-loop.
          let recentTurns: ConciergeTurnRow[] = [];
          if (threadId) {
            try {
              recentTurns = await loadRecentTurns(supabase, threadId, RECENT_TURN_WINDOW);
            } catch {
              /* memory degradation already surfaced via header */
            }
          }
          const toolCtx: ToolContext = {
            supabase,
            threadId: threadId ?? '',
            mode,
            episodeId,
            cookieHeader,
            appOrigin,
            recentTurns,
          };

          const toolsThisRound = isLastRound ? undefined : [...openaiSchemas];
          const params: Parameters<typeof client.chat.completions.create>[0] = {
            model,
            messages: conversation,
            max_completion_tokens: maxCompletionTokens,
            // Disable tools on the very last round so the model is forced
            // to produce a final natural-language answer.
            tools: toolsThisRound,
            tool_choice: toolsThisRound ? 'auto' : undefined,
            stream: false,
          };
          if (!isGpt5 && Number.isFinite(temperature)) {
            params.temperature = temperature;
          }
          // OpenAI 400: gpt-5* in /v1/chat/completions rejects the combination
          // of `tools` + `reasoning_effort`. Only pass reasoning_effort on the
          // final (tools-disabled) round so the model still reasons over the
          // collected tool results without breaking the tool-call rounds.
          if (reasoningEffort && isGpt5 && !toolsThisRound) {
            (params as { reasoning_effort?: string }).reasoning_effort = reasoningEffort;
          }

          const completion = await client.chat.completions.create(params);
          // `stream: false` so the response is a single completion object,
          // not an async iterable — narrow the type accordingly.
          if (Symbol.asyncIterator in (completion as object)) {
            throw new Error('expected non-streaming completion');
          }
          const msg = (completion as { choices: Array<{ message: ChatCompletionAssistantMessageParam }> })
            .choices[0]?.message;
          if (!msg) {
            writeToClient('\n\n⚠️ Empty response from model.');
            break;
          }

          const toolCalls = msg.tool_calls ?? [];

          if (toolCalls.length === 0) {
            // Final answer — emit text to client and exit.
            const text = typeof msg.content === 'string' ? msg.content : '';
            writeToClient(text);
            break;
          }

          // Persist the assistant's intermediate tool-call turn for audit.
          if (threadId) {
            try {
              await persistTurn(supabase, threadId, {
                role: 'assistant',
                event_type: 'tool_call',
                content: summariseToolCalls(toolCalls),
                metadata: {
                  model,
                  tool_calls: toolCalls.map((c) => ({
                    id: c.id,
                    name: c.function.name,
                    arguments: c.function.arguments,
                  })),
                },
              });
            } catch {
              /* swallow audit failures */
            }
          }

          // Add the assistant message with tool_calls to the conversation
          // (OpenAI requires the model's full assistant message before its
          // matching tool result messages).
          conversation.push({
            role: 'assistant',
            content: msg.content ?? null,
            tool_calls: toolCalls,
          });

          // Execute each tool call sequentially and append the result.
          for (const call of toolCalls) {
            const result = await runTool(call, toolCtx);
            const resultJson = safeStringify(result);

            // Persist tool_result turn for audit + future Skill Editor signal.
            if (threadId) {
              try {
                await persistTurn(supabase, threadId, {
                  role: 'tool',
                  event_type: 'tool_result',
                  content: resultJson,
                  metadata: {
                    tool_call_id: call.id,
                    tool_name: call.function.name,
                    ok: result.ok,
                  },
                });
              } catch {
                /* swallow audit failures */
              }
            }

            conversation.push({
              role: 'tool',
              tool_call_id: call.id,
              content: resultJson,
            });
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        writeToClient(`\n\n⚠️ Upstream error: ${message}`);
      } finally {
        controller.close();
        if (threadId && assistantBuffer.trim() !== '') {
          try {
            await persistTurn(supabase, threadId, {
              role: 'assistant',
              event_type: 'message',
              content: assistantBuffer,
              metadata: { model },
            });
          } catch {
            /* swallow secondary persistence failures */
          }
          // While ambient capture is active for this thread, also stream
          // the assistant final reply to the feedback log so the engineer
          // sees BOTH sides of the conversation in real time.
          if (captureActive) {
            try {
              await captureSimple({
                kind: 'ambient',
                content: `[ASSISTANT] ${assistantBuffer}`,
                threadId,
                episodeId,
                worktreeRoot,
              });
            } catch {
              /* never throw inside finally */
            }
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
      ...(captureLogPath
        ? {
            'X-Concierge-Feedback-Captured': `${captureTurnCount}`,
            'X-Concierge-Feedback-Log': captureLogPath.slice(-100),
          }
        : {}),
    },
  });
}

/** Execute a single tool_call against the registry. Unknown tools fail safely. */
async function runTool(
  call: ChatCompletionMessageToolCall,
  ctx: ToolContext,
): Promise<ToolResult> {
  const tool = findTool(call.function.name);
  if (!tool) {
    return { ok: false, error: `unknown tool "${call.function.name}"` };
  }
  let parsedArgs: Record<string, unknown>;
  try {
    parsedArgs = tool.parse(call.function.arguments ?? '{}') as Record<string, unknown>;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'invalid tool arguments',
    };
  }
  try {
    return await tool.execute(parsedArgs, ctx);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'tool execution failed',
    };
  }
}

function summariseToolCalls(calls: ChatCompletionMessageToolCall[]): string {
  return calls
    .map((c) => `🔧 ${c.function.name}(${truncate(c.function.arguments ?? '{}', 120)})`)
    .join('\n');
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ ok: false, error: 'unserialisable tool result' });
  }
}
