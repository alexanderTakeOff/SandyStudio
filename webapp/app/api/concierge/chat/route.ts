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
import { logEvent } from '@/lib/api/events';
import path from 'node:path';
import { buildSystemPrompt } from '@/lib/concierge/system-prompt-builder';
import { detectAwaitingDirectorInput } from '@/lib/concierge/await-detector';
import { createThread, getThread, loadRecentTurns, persistTurn } from '@/lib/concierge/threads';
import { findTool, openaiSchemas } from '@/lib/concierge/tools';
import { resolveSkillsContext } from '@/lib/concierge/build-context';
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
// Sprint γ 2026-05-14 hotfix — bumped 20 → 80. With Postgres trigger writing
// a system turn per pipeline event + Claude posting team-chat bubbles in the
// same channel, the previous 20-row window pushed user/assistant turns out
// fast and Polina lost both her conversation history and ambient context.
// 80 keeps a full smoke session worth of turns in the system prompt; the
// per-block filters (PIPELINE_EVENTS_SINCE_LAST_REPLY, TEAM_CHAT_FROM_CLAUDE)
// trim the final volume back down.
const RECENT_TURN_WINDOW = 80;

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

  const today = new Date().toISOString().slice(0, 10);

  // Sprint φ.2 (2026-05-16) — PA reads the capability manifest only.
  // Bodies are loaded on demand via the `getSkill` tool when she actually
  // needs the playbook content. Shared helper resolves series+genre and
  // formats the manifest identically for the auto-react route.
  // See docs/skills-as-capabilities.md.
  const { availablePlaybooks } = await resolveSkillsContext(supabase, episodeId);

  const buildPrompt = (turns: ConciergeTurnRow[]) =>
    buildSystemPrompt({ today, mode, episodeId, nextGate, recentTurns: turns, modelId: model, availablePlaybooks });

  // TD-20.A 2026-05-20 — Cancel support via req.signal. AbortController is
  // created client-side; when Director hits Cancel, fetch's signal aborts,
  // which propagates here as req.signal.aborted = true. The tool loop checks
  // this between rounds and between tool calls, then writes a {"t":"cancelled"}
  // event and closes the stream.
  const reqSignal: AbortSignal | undefined = (req as Request & { signal?: AbortSignal }).signal;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let assistantBuffer = '';
      let closed = false;
      const writeEvent = (event: Record<string, unknown>): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
        } catch {
          /* controller already closed — ignore */
        }
      };
      // Backwards-compat text writer (also accumulates into assistantBuffer
      // for the final persistTurn at the end of finally{}). For incremental
      // token emission during the streaming round we use writeEvent({t:'token'})
      // directly AND accumulate buffer separately.
      const writeToClient = (text: string) => {
        if (!text) return;
        assistantBuffer += text;
        writeEvent({ t: 'text', v: text });
      };
      const PER_TOOL_TIMEOUT_MS = 120_000;
      let cancelled = false;
      try {
        const conversation: ChatCompletionMessageParam[] = [
          { role: 'system', content: buildPrompt([]) },
          ...body.messages.map<ChatCompletionMessageParam>((m) => ({
            role: m.role,
            content: m.content,
          })),
        ];

        // Tool-call loop. Each round: ask the model. If it emits tool_calls,
        // execute them, persist `tool_call` + `tool_result` turns, append
        // to conversation, repeat. Otherwise stream the final text and exit.
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          if (reqSignal?.aborted) { cancelled = true; break; }
          const isLastRound = round === MAX_TOOL_ROUNDS - 1;

          // Refresh recent turns each round so verbal-approval detection
          // AND the ACTIVE_INTENT prompt block both see the freshest state.
          let recentTurns: ConciergeTurnRow[] = [];
          if (threadId) {
            try {
              recentTurns = await loadRecentTurns(supabase, threadId, RECENT_TURN_WINDOW);
            } catch {
              /* memory degradation already surfaced via header */
            }
          }
          // Rebuild the system prompt with the freshest recentTurns so the
          // ACTIVE_INTENT block reflects "Director just said X (Ns ago)" +
          // drift count. Conversation[0] is replaced in place.
          conversation[0] = { role: 'system', content: buildPrompt(recentTurns) };

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

          // TD-20.A streaming: on rounds that COULD emit tool_calls, we keep
          // stream:false — tool-call delta aggregation is complex and adds
          // little UX win since tools are the bottleneck. On the final round
          // (tools disabled, model is forced to write natural language) we
          // switch to stream:true and emit tokens incrementally so Director
          // sees the answer word-by-word.
          const useStreaming = !toolsThisRound;
          const params: Parameters<typeof client.chat.completions.create>[0] = {
            model,
            messages: conversation,
            max_completion_tokens: maxCompletionTokens,
            // Disable tools on the very last round so the model is forced
            // to produce a final natural-language answer.
            tools: toolsThisRound,
            tool_choice: toolsThisRound ? 'auto' : undefined,
            stream: useStreaming,
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

          // Branch: streaming round (final answer) vs non-streaming round
          // (tool-capable). Mirrors useStreaming above.
          if (useStreaming) {
            // Final-answer streaming round. OpenAI returns AsyncIterable; we
            // emit each delta.content as a token event. No tool_calls expected
            // because tools=undefined.
            const streamedParams = { ...params, stream: true } as Parameters<typeof client.chat.completions.create>[0];
            const iter = (await client.chat.completions.create(streamedParams)) as AsyncIterable<{
              choices?: Array<{ delta?: { content?: string | null } }>;
            }>;
            for await (const chunk of iter) {
              if (reqSignal?.aborted) { cancelled = true; break; }
              const tokenText = chunk.choices?.[0]?.delta?.content ?? '';
              if (tokenText) {
                assistantBuffer += tokenText;
                writeEvent({ t: 'token', v: tokenText });
              }
            }
            // Streaming round always concludes the conversation.
            break;
          }

          const completion = await client.chat.completions.create(params);
          if (reqSignal?.aborted) { cancelled = true; break; }
          // `stream: false` so the response is a single completion object,
          // not an async iterable — narrow the type accordingly.
          if (Symbol.asyncIterator in (completion as object)) {
            throw new Error('expected non-streaming completion on tool-capable round');
          }
          const msg = (completion as { choices: Array<{ message: ChatCompletionAssistantMessageParam }> })
            .choices[0]?.message;
          if (!msg) {
            writeToClient('\n\n⚠️ Empty response from model.');
            break;
          }

          const toolCalls = msg.tool_calls ?? [];

          if (toolCalls.length === 0) {
            // Final answer arrived on a tool-capable round — emit text and exit.
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
            if (reqSignal?.aborted) { cancelled = true; break; }
            // TD-20.A — emit tool_start event so the client can show
            // "Вызывает getAsset…" plashka with a seconds counter.
            writeEvent({
              t: 'tool_start',
              id: call.id,
              name: call.function.name,
              args_preview: truncate(call.function.arguments ?? '', 120),
            });

            const result = await runToolWithTimeout(call, toolCtx, PER_TOOL_TIMEOUT_MS);

            // TD-20.A — emit tool_result (or tool_timeout) event so the client
            // can swap the plashka for a compact "ok" / "error" / "timeout" chip.
            if (result.timedOut) {
              writeEvent({
                t: 'tool_timeout',
                id: call.id,
                name: call.function.name,
              });
            } else {
              writeEvent({
                t: 'tool_result',
                id: call.id,
                name: call.function.name,
                ok: result.ok,
              });
            }

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
          if (cancelled) break;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        writeEvent({ t: 'error', message });
      } finally {
        if (cancelled) {
          writeEvent({ t: 'cancelled' });
          // Persist a cancellation marker turn for audit; the regular
          // assistant turn (with whatever text streamed before cancel) is
          // still persisted below if assistantBuffer is non-empty.
          if (threadId) {
            try {
              await persistTurn(supabase, threadId, {
                role: 'system',
                event_type: 'message',
                content: 'Director cancelled this turn before completion.',
                metadata: { kind: 'cancelled', partial_chars: assistantBuffer.length },
              });
            } catch {
              /* swallow audit failures */
            }
          }
        }
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
        if (threadId && assistantBuffer.trim() !== '') {
          // TD-25 P1+P3 (2026-05-21): detect if Polina ended the turn with an
          // explicit q-format question or a passive "жду" without an ask, and
          // stamp `awaiting_director_input` into metadata. ConciergePanel
          // renders a yellow "🟡 Полина ждёт ответа" chip above the bubble
          // when this is present, so Director sees the pending ask without
          // having to scan the whole text.
          const awaiting = detectAwaitingDirectorInput(assistantBuffer);
          try {
            await persistTurn(supabase, threadId, {
              role: 'assistant',
              event_type: 'message',
              content: assistantBuffer,
              metadata: awaiting
                ? { model, awaiting_director_input: awaiting }
                : { model },
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
          // A4 (Director directive 2026-05-11): LOG-ONLY behavior-drift scan.
          // Detect "если хочешь / если позволите / скажи 'да'" patterns that
          // signal PA is asking permission when it should be acting. Emit
          // activity_event for future RC6 dashboard; do NOT modify the reply.
          const BANNED_RE =
            /если хочешь[, ]|если позволите[, ]|скажи['"]?\s*(да|yes)['"]?[, ]|я могу подготовить[, ]/i;
          const match = assistantBuffer.match(BANNED_RE);
          if (match) {
            try {
              // TD-29.5 (2026-05-21): route through logEvent.
              await logEvent(supabase, {
                event_type: 'manual_trigger',
                severity: 'warning',
                title: 'PA behavior drift: permission-asking phrase detected',
                description: `Phrase: "${match[0]}". Thread ${threadId?.slice(0, 8)}.`,
                actor: 'EXEC-CONC',
                episode_id: episodeId,
                metadata: {
                  kind: 'behavior_drift',
                  thread_id: threadId,
                  matched_phrase: match[0],
                  reply_length: assistantBuffer.length,
                },
              });
            } catch {
              /* swallow audit failures */
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

/**
 * TD-20.A — Tool timeout shim. Returns the underlying ToolResult unchanged,
 * or a synthesised { ok: false, timedOut: true } if the tool exceeds
 * timeoutMs. The runner does NOT cancel the underlying tool work — a tool
 * cannot be safely aborted mid-flight without per-tool cancellation hooks
 * (most tools today wrap fire-and-forget HTTP / Supabase calls). The
 * timeout exists to release the chat round so Director sees feedback and
 * can cancel rather than hanging on a stuck tool.
 */
async function runToolWithTimeout(
  call: ChatCompletionMessageToolCall,
  ctx: ToolContext,
  timeoutMs: number,
): Promise<ToolResult & { timedOut?: boolean }> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<ToolResult & { timedOut: true }>((resolve) => {
    timer = setTimeout(() => {
      resolve({
        ok: false,
        error: `tool ${call.function.name} did not finish within ${Math.round(timeoutMs / 1000)}s`,
        timedOut: true,
      });
    }, timeoutMs);
  });
  try {
    const winner = await Promise.race([runTool(call, ctx), timeoutPromise]);
    return winner;
  } finally {
    if (timer) clearTimeout(timer);
  }
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
