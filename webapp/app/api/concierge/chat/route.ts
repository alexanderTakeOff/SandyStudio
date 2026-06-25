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
import {
  createConciergeClient,
  conciergeModel,
  conciergeModelLabel,
  conciergeProvider,
  conciergeMaxTokensParam,
  conciergeSupportsTemperature,
  conciergeReasoningParam,
} from '@/lib/concierge/llm';
import { conciergeAutoReactEnabled } from '@/lib/concierge/cost';
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
import { createThread, getThread, loadRecentTurns, persistTurn, updateThreadEpisode } from '@/lib/concierge/threads';
import { findTool, openaiSchemas } from '@/lib/concierge/tools';
import {
  AUTO_REACT_ROUND_BACKSTOP,
  evaluateRound,
  type RoundCall,
} from '@/lib/concierge/auto-react-loop';
import { appendApprovalLine, loadWorkPlanDoc } from '@/lib/concierge/tools/work-plan';
import { checkVerbalApproval } from '@/lib/concierge/approval-check';
import { resolveSkillsContext } from '@/lib/concierge/build-context';
import { mapChatError } from '@/lib/concierge/chat-error-envelope';
import type { ToolContext, ToolResult } from '@/lib/concierge/tools';
import { isUuid } from '@/lib/concierge/tools/types';
import type { ConciergeMode, ConciergeTurnRow } from '@/lib/concierge/types';
import { resolveEffectiveConciergeMode } from '@/lib/concierge/resolve-mode';
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

// Live status for the chat header — reads the same env source the chat loop uses,
// so the header honestly shows (a) the provider/model ACTUALLY answering right now
// (gpt-5.5, claude-opus-4-8, …) and (b) whether the autonomous auto-react loop is
// armed. Both replace the old stale agent/mode label.
export function GET() {
  return NextResponse.json({
    provider: conciergeProvider(),
    model: conciergeModel(),
    label: conciergeModelLabel(),
    autoReact: conciergeAutoReactEnabled(),
  });
}

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

// goal-loop slice 1 (2026-06-23): the round cap is a runaway BACKSTOP, not a
// work limit. The old 5 forced Polina to stop mid-task and "announce + wait";
// now she runs until the model is done (0 tool calls) or the spin guard fires
// (evaluateRound). Director is present here, so on a stall we just emit a note —
// no escalation timer (that path is for the away/auto-react case).
const MAX_TOOL_ROUNDS = AUTO_REACT_ROUND_BACKSTOP;
// Sprint γ 2026-05-14 hotfix — bumped 20 → 80. With Postgres trigger writing
// a system turn per pipeline event + Claude posting team-chat bubbles in the
// same channel, the previous 20-row window pushed user/assistant turns out
// fast and Polina lost both her conversation history and ambient context.
// 80 keeps a full smoke session worth of turns in the system prompt; the
// per-block filters (PIPELINE_EVENTS_SINCE_LAST_REPLY, TEAM_CHAT_FROM_CLAUDE)
// trim the final volume back down.
const RECENT_TURN_WINDOW = 80;

export async function POST(req: Request) {
  try {
    return await handleChatPOST(req);
  } catch (err) {
    // 2026-05-22 outer guard. Any throw that escapes handleChatPOST before
    // the stream is created (Supabase exception, OpenAI init crash, etc.)
    // lands here and becomes a structured JSON envelope. The frontend
    // ConciergePanel reads this as JSON instead of raw HTML.
    const env = mapChatError(err);
    return NextResponse.json(env, { status: env.status });
  }
}

async function handleChatPOST(req: Request) {
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

  let episodeId = body.episodeId ?? null;
  let episodeCode: string | null = null;
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
  // q13 (2026-06-15): Polina's mode is derived from episode.governance_mode via
  // the single resolver — NOT the client-sent body.mode (which defaulted to '1'
  // and was the source of her "Mode 1" self-report on a Mode-2/4 episode). For a
  // brand-new thread the binding episode is body.episodeId; an existing thread's
  // own episode binding wins (re-resolved after the thread block below).
  let mode: ConciergeMode = await resolveEffectiveConciergeMode(supabase, episodeId);
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

  // Episode authority (2026-06-23, Director «чат должен следовать за открытым
  // эпизодом»). body.episodeId comes from the OPEN episode page — ConciergePanel
  // reads it from the route — a TRUSTED HUMAN signal (NOT a model-supplied tool
  // arg; q13's distrust was about Gemini jamming codes into tool args, not about
  // the UI). So the open page WINS and RE-BINDS the thread, making one global
  // chat follow whatever episode the Director is looking at. When the UI sends
  // no episode (non-episode page), fall back to the thread's own binding — which
  // still beats Polina GUESSING the id (the q13 fix this preserves).
  if (threadId) {
    const boundThread = await getThread(supabase, threadId);
    const boundEpisodeId = boundThread?.episode_id ?? null;
    if (isUuid(episodeId)) {
      // Open page is authoritative — re-bind the thread if it drifted.
      if (boundEpisodeId !== episodeId) {
        try {
          await updateThreadEpisode(supabase, threadId, episodeId!);
        } catch {
          /* non-fatal: context still resolved below for this turn */
        }
      }
      mode = await resolveEffectiveConciergeMode(supabase, episodeId);
    } else if (boundEpisodeId) {
      // No open-page episode → the thread's own binding is the authority.
      episodeId = boundEpisodeId;
      mode = await resolveEffectiveConciergeMode(supabase, boundEpisodeId);
    }
  }

  // Resolve episodeCode for display and tool fallback
  if (episodeId) {
    const { data: ep } = await supabase
      .from('episodes')
      .select('episode_code')
      .eq('id', episodeId)
      .maybeSingle();
    episodeCode = (ep as { episode_code?: string | null } | null)?.episode_code ?? null;
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

  // Unit A (2026-06-03) q6 — DETERMINISTIC APPROVAL APPEND. The instant the
  // Director's incoming turn carries an approval token, durably record it in
  // the episode's work-plan ledger server-side. This guarantees the standing
  // approval survives the conversation window independent of whether the model
  // remembers to call updateWorkPlan.
  //
  // Guard: only fire when THIS message is itself an approval (windowSize=1 over
  // the single just-received Director turn) — never fabricate, and never
  // re-append the same standing approval on later neutral turns. Best-effort;
  // a failure here must not break the chat turn.
  if (episodeId && threadId && !persistenceError) {
    try {
      const thisTurn: ConciergeTurnRow = {
        id: 'incoming',
        thread_id: threadId,
        role: 'director',
        event_type: 'message',
        content: lastUserMessage.content,
        metadata: {},
        token_count: null,
        created_at: new Date().toISOString(),
      } as ConciergeTurnRow;
      const approval = checkVerbalApproval([thisTurn], 1);
      if (approval.approved) {
        await appendApprovalLine(supabase, episodeId, lastUserMessage.content);
      }
    } catch {
      /* ledger append is best-effort — never block the chat turn */
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

  const client = createConciergeClient();
  const model = conciergeModel();
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

  // Unit A (2026-06-03) — fetch Polina's durable work-plan / decision ledger
  // for the focused episode so the [WORK_PLAN] system-prompt block carries her
  // standing approvals + todo list every turn. Direct Supabase read (no internal
  // HTTP round-trip). Best-effort: a missing/failed read degrades to a null doc
  // ("no work plan yet"), never blocks the chat turn.
  let workPlanDoc: string | null = null;
  if (episodeId) {
    try {
      workPlanDoc = await loadWorkPlanDoc(supabase, episodeId);
    } catch {
      /* degrade to null — block renders "no work plan yet" */
    }
  }

  const buildPrompt = (turns: ConciergeTurnRow[]) =>
    buildSystemPrompt({ today, mode, episodeId, episodeCode, nextGate, recentTurns: turns, modelId: model, availablePlaybooks, workPlanDoc });

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
      // TD-25 P4 (2026-05-22): accumulate metadataPatches from tool calls in
      // this round. At end-of-turn, these are shallow-merged into the
      // persisted assistant turn's metadata. `markAwaitingDirector` is the
      // first user — it patches `awaiting_director_input` deliberately,
      // bypassing the legacy regex detector.
      const accumulatedMetadataPatch: Record<string, unknown> = {};
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

        // Spin guard state (goal-loop slice 1), threaded across rounds.
        const seenToolSigs = new Set<string>();
        const spinState = { noProgress: 0 };
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
            episodeCode,
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
            ...conciergeMaxTokensParam(maxCompletionTokens),
            // Disable tools on the very last round so the model is forced
            // to produce a final natural-language answer.
            tools: toolsThisRound,
            tool_choice: toolsThisRound ? 'auto' : undefined,
            stream: useStreaming,
          };
          if (!isGpt5 && conciergeSupportsTemperature() && Number.isFinite(temperature)) {
            params.temperature = temperature;
          }
          // OpenAI 400: gpt-5* in /v1/chat/completions rejects the combination
          // of `tools` + `reasoning_effort`. Only pass reasoning_effort on the
          // final (tools-disabled) round so the model still reasons over the
          // collected tool results without breaking the tool-call rounds.
          if (reasoningEffort && isGpt5 && !toolsThisRound) {
            (params as { reasoning_effort?: string }).reasoning_effort = reasoningEffort;
          }
          // 2026-06-25 $-fix: cap Opus extended thinking on EVERY round (returns
          // {} for non-anthropic). Without this Opus runs uncapped thinking
          // (billed at output rate) on the interactive path too.
          Object.assign(params, conciergeReasoningParam());

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

          // Spin guard (goal-loop slice 1): with the cap now a high backstop,
          // stop a stuck/looping model BEFORE it re-fires a duplicate mutating
          // call or spins with no progress. Director is watching, so just emit a
          // short note and let the normal final-text persistence run.
          const spinVerdict = evaluateRound(
            toolCalls.map(
              (c): RoundCall => ({
                name: c.function.name,
                argsJson: c.function.arguments,
                mutating: findTool(c.function.name)?.mutating !== false,
              }),
            ),
            seenToolSigs,
            spinState,
          );
          if (spinVerdict.stop) {
            writeToClient(
              `\n\n⏸️ Остановилась, чтобы не крутить вхолостую (${spinVerdict.reason}). Скажи, как продолжить.`,
            );
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

            // TD-25 P4 (2026-05-22): collect any metadataPatch the tool
            // returned so the route can stamp it onto the persisted assistant
            // turn at the end. Multiple tools in the same round shallow-merge
            // (last writer wins per key). markAwaitingDirector is the primary
            // user but the mechanism is general.
            if (result.ok && result.metadataPatch) {
              Object.assign(accumulatedMetadataPatch, result.metadataPatch);
            }

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
          // TD-25 P4 (2026-05-22): prefer tool-driven awaiting marker over
          // the legacy regex detector. If Polina called markAwaitingDirector
          // in this round, `accumulatedMetadataPatch.awaiting_director_input`
          // is set deliberately — use it verbatim. Otherwise fall back to
          // regex detection (deprecated; will be removed after one-week
          // grace per TD-25 P4 plan).
          const toolAwaiting = accumulatedMetadataPatch.awaiting_director_input;
          const awaiting = toolAwaiting
            ? toolAwaiting
            : detectAwaitingDirectorInput(assistantBuffer);
          // Compose final metadata: model + tool patches + awaiting (which is
          // already in the patch if tool path took it).
          const finalMetadata: Record<string, unknown> = {
            model,
            ...accumulatedMetadataPatch,
            ...(awaiting && !toolAwaiting ? { awaiting_director_input: awaiting } : {}),
          };
          try {
            await persistTurn(supabase, threadId, {
              role: 'assistant',
              event_type: 'message',
              content: assistantBuffer,
              metadata: finalMetadata,
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
  // Durable phantom-episode guard (2026-06-20). On an UNBOUND thread,
  // resolveEpisodeId trusts ANY well-formed UUID the model puts in
  // args.episodeId — a hallucinated id (gemini's 3291d90d on E11) then sails
  // through and every episode-scoped query SILENTLY misses ("no APPROVED
  // storyboard…"). Validate existence once, here at the single dispatch
  // chokepoint, and fail LOUD so the model self-corrects instead of looping on
  // an invisible miss. Only when the thread is unbound (ctx.episodeId absent) —
  // a bound thread's binding wins in resolveEpisodeId and the model's arg is
  // already ignored, so no DB hit is needed there.
  if (!ctx.episodeId && isUuid(parsedArgs.episodeId)) {
    const { data: epRow } = await ctx.supabase
      .from('episodes')
      .select('id')
      .eq('id', parsedArgs.episodeId)
      .maybeSingle();
    if (!epRow) {
      return {
        ok: false,
        error: `episode ${parsedArgs.episodeId} does not exist. Do NOT invent or guess episode UUIDs — omit episodeId to use the active episode, or ask the Director for the correct id.`,
        code: 'episode_not_found',
      };
    }
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
