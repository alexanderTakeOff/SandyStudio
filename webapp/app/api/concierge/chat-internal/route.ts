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
  ChatCompletionMessageToolCall,
  ChatCompletionAssistantMessageParam,
} from 'openai/resources/chat/completions';
import { z } from 'zod';
import { getServerEnv } from '@/lib/env';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { buildSystemPrompt } from '@/lib/concierge/system-prompt-builder';
import { getThread, loadRecentTurns, persistTurn } from '@/lib/concierge/threads';
import { resolveSkillsContext } from '@/lib/concierge/build-context';
import { TOOLS, findTool, openaiSchemas, type ToolContext } from '@/lib/concierge/tools';
import { isHardLimitTool } from '@/lib/concierge/approval-check';
import type { ConciergeMode } from '@/lib/concierge/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ANTI_CASCADE_WINDOW_MS = 10_000;
const RECENT_TURN_WINDOW = 80;

/**
 * TD-51 (2026-05-25): auto-react tool loop cap. Polina may call read-only /
 * analysis tools to inspect what just happened (getAsset, getRecentActivityEvents,
 * getAnimatorCriticVerdict, etc.) before composing her narrative response.
 * 3 rounds keeps her bounded: typical agent_completed pickup needs 1-2 reads
 * + a final text round. Mutating tools (triggerAgent, requestRevision,
 * approveAsset) are blocked by the per-tool guard regardless of rounds.
 *
 * F5 (2026-06-12, E07 smoke): in BOLD modes (3/4) Polina ACTS in auto-react —
 * a batch step is read(1-2) + mutate(1) + verify(1) + final text, which does
 * not fit in 3. The E07 hour-long stall was exactly this: she ANNOUNCED the
 * next dispatch, ran out of rounds before the tool_call, and nothing woke
 * her again. Strict modes stay at 3 (read + narrate needs no more).
 */
const MAX_AUTO_REACT_TOOL_ROUNDS = 3;
const MAX_AUTO_REACT_TOOL_ROUNDS_BOLD = 5;

/**
 * TD-51 (2026-05-25): read-only / analysis subset of the concierge tool
 * registry. Filtered by Tool.mutating: false. Cached at module load — the
 * registry is frozen and module-lived so this list never changes at runtime.
 */
const READ_ONLY_TOOL_NAMES = new Set(
  TOOLS.filter((t) => t.mutating === false).map((t) => t.name),
);
const READ_ONLY_TOOL_SCHEMAS = openaiSchemas.filter((s) =>
  READ_ONLY_TOOL_NAMES.has(s.function.name),
);

/**
 * q9 (2026-06-09): bold-mode auto-react tool surface. In Mode 3 (DELEGATED) and
 * Mode 4 (AUTOTEST) Polina may act autonomously, so auto-react exposes the
 * MUTATING tools too — EXCEPT hard limits (publish via triggerAgent EXEC-PUB,
 * skill-canon writes), which stay Director-only in every mode and are never
 * offered here. Strict modes (1 / 2 / 2.5) keep the read-only surface only.
 *
 * Cached at module load — the registry is frozen and module-lived.
 */
const BOLD_MODES: ReadonlySet<ConciergeMode> = new Set(['3', '4']);
const BOLD_TOOL_SCHEMAS = openaiSchemas.filter(
  (s) => !isHardLimitTool(s.function.name),
);

const Body = z.object({
  thread_id: z.string().uuid(),
  // TD-25 P2 (2026-05-21): 'watchdog' source — re-ping after Polina's
  // prior turn left an unresolved awaiting_director_input flag.
  // 2026-06-03: 'timer' — escalation-timer + orphaned-awaiting-sweep post this
  // (typed in client.ts but missing here → silent 400s killed Polina's proactive nudges).
  source: z.enum(['ambient', 'claude_message', 'watchdog', 'timer']),
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
  //
  // F4 (2026-06-12, E07 smoke): FAILURES bypass the guard. During an active
  // batch Polina narrates constantly, so an agent_failed landing right after
  // her turn was swallowed as `recent_assistant_turn` — the Director learned
  // about the dead Designer 20 minutes later by looking himself. A failure
  // must always produce a reaction; the per-bucket debounce in exec-pa-react
  // still caps the rate.
  const isFailureTrigger = parsed.event_type === 'agent_failed';
  const lastTurn = recentTurns[recentTurns.length - 1];
  if (!isFailureTrigger && lastTurn && lastTurn.role === 'assistant') {
    const lastTs = new Date(lastTurn.created_at).getTime();
    if (Number.isFinite(lastTs) && Date.now() - lastTs < ANTI_CASCADE_WINDOW_MS) {
      return NextResponse.json({ skipped: 'recent_assistant_turn' }, { status: 200 });
    }
  }

  // Resolve the episode in focus: the thread's pinned episode first, else the
  // episode that owns the triggering activity event (ambient pipeline reaction).
  let episodeId: string | null = thread.episode_id ?? null;
  if (!episodeId && parsed.source === 'ambient') {
    const { data: evt } = await supabase
      .from('activity_events')
      .select('episode_id')
      .eq('id', parsed.trigger_id)
      .maybeSingle();
    episodeId = (evt as { episode_id?: string | null } | null)?.episode_id ?? null;
  }

  // q (2026-06-09): the gate's effective governance mode is the EPISODE's
  // governance_mode when Polina works on an episode — NOT the stale per-thread
  // active_mode. This is the Mode-3-readiness fix: declaring an episode Mode 3
  // (DELEGATED) / Mode 4 (AUTOTEST) actually lifts Polina's autonomous mutation
  // gate ON THAT EPISODE, instead of her staying boxed in the thread's default
  // Mode 1. Falls back to thread.active_mode for non-episode reactions. Hard
  // limits remain Director-only via assertHumanDirector() in every mode.
  let mode: ConciergeMode = (thread.active_mode as ConciergeMode | null) ?? '1';
  if (episodeId) {
    const { data: epRow } = await supabase
      .from('episodes')
      .select('governance_mode')
      .eq('id', episodeId)
      .maybeSingle();
    const gm = (epRow as { governance_mode?: number | null } | null)?.governance_mode;
    if (typeof gm === 'number' && gm >= 1 && gm <= 4) {
      mode = String(gm) as ConciergeMode;
    }
  }
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
      : parsed.source === 'watchdog'
        ? `[autonomous trigger] **OPEN-LOOP WATCHDOG re-ping** — your prior turn (${parsed.trigger_id}) had awaiting_director_input set but nothing has resolved it for >90s. Director may have missed your question or you may need to take the next concrete step yourself.`
        : `[autonomous trigger] team-chat message from Тео (turn ${parsed.trigger_id})`;

  // TD-51 (2026-05-25): per-source tool policy.
  // - watchdog: still no tools. Goal is re-prompting Director, not acting.
  //             Director must see Polina's re-ping as a text message, not a
  //             tool-call burst.
  // - ambient (agent_completed / agent_failed / approval_revision / etc) +
  //   claude_message: read-only / analysis tools allowed (getAsset,
  //   getRecentActivityEvents, getCriticVerdict, getAnimatorCriticVerdict,
  //   getGagVerdict, listShots, etc). Mutating tools (triggerAgent,
  //   approveAsset, requestRevision, regenerate*) remain blocked at the
  //   per-tool guard — Polina may "suggest" them in her text response, and
  //   Director invokes via the next Director turn.
  const allowTools = parsed.source !== 'watchdog';
  // q9: in bold modes (3 DELEGATED / 4 AUTOTEST) Polina may ACT autonomously —
  // expose + permit the mutating tools (minus hard limits). Strict modes keep
  // the read-only surface and the propose-don't-act instruction.
  const boldMode = BOLD_MODES.has(mode);
  const userInstruction = !allowTools
    ? 'Read your prior assistant turn (above). Either (a) take the next concrete sub-step yourself if the original Director directive logically covers it — don\'t wait for new approval; or (b) re-ask Director more explicitly with a fresh q-format question and a tighter framing. Do not just echo your previous wait. Do not request tools.'
    : boldMode
      ? [
          `Recap what just happened in this thread (read the recent turns above). You are in Mode ${mode} (DELEGATED/AUTOTEST) — you have delegated authority to ACT now without waiting for a fresh Director token.`,
          '',
          'You MAY call READ-ONLY tools to inspect the artifact, AND MUTATING tools to ACT (triggerAgent, approveAsset, requestRevision, regenerate*, etc.) when the next step is clear. The cost ceiling still backstops spend; surface your decisions for Director awareness.',
          '',
          'HARD LIMITS remain Director-only in every mode and are NOT available to you: publishing (triggerAgent EXEC-PUB), marking LOCKED, changing budget, changing governance mode, and skill-canon writes. If one of those is the right step, propose it for the Director instead.',
          '',
          'After your tool calls, produce a SHORT final text: name the artifact, the action you took (or recommend, for a hard limit), and 1-3 observations.',
        ].join('\n')
      : [
          'Recap what just happened in this thread (read the recent turns above) and decide whether to ACT now or WAIT for Director.',
          '',
          'You MAY call READ-ONLY and ANALYSIS tools to inspect the artifact this event references (getAsset, getRecentActivityEvents, getCriticVerdict, getAnimatorCriticVerdict, listShots, listPendingApprovals, etc). Use them when the event references an asset_id you have not yet read — silent-stall is worse than a tool call.',
          '',
          'You MUST NOT call MUTATING tools (triggerAgent, approveAsset, requestRevision, regenerateRefPlan, regenerateImageFromPlan, regenerateShotPlan, enrichBible, setBibleContent, createSeries, createEpisode, editBrief, copyAssetImage, proposeSkill, updateSkill, approveSkill). Those require explicit Director approval. If a mutation is the right next step, propose it in your text response and let Director invoke it.',
          '',
          'After your tool calls (if any), produce a SHORT final text: name the artifact, give the verdict status, list 1-3 concrete observations, and either (a) recommend an approve/revise/regen action for Director to invoke, or (b) explain why no action yet.',
        ].join('\n');

  const conversation: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `${triggerLabel}\n\n${userInstruction}`,
    },
  ];

  // ── Tool execution context.
  //   Strict modes (1/2/2.5): read-only/analysis only — mutating tools are
  //   blocked at the per-tool guard. No cookie, no service token.
  //   Bold modes (3/4): q9 — mutating tools (minus hard limits) are permitted.
  //   Auto-react has no Director cookie, so mutating tools authenticate to the
  //   Director-only routes via the EXEC_DIR_AI_TOKEN bearer (authHeader). The
  //   token resolves to a synthetic EXEC-DIR-AI principal; hard-limit routes
  //   reject it (assertHumanDirector), so it cannot publish/LOCK/budget/mode.
  const appOrigin = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const execDirAiToken = process.env.EXEC_DIR_AI_TOKEN?.trim();
  const authHeader =
    boldMode && execDirAiToken ? `Bearer ${execDirAiToken}` : null;
  const toolCtx: ToolContext = {
    supabase,
    threadId: parsed.thread_id,
    mode,
    episodeId,
    cookieHeader: null,
    authHeader,
    appOrigin,
    recentTurns,
  };

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  let assistantText = '';

  // ── TD-51 (2026-05-25) tool-call loop ────────────────────────────────────
  // Per-round shape mirrors /api/concierge/chat#L342-L443 but trimmed: no
  // streaming, no metadata patches, no per-tool timeout (auto-react is
  // server-to-server and not Director-facing — slow tools just slow the
  // batch). Last round force-disables tools so the model produces a final
  // text response instead of looping.
  let roundCount = 0;
  const maxRounds = boldMode
    ? MAX_AUTO_REACT_TOOL_ROUNDS_BOLD
    : MAX_AUTO_REACT_TOOL_ROUNDS;
  try {
    for (let round = 0; round < maxRounds; round++) {
      roundCount = round + 1;
      const isLastRound = round === maxRounds - 1;
      // q9: bold modes (3/4) expose mutating tools (minus hard limits) so Polina
      // can ACT; strict modes keep the read-only surface.
      const roundSchemas = boldMode ? BOLD_TOOL_SCHEMAS : READ_ONLY_TOOL_SCHEMAS;
      const toolsThisRound = allowTools && !isLastRound ? [...roundSchemas] : undefined;

      const params: ChatCompletionCreateParamsNonStreaming = {
        model,
        messages: conversation,
        max_completion_tokens: maxCompletionTokens,
        stream: false,
        tools: toolsThisRound,
        tool_choice: toolsThisRound ? 'auto' : undefined,
      };
      if (!isGpt5 && Number.isFinite(temperature)) {
        params.temperature = temperature;
      }
      // gpt-5* rejects tools + reasoning_effort combination — only pass
      // reasoning_effort on tool-disabled rounds (mirror main /chat).
      if (reasoningEffort && isGpt5 && !toolsThisRound) {
        (params as { reasoning_effort?: string }).reasoning_effort = reasoningEffort;
      }

      const completion = await client.chat.completions.create(params);
      if (Symbol.asyncIterator in (completion as object)) {
        throw new Error('expected non-streaming completion');
      }
      const msg = (completion as {
        choices: Array<{ message: ChatCompletionAssistantMessageParam }>;
      }).choices[0]?.message;
      if (!msg) break;

      const toolCalls = msg.tool_calls ?? [];

      if (toolCalls.length === 0) {
        // Final text from the model — exit the loop.
        const text = typeof msg.content === 'string' ? msg.content.trim() : '';
        assistantText = text;
        break;
      }

      // Persist the intermediate tool_call turn so Director's UI shows the
      // chips and the audit trail matches Director-turn flow.
      await persistTurn(supabase, parsed.thread_id, {
        role: 'assistant',
        event_type: 'tool_call',
        content: toolCalls
          .map((c) => `🔧 ${c.function.name}(${truncateForLog(c.function.arguments ?? '', 120)})`)
          .join('\n'),
        metadata: {
          model,
          auto_react: true,
          source: parsed.source,
          trigger_id: parsed.trigger_id,
          tool_calls: toolCalls.map((c) => ({
            id: c.id,
            name: c.function.name,
            arguments: c.function.arguments,
          })),
        },
      });

      // OpenAI protocol: the assistant message with tool_calls must precede
      // its matching tool result messages.
      conversation.push({
        role: 'assistant',
        content: msg.content ?? null,
        tool_calls: toolCalls,
      });

      // Execute tools sequentially. Read-only / analysis only — mutating
      // tools are rejected by the per-tool guard with a structured error
      // the model can read in the next round.
      for (const call of toolCalls) {
        const result = await runAutoReactTool(call, toolCtx);
        const resultJson = JSON.stringify(result);

        await persistTurn(supabase, parsed.thread_id, {
          role: 'tool',
          event_type: 'tool_result',
          content: truncateForLog(resultJson, 700),
          metadata: {
            ok: result.ok,
            tool_name: call.function.name,
            tool_call_id: call.id,
            auto_react: true,
          },
        });

        conversation.push({
          role: 'tool',
          tool_call_id: call.id,
          content: resultJson,
        });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown OpenAI error';
    return NextResponse.json({ error: 'openai_failed', detail: message }, { status: 502 });
  }

  if (!assistantText) {
    return NextResponse.json({ skipped: 'empty_response', rounds: roundCount }, { status: 200 });
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
      tool_rounds: roundCount,
    },
  });

  return NextResponse.json({
    ok: true,
    thread_id: parsed.thread_id,
    chars: assistantText.length,
    tool_rounds: roundCount,
  });
}

/**
 * TD-51 (2026-05-25): execute one tool call in auto-react context.
 *
 * q9 (2026-06-09): mode-aware. In STRICT modes (1/2/2.5) mutating tools stay
 * hard-blocked (Polina proposes, Director invokes). In BOLD modes (3/4) Polina
 * MAY fire mutating tools autonomously — EXCEPT hard limits (publish via
 * triggerAgent EXEC-PUB, skill-canon writes), which `gateMutation` inside each
 * tool already blocks. We parse args BEFORE the mutating decision so the
 * triggerAgent EXEC-PUB hard limit can be detected here too (defence-in-depth).
 */
async function runAutoReactTool(
  call: ChatCompletionMessageToolCall,
  ctx: ToolContext,
): Promise<
  | { ok: true; data: unknown; summary?: string }
  | { ok: false; error: string; code?: string }
> {
  const tool = findTool(call.function.name);
  if (!tool) {
    return { ok: false, error: `unknown tool: ${call.function.name}` };
  }

  let args: Record<string, unknown>;
  try {
    args = tool.parse(call.function.arguments ?? '{}') as Record<string, unknown>;
  } catch (e) {
    return { ok: false, error: `parse error: ${(e as Error).message}` };
  }

  if (tool.mutating) {
    const bold = ctx.mode === '3' || ctx.mode === '4';
    // Hard limits are never auto-runnable (any mode). gateMutation inside the
    // tool is the real gate; this is an early, explicit refusal for clarity.
    if (isHardLimitTool(tool.name, args)) {
      return {
        ok: false,
        error: `tool "${tool.name}" is a HARD LIMIT (Publish / LOCK / Budget / Mode per CLAUDE.md §6) — Director-only in every mode. Recommend it in your text response instead.`,
        code: 'auto_react_hard_limit_blocked',
      };
    }
    if (!bold) {
      return {
        ok: false,
        error: `tool "${tool.name}" is MUTATING — blocked in auto-react context for Mode ${ctx.mode}. Suggest the action in your text response so Director can invoke it on the next turn.`,
        code: 'auto_react_mutating_blocked',
      };
    }
    // Bold mode: fall through and execute. The tool's own gateMutation will
    // auto-pass it (non-hard-limit in mode 3/4) and the budget ceiling backs
    // cost. Auth to Director-only routes uses ctx.authHeader (EXEC-DIR-AI token).
  }

  try {
    const result = await tool.execute(args, ctx);
    return result;
  } catch (e) {
    return { ok: false, error: `execute error: ${(e as Error).message}` };
  }
}

function truncateForLog(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}… [${s.length - max} more chars]`;
}
